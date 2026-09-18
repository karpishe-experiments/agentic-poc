import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { MongoDatabaseContext } from "@/db/client";
import type { DifyExperimentDocument } from "@/db/documents";
import type { AssetStore } from "@/lib/assets/asset-store";
import { assertMutationsAllowed, runTrackedMutation } from "@/lib/application/deployment-control";
import { RecoverableApplicationError } from "@/lib/application/application-error";
import {
  DIFY_EXPERIMENT_PROJECT_ID,
  DIFY_EXPERIMENT_SCHEMA_VERSION,
  difyExperimentActionSchema,
  difyExperimentContextSchema,
  difyExperimentStorySchema,
  type DifyExperimentContext,
  type DifyExperimentImage,
  type DifyExperimentRun,
  type DifyExperimentStory,
} from "@/lib/contracts/dify-experiment";

const projectDocumentId = `dify-experiment:${DIFY_EXPERIMENT_PROJECT_ID}`;
const projectIdSchema = z.literal(DIFY_EXPERIMENT_PROJECT_ID);
const feedbackSchema = z.string().trim().min(1).max(2_000);

export type DifyExperimentConfiguration = {
  enabled: boolean;
  mode: "fake" | "real";
  imageEnabled: boolean;
  imageMaxAttempts: number;
};

export class DifyExperimentError extends RecoverableApplicationError {}

function error(code: string, message: string, status = 409): never {
  throw new DifyExperimentError({ code, message, status });
}

function syntheticSeed() {
  return {
    idea: "Pip discovers a thirsty sunflower in a sunny garden, finds a way to help, and the story ends happily.",
    preferences: {
      age_range: "6-8",
      language: "English",
      visual_style: "Warm watercolor, square illustration, no lettering or speech bubbles",
      character: "Pip, a small orange fox wearing a blue scarf",
    },
  } as const;
}

function storyForRevision(revision: number): DifyExperimentStory {
  const ending = revision > 1
    ? "The sunflower lifted its bright face and tickled Pip's blue scarf with a leaf. Pip giggled and rested in its cool shade."
    : "The sunflower lifted its bright face. Pip smiled and rested in its cool shade.";
  return difyExperimentStorySchema.parse({
    title: "Pip and the Thirsty Sunflower",
    storyline: "Pip finds a drooping sunflower in the garden. He brings water in a little watering can. The sunflower stands tall again, and Pip rests happily in its shade.",
    character_description: "Pip, a small orange fox wearing a blue scarf",
    panels: [
      { number: 1, text: "Pip found a sunflower with its head hanging low. Its soil was dry.", scene: "Pip stands beside a drooping sunflower in a sunny garden, looking at the dry soil." },
      { number: 2, text: "Pip filled his little watering can. He gave the thirsty sunflower a gentle drink.", scene: "Pip pours water onto the sunflower's soil with a small watering can." },
      { number: 3, text: ending, scene: "Pip rests beneath the healthy sunflower, smiling in the garden." },
    ],
    first_panel_image_prompt: "Single square warm watercolor illustration. Pip, a small orange fox wearing a blue scarf, stands beside a drooping sunflower in a sunny garden, looking at its dry soil with gentle concern. No lettering, speech bubbles, borders, or collage.",
  });
}

function currentStory(document: DifyExperimentDocument): DifyExperimentStory | null {
  return document.revisions.find((revision) => revision.revision === document.currentRevision)?.story ?? null;
}

function stateFor(document: DifyExperimentDocument): DifyExperimentContext["state"] {
  if (document.image?.status === "generating") return "generating";
  if (document.image?.status === "ready") return "complete";
  if (document.image?.status === "failed" || document.image?.status === "unknown") return "image_failed";
  if (document.currentRevision === 0) return "draft_needed";
  if (document.approvedRevision === document.currentRevision) return "ready_for_image";
  if (document.reviewRevision === document.currentRevision) return "awaiting_review";
  return "draft_saved";
}

