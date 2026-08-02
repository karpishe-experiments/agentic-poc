import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import { RecoverableApplicationError } from "@/lib/application/application-error";
import { ArtifactService } from "@/lib/application/artifact-service";
import type { GenerationService } from "@/lib/application/generation-service";
import { createProgressCard, createRecoveryCard } from "@/lib/application/card-factories";
import { QualityService } from "@/lib/application/quality-service";
import { cardResponseSchema, genUICardSchema } from "@/lib/contracts/cards";

export class CardService {
  private readonly repositories: Repositories;
  private readonly artifacts: ArtifactService;
  private readonly generation?: GenerationService;
  private readonly quality: QualityService;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; artifacts?: ArtifactService; generation?: GenerationService; quality?: QualityService } = {}) {
    const database = dependencies.database ?? createDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.artifacts = dependencies.artifacts ?? new ArtifactService({ database });
    this.generation = dependencies.generation;
    this.quality = dependencies.quality ?? new QualityService({ database });
  }

  public async submit(bookletId: string, input: unknown) {
    const parsed = cardResponseSchema.parse(input);
    const card = await this.repositories.conversation.getCard(bookletId, parsed.cardId);
    if (!card) throw new RecoverableApplicationError({ code: "card_not_found", message: "This card is no longer available.", status: 404 });
    if (card.family === "artifact_review" && card.variant === "summary" && parsed.action === "approve_and_continue" && card.payload.artifactType === "story_plan") {
      const outcome = await this.quality.runStoryReadiness(bookletId);
      if (outcome.kind !== "passed") {
        const refreshed = await this.artifacts.get(bookletId, "story_plan");
        const replacement = outcome.kind === "unresolved"
          ? outcome.card
          : {
            schemaVersion: "1" as const,
            cardId: randomUUID(),
            family: "artifact_review" as const,
            variant: "summary" as const,
            status: "active" as const,
            title: "Review the repaired Story Plan",
            explanation: "One targeted repair was applied. Review this new version before continuing.",
            allowedActions: ["approve_and_continue" as const, "request_revision" as const],
            payload: { artifactType: "story_plan" as const, versionId: refreshed.currentVersion?.id ?? null, summary: [{ label: "Status", value: "Targeted repair ready" }] },
          };
        await this.repositories.conversation.persistAssistantCard({
          bookletId,
          messageId: randomUUID(),
          narration: outcome.kind === "unresolved" ? "The Story Plan needs your decision before visual development." : "One targeted Story Plan repair is ready for your review.",
          card: replacement,
          createdAtMs: Date.now(),
        });
        return { kind: "saved" as const, duplicate: false, followupRequired: false, summary: "Story quality requires an updated review.", refreshRequired: true };
      }
    }
    if (card.family === "artifact_review" && parsed.action === "approve_and_continue" && card.payload.artifactType === "page_plan") {
      const review = await this.quality.reviewGenerationReadiness(bookletId);
      if (review.status !== "passed") throw new RecoverableApplicationError({ code: "generation_readiness_failed", message: review.issues.map((issue) => issue.message).join(" "), status: 409 });
    }
    if (card.family === "artifact_review" && parsed.action === "approve_and_continue" && card.payload.artifactType === "final_pages") {
      const review = await this.quality.reviewFinalPages(bookletId);
      if (review.status !== "passed") throw new RecoverableApplicationError({ code: "final_page_quality_failed", message: review.issues.map((issue) => issue.message).join(" "), status: 409 });
    }
    const now = Date.now();
    const result = await this.repositories.conversation.submitCardResponse({ bookletId, response: parsed, createdAtMs: now });
    if (result.kind !== "conflict") {
      if (result.kind === "saved" && card.family === "issue" && parsed.action === "accept_with_issue") {
        await this.repositories.evidence.acceptLatestUnresolvedQualityReview(bookletId, now);
      }
      if (result.kind === "saved" && card.family === "artifact_review" && parsed.action === "approve_and_continue" && card.payload.versionId) {
        if (card.payload.artifactType === "visual_bible") {
          if (card.variant === "summary") {
            const visualBible = await this.artifacts.get(bookletId, "visual_bible");
            const content = visualBible.currentVersion?.content as { characters?: Array<{ referenceRequired: boolean }>; locations?: Array<{ referenceRequired: boolean }> } | undefined;
            const referenceCount = [...(content?.characters ?? []), ...(content?.locations ?? [])].filter((entity) => entity.referenceRequired).length;
            const contentApproved = visualBible.approvals.some((approval) => approval.artifactVersionId === card.payload.versionId && approval.scope === "artifact_content");
            if (contentApproved && referenceCount === 0) {
              await this.artifacts.approve(bookletId, "visual_bible", card.payload.versionId);
              return result;
            }
            if (contentApproved) throw new RecoverableApplicationError({ code: "reference_generation_pending", message: "Canonical references are still generating or awaiting review.", status: 409 });
            await this.artifacts.approve(bookletId, "visual_bible", card.payload.versionId, { scope: "artifact_content" });
            if (referenceCount === 0) {
              await this.repositories.conversation.persistAssistantCard({
                bookletId,
                messageId: randomUUID(),
                narration: "This Visual Bible has no recurring visual subject that needs a canonical reference.",
                card: {
                  schemaVersion: "1",
                  cardId: randomUUID(),
                  family: "artifact_review",
                  variant: "summary",
                  status: "active",
                  title: "Approve the Visual Bible",
                  explanation: "The definitions are approved and no canonical reference is required for this booklet.",
                  allowedActions: ["approve_and_continue"],
                  payload: { artifactType: "visual_bible", versionId: card.payload.versionId, summary: [{ label: "Required references", value: "0" }] },
                },
                createdAtMs: Date.now(),
              });
              return result;
            }
            const generation = this.generation ?? new (await import("@/lib/application/generation-service")).GenerationService();
            const job = await generation.createReferenceJob(bookletId);
            const items = await this.repositories.jobs.getItems(job.id);
            await this.repositories.conversation.persistAssistantCard({
              bookletId,
              messageId: randomUUID(),
              narration: "Canonical references are generating in the background. You can keep using the workspace while progress updates.",
              card: createProgressCard({ cardId: randomUUID(), title: "Generating canonical references", explanation: "Completed references are retained if another item needs recovery.", variant: "artifact_generation", completed: 0, total: Math.max(1, items.length), currentLabel: "Preparing reference images" }),
              createdAtMs: Date.now(),
            });
            // The persistent Node runner owns normal execution. Vitest disables it to
            // keep fixtures deterministic, so the test-only path starts the same job here.
            if (process.env.VITEST) generation.startReferenceJob(bookletId, job.id);
            return result;
          }
          const visualBible = await this.artifacts.get(bookletId, "visual_bible");
          const content = visualBible.currentVersion?.content as { characters?: Array<{ entityId: string; currentReferenceAssetId: string | null }>; locations?: Array<{ entityId: string; currentReferenceAssetId: string | null }> } | undefined;
          const entities = [...(content?.characters ?? []), ...(content?.locations ?? [])].filter((entity) => entity.currentReferenceAssetId);
          if (!entities.length) throw new RecoverableApplicationError({ code: "references_missing", message: "Generate canonical references before approving the Visual Bible.", status: 409 });
          const selected = new Set(Array.isArray(parsed.value) ? parsed.value.filter((value): value is string => typeof value === "string") : []);
          const requiredAssets = new Set(entities.map((entity) => entity.currentReferenceAssetId!));
          if (selected.size !== requiredAssets.size || [...requiredAssets].some((assetId) => !selected.has(assetId))) throw new RecoverableApplicationError({ code: "reference_review_incomplete", message: "Select every canonical reference after reviewing it before approving the Visual Bible.", status: 409 });
          for (const entity of entities) {
            await this.artifacts.approve(bookletId, "visual_bible", card.payload.versionId!, { scope: "reference", subjectKey: entity.entityId });
          }
        }
        if (card.payload.artifactType === "final_pages") {
          const finalPages = await this.artifacts.get(bookletId, "final_pages");
          const pages = finalPages.currentVersion?.content as { pages?: Array<{ pageId: string }> } | undefined;
          if (!pages?.pages?.length) throw new RecoverableApplicationError({ code: "final_pages_missing", message: "Composed pages need to be available before approval.", status: 409 });
          const finalContent = finalPages.currentVersion?.content as { pages?: Array<{ pageId: string; composedAssetId: string }> } | undefined;
          const selected = new Set(Array.isArray(parsed.value) ? parsed.value.filter((value): value is string => typeof value === "string") : []);
          const requiredAssets = new Set((finalContent?.pages ?? []).map((page) => page.composedAssetId));
          if (selected.size !== requiredAssets.size || [...requiredAssets].some((assetId) => !selected.has(assetId))) throw new RecoverableApplicationError({ code: "page_review_incomplete", message: "Select every final page after reviewing it before approval.", status: 409 });
          for (const page of pages.pages) {
            await this.artifacts.approve(bookletId, "final_pages", card.payload.versionId!, { scope: "page", subjectKey: page.pageId });
          }
        }
        await this.artifacts.approve(bookletId, card.payload.artifactType, card.payload.versionId);
        if (card.payload.artifactType === "page_plan") {
          const generation = this.generation ?? new (await import("@/lib/application/generation-service")).GenerationService();
          const job = await generation.createPageJob(bookletId);
          const items = await this.repositories.jobs.getItems(job.id);
          await this.repositories.conversation.persistAssistantCard({
            bookletId,
            messageId: randomUUID(),
            narration: "Page illustrations are generating in sequence in the background. Completed pages remain available if another page needs recovery.",
            card: createProgressCard({ cardId: randomUUID(), title: "Generating booklet pages", explanation: "You can keep using the workspace while each page completes.", variant: "page_batch", completed: 0, total: Math.max(1, items.length), currentLabel: "Preparing the cover illustration" }),
            createdAtMs: Date.now(),
          });
          // See the reference-job note above: avoid racing the in-process runner.
          if (process.env.VITEST) generation.startPageJob(bookletId, job.id);
        }
      }
      if (result.kind === "saved" && card.family === "question" && parsed.action === "confirm_geometry" && typeof parsed.value === "string") {
        if (!["square_1_1", "landscape_5_4", "portrait_4_5"].includes(parsed.value)) throw new RecoverableApplicationError({ code: "invalid_geometry", message: "Choose one of the offered page shapes.", status: 400 });
        const specification = await this.artifacts.get(bookletId, "booklet_specification");
        if (!specification.currentVersion || !specification.currentVersion.content || typeof specification.currentVersion.content !== "object") throw new RecoverableApplicationError({ code: "specification_missing", message: "Create a booklet specification before confirming geometry.", status: 409 });
        const updated = await this.artifacts.revise(bookletId, "booklet_specification", { ...specification.currentVersion.content, geometry: parsed.value, geometryConfirmed: true }, { createdBy: "application" });
        await this.artifacts.approve(bookletId, "booklet_specification", updated.currentVersion!.id);
      }
      if (result.kind === "saved" && card.family === "question" && card.title === "Choose visual style" && parsed.action === "select" && typeof parsed.value === "string") {
        const style = await this.artifacts.get(bookletId, "visual_style");
        if (!style.currentVersion || !style.currentVersion.content || typeof style.currentVersion.content !== "object") throw new RecoverableApplicationError({ code: "visual_style_missing", message: "Create visual direction before selecting a style.", status: 409 });
        const styles: Record<string, { name: string; visualDirection: string; palette: string[]; texture: string; lighting: string; styleReferenceAssetIds: string[] }> = {
          "soft-watercolor": { name: "Soft watercolor", visualDirection: "Rounded watercolor forms, soft edges, and clear character silhouettes.", palette: ["sunlit ochre", "leaf green", "sky blue", "warm cream"], texture: "Layered watercolor paper texture", lighting: "Warm morning light", styleReferenceAssetIds: ["00000000-0000-4000-8000-000000000001"] },
          "cut-paper-collage": { name: "Cut-paper collage", visualDirection: "Layered paper shapes with bold readable silhouettes.", palette: ["coral", "teal", "butter yellow"], texture: "Cut paper edges", lighting: "Even cheerful daylight", styleReferenceAssetIds: ["00000000-0000-4000-8000-000000000002"] },
          "colored-pencil": { name: "Colored pencil", visualDirection: "Visible pencil texture with clear rounded forms.", palette: ["berry red", "forest green", "soft violet"], texture: "Colored pencil grain", lighting: "Gentle afternoon light", styleReferenceAssetIds: ["00000000-0000-4000-8000-000000000003"] },
        };
        const choice = styles[parsed.value];
        if (!choice) throw new RecoverableApplicationError({ code: "invalid_style", message: "Choose one of the seeded visual styles.", status: 400 });
        const updated = await this.artifacts.revise(bookletId, "visual_style", { ...style.currentVersion.content, styleId: parsed.value, ...choice }, { createdBy: "user_edit" });
        await this.artifacts.approve(bookletId, "visual_style", updated.currentVersion!.id);
      }
      return result;
    }

    const recoveryCard = createRecoveryCard({
      cardId: randomUUID(),
      title: "Decision already saved",
      explanation: "The earlier response remains in the booklet history.",
      code: "card_already_submitted",
      summary: result.summary,
      details: ["Reopen the previous card if you need to make a different decision."],
    });
    await this.repositories.conversation.persistAssistantCard({
      bookletId,
      messageId: randomUUID(),
      narration: "I kept the first saved decision and added a recovery option.",
      card: recoveryCard,
      createdAtMs: now,
    });
    return { ...result, recoveryCard };
  }

  public async reopen(bookletId: string, cardId: string) {
    const previous = await this.repositories.conversation.getCard(bookletId, cardId);
    if (!previous) throw new RecoverableApplicationError({ code: "card_not_found", message: "This card is no longer available.", status: 404 });
    if (previous.status === "active") throw new RecoverableApplicationError({ code: "card_already_active", message: "This card is already open for a response." });
    const card = genUICardSchema.parse({ ...previous, cardId: randomUUID(), status: "active" });
    await this.repositories.conversation.persistAssistantCard({
      bookletId,
      messageId: randomUUID(),
      narration: `Reopened: ${previous.title}`,
      card,
      createdAtMs: Date.now(),
    });
    return card;
  }
}

export function getCardService(): CardService {
  return new CardService();
}
