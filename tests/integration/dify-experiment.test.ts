import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import type { AssetStore, StoredAsset } from "@/lib/assets/asset-store";
import { DifyExperimentError, DifyExperimentService } from "@/lib/dify-experiment/service";
import type { MongoDatabaseContext } from "@/db/client";
import fixtures from "@/docs/accepted/2026-09-16_agent-platform-decision/fixtures.json";

class MemoryAssetStore implements AssetStore {
  private readonly values = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  public async put(uri: string, content: Uint8Array, mimeType: string): Promise<StoredAsset> { this.values.set(uri, { bytes: Uint8Array.from(content), mimeType }); return { uri, mimeType, byteLength: content.byteLength }; }
  public async get(uri: string): Promise<Uint8Array> { const value = this.values.get(uri); if (!value) throw new Error("missing asset"); return Uint8Array.from(value.bytes); }
  public async exists(uri: string): Promise<boolean> { return this.values.has(uri); }
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

describe("Dify experiment lifecycle", () => {
  it("releases an expired turn on read and lets a fresh turn resume", async () => {
    let now = 1_000;
    const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
    const service = new DifyExperimentService({ database, assets: new MemoryAssetStore(), config: { enabled: true, mode: "fake", imageEnabled: false, imageMaxAttempts: 2 }, now: () => now });
    await service.initialize();
    const first = await service.startTurn({ action: "create" });
    now += 300_001;
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
    expect((await service.claimPanelImage({ projectId: "booklet-dify-trial", runId: imageRun.run.id, expectedRevision: 1, panelNumber: 1 })).started).toBe(true);
    expect((await service.claimPanelImage({ projectId: "booklet-dify-trial", runId: imageRun.run.id, expectedRevision: 1, panelNumber: 1 })).started).toBe(false);
    now += 120_001;
    const context = await service.getContext();
    expect(context).toMatchObject({ state: "image_failed", image_attempt_count: 1, image: { status: "unknown" } });
  });

  it("keeps the synthetic draft, review, approval, and image outside normal booklet data", async () => {
    const { database, service } = await createService(true);
    expect((await service.initialize()).state).toBe("draft_needed");

    const create = await service.startTurn({ action: "create" }); await service.runFakeTurn(create.run.id);
    let view = await service.getProjectView();
    expect(view.context).toMatchObject({ current_revision: 1, review_revision: 1, approved_revision: null, state: "awaiting_review" });
    expect(view.revisions).toHaveLength(1);
    await expect(service.requestPanelImage({ projectId: "booklet-dify-trial", runId: create.run.id, expectedRevision: 1, panelNumber: 1 })).rejects.toMatchObject({ code: "approval_required" } satisfies Partial<DifyExperimentError>);

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
    await expect(service.requestPanelImage({ projectId: "booklet-dify-trial", runId: checkRun.run.id, expectedRevision: 1, panelNumber: 1 })).resolves.toMatchObject({ image_attempt_count: 1, state: "complete" });
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
      const claims = await Promise.allSettled([1, 2].map(() => service.claimPanelImage({ projectId: "booklet-dify-trial", runId: turn.run.id, expectedRevision: 1, panelNumber: 1 })));
      expect(claims.filter((claim) => claim.status === "fulfilled" && claim.value.started)).toHaveLength(1);
      const document = await service.getProjectView();
      expect(document.context.image_attempt_count).toBe(attempt);
      const image = (await database.collections.dify_experiment_projects.findOne({ projectId: "booklet-dify-trial" }))?.image;
      expect(image?.status).toBe("generating");
      await service.failImage(image!.id, "failed", "Synthetic provider failure");
      await service.completeRun(turn.run.id, { status: "completed", toolCalls: [], message: null });
      if (attempt === 1) await service.retryImage({ expectedRevision: 1 });
    }
    await expect(service.retryImage({ expectedRevision: 1 })).rejects.toMatchObject({ code: "image_limit_reached" });
    expect((await service.getContext()).image_attempt_count).toBe(2);
  });
});