function contextFor(document: DifyExperimentDocument): DifyExperimentContext {
  const state = stateFor(document);
  const pendingFeedback = document.feedback.filter((feedback) => feedback.consumedByRevision === null && feedback.basedOnRevision === document.currentRevision).slice(-5);
  const allowedActions = state === "draft_needed" ? ["save_story_draft"] as const
    : state === "draft_saved" ? ["save_story_draft", "request_review"] as const
      : state === "awaiting_review" ? (pendingFeedback.length ? ["save_story_draft"] as const : ["request_review"] as const)
        : state === "ready_for_image" ? ["generate_panel_image"] as const : [] as const;
  return difyExperimentContextSchema.parse({
    project_id: document.projectId,
    idea: document.idea,
    preferences: document.preferences,
    current_revision: document.currentRevision,
    story: currentStory(document),
    review_revision: document.reviewRevision,
    approved_revision: document.approvedRevision,
    pending_feedback: pendingFeedback.map((feedback) => feedback.text),
    image: document.image ? { status: document.image.status, revision: document.image.revision, attempt_count: document.image.attemptCount, prompt: document.image.prompt, asset_path: document.image.assetPath, error: document.image.error } : null,
    state,
    allowed_actions: [...allowedActions],
    image_attempt_count: document.imageAttemptCount,
    active_run_id: document.activeRunId,
  });
}

export class DifyExperimentService {
  public constructor(
    private readonly input: { database: MongoDatabaseContext; assets: AssetStore; config: DifyExperimentConfiguration; now?: () => number },
  ) {}

  private get collection() { return this.input.database.collections.dify_experiment_projects; }
  private now() { return this.input.now?.() ?? Date.now(); }

  public assertAvailable() {
    if (!this.input.config.enabled) error("experiment_unavailable", "The Dify experiment is not enabled here.", 404);
  }

  public isFakeMode(): boolean { return this.input.config.mode === "fake"; }

  private async requireProject(): Promise<DifyExperimentDocument> {
    let project = await this.collection.findOne({ _id: projectDocumentId });
    if (!project) error("project_not_initialized", "Initialize the synthetic experiment project first.", 404);
    const now = this.now();
    const activeRunId = project.activeRunId;
    const activeRun = project.runs.find((run) => run.id === activeRunId);
    if (activeRun?.status === "running" && activeRun.deadlineAtMs <= now) {
      await runTrackedMutation(() => this.collection.updateOne(
        { _id: projectDocumentId, activeRunId: activeRun.id, runs: { $elemMatch: { id: activeRun.id, status: "running", deadlineAtMs: { $lte: now } } } },
        { $set: { activeRunId: null, updatedAtMs: now, "runs.$.status": "unknown", "runs.$.finishedAtMs": now, "runs.$.error": "The agent turn was interrupted. Resume from the saved project state." } },
      ));
      project = await this.collection.findOne({ _id: projectDocumentId });
      if (!project) error("project_not_initialized", "Initialize the synthetic experiment project first.", 404);
    }
    if (project.image?.status === "generating" && project.image.startedAtMs + 120_000 <= now) {
      const image = project.image;
      await runTrackedMutation(() => this.collection.updateOne(
        { _id: projectDocumentId, "image.id": image.id, "image.status": "generating", "image.startedAtMs": { $lte: now - 120_000 } },
        { $set: { "image.status": "unknown", "image.error": "The image request was interrupted. Inspect the attempt before retrying.", "image.completedAtMs": now, updatedAtMs: now } },
      ));
      project = await this.collection.findOne({ _id: projectDocumentId });
      if (!project) error("project_not_initialized", "Initialize the synthetic experiment project first.", 404);
    }
    return project;
  }

  private assertActiveRun(project: DifyExperimentDocument, value: unknown): string {
    const runId = z.string().uuid().parse(value);
    if (project.activeRunId !== runId || !project.runs.some((run) => run.id === runId && run.status === "running" && run.deadlineAtMs > this.now())) {
      error("stale_run", "This agent turn is no longer active. Reload project context and start a new turn.");
    }
    return runId;
  }

