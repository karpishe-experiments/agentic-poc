import { randomUUID } from "node:crypto";
import { validateUIMessages } from "ai";

import { createRepositories, type Repositories } from "@/db/repositories";
import { RecoverableApplicationError } from "@/lib/application/application-error";
import { createRecoveryCard } from "@/lib/application/card-factories";
import { getDatabase, type Database } from "@/db/client";
import { BookletNotFoundError } from "@/lib/application/booklet-service";
import { ArtifactService } from "@/lib/application/artifact-service";
import { ManagerService } from "@/lib/application/manager-service";
import { QualityService } from "@/lib/application/quality-service";
import type { PreparedActiveAgentSet } from "@/lib/application/agent-resolver";
import { buildSkillContext } from "@/lib/application/skill-context";
import type { GenerationService } from "@/lib/application/generation-service";
import type { ExportService } from "@/lib/application/export-service";

import { SCHEMA_VERSION } from "@/lib/contracts/common";


import { resolveComicCopyMode } from "@/lib/config/env";

import { bookletMessageMetadataSchema, bookletUIMessageDataSchemas, type BookletUIMessage } from "@/lib/contracts/messages";
import type { GenUICard } from "@/lib/contracts/cards";
import { assertMutationsAllowed } from "@/lib/application/deployment-control";

export type ChatTurn = { userMessage: BookletUIMessage; assistantMessage: BookletUIMessage };

const typedRecoveryCodes = new Set([
  "visual_bible_entities_mismatch",
  "page_plan_specification_mismatch",
  "page_plan_reference_mismatch",
  "skill_contract_mismatch",
]);

/**
 * Only these validation failures safely replace the active decision with a
 * retry card. Other recoverable errors may need the existing card to remain
 * available, so they continue through the normal error envelope.
 */
export function isTypedWorkflowRecovery(error: unknown): error is RecoverableApplicationError {
  return error instanceof RecoverableApplicationError && typedRecoveryCodes.has(error.code);
}

