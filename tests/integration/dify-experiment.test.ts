import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import type { AssetStore, StoredAsset } from "@/lib/assets/asset-store";
import { DifyExperimentError, DifyExperimentService } from "@/lib/dify-experiment/service";
import type { MongoDatabaseContext } from "@/db/client";
import fixtures from "@/docs/accepted/2026-09-16_agent-platform-decision/fixtures.json";
import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";

class MemoryAssetStore implements AssetStore {
  protected readonly values = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  public async put(uri: string, content: Uint8Array, mimeType: string): Promise<StoredAsset> { this.values.set(uri, { bytes: Uint8Array.from(content), mimeType }); return { uri, mimeType, byteLength: content.byteLength }; }
  public async get(uri: string): Promise<Uint8Array> { const value = this.values.get(uri); if (!value) throw new Error("missing asset"); return Uint8Array.from(value.bytes); }
  public async exists(uri: string): Promise<boolean> { return this.values.has(uri); }
}

class ControlledAssetStore extends MemoryAssetStore {
  public failNextPut = false;
  public blockNextPut = false;
  public putStarted: Promise<void> = Promise.resolve();
  private announcePut: (() => void) | null = null;
  private releasePut: (() => void) | null = null;

  public armBlockedPut() {
    this.blockNextPut = true;
    this.putStarted = new Promise((resolve) => { this.announcePut = resolve; });
  }

  public releaseBlockedPut() { this.releasePut?.(); }

  public override async put(uri: string, content: Uint8Array, mimeType: string): Promise<StoredAsset> {
    if (this.failNextPut) { this.failNextPut = false; throw new Error("simulated storage failure"); }
    if (this.blockNextPut) {
      this.blockNextPut = false;
      this.announcePut?.();
      await new Promise<void>((resolve) => { this.releasePut = resolve; });
    }
    return super.put(uri, content, mimeType);
  }
}

const databases: MongoDatabaseContext[] = [];
const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalDeploymentEnvironment = process.env.DEPLOYMENT_ENV;
beforeEach(() => { process.env.OPENAI_API_KEY = "test-key"; delete process.env.DEPLOYMENT_ENV; });
afterEach(async () => {
  await Promise.all(databases.splice(0).map(closeTestDatabase));
  if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalOpenAiKey;
  if (originalDeploymentEnvironment === undefined) delete process.env.DEPLOYMENT_ENV; else process.env.DEPLOYMENT_ENV = originalDeploymentEnvironment;
});

async function createService(imageEnabled = false) {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  return { database, service: new DifyExperimentService({ database, assets: new MemoryAssetStore(), config: { enabled: true, mode: "fake", imageEnabled, imageMaxAttempts: 2 } }) };
}

async function prepareAuthorizedImage(input?: { assets?: AssetStore; now?: () => number }) {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const assets = input?.assets ?? new MemoryAssetStore();
  const service = new DifyExperimentService({ database, assets, config: { enabled: true, mode: "fake", imageEnabled: true, imageMaxAttempts: 2 }, now: input?.now });
  await service.initialize();
  const create = await service.startTurn({ action: "create" }); await service.runFakeTurn(create.run.id); await service.approve({ expectedRevision: 1 });
  const run = await service.startTurn({ action: "resume" });
  const authorization = await service.authorizeIllustration({ projectId: "booklet-dify-trial", runId: run.run.id, expectedRevision: 1, panelNumber: 1, workflowRunId: "workflow-png" });
  return { assets, authorization, database, run, service };
}

