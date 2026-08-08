import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import type { AssetStore } from "@/lib/assets/asset-store";
import { ArtifactService } from "@/lib/application/artifact-service";
import { getServerEnv, resolveDataRoot, resolveImageProviderProfile, resolvePageImageQuality } from "@/lib/config/env";
import { imageRequestSchema, type ImageRequest, type ImageResult } from "@/lib/contracts/images";
import { serializeImagePrompt } from "@/lib/images/prompt-serializer";
import { FakeImageProvider } from "@/lib/images/fake-image-provider";
import { OpenAIImageProvider } from "@/lib/images/openai-image-provider";
import type { ImageProvider } from "@/lib/images/provider";
import { composePage } from "@/lib/composition/compose-page";
import { estimateImageCostUsd, pricingVersion } from "@/lib/config/pricing";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import type { GenUICard } from "@/lib/contracts/cards";
import { describeGenerationError, GenerationDiagnostics } from "@/lib/jobs/generation-diagnostics";
import { pagePlanSchema } from "@/lib/contracts/artifacts";

type ReferenceItem = {
  entityId: string;
  kind: "character" | "location";
  name: string;
  visualDetails: string[];
  continuityConstraints: string[];
  referenceRequired: boolean;
};

const ACTIVE_JOB_RUNS = Symbol.for("kids-booklet-poc.active-generation-jobs");

function activeJobRuns(): Map<string, Promise<void>> {
  const state = globalThis as typeof globalThis & { [ACTIVE_JOB_RUNS]?: Map<string, Promise<void>> };
  state[ACTIVE_JOB_RUNS] ??= new Map<string, Promise<void>>();
  return state[ACTIVE_JOB_RUNS];
}

function referenceUri(bookletId: string, item: ReferenceItem, assetId: string): string {
  return `${bookletId}/references/${item.kind === "character" ? "characters" : "locations"}/${item.entityId}/${assetId}.png`;
}

