import { randomUUID } from "node:crypto";
import { validateUIMessages } from "ai";
import { z } from "zod";
import { createRepositories, type Repositories } from "@/db/repositories";
import { RecoverableApplicationError } from "@/lib/application/application-error";
import { createDatabase, type Database } from "@/db/client";
import { BookletNotFoundError } from "@/lib/application/booklet-service";
import { ArtifactService } from "@/lib/application/artifact-service";
import { createFakeConversationResult } from "@/lib/application/fake-conversation-runtime";
import { ManagerService } from "@/lib/application/manager-service";
import { QualityService } from "@/lib/application/quality-service";
import { buildSkillContext } from "@/lib/application/skill-context";
import type { GenerationService } from "@/lib/application/generation-service";
import type { ExportService } from "@/lib/application/export-service";
import { readinessAssessmentSchema } from "@/lib/contracts/skills";
import { storyPlanningResultSchema } from "@/lib/skills/story-planning-revision";
import { storyQualityResultSchema } from "@/lib/skills/quality-review-repair";
import { visualDirectionResultSchema } from "@/lib/skills/visual-direction-reference-planning";
import { bookletSpecificationResultSchema } from "@/lib/skills/booklet-specification";
import { pagePlanningResultSchema } from "@/lib/skills/page-planning-writing";
import { imagePromptCompilationResultSchema } from "@/lib/skills/image-prompt-compilation";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import { bookletMessageMetadataSchema, bookletUIMessageDataSchemas, type BookletUIMessage } from "@/lib/contracts/messages";

export type ChatTurn = { userMessage: BookletUIMessage; assistantMessage: BookletUIMessage };

