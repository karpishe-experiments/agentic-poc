import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import type { AssetStore } from "@/lib/assets/asset-store";
import { ArtifactService } from "@/lib/application/artifact-service";
import { getServerEnv, resolveDataRoot } from "@/lib/config/env";
import { imageRequestSchema, type ImageRequest } from "@/lib/contracts/images";
import { serializeImagePrompt } from "@/lib/images/prompt-serializer";
import { FakeImageProvider } from "@/lib/images/fake-image-provider";
import { OpenAIImageProvider } from "@/lib/images/openai-image-provider";
import type { ImageProvider } from "@/lib/images/provider";
import { composePage } from "@/lib/composition/compose-page";
import { estimateImageCostUsd, pricingVersion } from "@/lib/config/pricing";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import type { GenUICard } from "@/lib/contracts/cards";

type ReferenceItem = {
  entityId: string;
  kind: "character" | "location";
  name: string;
  visualDetails: string[];
  continuityConstraints: string[];
  referenceRequired: boolean;
};

function retryDelay(attempt: number): number {
  // attempt is the completed attempt count: retry once after ~1s, then ~3s.
  return attempt === 1 ? 1_000 : 3_000;
}

const ACTIVE_JOB_RUNS = Symbol.for("kids-booklet-poc.active-generation-jobs");

function activeJobRuns(): Map<string, Promise<void>> {
  const state = globalThis as typeof globalThis & { [ACTIVE_JOB_RUNS]?: Map<string, Promise<void>> };
  state[ACTIVE_JOB_RUNS] ??= new Map<string, Promise<void>>();
  return state[ACTIVE_JOB_RUNS];
}

function referenceUri(bookletId: string, item: ReferenceItem, assetId: string): string {
  return `${bookletId}/references/${item.kind === "character" ? "characters" : "locations"}/${item.entityId}/${assetId}.png`;
}