function compactPromptField(value: string, maximum = 480): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 3).trimEnd()}...`;
}

function compactPromptItems(values: string[], maximumPerItem = 240, maximumItems = 12): string[] {
  return [...new Set(values.filter(Boolean).map((value) => compactPromptField(value, maximumPerItem)))].slice(0, maximumItems);
}

export class GenerationService {
  private readonly repositories: Repositories;
  private readonly artifacts: ArtifactService;
  private assets?: AssetStore;
  private readonly provider: ImageProvider;
  private readonly imageModel: string;
  private readonly imageQuality: ImageRequest["quality"];
  private readonly dataRoot?: string;
  private readonly diagnostics: GenerationDiagnostics;
  private readonly diagnosticWaitMs: number;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; artifacts?: ArtifactService; assets?: AssetStore; provider?: ImageProvider; imageModel?: string; imageQuality?: ImageRequest["quality"]; diagnostics?: GenerationDiagnostics; diagnosticWaitMs?: number } = {}) {
    const database = dependencies.database ?? createDatabase();
    const needsEnvironment = !dependencies.assets || !dependencies.provider || !dependencies.imageModel;
    const env = needsEnvironment ? getServerEnv() : null;
    const imageProfile = env ? resolveImageProviderProfile(env) : null;
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.artifacts = dependencies.artifacts ?? new ArtifactService({ database });
    this.assets = dependencies.assets;
    this.dataRoot = env ? resolveDataRoot(env) : undefined;
    this.provider = dependencies.provider ?? (imageProfile!.runtime === "real" ? new OpenAIImageProvider(undefined, { fastOutput: imageProfile!.fastOutput }) : new FakeImageProvider());
    this.imageModel = dependencies.imageModel ?? env!.OPENAI_IMAGE_MODEL;
    this.imageQuality = dependencies.imageQuality ?? imageProfile?.quality ?? "balanced";
    this.diagnostics = dependencies.diagnostics ?? new GenerationDiagnostics(this.dataRoot);
    this.diagnosticWaitMs = dependencies.diagnosticWaitMs ?? 30_000;
  }

  public async createReferenceJob(bookletId: string, options: { entityIds?: string[]; revisionKey?: string; revisionInstruction?: string; editTargetAssetId?: string } = {}) {
    const bible = await this.artifacts.get(bookletId, "visual_bible");
    if (!bible.currentVersion) throw new Error("Visual Bible needs a saved version before reference generation.");
    const content = bible.currentVersion.content as { characters: ReferenceItem[]; locations: ReferenceItem[] };
    const selectedIds = options.entityIds ? new Set(options.entityIds) : null;
    const items = [...content.characters.map((item) => ({ ...item, kind: "character" as const })), ...content.locations.map((item) => ({ ...item, kind: "location" as const }))]
      .filter((item) => item.referenceRequired && (!selectedIds || selectedIds.has(item.entityId)));
    if (!items.length || (selectedIds && items.length !== selectedIds.size)) throw new Error("Choose a current canonical reference to regenerate.");
    if ((options.revisionInstruction || options.editTargetAssetId) && items.length !== 1) throw new Error("A targeted reference revision must select exactly one image.");
    const jobId = randomUUID();
    return this.repositories.jobs.createOrGet({
      id: jobId,
      bookletId,
      jobType: "references",
      idempotencyKey: `references:${bible.currentVersion.id}${options.revisionKey ? `:revision:${options.revisionKey}` : ""}`,
      input: { visualBibleVersionId: bible.currentVersion.id, entityIds: options.entityIds ?? null },
      items: items.map((item, position) => {
        const promptPlan = {
          purpose: `${item.kind} canonical visual reference`, subject: item.name, action: `Create a clear reference pose or establishing view for ${item.name}.`, location: item.kind === "location" ? item.name : "a calm neutral story setting",
          visualStyle: "Use the approved booklet visual direction.", continuityConstraints: item.continuityConstraints, revisionInstruction: options.revisionInstruction, preserve: item.visualDetails,
        };
        const request = imageRequestSchema.parse({ schemaVersion: "1", operation: options.editTargetAssetId ? "edit" : "generate", model: this.imageModel, promptPlan, prompt: serializeImagePrompt(promptPlan), geometry: "square_1_1", quality: this.imageQuality, references: [], editTargetAssetId: options.editTargetAssetId ?? null });
        return { id: randomUUID(), itemKey: `${item.kind}:${item.entityId}`, position, input: { item, request } };
      }),
      createdAtMs: Date.now(),
    });
  }

  public async runReferenceJob(bookletId: string, jobId: string, options: { retryItemId?: string } = {}) {
    return this.runExclusively(jobId, async () => {
    if (!options.retryItemId && await this.haltForSavedFailure(jobId)) return;
    for (;;) {
      const item = await this.repositories.jobs.claimNextPending(jobId, Date.now(), Boolean(options.retryItemId));
      if (!item) break;
      if (options.retryItemId && item.id !== options.retryItemId) throw new Error("The requested failed reference is not the next pending item.");
      const input = item.input as { item: ReferenceItem; request: ImageRequest };
      const request = imageRequestSchema.parse(input.request);
      await this.diagnostics.record({
        event: "job_item_claimed", bookletId, jobId, itemId: item.id, itemKey: item.itemKey, attempt: item.attemptCount,
        operation: request.operation, providerRuntime: this.provider.runtime, model: request.model, geometry: request.geometry, referenceCount: request.references.length,
      });
      try {
        const editTarget = request.editTargetAssetId ? await this.repositories.assets.get(request.editTargetAssetId) : null;
        if (request.editTargetAssetId && !editTarget) throw new Error("The reference image selected for editing is missing.");
        const inputAssets = editTarget ? [{ assetId: editTarget.id, bytes: Buffer.from(await (await this.getAssetStore()).get(editTarget.uri)) }] : [];
        const { result, startedAtMs } = await this.executeImageWithDiagnostics({ bookletId, jobId, itemId: item.id, itemKey: item.itemKey, attempt: item.attemptCount, request, inputAssets });
        await this.repositories.evidence.recordModelCall({
          id: randomUUID(), bookletId, operation: "image_reference", skillId: "visual_direction_reference_planning@1", jobId,
          provider: this.provider.runtime === "fake" ? "fake" : result.provider, model: result.model, traceId: jobId,
          status: result.status === "succeeded" ? "succeeded" : "failed", attempt: item.attemptCount, startedAtMs, latencyMs: Math.max(0, Date.now() - startedAtMs),
          inputReference: { itemKey: item.itemKey, request }, outputReference: result.status === "succeeded" ? { providerRequestId: result.providerRequestId } : undefined,
          usage: result.usage, actualCostUsd: this.provider.runtime === "fake" ? "0" : null, estimatedCostUsd: this.provider.runtime === "fake" ? "0" : estimateImageCostUsd(result.usage)?.toFixed(6) ?? null, pricingVersion: this.provider.runtime === "fake" ? "fake-runtime-v1" : pricingVersion,
          errorMessage: result.error?.message,
        });
        if (result.status === "failed" || !result.bytesBase64 || !result.mimeType || !result.width || !result.height) {
          const failure = result.error ?? { kind: "unavailable" as const, message: "Image provider returned no image." };
          await this.recordItemFailure({ bookletId, jobId, itemId: item.id, itemKey: item.itemKey, attempt: item.attemptCount, error: new Error(failure.message) });
          await this.repositories.jobs.failItem({ jobId, itemId: item.id, error: failure, finishedAtMs: Date.now(), haltJob: true });
          break;
        }
        const assetId = randomUUID();
        const bytes = Buffer.from(result.bytesBase64, "base64");
        const uri = referenceUri(bookletId, input.item, assetId);
        await (await this.getAssetStore()).put(uri, bytes, result.mimeType);
        await this.repositories.jobs.completeItem({
          jobId,
          itemId: item.id,
          result: { provider: result.provider, model: result.model, providerRequestId: result.providerRequestId, usage: result.usage, request },
          assets: [{ id: assetId, bookletId, kind: "reference", uri, mimeType: result.mimeType, width: result.width, height: result.height, sourceAssetId: null, metadata: { role: input.item.kind === "character" ? "character_identity" : "location_continuity", entityId: input.item.entityId, jobId, request }, createdAtMs: Date.now() }],
          primaryAssetId: assetId,
          finishedAtMs: Date.now(),
          pauseWithPending: Boolean(options.retryItemId),
        });
        if (options.retryItemId) break;
      } catch (error) {
        await this.recordItemFailure({ bookletId, jobId, itemId: item.id, itemKey: item.itemKey, attempt: item.attemptCount, error });
        await this.repositories.jobs.failItem({ jobId, itemId: item.id, error: { kind: "unavailable", message: describeGenerationError(error).message }, finishedAtMs: Date.now(), haltJob: true });
        break;
      }
    }
    await this.finalizeReferences(bookletId, jobId);
    });
  }

  public startReferenceJob(bookletId: string, jobId: string, options: { retryItemId?: string } = {}): void {
    void this.runReferenceJob(bookletId, jobId, options).catch((error) => {
      console.error(`Reference job ${jobId} stopped unexpectedly:`, error);
    });
  }

  public async retryReferenceItem(bookletId: string, jobId: string, itemId: string) {
    await this.repositories.jobs.retryItem(jobId, itemId);
    return this.runReferenceJob(bookletId, jobId, { retryItemId: itemId });
  }

  public async createPageJob(bookletId: string, options: { pageIds?: string[]; revisionKey?: string; revisionInstruction?: string; editTargetAssetId?: string } = {}) {
    const plan = await this.artifacts.get(bookletId, "page_plan");
    if (!plan.currentVersion) throw new Error("Page generation needs an approved Page Plan.");
    const content = pagePlanSchema.parse(plan.currentVersion.content);
    const [bible, visualStyle] = await Promise.all([
      this.artifacts.get(bookletId, "visual_bible"),
      this.artifacts.get(bookletId, "visual_style"),
    ]);
    const bibleContent = bible.currentVersion?.content as {
      styleReferences?: string[];
      characters?: Array<{ entityId: string; name: string; visualDetails: string[]; continuityConstraints: string[]; currentReferenceAssetId: string | null }>;
      locations?: Array<{ entityId: string; name: string; visualDetails: string[]; continuityConstraints: string[]; currentReferenceAssetId: string | null }>;
    } | undefined;
    const styleContent = visualStyle.currentVersion?.content as { visualDirection?: string; texture?: string; lighting?: string } | undefined;
    const styleIds = new Set(bibleContent?.styleReferences ?? []);
    const locationIds = new Set((bibleContent?.locations ?? []).map((location) => location.currentReferenceAssetId).filter((id): id is string => Boolean(id)));
    const charactersById = new Map((bibleContent?.characters ?? []).map((character) => [character.entityId, character]));
    const locationsById = new Map((bibleContent?.locations ?? []).map((location) => [location.entityId, location]));
    const selectedPageIds = options.pageIds ? new Set(options.pageIds) : null;
    const selectedPages = selectedPageIds ? content.pages.filter((page) => selectedPageIds.has(page.pageId)) : content.pages;
    if (!selectedPages.length || (selectedPageIds && selectedPages.length !== selectedPageIds.size)) throw new Error("Choose one or more pages from the current Page Plan to regenerate.");
    if (selectedPages.some((page) => !page.lettering?.length)) throw new Error("Upgrade and approve the Page Plan with professional comic lettering before generating pages.");
    if ((options.revisionInstruction || options.editTargetAssetId) && selectedPages.length !== 1) throw new Error("A targeted page revision must select exactly one image.");
    const jobId = randomUUID();
    return this.repositories.jobs.createOrGet({
      id: jobId, bookletId, jobType: "pages", idempotencyKey: `pages:${plan.currentVersion.id}${options.revisionKey ? `:revision:${options.revisionKey}` : ""}`, input: { pagePlanVersionId: plan.currentVersion.id, pageIds: options.pageIds ?? null }, createdAtMs: Date.now(),
      items: selectedPages.map((page) => {
        const pageCharacters = page.characterIds.map((entityId) => charactersById.get(entityId)).filter((item): item is NonNullable<typeof item> => Boolean(item));
        const pageLocations = page.locationIds.map((entityId) => locationsById.get(entityId)).filter((item): item is NonNullable<typeof item> => Boolean(item));
        const subject = pageCharacters.length
          ? compactPromptField(pageCharacters.map((character) => `${character.name}: ${character.visualDetails.slice(0, 2).join(", ")}`).join("; "))
          : "The approved story subjects";
        const location = pageLocations.length
          ? compactPromptField(pageLocations.map((item) => `${item.name}: ${item.visualDetails.slice(0, 2).join(", ")}`).join("; "))
          : "The approved story setting";
        const continuityConstraints = compactPromptItems([
          ...page.continuityNotes,
          ...pageCharacters.flatMap((character) => character.continuityConstraints),
          ...pageLocations.flatMap((item) => item.continuityConstraints),
        ]);
        const preserve = compactPromptItems([
          ...pageCharacters.flatMap((character) => [`Keep ${character.name} recognizable.`, ...character.visualDetails]),
          ...pageLocations.flatMap((item) => [`Keep ${item.name} recognizable.`, ...item.visualDetails]),
          "Keep the approved visual style consistent with the supplied references.",
        ]);
        const promptPlan = {
          purpose: page.kind === "cover" ? "booklet cover illustration" : `story page ${page.pageIndex} illustration`,
          subject,
          action: page.sceneAction,
          location,
          visualStyle: [styleContent?.visualDirection, styleContent?.texture, styleContent?.lighting].filter(Boolean).join("; ") || "Use the approved visual style and canonical references.",
          continuityConstraints,
          textSafeRegion: page.textSafeRegion,
          lettering: page.lettering,
          speakerNames: Object.fromEntries(pageCharacters.map((character) => [character.entityId, character.name])),
          revisionInstruction: options.revisionInstruction,
          preserve,
        };
        const referenceLimit = options.editTargetAssetId ? 7 : 8;
        const references = page.relevantReferenceIds.slice(0, referenceLimit).map((assetId) => ({
          assetId,
          role: styleIds.has(assetId) ? "style" as const : locationIds.has(assetId) ? "location_continuity" as const : "character_identity" as const,
        }));
        const request = imageRequestSchema.parse({ schemaVersion: "1", operation: references.length || options.editTargetAssetId ? "edit" : "generate", model: this.imageModel, promptPlan, prompt: serializeImagePrompt(promptPlan), geometry: content.geometry, quality: resolvePageImageQuality(this.imageQuality), references, editTargetAssetId: options.editTargetAssetId ?? null });
        return { id: randomUUID(), itemKey: `page:${page.pageId}`, position: page.pageIndex, input: { page, geometry: content.geometry, request } };
      }),
    });
  }

  public async runPageJob(bookletId: string, jobId: string, options: { retryItemId?: string } = {}) {
    return this.runExclusively(jobId, async () => {
    if (!options.retryItemId && await this.haltForSavedFailure(jobId)) return;
    for (;;) {
      const item = await this.repositories.jobs.claimNextPending(jobId, Date.now(), Boolean(options.retryItemId));
      if (!item) break;
      if (options.retryItemId && item.id !== options.retryItemId) throw new Error("The requested failed page is not the next pending item.");
      const input = item.input as { page: Parameters<typeof composePage>[0]["page"]; geometry: "square_1_1" | "landscape_5_4" | "portrait_4_5"; request: ImageRequest };
      const request = imageRequestSchema.parse(input.request);
      await this.diagnostics.record({
        event: "job_item_claimed", bookletId, jobId, itemId: item.id, itemKey: item.itemKey, attempt: item.attemptCount,
        operation: request.operation, providerRuntime: this.provider.runtime, model: request.model, geometry: request.geometry, referenceCount: request.references.length,
      });
      try {
        const sourceReferences = await Promise.all(request.references.map(async (reference) => {
          const asset = await this.repositories.assets.get(reference.assetId);
          return asset ? { assetId: asset.id, bytes: Buffer.from(await (await this.getAssetStore()).get(asset.uri)) } : null;
        }));
        if (sourceReferences.some((reference) => reference === null)) {
          const error = new Error("A Page Plan reference asset is missing.");
          await this.recordItemFailure({ bookletId, jobId, itemId: item.id, itemKey: item.itemKey, attempt: item.attemptCount, error });
          await this.repositories.jobs.failItem({ jobId, itemId: item.id, error: { kind: "user_correctable", message: error.message }, finishedAtMs: Date.now(), haltJob: true });
          break;
        }
        const editTarget = request.editTargetAssetId ? await this.repositories.assets.get(request.editTargetAssetId) : null;
        if (request.editTargetAssetId && !editTarget) {
          const error = new Error("The page image selected for editing is missing.");
          await this.recordItemFailure({ bookletId, jobId, itemId: item.id, itemKey: item.itemKey, attempt: item.attemptCount, error });
          await this.repositories.jobs.failItem({ jobId, itemId: item.id, error: { kind: "user_correctable", message: error.message }, finishedAtMs: Date.now(), haltJob: true });
          break;
        }
        const usableReferences = sourceReferences.filter((reference) => reference !== null);
        if (editTarget) usableReferences.unshift({ assetId: editTarget.id, bytes: Buffer.from(await (await this.getAssetStore()).get(editTarget.uri)) });
        const { result: generated, startedAtMs } = await this.executeImageWithDiagnostics({ bookletId, jobId, itemId: item.id, itemKey: item.itemKey, attempt: item.attemptCount, request, inputAssets: usableReferences });
        await this.repositories.evidence.recordModelCall({
          id: randomUUID(), bookletId, operation: "image_page", skillId: "image_prompt_compilation@1", jobId,
          provider: this.provider.runtime === "fake" ? "fake" : generated.provider, model: generated.model, traceId: jobId,
          status: generated.status === "succeeded" ? "succeeded" : "failed", attempt: item.attemptCount, startedAtMs, latencyMs: Math.max(0, Date.now() - startedAtMs),
          inputReference: { itemKey: item.itemKey, request }, outputReference: generated.status === "succeeded" ? { providerRequestId: generated.providerRequestId } : undefined,
          usage: generated.usage, actualCostUsd: this.provider.runtime === "fake" ? "0" : null, estimatedCostUsd: this.provider.runtime === "fake" ? "0" : estimateImageCostUsd(generated.usage)?.toFixed(6) ?? null, pricingVersion: this.provider.runtime === "fake" ? "fake-runtime-v1" : pricingVersion,
          errorMessage: generated.error?.message,
        });
        if (generated.status === "failed" || !generated.bytesBase64 || !generated.mimeType || !generated.width || !generated.height) {
          const failure = generated.error ?? { kind: "unavailable" as const, message: "Image provider returned no page image." };
          await this.recordItemFailure({ bookletId, jobId, itemId: item.id, itemKey: item.itemKey, attempt: item.attemptCount, error: new Error(failure.message) });
          await this.repositories.jobs.failItem({ jobId, itemId: item.id, error: failure, finishedAtMs: Date.now(), haltJob: true });
          break;
        }
        const sourceId = randomUUID();
        const sourceBytes = Buffer.from(generated.bytesBase64, "base64");
        const sourceUri = `${bookletId}/pages/source/${item.position}/${sourceId}.png`;
        await (await this.getAssetStore()).put(sourceUri, sourceBytes, generated.mimeType);
        const composed = await composePage({ source: sourceBytes, page: input.page, geometry: input.geometry });
        const composedId = randomUUID();
        const composedUri = `${bookletId}/pages/composed/${item.position}/${composedId}.png`;
        await (await this.getAssetStore()).put(composedUri, composed.bytes, "image/png");
        const now = Date.now();
        await this.repositories.jobs.completeItem({
          jobId, itemId: item.id, primaryAssetId: composedId, finishedAtMs: now, pauseWithPending: Boolean(options.retryItemId),
          result: { sourceAssetId: sourceId, composedAssetId: composedId, request, provider: generated.provider, model: generated.model, usage: generated.usage },
          assets: [
            { id: sourceId, bookletId, kind: "page_source", uri: sourceUri, mimeType: generated.mimeType, width: generated.width, height: generated.height, sourceAssetId: null, metadata: { jobId, request }, createdAtMs: now },
            { id: composedId, bookletId, kind: "page_composed", uri: composedUri, mimeType: "image/png", width: composed.width, height: composed.height, sourceAssetId: sourceId, metadata: { jobId, pageIndex: item.position }, createdAtMs: now },
          ],
        });
        if (options.retryItemId) break;
      } catch (error) {
        await this.recordItemFailure({ bookletId, jobId, itemId: item.id, itemKey: item.itemKey, attempt: item.attemptCount, error });
        await this.repositories.jobs.failItem({ jobId, itemId: item.id, error: { kind: "unavailable", message: describeGenerationError(error).message }, finishedAtMs: Date.now(), haltJob: true });
        break;
      }
    }
    await this.finalizePages(bookletId, jobId);
    });
  }

  public startPageJob(bookletId: string, jobId: string, options: { retryItemId?: string } = {}): void {
    void this.runPageJob(bookletId, jobId, options).catch((error) => {
      console.error(`Page job ${jobId} stopped unexpectedly:`, error);
    });
  }

  public async retryPageItem(bookletId: string, jobId: string, itemId: string) {
    await this.repositories.jobs.retryItem(jobId, itemId);
    return this.runPageJob(bookletId, jobId, { retryItemId: itemId });
  }

  private async finalizeReferences(bookletId: string, jobId: string) {
    const items = await this.repositories.jobs.getItems(jobId);
    if (!items.length || items.some((item) => item.status !== "succeeded" || !item.assetId)) return;
    const bible = await this.artifacts.get(bookletId, "visual_bible");
    if (!bible.currentVersion || !bible.currentVersion.content || typeof bible.currentVersion.content !== "object") return;
    const source = bible.currentVersion.content as { characters: Array<{ entityId: string; currentReferenceAssetId: string | null }>; locations: Array<{ entityId: string; currentReferenceAssetId: string | null }> };
    const byEntity = new Map(items.map((item) => [(item.input as { item: ReferenceItem }).item.entityId, item.assetId!]));
    const revised = await this.artifacts.revise(bookletId, "visual_bible", {
      ...source,
      characters: source.characters.map((item) => ({ ...item, currentReferenceAssetId: byEntity.get(item.entityId) ?? item.currentReferenceAssetId })),
      locations: source.locations.map((item) => ({ ...item, currentReferenceAssetId: byEntity.get(item.entityId) ?? item.currentReferenceAssetId })),
    }, { createdBy: "application" });
    const content = revised.currentVersion?.content as { characters?: Array<{ entityId: string; name: string; currentReferenceAssetId: string | null }>; locations?: Array<{ entityId: string; name: string; currentReferenceAssetId: string | null }> } | undefined;
    const galleryItems = [...(content?.characters ?? []), ...(content?.locations ?? [])]
      .flatMap((entity) => entity.currentReferenceAssetId ? [{ assetId: entity.currentReferenceAssetId, label: entity.name, selected: false, regenerationTarget: { kind: "reference" as const, entityId: entity.entityId } }] : []);
    if (!revised.currentVersion || !galleryItems.length) return;
    const card: GenUICard = {
      schemaVersion: SCHEMA_VERSION,
      cardId: randomUUID(),
      family: "artifact_review",
      variant: "visual_gallery",
      status: "active",
      title: "Review canonical references",
      explanation: "Review every canonical reference, then approve them together to continue.",
      allowedActions: ["approve_and_continue"],
      payload: { artifactType: "visual_bible", versionId: revised.currentVersion.id, items: galleryItems },
    };
    await this.repositories.conversation.persistAssistantCard({
      bookletId,
      messageId: randomUUID(),
      narration: "Canonical references are ready for review.",
      card,
      createdAtMs: Date.now(),
    });
  }

  private async haltForSavedFailure(jobId: string): Promise<boolean> {
    const failedItem = (await this.repositories.jobs.getItems(jobId)).find((item) => item.status === "failed");
    if (!failedItem) return false;
    await this.repositories.jobs.failItem({
      jobId,
      itemId: failedItem.id,
      error: failedItem.error,
      finishedAtMs: Date.now(),
      haltJob: true,
    });
    return true;
  }

  private async finalizePages(bookletId: string, jobId: string) {
    const items = await this.repositories.jobs.getItems(jobId);
    if (!items.length || items.some((item) => item.status !== "succeeded" || !item.assetId)) return;
    const plan = await this.artifacts.get(bookletId, "page_plan");
    if (!plan.currentVersion) return;
    const previous = await this.artifacts.get(bookletId, "final_pages");
    const existingByPageId = new Map(((previous.currentVersion?.content as { pages?: Array<{ pageId: string; pageIndex: number; sourceIllustrationAssetId: string; composedAssetId: string; readerText: string; lettering?: unknown[]; textSafeRegion: { x: number; y: number; width: number; height: number }; revisionNumber: number; acceptedQualityIssueIds: string[] }> } | undefined)?.pages ?? []).map((page) => [page.pageId, page]));
    const generatedByPageId = new Map(items.map((item) => {
      const source = item.input as { page: { pageId: string; pageIndex: number; readerText: string; lettering?: unknown[]; textSafeRegion: { x: number; y: number; width: number; height: number } } };
      const result = item.result as { sourceAssetId: string; composedAssetId: string };
      const previousPage = existingByPageId.get(source.page.pageId);
      return [source.page.pageId, { pageId: source.page.pageId, pageIndex: source.page.pageIndex, sourceIllustrationAssetId: result.sourceAssetId, composedAssetId: result.composedAssetId, readerText: source.page.readerText, lettering: source.page.lettering, textSafeRegion: source.page.textSafeRegion, revisionNumber: (previousPage?.revisionNumber ?? 0) + 1, acceptedQualityIssueIds: [] }] as const;
    }));
    const plannedPages = (plan.currentVersion.content as { pages: Array<{ pageId: string }> }).pages;
    const pages = plannedPages.map((page) => generatedByPageId.get(page.pageId) ?? existingByPageId.get(page.pageId)).filter((page): page is NonNullable<typeof page> => Boolean(page));
    if (pages.length !== plannedPages.length) return;
    const revised = await this.artifacts.revise(bookletId, "final_pages", { schemaVersion: "1", pages }, { createdBy: "application" });
    if (!revised.currentVersion) return;
    const card: GenUICard = {
      schemaVersion: SCHEMA_VERSION,
      cardId: randomUUID(),
      family: "artifact_review",
      variant: "visual_gallery",
      status: "active",
      title: "Review final pages",
      explanation: "Review every composed page, then approve them together for PDF export.",
      allowedActions: ["approve_and_continue"],
      payload: {
        artifactType: "final_pages",
        versionId: revised.currentVersion.id,
        items: pages.map((page) => ({ assetId: page.composedAssetId, label: page.pageIndex === 0 ? "Cover" : `Story page ${page.pageIndex}`, selected: false, regenerationTarget: { kind: "page" as const, pageId: page.pageId } })),
      },
    };
    await this.repositories.conversation.persistAssistantCard({
      bookletId,
      messageId: randomUUID(),
      narration: "Every page is composed and ready for review.",
      card,
      createdAtMs: Date.now(),
    });
  }

  private async executeImageWithDiagnostics(input: {
    bookletId: string;
    jobId: string;
    itemId: string;
    itemKey: string;
    attempt: number;
    request: ImageRequest;
    inputAssets?: Array<{ assetId: string; bytes: Buffer }>;
  }): Promise<{ result: ImageResult; startedAtMs: number }> {
    const startedAtMs = Date.now();
    const shared = {
      bookletId: input.bookletId,
      jobId: input.jobId,
      itemId: input.itemId,
      itemKey: input.itemKey,
      attempt: input.attempt,
      operation: input.request.operation,
      providerRuntime: this.provider.runtime,
      model: input.request.model,
      geometry: input.request.geometry,
      referenceCount: input.request.references.length,
    } as const;
    await this.diagnostics.record({ event: "provider_request_started", ...shared });
    const heartbeat = this.diagnosticWaitMs > 0
      ? setInterval(() => {
        void this.diagnostics.record({ event: "provider_request_still_waiting", ...shared, elapsedMs: Math.max(0, Date.now() - startedAtMs) });
      }, this.diagnosticWaitMs)
      : undefined;

    try {
      const result = await this.provider.execute(input.request, input.inputAssets);
      await this.diagnostics.record({
        event: "provider_request_completed",
        ...shared,
        elapsedMs: Math.max(0, Date.now() - startedAtMs),
        resultStatus: result.status,
        providerRequestId: result.providerRequestId,
        error: result.error ? {
          ...describeGenerationError(new Error(result.error.message)),
          status: result.error.providerError?.status ?? null,
          code: result.error.providerError?.code ?? null,
          type: result.error.providerError?.type ?? null,
          requestId: result.error.providerError?.requestId ?? null,
        } : undefined,
      });
      return { result, startedAtMs };
    } catch (error) {
      await this.diagnostics.record({
        event: "provider_request_threw",
        ...shared,
        elapsedMs: Math.max(0, Date.now() - startedAtMs),
        error: describeGenerationError(error),
      });
      throw error;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }
  }

  private async recordItemFailure(input: { bookletId: string; jobId: string; itemId: string; itemKey: string; attempt: number; error: unknown }): Promise<void> {
    await this.diagnostics.record({
      event: "job_item_failed",
      bookletId: input.bookletId,
      jobId: input.jobId,
      itemId: input.itemId,
      itemKey: input.itemKey,
      attempt: input.attempt,
      error: describeGenerationError(input.error),
    });
  }

  private async getAssetStore(): Promise<AssetStore> {
    if (this.assets) return this.assets;
    const { FilesystemAssetStore } = await import("@/lib/assets/filesystem-asset-store");
    this.assets = new FilesystemAssetStore(this.dataRoot ?? resolveDataRoot(getServerEnv()));
    return this.assets;
  }

  private async runExclusively(jobId: string, work: () => Promise<void>): Promise<void> {
    const active = activeJobRuns();
    const existing = active.get(jobId);
    if (existing) return existing;
    const running = work().finally(() => active.delete(jobId));
    active.set(jobId, running);
    return running;
  }
}