describe("Dify experiment lifecycle", () => {
  it("releases an expired turn on read and lets a fresh turn resume", async () => {
    let now = 1_000;
    const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
    const service = new DifyExperimentService({ database, assets: new MemoryAssetStore(), config: { enabled: true, mode: "fake", imageEnabled: false, imageMaxAttempts: 2 }, now: () => now });
    await service.initialize();
    const first = await service.startTurn({ action: "create" });
    now += 600_001;
    const view = await service.getProjectView();
    expect(view.context.active_run_id).toBeNull();
    expect(view.runs[0]).toMatchObject({ id: first.run.id, status: "unknown" });
    const next = await service.startTurn({ action: "resume" });
    expect(next.run.id).not.toBe(first.run.id);
    await expect(service.saveStoryDraft({ projectId: "booklet-dify-trial", runId: first.run.id, expectedRevision: 0, story: fixtures.example_story })).rejects.toMatchObject({ code: "stale_run" });
    expect((await service.getContext()).current_revision).toBe(0);
    await service.completeRun(first.run.id, { status: "completed", toolCalls: [], message: "late" });
    expect((await service.getProjectView()).runs[0]?.status).toBe("unknown");
  });

  it("claims a generating image once and marks an interrupted attempt unknown", async () => {
    let now = 1_000;
    const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
    const service = new DifyExperimentService({ database, assets: new MemoryAssetStore(), config: { enabled: true, mode: "fake", imageEnabled: true, imageMaxAttempts: 2 }, now: () => now });
    await service.initialize();
    const turn = await service.startTurn({ action: "create" }); await service.runFakeTurn(turn.run.id);
    await service.approve({ expectedRevision: 1 });
    const imageRun = await service.startTurn({ action: "resume" });
    expect((await service.authorizeIllustration({ projectId: "booklet-dify-trial", runId: imageRun.run.id, expectedRevision: 1, panelNumber: 1, workflowRunId: "workflow-1" })).started).toBe(true);
    expect((await service.authorizeIllustration({ projectId: "booklet-dify-trial", runId: imageRun.run.id, expectedRevision: 1, panelNumber: 1, workflowRunId: "workflow-1" })).started).toBe(false);
    now += 600_001;
    const context = await service.getContext();
    expect(context).toMatchObject({ state: "image_failed", image_attempt_count: 1, image: { status: "unknown" } });
  });

  it("rejects disabled illustration and a stale authorizing turn", async () => {
    const { service } = await createService(false); await service.initialize();
    const create = await service.startTurn({ action: "create" }); await service.runFakeTurn(create.run.id); await service.approve({ expectedRevision: 1 });
    const stale = await service.startTurn({ action: "resume" }); await service.completeRun(stale.run.id, { status: "completed", toolCalls: [], message: null });
    const current = await service.startTurn({ action: "resume" });
    await expect(service.authorizeIllustration({ projectId: "booklet-dify-trial", runId: stale.run.id, expectedRevision: 1, panelNumber: 1, workflowRunId: "workflow-stale" })).rejects.toMatchObject({ code: "stale_run" });
    await expect(service.authorizeIllustration({ projectId: "booklet-dify-trial", runId: current.run.id, expectedRevision: 1, panelNumber: 1, workflowRunId: "workflow-disabled" })).rejects.toMatchObject({ code: "image_disabled" });
  });

  it("keeps the synthetic draft, review, approval, and image outside normal booklet data", async () => {
    const { database, service } = await createService(true);
    expect((await service.initialize()).state).toBe("draft_needed");

    const create = await service.startTurn({ action: "create" }); await service.runFakeTurn(create.run.id);
    let view = await service.getProjectView();
    expect(view.context).toMatchObject({ current_revision: 1, review_revision: 1, approved_revision: null, state: "awaiting_review" });
    expect(view.revisions).toHaveLength(1);
    await expect(service.authorizeIllustration({ projectId: "booklet-dify-trial", runId: create.run.id, expectedRevision: 1, panelNumber: 1, workflowRunId: "workflow-before-approval" })).rejects.toMatchObject({ code: "approval_required" } satisfies Partial<DifyExperimentError>);

    const revise = await service.startTurn({ action: "revise", expectedRevision: 1, feedback: "Make the ending funnier, but preserve the first panel." }); await service.runFakeTurn(revise.run.id);
    view = await service.getProjectView();
    expect(view.context).toMatchObject({ current_revision: 2, review_revision: 2, approved_revision: null, state: "awaiting_review" });
    expect(view.revisions[1]?.story.panels[0]).toEqual(view.revisions[0]?.story.panels[0]);

    await service.approve({ expectedRevision: 2 }); const image = await service.startTurn({ action: "resume" }); await service.runFakeTurn(image.run.id);
    view = await service.getProjectView();
    expect(view.context).toMatchObject({ approved_revision: 2, state: "complete", image_attempt_count: 1, image: { status: "ready", attempt_count: 1 } });
    expect(await database.database.collection("booklets").countDocuments()).toBe(0);
    expect(await database.database.collection("assets").countDocuments()).toBe(0);
  });

  it("rejects feedback after approval and preserves the project-wide image cap", async () => {
    const { service } = await createService(true); await service.initialize(); const first = await service.startTurn({ action: "create" }); await service.runFakeTurn(first.run.id);
    await service.approve({ expectedRevision: 1 });
    await expect(service.startTurn({ action: "revise", expectedRevision: 1, feedback: "Too late" })).rejects.toMatchObject({ code: "review_required" } satisfies Partial<DifyExperimentError>);
    const run = await service.startTurn({ action: "resume" }); await service.runFakeTurn(run.run.id);
    const completed = await service.getContext();
    const checkRun = await service.startTurn({ action: "resume" });
    await expect(service.authorizeIllustration({ projectId: "booklet-dify-trial", runId: checkRun.run.id, expectedRevision: 1, panelNumber: 1, workflowRunId: "workflow-existing" })).resolves.toMatchObject({ started: false, context: { image_attempt_count: 1, state: "complete" } });
    expect(completed.image_attempt_count).toBe(1);
  });

  it("accepts only one concurrent save for the same revision", async () => {
    const { service } = await createService(); await service.initialize();
    const turn = await service.startTurn({ action: "create" });
    const attempts = await Promise.allSettled([1, 2].map(() => service.saveStoryDraft({ projectId: "booklet-dify-trial", runId: turn.run.id, expectedRevision: 0, story: fixtures.example_story })));
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect((await service.getProjectView()).revisions).toHaveLength(1);
    await expect(service.approve({ expectedRevision: 1 })).rejects.toMatchObject({ code: "busy" });
  });

  it("allows one explicit image retry and rejects a third attempt", async () => {
    const { database, service } = await createService(true); await service.initialize();
    const create = await service.startTurn({ action: "create" }); await service.runFakeTurn(create.run.id);
    await service.approve({ expectedRevision: 1 });

    for (const attempt of [1, 2]) {
      const turn = await service.startTurn({ action: "resume" });
      const claims = await Promise.allSettled([1, 2].map(() => service.authorizeIllustration({ projectId: "booklet-dify-trial", runId: turn.run.id, expectedRevision: 1, panelNumber: 1, workflowRunId: `workflow-${attempt}` })));
      expect(claims.filter((claim) => claim.status === "fulfilled" && claim.value.started)).toHaveLength(1);
      const document = await service.getProjectView();
      expect(document.context.image_attempt_count).toBe(attempt);
      const image = (await database.collections.dify_experiment_projects.findOne({ projectId: "booklet-dify-trial" }))?.image;
      expect(image?.status).toBe("generating");
      await service.reportImageFailure({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: image!.id, category: "generation_failed" });
      await service.completeRun(turn.run.id, { status: "completed", toolCalls: [], message: null });
      if (attempt === 1) await service.retryImage({ expectedRevision: 1 });
    }
    await expect(service.retryImage({ expectedRevision: 1 })).rejects.toMatchObject({ code: "image_limit_reached" });
    expect((await service.getContext()).image_attempt_count).toBe(2);
  });

  it("saves an idempotent Dify PNG and rejects a conflicting completion", async () => {
    const { service } = await createService(true); await service.initialize();
    const create = await service.startTurn({ action: "create" }); await service.runFakeTurn(create.run.id); await service.approve({ expectedRevision: 1 });
    const run = await service.startTurn({ action: "resume" });
    const authorization = await service.authorizeIllustration({ projectId: "booklet-dify-trial", runId: run.run.id, expectedRevision: 1, panelNumber: 1, workflowRunId: "workflow-png" });
    const png = new Uint8Array(await sharp({ create: { width: 1536, height: 1536, channels: 3, background: "orange" } }).png().toBuffer());
    await expect(service.completeImage({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, bytes: png })).resolves.toMatchObject({ state: "complete", image_attempt_count: 1 });
    await expect(service.completeImage({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, bytes: png })).resolves.toMatchObject({ state: "complete" });
    const other = new Uint8Array(await sharp({ create: { width: 1536, height: 1536, channels: 3, background: "blue" } }).png().toBuffer());
    await expect(service.completeImage({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, bytes: other })).rejects.toMatchObject({ code: "image_conflict" });
  });

  it("recovers an unknown Dify output without consuming another attempt", async () => {
    const { service } = await createService(true); await service.initialize();
    const create = await service.startTurn({ action: "create" }); await service.runFakeTurn(create.run.id); await service.approve({ expectedRevision: 1 });
    const run = await service.startTurn({ action: "resume" });
    const authorization = await service.authorizeIllustration({ projectId: "booklet-dify-trial", runId: run.run.id, expectedRevision: 1, panelNumber: 1, workflowRunId: "workflow-recovery" });
    await service.reportImageFailure({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, category: "upload_failed" });
    const png = new Uint8Array(await sharp({ create: { width: 1536, height: 1536, channels: 3, background: "orange" } }).png().toBuffer());
    await expect(service.completeImage({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, bytes: png })).resolves.toMatchObject({ state: "complete", image_attempt_count: 1 });
  });

  it("rejects malformed, oversized, wrong-size, and wrong-attempt completions", async () => {
    const { authorization, service } = await prepareAuthorizedImage();
    await expect(service.completeImage({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, bytes: new Uint8Array([1, 2, 3]) })).rejects.toMatchObject({ code: "invalid_image" });
    await expect(service.completeImage({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, bytes: new Uint8Array(20 * 1024 * 1024 + 1) })).rejects.toMatchObject({ code: "image_too_large" });
    const wrongSize = new Uint8Array(await sharp({ create: { width: 512, height: 512, channels: 3, background: "orange" } }).png().toBuffer());
    await expect(service.completeImage({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, bytes: wrongSize })).rejects.toMatchObject({ code: "invalid_image" });
    const png = new Uint8Array(await sharp({ create: { width: 1536, height: 1536, channels: 3, background: "orange" } }).png().toBuffer());
    await expect(service.completeImage({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: randomUUID(), bytes: png })).rejects.toMatchObject({ code: "image_completion_busy" });
  });

  it("releases a completion claim after storage failure", async () => {
    const assets = new ControlledAssetStore(); assets.failNextPut = true;
    const { authorization, database, service } = await prepareAuthorizedImage({ assets });
    const png = new Uint8Array(await sharp({ create: { width: 1536, height: 1536, channels: 3, background: "orange" } }).png().toBuffer());
    await expect(service.completeImage({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, bytes: png })).rejects.toThrow("simulated storage failure");
    expect((await database.collections.dify_experiment_projects.findOne({ projectId: "booklet-dify-trial" }))?.image?.completionClaim).toBeNull();
    await expect(service.completeImage({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, bytes: png })).resolves.toMatchObject({ state: "complete" });
  });

  it("prevents an expired claimant from overwriting the winning image", async () => {
    let now = 1_000; const assets = new ControlledAssetStore(); assets.armBlockedPut();
    const { authorization, service } = await prepareAuthorizedImage({ assets, now: () => now });
    const orange = new Uint8Array(await sharp({ create: { width: 1536, height: 1536, channels: 3, background: "orange" } }).png().toBuffer());
    const blue = new Uint8Array(await sharp({ create: { width: 1536, height: 1536, channels: 3, background: "blue" } }).png().toBuffer());
    const expired = service.completeImage({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, bytes: orange });
    await assets.putStarted; now += 60_001;
    await expect(service.completeImage({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, bytes: blue })).resolves.toMatchObject({ state: "complete" });
    assets.releaseBlockedPut(); await expect(expired).rejects.toMatchObject({ code: "image_superseded" });
    expect(createHash("sha256").update((await service.getImageAsset()).bytes).digest("hex")).toBe(createHash("sha256").update(blue).digest("hex"));
  });

  it("does not let failure or Retry replace an actively claimed or ready image", async () => {
    const assets = new ControlledAssetStore(); assets.armBlockedPut();
    const { authorization, run, service } = await prepareAuthorizedImage({ assets });
    const png = new Uint8Array(await sharp({ create: { width: 1536, height: 1536, channels: 3, background: "orange" } }).png().toBuffer());
    await service.reportImageFailure({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, category: "upload_failed" });
    await service.completeRun(run.run.id, { status: "completed", toolCalls: [], message: null });
    const completion = service.completeImage({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, bytes: png });
    await assets.putStarted;
    await expect(service.reportImageFailure({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, category: "upload_failed" })).rejects.toMatchObject({ code: "image_failure_rejected" });
    await expect(service.retryImage({ expectedRevision: 1 })).rejects.toMatchObject({ code: "image_completion_busy" });
    assets.releaseBlockedPut(); await expect(completion).resolves.toMatchObject({ state: "complete" });
    await expect(service.reportImageFailure({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, category: "generation_failed" })).rejects.toMatchObject({ code: "image_failure_rejected" });
  });

  it("recovers the second failed attempt at the cap without incrementing it", async () => {
    const { authorization, run, service } = await prepareAuthorizedImage();
    await service.reportImageFailure({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, category: "generation_failed" });
    await service.completeRun(run.run.id, { status: "completed", toolCalls: [], message: null }); await service.retryImage({ expectedRevision: 1 });
    const retryRun = await service.startTurn({ action: "resume" });
    const second = await service.authorizeIllustration({ projectId: "booklet-dify-trial", runId: retryRun.run.id, expectedRevision: 1, panelNumber: 1, workflowRunId: "workflow-2" });
    await service.reportImageFailure({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: second.attemptId, category: "upload_failed" });
    const png = new Uint8Array(await sharp({ create: { width: 1536, height: 1536, channels: 3, background: "orange" } }).png().toBuffer());
    await expect(service.completeImage({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: second.attemptId, bytes: png })).resolves.toMatchObject({ state: "complete", image_attempt_count: 2 });
  });

  it("reads a pre-callback failed attempt without optional metadata", async () => {
    const { authorization, database, service } = await prepareAuthorizedImage();
    await service.reportImageFailure({ projectId: "booklet-dify-trial", expectedRevision: 1, attemptId: authorization.attemptId, category: "generation_failed" });
    await database.collections.dify_experiment_projects.updateOne(
      { projectId: "booklet-dify-trial" },
      { $unset: { "image.originatingRunId": "", "image.workflowRunId": "", "image.deadlineAtMs": "", "image.failureCategory": "", "image.completionClaim": "" } },
    );
    await expect(service.getContext()).resolves.toMatchObject({ state: "image_failed", image: { attempt_id: authorization.attemptId, workflow_run_id: null } });
  });
});