  public async initialize(): Promise<DifyExperimentContext> {
    this.assertAvailable(); await assertMutationsAllowed();
    const seed = syntheticSeed(); const now = this.now();
    await this.collection.updateOne({ _id: projectDocumentId }, {
      $setOnInsert: {
        _id: projectDocumentId, schemaVersion: DIFY_EXPERIMENT_SCHEMA_VERSION, projectId: DIFY_EXPERIMENT_PROJECT_ID,
        idea: seed.idea, preferences: seed.preferences, revisions: [], feedback: [], currentRevision: 0, reviewRevision: null,
        approvedRevision: null, image: null, imageAttemptCount: 0, runs: [], activeRunId: null, createdAtMs: now, updatedAtMs: now,
      },
    }, { upsert: true });
    return contextFor(await this.requireProject());
  }

  public async getContext(): Promise<DifyExperimentContext> {
    this.assertAvailable(); return contextFor(await this.requireProject());
  }

  public async getProjectView(): Promise<{ context: DifyExperimentContext; revisions: DifyExperimentDocument["revisions"]; runs: Array<Pick<DifyExperimentRun, "id" | "action" | "status" | "startedAtMs" | "finishedAtMs" | "message" | "error" | "toolCalls">> }> {
    this.assertAvailable(); const project = await this.requireProject();
    return { context: contextFor(project), revisions: project.revisions, runs: project.runs.map(({ id, action, status, startedAtMs, finishedAtMs, message, error, toolCalls }) => ({ id, action, status, startedAtMs, finishedAtMs, message, error, toolCalls })) };
  }

  public async saveStoryDraft(input: { projectId: unknown; runId: unknown; expectedRevision: unknown; story: unknown }): Promise<DifyExperimentContext> {
    this.assertAvailable(); await assertMutationsAllowed(); projectIdSchema.parse(input.projectId);
    const expectedRevision = z.number().int().min(0).parse(input.expectedRevision);
    const story = difyExperimentStorySchema.parse(input.story);
    const project = await this.requireProject();
    const runId = this.assertActiveRun(project, input.runId);
    if (project.currentRevision !== expectedRevision) error("stale_revision", "The story changed. Reload context before saving.");
    if (project.approvedRevision === project.currentRevision || project.image !== null) error("story_locked", "The approved or illustrated story cannot be changed.");
    const state = stateFor(project);
    const pendingFeedback = project.feedback.filter((feedback) => feedback.consumedByRevision === null && feedback.basedOnRevision === expectedRevision);
    if (state === "awaiting_review" && pendingFeedback.length === 0) error("review_pending", "Wait for feedback or approval before changing the review draft.");
    if (!(state === "draft_needed" || state === "draft_saved" || (state === "awaiting_review" && pendingFeedback.length > 0))) error("busy", "The story cannot be changed in its current state.");
    const nextRevision = expectedRevision + 1; const now = this.now();
    const result = await this.collection.findOneAndUpdate(
      { _id: projectDocumentId, activeRunId: runId, currentRevision: expectedRevision, approvedRevision: null, image: null },
      { $set: { currentRevision: nextRevision, reviewRevision: null, approvedRevision: null, feedback: project.feedback.map((feedback) => feedback.consumedByRevision === null && feedback.basedOnRevision === expectedRevision ? { ...feedback, consumedByRevision: nextRevision } : feedback), updatedAtMs: now }, $push: { revisions: { revision: nextRevision, story, createdAtMs: now } } },
      { returnDocument: "after" },
    );
    if (!result) error("stale_revision", "The story changed while it was being saved.");
    return contextFor(result);
  }

  public async requestReview(input: { projectId: unknown; runId: unknown; expectedRevision: unknown }): Promise<DifyExperimentContext> {
    this.assertAvailable(); await assertMutationsAllowed(); projectIdSchema.parse(input.projectId);
    const expectedRevision = z.number().int().min(1).parse(input.expectedRevision); const project = await this.requireProject();
    const runId = this.assertActiveRun(project, input.runId);
    if (project.currentRevision !== expectedRevision) error("stale_revision", "The story changed. Reload context before requesting review.");
    if (project.reviewRevision === expectedRevision) return contextFor(project);
    if (project.approvedRevision !== null || project.image !== null) error("story_locked", "The approved or illustrated story cannot be reviewed again.");
    const result = await this.collection.findOneAndUpdate({ _id: projectDocumentId, activeRunId: runId, currentRevision: expectedRevision, reviewRevision: null, approvedRevision: null, image: null }, { $set: { reviewRevision: expectedRevision, updatedAtMs: this.now() } }, { returnDocument: "after" });
    if (!result) error("stale_revision", "The story changed while review was requested.");
    return contextFor(result);
  }