export class ChatService {
  private readonly repositories: Repositories;
  private readonly manager: ManagerService;
  private readonly artifacts: ArtifactService;
  private readonly quality: QualityService;
  private readonly database: Database;
  private readonly exporter?: ExportService;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; manager?: ManagerService; artifacts?: ArtifactService; quality?: QualityService; generation?: GenerationService; exporter?: ExportService } = {}) {
    const database = dependencies.database ?? dependencies.repositories?.database ?? getDatabase();
    this.database = database;
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.manager = dependencies.manager ?? new ManagerService({ database });
    this.artifacts = dependencies.artifacts ?? new ArtifactService({ database });
    this.quality = dependencies.quality ?? new QualityService({ database });
    this.exporter = dependencies.exporter;
  }

  public async createTurn(bookletId: string, input: unknown): Promise<ChatTurn> {
    await assertMutationsAllowed();
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
    // Configuration failures must not add a user message, card, artifact, or
    // workflow mutation. A saved card response remains independently pending.
    let prepared: PreparedActiveAgentSet | undefined;
    if (booklet.currentStage !== "pdf_export") {
      try {
        prepared = await this.manager.preflight();
      } catch (error) {
        if (claimedResponseId) await this.repositories.conversation.resetRunningCardFollowup(claimedResponseId);
        throw error;
      }
    }
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
      const currentPagePlan = booklet.currentStage === "page_plan" ? await this.artifacts.get(bookletId, "page_plan") : null;
      const finalPages = booklet.currentStage === "final_pages" ? await this.artifacts.get(bookletId, "final_pages") : null;
      const requestsQuality = Boolean(currentStory?.currentVersion) && /\b(quality|review|check)\b/i.test(authoritativeText);
      const artifactSummaries = await this.repositories.artifacts.listByBooklet(bookletId);
      const skillContext = buildSkillContext({
        booklet,
        operation: requestsQuality ? "story_quality" : "guided_intake",
        intent: authoritativeText,
        originalIdea,
        previousMessages,
        approvedArtifactVersionIds: artifactSummaries.filter((artifact) => artifact.state === "approved" && artifact.currentVersionId).map((artifact) => artifact.currentVersionId!),
        traceId: randomUUID(),
      });
      const skillInput = booklet.currentStage === "story_plan"
        ? { intent: authoritativeText, currentStory: currentStory?.currentVersion?.content ?? null, storyPlan: currentStory?.currentVersion?.content }
        : booklet.currentStage === "visual_style"
          ? { intent: authoritativeText, storyPlan: storyDetail?.currentVersion?.content, visualStyle: null }
          : booklet.currentStage === "visual_bible"
            ? { intent: authoritativeText, storyPlan: storyDetail?.currentVersion?.content, visualStyle: visualStyle?.currentVersion?.content ?? null }
            : booklet.currentStage === "booklet_specification"
              ? { intent: authoritativeText, storyPlan: storyDetail?.currentVersion?.content }
              : booklet.currentStage === "page_plan"
                ? { intent: authoritativeText, storyPlan: storyDetail?.currentVersion?.content, visualBible: visualBible?.currentVersion?.content, specification: specification?.currentVersion?.content, currentPagePlan: currentPagePlan?.currentVersion?.content ?? null, copyMode: resolveComicCopyMode() }
                : booklet.currentStage === "final_pages"
                  ? { intent: authoritativeText, finalPages: finalPages?.currentVersion?.content }
                  : undefined;
      const route = await this.manager.route(skillContext, { cardId: randomUUID(), skillInput }, prepared);
      const candidatePools = new (await import("@/lib/application/candidate-pool-service")).CandidatePoolService(this.repositories, process.env.MODEL_RUNTIME === "real" ? "real" : "fake");
      const candidatePool = await candidatePools.forSkill(route.skillId);
      if (!candidatePool.candidates.length) throw new RecoverableApplicationError({ code: "execution_pool_unavailable", message: "No compatible agents are active for this step. Open /admin/agents to repair it.", status: 503 });
      const rememberedSelection = candidatePools.rememberedSelection(candidatePool, await this.repositories.execution.getPreference(bookletId, candidatePool.targetKey));
      const cardId = randomUUID();
      let agentRunCard: Extract<GenUICard, { family: "agent_run" }> = {
        schemaVersion: "1" as const, cardId, family: "agent_run" as const, variant: "parallel_execution" as const, status: "active" as const,
        title: "Choose agents for this step", explanation: "Your saved team will be used for this step. You can change it before running.",
        allowedActions: ["run_agents" as const, "change_agents" as const],
        payload: { revision: 1, target: `skill:${route.skillId}`, subjectLabel: route.skillId.replace("@1", "").replaceAll("_", " "), state: "ready" as const, batchId: null, poolFingerprint: candidatePool.fingerprint,
          candidates: candidatePool.candidates.map((candidate) => ({ agentId: candidate.agentId, agentVersionId: candidate.id, displayName: candidate.displayName, purpose: candidate.purpose, profileSummary: `${candidate.profileId} · ${candidate.modelId}`, eligible: true })),
          selectedAgentIds: rememberedSelection.selectedAgentIds, staleSelectionNotices: rememberedSelection.notices, items: [], selectedItemId: null, selectionMode: null, history: [],
        },
      };
      const assistantMessageId = randomUUID();
      await this.repositories.conversation.persistAssistantCard({ bookletId, messageId: assistantMessageId, narration: "I routed this step and saved the available agent team. Choose one or more agents to run.", card: agentRunCard, createdAtMs: now, readyInput: { kind: "text", skillId: route.skillId, skillInput: route.rawInput, context: skillContext, subjectKind: "text", subjectId: booklet.currentStage }, readyInputSchemaVersion: "1", readyWorkflowFingerprint: { stage: booklet.currentStage, approvedArtifactVersionIds: skillContext.approvedArtifactVersionIds }, readyPreviousBatchId: null });
      // A sole compatible text candidate has no creator choice to make. Start it
      // server-side so the same durable card can project running/completed states.
      if (candidatePool.candidates.length === 1 && !process.env.VITEST) {
        const service = new (await import("@/lib/application/agent-run-service")).AgentRunService({ repositories: this.repositories });
        await service.start(bookletId, cardId, { cardId, responseId: randomUUID(), action: "run_agents", value: [candidatePool.candidates[0]!.agentId] });
        const projected = await this.repositories.conversation.getCard(bookletId, cardId);
        if (projected?.family === "agent_run") agentRunCard = projected;
      }
      if (claimedResponseId) await this.repositories.conversation.completeCardFollowup({ responseId: claimedResponseId, assistantMessageId });
      return {
        userMessage: persistedUserMessage,
        assistantMessage: { id: assistantMessageId, role: "assistant", metadata: { schemaVersion: "1", bookletId, persistedAt: new Date(now).toISOString() }, parts: [{ type: "text", text: "I routed this step and saved the available agent team. Choose one or more agents to run." }, { type: "data-card", id: agentRunCard.cardId, data: agentRunCard }] },
      };
    } catch (error) {
      if (claimedResponseId) await this.repositories.conversation.resetRunningCardFollowup(claimedResponseId);
      throw error;
    }
  }

  /** Persist a typed recovery card for expected workflow errors so useChat stays usable. */
  public async createRecoveryTurn(bookletId: string, error: RecoverableApplicationError): Promise<BookletUIMessage> {
    const booklet = await this.repositories.booklets.get(bookletId);
    if (!booklet) throw new BookletNotFoundError(bookletId);
    const now = Date.now();
    const visualBibleFailure = error.code === "visual_bible_entities_mismatch";
    const pagePlanFailure = error.code === "page_plan_specification_mismatch" || error.code === "page_plan_reference_mismatch";
    const recovery = visualBibleFailure
      ? {
        title: "Retry Visual Bible",
        explanation: "Your approved Story Plan and visual style are still saved. No canonical references or page images were created.",
        summary: "The visual definitions did not line up with the Story Plan. Retrying will rebuild the required subjects from your approved Story Plan.",
        details: [error.message, "Retry does not change the approved story or visual style."],
        narration: "I kept your story and style. The Visual Bible needs one safe retry before reference generation.",
      }
      : pagePlanFailure
        ? {
          title: "Retry Page Plan",
          explanation: "Your approved Story Plan, Visual Bible, and Booklet Specification are still saved. No page images were created.",
          summary: "The Page Plan did not line up with the confirmed booklet settings. Retrying uses your current approved Story Plan, Visual Bible, and geometry.",
          details: [error.message, "Retry does not change approved decisions or start image generation."],
          narration: "I kept your approved booklet decisions. The Page Plan needs one safe retry before page images can be generated.",
        }
        : {
          title: "Retry this step",
          explanation: "Your saved booklet work is still available. Retry only the step that needs attention.",
          summary: error.message,
          details: [error.message],
          narration: "This step needs a retry, but your saved work is retained.",
        };
    const card = createRecoveryCard({
      cardId: randomUUID(),
      title: recovery.title,
      explanation: recovery.explanation,
      code: error.code,
      summary: recovery.summary,
      details: recovery.details,
      allowedActions: ["retry"],
    });
    const assistantMessageId = randomUUID();
    await this.repositories.conversation.persistAssistantCard({
      bookletId,
      messageId: assistantMessageId,
      narration: recovery.narration,
      card,
      createdAtMs: now,
    });
    return {
      id: assistantMessageId,
      role: "assistant",
      metadata: { schemaVersion: "1", bookletId, persistedAt: new Date(now).toISOString() },
      parts: [
        { type: "text", text: recovery.narration },
        { type: "data-card", id: card.cardId, data: card },
      ],
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