export class ChatService {
  private readonly repositories: Repositories;
  private readonly manager: ManagerService;
  private readonly artifacts: ArtifactService;
  private readonly quality: QualityService;
  private readonly database: Database;
  private readonly exporter?: ExportService;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; manager?: ManagerService; artifacts?: ArtifactService; quality?: QualityService; generation?: GenerationService; exporter?: ExportService } = {}) {
    const database = dependencies.database ?? createDatabase();
    this.database = database;
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.manager = dependencies.manager ?? new ManagerService({ database });
    this.artifacts = dependencies.artifacts ?? new ArtifactService({ database });
    this.quality = dependencies.quality ?? new QualityService({ database });
    this.exporter = dependencies.exporter;
  }

  public async createFakeTurn(bookletId: string, input: unknown): Promise<ChatTurn> {
    const [message] = await validateUIMessages<BookletUIMessage>({
      messages: [input],
      metadataSchema: bookletMessageMetadataSchema,
      dataSchemas: bookletUIMessageDataSchemas,
    });
    if (!message || message.role !== "user") throw new RecoverableApplicationError({ code: "invalid_chat_message", message: "Send one text message at a time.", status: 400 });
    const booklet = await this.repositories.booklets.get(bookletId);
    if (!booklet) throw new BookletNotFoundError(bookletId);

    const text = message.parts.find((part) => part.type === "text")?.text?.trim();
    if (!text) throw new RecoverableApplicationError({ code: "invalid_chat_message", message: "Add a message before sending it.", status: 400 });
    const previousMessages = await this.repositories.conversation.listMessages(bookletId);
    const responseId = message.metadata?.responseId;
    let claimedResponseId: string | null = null;
    let authoritativeText = text;

    if (responseId) {
      const claim = await this.repositories.conversation.claimCardFollowup({ bookletId, responseId });
      if (claim.status === "missing") {
        throw new RecoverableApplicationError({ code: "card_response_not_found", message: "That saved decision is no longer available. Please reopen the card and try again.", status: 409 });
      }
      if (claim.status === "running") {
        throw new RecoverableApplicationError({ code: "card_followup_running", message: "That decision is still being processed. Please try again in a moment.", status: 409 });
      }
      if (claim.status === "completed") {
        const [assistantMessage] = await validateUIMessages<BookletUIMessage>({
          messages: [claim.assistantMessage],
          metadataSchema: bookletMessageMetadataSchema,
          dataSchemas: bookletUIMessageDataSchemas,
        });
        if (!assistantMessage || assistantMessage.role !== "assistant") throw new Error("Saved assistant follow-up is invalid.");
        return { userMessage: message, assistantMessage };
      }
      claimedResponseId = responseId;
      authoritativeText = claim.summary;
    } else if (await this.repositories.conversation.getActiveCard(bookletId)) {
      throw new RecoverableApplicationError({ code: "active_card_required", message: "Respond to the active card before starting a different request.", status: 409 });
    }

    const originalIdea = previousMessages
      .flatMap((persisted) => {
        const saved = persisted.message;
        return saved && typeof saved === "object" && "parts" in saved && Array.isArray(saved.parts)
          ? saved.parts.filter((part): part is { type: "text"; text: string } => Boolean(part) && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string").map((part) => part.text)
          : [];
      })
      .find(Boolean) ?? authoritativeText;
    const now = Date.now();
    const persistedUserMessage: BookletUIMessage = {
      ...message,
      metadata: {
        schemaVersion: "1",
        bookletId,
        responseId: responseId ?? undefined,
        persistedAt: new Date(now).toISOString(),
      },
      parts: [{ type: "text", text: authoritativeText }],
    };
    try {
      await this.repositories.conversation.appendMessage({ id: persistedUserMessage.id, bookletId, role: "user", message: persistedUserMessage, createdAtMs: now });
      if (booklet.currentStage === "pdf_export") {
        const result = await this.createExportResponse(bookletId);
        const assistantMessageId = randomUUID();
        await this.repositories.conversation.persistAssistantCard({ bookletId, messageId: assistantMessageId, narration: result.narration, card: result.card, createdAtMs: now });
        if (claimedResponseId) await this.repositories.conversation.completeCardFollowup({ responseId: claimedResponseId, assistantMessageId });
        return {
          userMessage: persistedUserMessage,
          assistantMessage: { id: assistantMessageId, role: "assistant", metadata: { schemaVersion: "1", bookletId, persistedAt: new Date(now).toISOString() }, parts: [{ type: "text", text: result.narration }, { type: "data-card", id: result.card.cardId, data: result.card }] },
        };
      }
      const storyDetail = ["story_plan", "visual_style", "visual_bible", "booklet_specification", "page_plan"].includes(booklet.currentStage) ? await this.artifacts.get(bookletId, "story_plan") : null;
      const currentStory = booklet.currentStage === "story_plan" ? storyDetail : null;
      const visualStyle = booklet.currentStage === "visual_bible" ? await this.artifacts.get(bookletId, "visual_style") : null;
      const visualBible = ["booklet_specification", "page_plan"].includes(booklet.currentStage) ? await this.artifacts.get(bookletId, "visual_bible") : null;
      const specification = booklet.currentStage === "page_plan" ? await this.artifacts.get(bookletId, "booklet_specification") : null;
      const finalPages = booklet.currentStage === "final_pages" ? await this.artifacts.get(bookletId, "final_pages") : null;
      const requestsQuality = Boolean(currentStory?.currentVersion) && /\b(quality|review|check)\b/i.test(authoritativeText);
      const artifactSummaries = await this.repositories.artifacts.listByBooklet(bookletId);
      const managerResult = await this.manager.run(buildSkillContext({
        booklet,
        operation: requestsQuality ? "story_quality" : "guided_intake",
        intent: authoritativeText,
        originalIdea,
        previousMessages,
        approvedArtifactVersionIds: artifactSummaries.filter((artifact) => artifact.state === "approved" && artifact.currentVersionId).map((artifact) => artifact.currentVersionId!),
        traceId: randomUUID(),
      }), {
        cardId: randomUUID(),
        skillInput: booklet.currentStage === "story_plan"
          ? { intent: authoritativeText, currentStory: currentStory?.currentVersion?.content ?? null, storyPlan: currentStory?.currentVersion?.content }
          : booklet.currentStage === "visual_style"
            ? { intent: authoritativeText, storyPlan: storyDetail?.currentVersion?.content, visualStyle: null }
            : booklet.currentStage === "visual_bible"
              ? { intent: authoritativeText, storyPlan: storyDetail?.currentVersion?.content, visualStyle: visualStyle?.currentVersion?.content ?? null }
              : booklet.currentStage === "booklet_specification"
                ? { intent: authoritativeText, storyPlan: storyDetail?.currentVersion?.content }
                : booklet.currentStage === "page_plan"
                  ? { intent: authoritativeText, storyPlan: storyDetail?.currentVersion?.content, visualBible: visualBible?.currentVersion?.content, specification: specification?.currentVersion?.content }
                  : booklet.currentStage === "final_pages"
                    ? { intent: authoritativeText, finalPages: finalPages?.currentVersion?.content }
              : undefined,
      });
      const assessment = readinessAssessmentSchema.safeParse(managerResult.output);
      const storyDraft = storyPlanningResultSchema.safeParse(managerResult.output);
      const storyQuality = storyQualityResultSchema.safeParse(managerResult.output);
      const visualDirection = visualDirectionResultSchema.safeParse(managerResult.output);
      const specificationDraft = bookletSpecificationResultSchema.safeParse(managerResult.output);
      const pagePlanDraft = pagePlanningResultSchema.safeParse(managerResult.output);
      const finalPagesReview = imagePromptCompilationResultSchema.safeParse(managerResult.output);
      const result = assessment.success && assessment.data.questionCard
        ? { narration: "I’ll shape this around the idea you shared. First, let’s choose the reading audience.", card: assessment.data.questionCard }
        : assessment.success && assessment.data.ready && booklet.currentStage === "audience_profile"
          ? await this.createAudienceReview(bookletId, originalIdea, assessment.data.knownFacts)
          : storyDraft.success && booklet.currentStage === "story_plan"
            ? await this.createStoryReview(bookletId, storyDraft.data.storyPlan, storyDraft.data.summary)
            : storyQuality.success && booklet.currentStage === "story_plan"
              ? await this.createQualityResponse(bookletId, storyQuality.data)
              : visualDirection.success && (booklet.currentStage === "visual_style" || booklet.currentStage === "visual_bible")
                ? await this.createVisualReview(bookletId, visualDirection.data)
                : specificationDraft.success && booklet.currentStage === "booklet_specification"
                  ? await this.createSpecificationConfirmation(bookletId, specificationDraft.data.content, specificationDraft.data.summary)
                  : pagePlanDraft.success && booklet.currentStage === "page_plan"
                    ? await this.createPagePlanReview(bookletId, pagePlanDraft.data.content, pagePlanDraft.data.summary)
                    : finalPagesReview.success && booklet.currentStage === "final_pages"
                      ? await this.createFinalPagesReview(bookletId, finalPagesReview.data.summary)
          : createFakeConversationResult({ bookletId, cardId: randomUUID(), idea: originalIdea });
      const assistantMessageId = randomUUID();
      await this.repositories.conversation.persistAssistantCard({
        bookletId,
        messageId: assistantMessageId,
        narration: result.narration,
        card: result.card,
        createdAtMs: now,
      });
      if (claimedResponseId) await this.repositories.conversation.completeCardFollowup({ responseId: claimedResponseId, assistantMessageId });
      return {
        userMessage: persistedUserMessage,
        assistantMessage: {
          id: assistantMessageId,
          role: "assistant",
          metadata: { schemaVersion: "1", bookletId, persistedAt: new Date(now).toISOString() },
          parts: [{ type: "text", text: result.narration }, { type: "data-card", id: result.card.cardId, data: result.card }],
        },
      };
    } catch (error) {
      if (claimedResponseId) await this.repositories.conversation.resetRunningCardFollowup(claimedResponseId);
      throw error;
    }
  }

  private async createAudienceReview(bookletId: string, idea: string, knownFacts: string[]) {
    const ageBand = knownFacts.find((fact) => /3[-–]5/.test(fact)) ? "3-5" as const
      : knownFacts.find((fact) => /9[-–]12/.test(fact)) ? "9-12" as const
        : "6-8" as const;
    const audience = await this.artifacts.revise(bookletId, "audience_profile", {
      schemaVersion: SCHEMA_VERSION,
      ageBand,
      interests: ["gentle adventures", "helping friends"],
      readingNeeds: "Clear concrete language with a reassuring emotional arc.",
      tone: "Warm, playful, and hopeful",
      avoidList: ["graphic danger"],
      knownFacts,
      openAssumptions: ["The creator can revise details before approval."],
    }, { createdBy: "agent" });
    return {
      narration: "I drafted the audience profile. Review it before we create the Story Plan.",
      card: {
        schemaVersion: SCHEMA_VERSION,
        cardId: randomUUID(),
        family: "artifact_review" as const,
        variant: "summary" as const,
        status: "active" as const,
        title: "Review the audience profile",
        explanation: "Approving this version keeps the reading age and tone available to the Story Plan.",
        allowedActions: ["approve_and_continue" as const],
        payload: {
          artifactType: "audience_profile" as const,
          versionId: audience.currentVersion!.id,
          summary: [
            { label: "Reading age", value: ageBand.replace("-", "–") },
            { label: "Tone", value: "Warm, playful, and hopeful" },
          ],
        },
      },
    };
  }

  private async createStoryReview(bookletId: string, draft: unknown, narration: string) {
    const story = await this.artifacts.revise(bookletId, "story_plan", draft, { createdBy: "agent" });
    if (!story.currentVersion || !story.currentVersion.content || typeof story.currentVersion.content !== "object") {
      throw new RecoverableApplicationError({ code: "story_plan_missing", message: "The Story Plan needs a saved version before it can be reviewed.", status: 409 });
    }
    const content = story.currentVersion.content as { premise?: string; theme?: string; ending?: string };
    return {
      narration,
      card: {
        schemaVersion: SCHEMA_VERSION,
        cardId: randomUUID(),
        family: "artifact_review" as const,
        variant: "summary" as const,
        status: "active" as const,
        title: "Review the Story Plan",
        explanation: "Approve it to carry these story constraints into visual direction.",
        allowedActions: ["approve_and_continue" as const, "request_revision" as const],
        payload: {
          artifactType: "story_plan" as const,
          versionId: story.currentVersion.id,
          summary: [
            { label: "Premise", value: content.premise ?? "A gentle story is being drafted." },
            { label: "Theme", value: content.theme ?? "Kindness" },
            { label: "Ending", value: content.ending ?? "A hopeful ending" },
          ],
        },
      },
    };
  }

  private async createQualityResponse(bookletId: string, qualityOutput: unknown) {
    const review = await this.quality.applyStoryReview(bookletId, qualityOutput);
    if (review.kind === "unresolved") {
      return { narration: "The Story Plan needs a focused change before it can move forward.", card: review.card };
    }
    const story = await this.artifacts.get(bookletId, "story_plan");
    const content = story.currentVersion?.content as { premise?: string; theme?: string; ending?: string } | undefined;
    return {
      narration: review.kind === "repaired" ? "I made one focused repair and the Story Plan is ready for your review." : "The Story Plan passed its readiness check and is ready for your review.",
      card: {
        schemaVersion: SCHEMA_VERSION,
        cardId: randomUUID(),
        family: "artifact_review" as const,
        variant: "summary" as const,
        status: "active" as const,
        title: "Review the Story Plan",
        explanation: "Approve it to carry these story constraints into visual direction.",
        allowedActions: ["approve_and_continue" as const, "request_revision" as const],
        payload: {
          artifactType: "story_plan" as const,
          versionId: story.currentVersion?.id ?? null,
          summary: [
            { label: "Premise", value: content?.premise ?? "A gentle story is being drafted." },
            { label: "Theme", value: content?.theme ?? "Kindness" },
            { label: "Ending", value: content?.ending ?? "A hopeful ending" },
          ],
        },
      },
    };
  }

  private async createVisualReview(bookletId: string, output: z.infer<typeof visualDirectionResultSchema>) {
    if (output.kind === "visual_style") {
      await this.artifacts.revise(bookletId, "visual_style", output.content, { createdBy: "agent" });
      return {
        narration: output.summary,
        card: {
          schemaVersion: SCHEMA_VERSION, cardId: randomUUID(), family: "question" as const, variant: "single_select" as const, status: "active" as const,
          title: "Choose visual style", explanation: "Soft watercolor is recommended, but each seeded direction remains available.", allowedActions: ["select" as const],
          payload: { prompt: "Choose the booklet's visual direction.", recommendedChoiceId: output.content.styleId, choices: [
            { id: "soft-watercolor", label: "Soft watercolor", description: "Warm, forgiving shapes for gentle stories." },
            { id: "cut-paper-collage", label: "Cut-paper collage", description: "Bold handmade shapes and clear silhouettes." },
            { id: "colored-pencil", label: "Colored pencil", description: "Textured lines and familiar storybook warmth." },
          ] },
        },
      };
    }
    await this.artifacts.revise(bookletId, "visual_bible", output.content, { createdBy: "agent" });
    const detail = await this.artifacts.get(bookletId, "visual_bible");
    const bible = detail.currentVersion?.content as { characters: Array<{ name: string; referenceRequired: boolean }>; locations: Array<{ name: string; referenceRequired: boolean }> };
    const requiredReferences = [...bible.characters, ...bible.locations].filter((item) => item.referenceRequired).length;
    return {
      narration: output.summary,
      card: {
        schemaVersion: SCHEMA_VERSION, cardId: randomUUID(), family: "artifact_review" as const, variant: "summary" as const, status: "active" as const,
        title: "Review the Visual Bible", explanation: `Approve these definitions to generate ${requiredReferences} canonical reference${requiredReferences === 1 ? "" : "s"} in the background.`, allowedActions: ["approve_and_continue" as const],
        payload: { artifactType: "visual_bible" as const, versionId: detail.currentVersion!.id, summary: [{ label: "Characters", value: String(bible.characters.length) }, { label: "Locations", value: String(bible.locations.length) }, { label: "Required references", value: String(requiredReferences) }] },
      },
    };
  }

  private async createSpecificationConfirmation(bookletId: string, content: unknown, narration: string) {
    const detail = await this.artifacts.revise(bookletId, "booklet_specification", content, { createdBy: "agent" });
    const specification = detail.currentVersion?.content as { storyPageCount: number; geometry: "square_1_1" | "landscape_5_4" | "portrait_4_5" };
    return {
      narration,
      card: {
        schemaVersion: SCHEMA_VERSION, cardId: randomUUID(), family: "question" as const, variant: "single_select" as const, status: "active" as const,
        title: "Confirm booklet geometry", explanation: `The plan recommends ${specification.storyPageCount} story pages. You may change the count from 3 to 8 in the Booklet Specification editor, then choose the final page shape before page planning.`, allowedActions: ["confirm_geometry" as const],
        payload: { prompt: "Choose the final booklet page shape.", recommendedChoiceId: specification.geometry, choices: [
          { id: "square_1_1", label: "Square (1:1)" }, { id: "landscape_5_4", label: "Landscape (5:4)" }, { id: "portrait_4_5", label: "Portrait (4:5)" },
        ] },
      },
    };
  }

  private async createPagePlanReview(bookletId: string, content: unknown, narration: string) {
    const detail = await this.artifacts.revise(bookletId, "page_plan", content, { createdBy: "agent" });
    const plan = detail.currentVersion?.content as { storyPageCount: number; geometry: string; pages: unknown[] };
    return {
      narration,
      card: {
        schemaVersion: SCHEMA_VERSION, cardId: randomUUID(), family: "artifact_review" as const, variant: "summary" as const, status: "active" as const,
        title: "Review the Page Plan", explanation: "Each package has one scene and one intended illustration. Approve it when the count and sequence are right.", allowedActions: ["approve_and_continue" as const, "request_revision" as const],
        payload: { artifactType: "page_plan" as const, versionId: detail.currentVersion!.id, summary: [{ label: "Story pages", value: String(plan.storyPageCount) }, { label: "Canvas", value: plan.geometry }, { label: "Page packages", value: String(plan.pages.length) }] },
      },
    };
  }

  private async createFinalPagesReview(bookletId: string, narration: string) {
    const detail = await this.artifacts.get(bookletId, "final_pages");
    const pages = detail.currentVersion?.content as { pages?: Array<{ pageIndex: number; pageId: string; composedAssetId: string }> } | undefined;
    if (!detail.currentVersion || !pages?.pages) throw new Error("Final Pages are not available for review.");
    return {
      narration,
      card: {
        schemaVersion: SCHEMA_VERSION, cardId: randomUUID(), family: "artifact_review" as const, variant: "visual_gallery" as const, status: "active" as const,
        title: "Review final pages", explanation: "Approve every composed page set before PDF export.", allowedActions: ["approve_and_continue" as const],
        payload: { artifactType: "final_pages" as const, versionId: detail.currentVersion.id, items: pages.pages.map((page) => ({ assetId: page.composedAssetId, label: page.pageIndex === 0 ? "Cover" : `Story page ${page.pageIndex}`, selected: false })) },
      },
    };
  }

  private async createExportResponse(bookletId: string) {
    const exporter = this.exporter ?? new (await import("@/lib/application/export-service")).ExportService({ database: this.database });
    const result = await exporter.export(bookletId);
    const artifact = await this.artifacts.get(bookletId, "pdf_export");
    return {
      narration: `Your ${result.pageCount}-page PDF is ready to download.`,
      card: {
        schemaVersion: SCHEMA_VERSION, cardId: randomUUID(), family: "artifact_review" as const, variant: "summary" as const, status: "active" as const,
        title: "Download your booklet PDF", explanation: "The export keeps the approved page order and geometry.", allowedActions: [],
        payload: { artifactType: "pdf_export" as const, versionId: artifact.currentVersion?.id ?? null, downloadAssetId: result.assetId, summary: [{ label: "Pages", value: String(result.pageCount) }, { label: "Status", value: "Ready" }] },
      },
    };
  }
}

export function getChatService(): ChatService {
  return new ChatService();
}