  public async approve(input: { expectedRevision: unknown }): Promise<DifyExperimentContext> {
    this.assertAvailable(); await assertMutationsAllowed(); const expectedRevision = z.number().int().min(1).parse(input.expectedRevision); const project = await this.requireProject();
    if (project.approvedRevision === expectedRevision) return contextFor(project);
    if (project.activeRunId || project.feedback.some((feedback) => feedback.consumedByRevision === null && feedback.basedOnRevision === expectedRevision)) error("busy", "Save or finish the pending revision before approving.");
    const result = await this.collection.findOneAndUpdate({ _id: projectDocumentId, currentRevision: expectedRevision, reviewRevision: expectedRevision, approvedRevision: null, activeRunId: null, image: null }, { $set: { approvedRevision: expectedRevision, updatedAtMs: this.now() } }, { returnDocument: "after" });
    if (!result) error("review_required", "Only the current review draft can be approved.");
    return contextFor(result);
  }

  public async startTurn(input: { action: unknown; expectedRevision?: unknown; feedback?: unknown }): Promise<{ context: DifyExperimentContext; run: DifyExperimentRun }> {
    this.assertAvailable(); await assertMutationsAllowed(); const action = difyExperimentActionSchema.parse(input.action); const project = await this.requireProject();
    if (project.activeRunId) error("busy", "An agent turn is already running.");
    const now = this.now(); const run: DifyExperimentRun = { id: randomUUID(), action, status: "running", startedAtMs: now, deadlineAtMs: now + 300_000, finishedAtMs: null, message: null, error: null, toolCalls: [], providerTaskId: null, providerConversationId: null, providerMessageId: null, usage: null };
    let filter: Record<string, unknown> = { _id: projectDocumentId, activeRunId: null };
    let update: Record<string, unknown> = { $set: { activeRunId: run.id, updatedAtMs: now }, $push: { runs: run } };
    if (action === "create") {
      if (project.currentRevision !== 0) error("already_started", "A story draft already exists. Resume it instead.");
      filter = { ...filter, currentRevision: 0 };
    } else if (action === "revise") {
      const expectedRevision = z.number().int().min(1).parse(input.expectedRevision); const feedback = feedbackSchema.parse(input.feedback);
      if (project.currentRevision !== expectedRevision || project.reviewRevision !== expectedRevision || project.approvedRevision !== null || project.image !== null) error("review_required", "Feedback is accepted only for the current unapproved review draft.");
      filter = { ...filter, currentRevision: expectedRevision, reviewRevision: expectedRevision, approvedRevision: null, image: null };
      update = { $set: { activeRunId: run.id, updatedAtMs: now }, $push: { runs: run, feedback: { text: feedback, basedOnRevision: expectedRevision, consumedByRevision: null, createdAtMs: now } } };
    }
    const result = await this.collection.findOneAndUpdate(filter, update, { returnDocument: "after" });
    if (!result) error("busy", "The project changed before the agent turn could start.");
    return { context: contextFor(result), run };
  }

  public async requestPanelImage(input: { projectId: unknown; runId: unknown; expectedRevision: unknown; panelNumber: unknown }): Promise<DifyExperimentContext> {
    return (await this.claimPanelImage(input)).context;
  }