export class GenerationService {
  private readonly repositories: Repositories;
  private readonly artifacts: ArtifactService;
  private assets?: AssetStore;
  private readonly provider: ImageProvider;
  private readonly imageModel: string;
  private readonly dataRoot?: string;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; artifacts?: ArtifactService; assets?: AssetStore; provider?: ImageProvider; imageModel?: string } = {}) {
    const database = dependencies.database ?? createDatabase();
    const needsEnvironment = !dependencies.assets || !dependencies.provider || !dependencies.imageModel;
    const env = needsEnvironment ? getServerEnv() : null;
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.artifacts = dependencies.artifacts ?? new ArtifactService({ database });
    this.assets = dependencies.assets;
    this.dataRoot = env ? resolveDataRoot(env) : undefined;
    this.provider = dependencies.provider ?? (process.env.IMAGE_PROVIDER_MODE === "real" ? new OpenAIImageProvider() : new FakeImageProvider());
    this.imageModel = dependencies.imageModel ?? env!.OPENAI_IMAGE_MODEL;
  }

  public async createReferenceJob(bookletId: string) {
    const bible = await this.artifacts.get(bookletId, "visual_bible");
    if (!bible.currentVersion) throw new Error("Visual Bible needs a saved version before reference generation.");
    const content = bible.currentVersion.content as { characters: ReferenceItem[]; locations: ReferenceItem[] };
    const items = [...content.characters.map((item) => ({ ...item, kind: "character" as const })), ...content.locations.map((item) => ({ ...item, kind: "location" as const }))]
      .filter((item) => item.referenceRequired);
    const jobId = randomUUID();
    return this.repositories.jobs.createOrGet({
      id: jobId,
      bookletId,
      jobType: "references",
      idempotencyKey: `references:${bible.currentVersion.id}`,
      input: { visualBibleVersionId: bible.currentVersion.id },
      items: items.map((item, position) => {
        const promptPlan = {
          purpose: `${item.kind} canonical visual reference`, subject: item.name, action: `Create a clear reference pose or establishing view for ${item.name}.`, location: item.kind === "location" ? item.name : "a calm neutral story setting",
          visualStyle: "Use the approved booklet visual direction.", continuityConstraints: item.continuityConstraints, preserve: item.visualDetails,
        };
        const request = imageRequestSchema.parse({ schemaVersion: "1", operation: "generate", model: this.imageModel, promptPlan, prompt: serializeImagePrompt(promptPlan), geometry: "square_1_1", quality: "balanced", references: [], editTargetAssetId: null });
        return { id: randomUUID(), itemKey: `${item.kind}:${item.entityId}`, position, input: { item, request } };
      }),
      createdAtMs: Date.now(),
    });
  }

  public async runReferenceJob(bookletId: string, jobId: string) {
    return this.runExclusively(jobId, async () => {
    for (;;) {
      const item = await this.repositories.jobs.claimNextPending(jobId, Date.now());
      if (!item) break;
      const input = item.input as { item: ReferenceItem; request: ImageRequest };
      const request = imageRequestSchema.parse(input.request);
      const startedAtMs = Date.now();
      const result = await this.provider.execute(request);
      await this.repositories.evidence.recordModelCall({
        id: randomUUID(), bookletId, operation: "image_reference", skillId: "visual_direction_reference_planning@1", jobId,
        provider: this.provider.runtime === "fake" ? "fake" : result.provider, model: result.model, traceId: jobId,
        status: result.status === "succeeded" ? "succeeded" : "failed", attempt: item.attemptCount, startedAtMs, latencyMs: Math.max(0, Date.now() - startedAtMs),
        inputReference: { itemKey: item.itemKey, request }, outputReference: result.status === "succeeded" ? { providerRequestId: result.providerRequestId } : undefined,
        usage: result.usage, actualCostUsd: this.provider.runtime === "fake" ? "0" : null, estimatedCostUsd: this.provider.runtime === "fake" ? "0" : estimateImageCostUsd(result.usage)?.toFixed(6) ?? null, pricingVersion: this.provider.runtime === "fake" ? "fake-runtime-v1" : pricingVersion,
        errorMessage: result.error?.message,
      });
      if (result.status === "failed" || !result.bytesBase64 || !result.mimeType || !result.width || !result.height) {
        await this.repositories.jobs.failItem({ jobId, itemId: item.id, error: result.error ?? { kind: "unavailable", message: "Image provider returned no image." }, finishedAtMs: Date.now() });
        if (result.error?.kind === "transient" && item.attemptCount <= 2) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay(item.attemptCount)));
          await this.repositories.jobs.retryItem(jobId, item.id);
          continue;
        }
        continue;
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
      });
    }
    await this.finalizeReferences(bookletId, jobId);
    });
  }

  public startReferenceJob(bookletId: string, jobId: string): void {
    void this.runReferenceJob(bookletId, jobId).catch((error) => {
      console.error(`Reference job ${jobId} stopped unexpectedly:`, error);
    });
  }

  public async retryReferenceItem(bookletId: string, jobId: string, itemId: string) {
    await this.repositories.jobs.retryItem(jobId, itemId);
    if (process.env.VITEST) return this.runReferenceJob(bookletId, jobId);
  }

  public async createPageJob(bookletId: string, options: { pageIds?: string[]; revisionKey?: string } = {}) {
    const plan = await this.artifacts.get(bookletId, "page_plan");
    if (!plan.currentVersion) throw new Error("Page generation needs an approved Page Plan.");
    const content = plan.currentVersion.content as { geometry: "square_1_1" | "landscape_5_4" | "portrait_4_5"; pages: Array<{ pageId: string; pageIndex: number; kind: "cover" | "story"; readerText: string; sceneAction: string; relevantReferenceIds: string[]; textSafeRegion: { x: number; y: number; width: number; height: number } }> };
    const bible = await this.artifacts.get(bookletId, "visual_bible");
    const bibleContent = bible.currentVersion?.content as { styleReferences?: string[]; characters?: Array<{ currentReferenceAssetId: string | null }>; locations?: Array<{ currentReferenceAssetId: string | null }> } | undefined;
    const styleIds = new Set(bibleContent?.styleReferences ?? []);
    const locationIds = new Set((bibleContent?.locations ?? []).map((location) => location.currentReferenceAssetId).filter((id): id is string => Boolean(id)));
    const selectedPageIds = options.pageIds ? new Set(options.pageIds) : null;
    const selectedPages = selectedPageIds ? content.pages.filter((page) => selectedPageIds.has(page.pageId)) : content.pages;
    if (!selectedPages.length || (selectedPageIds && selectedPages.length !== selectedPageIds.size)) throw new Error("Choose one or more pages from the current Page Plan to regenerate.");
    const jobId = randomUUID();
    return this.repositories.jobs.createOrGet({
      id: jobId, bookletId, jobType: "pages", idempotencyKey: `pages:${plan.currentVersion.id}${options.revisionKey ? `:revision:${options.revisionKey}` : ""}`, input: { pagePlanVersionId: plan.currentVersion.id, pageIds: options.pageIds ?? null }, createdAtMs: Date.now(),
      items: selectedPages.map((page) => {
        const promptPlan = { purpose: page.kind === "cover" ? "booklet cover illustration" : `story page ${page.pageIndex} illustration`, subject: "Approved Story Plan subjects", action: page.sceneAction, location: "Approved Visual Bible location", visualStyle: "Use the approved visual style and canonical references.", continuityConstraints: [], textSafeRegion: page.textSafeRegion, preserve: ["Canonical character and location identity"] };
        const references = page.relevantReferenceIds.map((assetId) => ({
          assetId,
          role: styleIds.has(assetId) ? "style" as const : locationIds.has(assetId) ? "location_continuity" as const : "character_identity" as const,
        }));
        const request = imageRequestSchema.parse({ schemaVersion: "1", operation: references.length ? "edit" : "generate", model: this.imageModel, promptPlan, prompt: serializeImagePrompt(promptPlan), geometry: content.geometry, quality: "balanced", references, editTargetAssetId: null });
        return { id: randomUUID(), itemKey: `page:${page.pageId}`, position: page.pageIndex, input: { page, geometry: content.geometry, request } };
      }),
    });
  }

  public async runPageJob(bookletId: string, jobId: string) {
    return this.runExclusively(jobId, async () => {
    for (;;) {
      const item = await this.repositories.jobs.claimNextPending(jobId, Date.now());
      if (!item) break;
      const input = item.input as { page: Parameters<typeof composePage>[0]["page"]; geometry: "square_1_1" | "landscape_5_4" | "portrait_4_5"; request: ImageRequest };
      const request = imageRequestSchema.parse(input.request);
      const sourceReferences = await Promise.all(request.references.map(async (reference) => {
        const asset = await this.repositories.assets.get(reference.assetId);
        return asset ? { assetId: asset.id, bytes: Buffer.from(await (await this.getAssetStore()).get(asset.uri)) } : null;
      }));
      if (sourceReferences.some((reference) => reference === null)) {
        await this.repositories.jobs.failItem({ jobId, itemId: item.id, error: { kind: "user_correctable", message: "A Page Plan reference asset is missing." }, finishedAtMs: Date.now() });
        continue;
      }
      const usableReferences = sourceReferences.filter((reference) => reference !== null);
      const startedAtMs = Date.now();
      const generated = await this.provider.execute(request, usableReferences);
      await this.repositories.evidence.recordModelCall({
        id: randomUUID(), bookletId, operation: "image_page", skillId: "image_prompt_compilation@1", jobId,
        provider: this.provider.runtime === "fake" ? "fake" : generated.provider, model: generated.model, traceId: jobId,
        status: generated.status === "succeeded" ? "succeeded" : "failed", attempt: item.attemptCount, startedAtMs, latencyMs: Math.max(0, Date.now() - startedAtMs),
        inputReference: { itemKey: item.itemKey, request }, outputReference: generated.status === "succeeded" ? { providerRequestId: generated.providerRequestId } : undefined,
        usage: generated.usage, actualCostUsd: this.provider.runtime === "fake" ? "0" : null, estimatedCostUsd: this.provider.runtime === "fake" ? "0" : estimateImageCostUsd(generated.usage)?.toFixed(6) ?? null, pricingVersion: this.provider.runtime === "fake" ? "fake-runtime-v1" : pricingVersion,
        errorMessage: generated.error?.message,
      });
      if (generated.status === "failed" || !generated.bytesBase64 || !generated.mimeType || !generated.width || !generated.height) {
        await this.repositories.jobs.failItem({ jobId, itemId: item.id, error: generated.error ?? { kind: "unavailable", message: "Image provider returned no page image." }, finishedAtMs: Date.now() });
        if (generated.error?.kind === "transient" && item.attemptCount <= 2) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay(item.attemptCount)));
          await this.repositories.jobs.retryItem(jobId, item.id);
          continue;
        }
        continue;
      }
      try {
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
          jobId, itemId: item.id, primaryAssetId: composedId, finishedAtMs: now,
          result: { sourceAssetId: sourceId, composedAssetId: composedId, request, provider: generated.provider, model: generated.model, usage: generated.usage },
          assets: [
            { id: sourceId, bookletId, kind: "page_source", uri: sourceUri, mimeType: generated.mimeType, width: generated.width, height: generated.height, sourceAssetId: null, metadata: { jobId, request }, createdAtMs: now },
            { id: composedId, bookletId, kind: "page_composed", uri: composedUri, mimeType: "image/png", width: composed.width, height: composed.height, sourceAssetId: sourceId, metadata: { jobId, pageIndex: item.position }, createdAtMs: now },
          ],
        });
      } catch (error) {
        await this.repositories.jobs.failItem({ jobId, itemId: item.id, error: { kind: "user_correctable", message: error instanceof Error ? error.message : "Page composition failed." }, finishedAtMs: Date.now() });
      }
    }
    await this.finalizePages(bookletId, jobId);
    });
  }

  public startPageJob(bookletId: string, jobId: string): void {
    void this.runPageJob(bookletId, jobId).catch((error) => {
      console.error(`Page job ${jobId} stopped unexpectedly:`, error);
    });
  }

  public async retryPageItem(bookletId: string, jobId: string, itemId: string) {
    await this.repositories.jobs.retryItem(jobId, itemId);
    if (process.env.VITEST) return this.runPageJob(bookletId, jobId);
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
      .flatMap((entity) => entity.currentReferenceAssetId ? [{ assetId: entity.currentReferenceAssetId, label: entity.name, description: "Review this canonical reference before continuing.", selected: false }] : []);
    if (!revised.currentVersion || !galleryItems.length) return;
    const card: GenUICard = {
      schemaVersion: SCHEMA_VERSION,
      cardId: randomUUID(),
      family: "artifact_review",
      variant: "visual_gallery",
      status: "active",
      title: "Review canonical references",
      explanation: "Review every canonical reference, select each one, then approve the Visual Bible.",
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

  private async finalizePages(bookletId: string, jobId: string) {
    const items = await this.repositories.jobs.getItems(jobId);
    if (!items.length || items.some((item) => item.status !== "succeeded" || !item.assetId)) return;
    const plan = await this.artifacts.get(bookletId, "page_plan");
    if (!plan.currentVersion) return;
    const previous = await this.artifacts.get(bookletId, "final_pages");
    const existingByPageId = new Map(((previous.currentVersion?.content as { pages?: Array<{ pageId: string; pageIndex: number; sourceIllustrationAssetId: string; composedAssetId: string; readerText: string; textSafeRegion: { x: number; y: number; width: number; height: number }; revisionNumber: number; acceptedQualityIssueIds: string[] }> } | undefined)?.pages ?? []).map((page) => [page.pageId, page]));
    const generatedByPageId = new Map(items.map((item) => {
      const source = item.input as { page: { pageId: string; pageIndex: number; readerText: string; textSafeRegion: { x: number; y: number; width: number; height: number } } };
      const result = item.result as { sourceAssetId: string; composedAssetId: string };
      const previousPage = existingByPageId.get(source.page.pageId);
      return [source.page.pageId, { pageId: source.page.pageId, pageIndex: source.page.pageIndex, sourceIllustrationAssetId: result.sourceAssetId, composedAssetId: result.composedAssetId, readerText: source.page.readerText, textSafeRegion: source.page.textSafeRegion, revisionNumber: (previousPage?.revisionNumber ?? 0) + 1, acceptedQualityIssueIds: [] }] as const;
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
      explanation: "Review every composed page, select each one, then approve Final Pages for PDF export.",
      allowedActions: ["approve_and_continue"],
      payload: {
        artifactType: "final_pages",
        versionId: revised.currentVersion.id,
        items: pages.map((page) => ({ assetId: page.composedAssetId, label: page.pageIndex === 0 ? "Cover" : `Story page ${page.pageIndex}`, description: "Check composition and reader-facing text.", selected: false })),
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