  public async claimPanelImage(input: { projectId: unknown; runId: unknown; expectedRevision: unknown; panelNumber: unknown }): Promise<{ context: DifyExperimentContext; started: boolean }> {
    this.assertAvailable(); await assertMutationsAllowed(); projectIdSchema.parse(input.projectId);
    const expectedRevision = z.number().int().min(1).parse(input.expectedRevision); z.literal(1).parse(input.panelNumber);
    const project = await this.requireProject();
    if (project.currentRevision !== expectedRevision || project.approvedRevision !== expectedRevision) error("approval_required", "Approve the current revision before requesting its image.");
    const runId = this.assertActiveRun(project, input.runId);
    if (project.image?.status === "generating" || project.image?.status === "ready") return { context: contextFor(project), started: false };
    if (project.image) error("image_attempt_exists", "Retry the saved failed image explicitly from the application.");
    if (!this.input.config.imageEnabled) error("image_disabled", "Enable image generation before requesting an image.", 403);
    if (project.imageAttemptCount >= this.input.config.imageMaxAttempts) error("image_limit_reached", "The image attempt limit has been reached.", 403);
    const story = currentStory(project); if (!story) error("story_missing", "The approved story could not be found.");
    const now = this.now(); const image: DifyExperimentImage = { id: randomUUID(), status: "generating", revision: expectedRevision, attemptCount: project.imageAttemptCount + 1, prompt: story.first_panel_image_prompt, assetPath: null, mimeType: null, error: null, startedAtMs: now, completedAtMs: null };
    const result = await this.collection.findOneAndUpdate(
      { _id: projectDocumentId, activeRunId: runId, currentRevision: expectedRevision, approvedRevision: expectedRevision, image: null, imageAttemptCount: project.imageAttemptCount },
      { $set: { image, updatedAtMs: now }, $inc: { imageAttemptCount: 1 } }, { returnDocument: "after" },
    );
    if (!result) error("busy", "The image state changed before generation could start.");
    return { context: contextFor(result), started: true };
  }

  public async retryImage(input: { expectedRevision: unknown }): Promise<DifyExperimentContext> {
    this.assertAvailable(); await assertMutationsAllowed(); const expectedRevision = z.number().int().min(1).parse(input.expectedRevision); const project = await this.requireProject();
    if (project.image === null && project.approvedRevision === expectedRevision) return contextFor(project);
    if (project.currentRevision !== expectedRevision || project.approvedRevision !== expectedRevision || !project.image || !["failed", "unknown"].includes(project.image.status)) error("image_retry_unavailable", "Only the current failed or unknown image can be retried.");
    if (project.activeRunId || project.imageAttemptCount >= this.input.config.imageMaxAttempts) error("image_limit_reached", "The image attempt limit has been reached.", 403);
    const result = await this.collection.findOneAndUpdate({ _id: projectDocumentId, currentRevision: expectedRevision, approvedRevision: expectedRevision, activeRunId: null, "image.id": project.image.id, "image.status": { $in: ["failed", "unknown"] } }, { $set: { image: null, updatedAtMs: this.now() } }, { returnDocument: "after" });
    if (!result) error("busy", "The image state changed before retry could be prepared.");
    return contextFor(result);
  }

  public async runFakeTurn(runId: string): Promise<void> {
    const project = await this.requireProject(); const run = project.runs.find((candidate) => candidate.id === runId);
    if (!run || project.activeRunId !== runId || run.status !== "running") return;
    try {
      const context = contextFor(project);
      const calls: string[] = ["get_project_context"];
      if (run.action === "create" || run.action === "revise") {
        const saved = await this.saveStoryDraft({ projectId: DIFY_EXPERIMENT_PROJECT_ID, runId, expectedRevision: context.current_revision, story: storyForRevision(context.current_revision + 1) }); calls.push("save_story_draft");
        await this.requestReview({ projectId: DIFY_EXPERIMENT_PROJECT_ID, runId, expectedRevision: saved.current_revision }); calls.push("request_review");
      } else if (context.state === "draft_saved") {
        await this.requestReview({ projectId: DIFY_EXPERIMENT_PROJECT_ID, runId, expectedRevision: context.current_revision }); calls.push("request_review");
      } else if (context.state === "ready_for_image" && this.input.config.imageEnabled) {
        await this.requestPanelImage({ projectId: DIFY_EXPERIMENT_PROJECT_ID, runId, expectedRevision: context.current_revision, panelNumber: 1 }); calls.push("generate_panel_image");
        const latest = await this.requireProject(); if (latest.image?.status === "generating") await this.completeFakeImage(latest.image.id);
      }
      await this.completeRun(runId, { status: "completed", toolCalls: calls, message: context.state === "complete" ? "The saved booklet experiment is complete." : "The saved state is ready for the next review step." });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The fake agent run failed.";
      await this.completeRun(runId, { status: "failed", toolCalls: [], message: null, error: message });
    }
  }

  public async completeRun(runId: string, input: { status: "completed" | "failed" | "unknown"; toolCalls: string[]; message: string | null; error?: string | null; providerTaskId?: string | null; providerConversationId?: string | null; providerMessageId?: string | null; usage?: { inputTokens: number; outputTokens: number } | null }): Promise<void> {
    const now = this.now(); await this.collection.updateOne({ _id: projectDocumentId, activeRunId: runId, "runs.id": runId }, { $set: { activeRunId: null, updatedAtMs: now, "runs.$.status": input.status, "runs.$.finishedAtMs": now, "runs.$.toolCalls": input.toolCalls, "runs.$.message": input.message, "runs.$.error": input.error ?? null, "runs.$.providerTaskId": input.providerTaskId ?? null, "runs.$.providerConversationId": input.providerConversationId ?? null, "runs.$.providerMessageId": input.providerMessageId ?? null, "runs.$.usage": input.usage ?? null } });
  }

  public async completeFakeImage(imageId: string): Promise<void> {
    const project = await this.requireProject(); const image = project.image;
    if (!image || image.id !== imageId || image.status !== "generating") return;
    const path = `experiments/dify/${DIFY_EXPERIMENT_PROJECT_ID}/panel-1-attempt-${image.attemptCount}.svg`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768"><rect width="768" height="768" fill="#f3d39b"/><circle cx="620" cy="130" r="70" fill="#f4b860"/><path d="M0 550h768v218H0z" fill="#c9794e"/><text x="40" y="70" font-family="sans-serif" font-size="28" fill="#29231d">Fake experiment image</text><text x="40" y="110" font-family="sans-serif" font-size="20" fill="#29231d">Pip and the thirsty sunflower</text></svg>`;
    if (!(await this.input.assets.exists(path))) await this.input.assets.put(path, Buffer.from(svg), "image/svg+xml");
    const now = this.now(); await this.collection.updateOne({ _id: projectDocumentId, "image.id": imageId, "image.status": "generating" }, { $set: { updatedAtMs: now, "image.status": "ready", "image.assetPath": path, "image.mimeType": "image/svg+xml", "image.completedAtMs": now } });
  }

  public async completeCurrentFakeImage(): Promise<void> {
    const project = await this.requireProject();
    if (project.image?.status === "generating") await this.completeFakeImage(project.image.id);
  }

  public async completeImage(imageId: string, input: { bytes: Uint8Array; mimeType: string }): Promise<void> {
    const project = await this.requireProject(); const image = project.image;
    if (!image || image.id !== imageId || image.status !== "generating") return;
    const extension = input.mimeType === "image/png" ? "png" : input.mimeType === "image/jpeg" ? "jpg" : null;
    if (!extension) throw new Error("The image provider returned an unsupported image type.");
    const path = `experiments/dify/${DIFY_EXPERIMENT_PROJECT_ID}/panel-1-attempt-${image.attemptCount}.${extension}`;
    if (!(await this.input.assets.exists(path))) await this.input.assets.put(path, input.bytes, input.mimeType);
    const now = this.now(); await this.collection.updateOne({ _id: projectDocumentId, "image.id": imageId, "image.status": "generating" }, { $set: { updatedAtMs: now, "image.status": "ready", "image.assetPath": path, "image.mimeType": input.mimeType, "image.completedAtMs": now } });
  }

  public async failImage(imageId: string, status: "failed" | "unknown", message: string): Promise<void> {
    const now = this.now(); await this.collection.updateOne({ _id: projectDocumentId, "image.id": imageId, "image.status": "generating" }, { $set: { updatedAtMs: now, "image.status": status, "image.error": message.slice(0, 1_000), "image.completedAtMs": now } });
  }

  public async currentGeneratingImage(): Promise<DifyExperimentImage | null> {
    const image = (await this.requireProject()).image; return image?.status === "generating" ? image : null;
  }

  public async getImageAsset(): Promise<{ bytes: Uint8Array; mimeType: string }> {
    this.assertAvailable(); const project = await this.requireProject(); const image = project.image;
    if (!image || image.status !== "ready" || !image.assetPath || !image.mimeType) error("image_not_ready", "The experiment image is not ready.", 404);
    return { bytes: await this.input.assets.get(image.assetPath), mimeType: image.mimeType };
  }
}
