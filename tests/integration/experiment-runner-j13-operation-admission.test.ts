import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { withMongoTransaction } from "@/db/client";
import { materializeNarrativeResult } from "@/db/experiment-narrative";
import { createExperimentRepository } from "@/db/experiment-repository";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import type { AssetStore } from "@/lib/assets/asset-store";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const { verifySources } = vi.hoisted(() => ({ verifySources: vi.fn() }));
vi.mock("@/db/experiment-pages", () => ({ verifyCurrentPageIllustrationSources: verifySources }));

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const databases: Database[] = [];
afterEach(async () => { verifySources.mockReset(); await Promise.all(databases.splice(0).map(closeTestDatabase)); });

async function setup(references = 1) {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const runId = id(1), bookletId = id(2), pageId = id(3), managerWorkflowId = id(4), operationId = id(5);
  const configuration = [
    { role: "manager", taskId: null },
    ...Array.from({ length: 12 }, (_, index) => ({ role: "specialist", taskId: `J${String(index + 1).padStart(2, "0")}` })),
    { role: "tester", taskId: null }, { role: "image", taskId: null, finalPageIllustration: true },
  ].map((item, index) => ({ ...item, appId: id(100 + index), publishedWorkflowId: id(200 + index), toolProviderId: null }));
  const repository = createExperimentRepository(database, { store: () => ({} as AssetStore) });
  await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration, nowMs: 1 });
  await database.collections.experiment_operations.insertOne({
    _id: id(6), runId, role: "manager", taskId: null, subjectKind: "book", subjectId: bookletId,
    idempotencyKey: "manager", inputFingerprint: "a".repeat(64), attempt: 1, mode: "simulated", providerKind: "text",
    state: "succeeded", workflowRunId: managerWorkflowId, parentWorkflowRunId: null, verifiedWorkflowId: id(200),
    reservationCount: 1, deadlineAtMs: null, resultJson: JSON.stringify({ kind: "delegate", payload: { taskId: "J13", subjectKind: "page", subjectId: pageId } }),
    resultDigest: null, warningsJson: "[]", expectedTargetVersionId: null, dependencyVersionIds: [], materializationJson: null,
    safeFailure: null, createdAtMs: 2, updatedAtMs: 2,
  });
  const request = { kind: "page_source" as const, prompt: "Exact approved lettering", sourceVersionIds: [id(10), id(11)], styleVersionId: id(11) };
  const attachments = Array.from({ length: references }, (_, index) => ({ panelKey: `panel-${index}`, subjectKind: "character" as const,
    subjectId: id(20 + index), assetId: id(30 + index), artifactVersionId: id(40 + index), bytes: new Uint8Array([index + 1]),
    mimeType: "image/png" as const, sha256: String(index + 1).repeat(64), byteLength: 1, width: 1, height: 1 }));
  verifySources.mockResolvedValue({ request: { request }, attachments, warnings: [], layout: { pages: [{ pageId }] } });
  return { database, repository, runId, bookletId, pageId, managerWorkflowId, operationId, request, attachments };
}

function preparedInput(env: Awaited<ReturnType<typeof setup>>) {
  return { runId: env.runId, operationId: env.operationId, expectedRevision: 0, role: "image" as const, taskId: "J13" as const,
    subjectKind: "page" as const, subjectId: env.pageId, inputFingerprint: imageRequestFingerprint(env.request), attempt: 1,
    providerKind: "image" as const, imageRequest: env.request, parentWorkflowRunId: env.managerWorkflowId, nowMs: 3 };
}

describe("J13 image-operation admission", () => {
  it("materializes manager page delegation only after current source verification", async () => {
    const env = await setup(0);
    const run = (await env.repository.getRun(env.runId))!;
    const operation = (await env.repository.getOperation(id(6)))!;
    const result = { kind: "delegate" as const, payload: { taskId: "J13" as const, subjectKind: "page" as const, subjectId: env.pageId } };
    const save = () => withMongoTransaction(env.database, (session) => materializeNarrativeResult(env.database, session,
      run, operation, result, [], 3, () => ({} as AssetStore)));
    expect((await save()).summary).toEqual({ delegatedTaskId: "J13" });
    verifySources.mockRejectedValue(new Error("Corrupt approved reference"));
    await expect(save()).rejects.toMatchObject({ code: "invalid_result" });
  });

  it("rejects manager replacement of an existing draft without its exact pending revision", async () => {
    const env = await setup(0);
    await env.database.collections.artifacts.insertOne({ _id: id(80), bookletId: env.bookletId, artifactType: "J13", taskId: "J13",
      experimentRunId: env.runId, subjectKind: "page", subjectId: env.pageId, state: "draft", currentVersionId: id(81), createdAtMs: 1, updatedAtMs: 1 });
    const run = (await env.repository.getRun(env.runId))!;
    const operation = (await env.repository.getOperation(id(6)))!;
    const result = { kind: "delegate" as const, payload: { taskId: "J13" as const, subjectKind: "page" as const, subjectId: env.pageId } };
    const save = () => withMongoTransaction(env.database, (session) => materializeNarrativeResult(env.database, session,
      run, operation, result, [], 3, () => ({} as AssetStore)));
    await expect(save()).rejects.toMatchObject({ code: "invalid_result" });
    run.pendingDecisionJson = JSON.stringify({ kind: "revision", taskId: "J13", subjectKind: "page", subjectId: env.pageId, artifactVersionId: id(81) });
    expect((await save()).summary).toEqual({ delegatedTaskId: "J13" });
  });

  it("rejects manager image delegation when a sibling Page Bible is not accepted and current", async () => {
    const env = await setup(0);
    const run = (await env.repository.getRun(env.runId))!;
    const operation = (await env.repository.getOperation(id(6)))!;
    verifySources.mockResolvedValueOnce({ request: { request: env.request }, attachments: [], warnings: [],
      layout: { pages: [{ pageId: env.pageId }, { pageId: id(90) }] } });
    verifySources.mockRejectedValueOnce(new Error("Sibling Page Bible is missing or stale"));
    await expect(withMongoTransaction(env.database, (session) => materializeNarrativeResult(env.database, session,
      run, operation, { kind: "delegate", payload: { taskId: "J13", subjectKind: "page", subjectId: env.pageId } },
      [], 3, () => ({} as AssetStore)))).rejects.toMatchObject({ code: "invalid_result" });
    expect(verifySources.mock.calls.at(-1)?.[3]).toBe(id(90));
  });

  it("requires the latest verified manager selection, then completed ordered uploads before dispatch and claim", async () => {
    const env = await setup();
    const operation = await env.repository.prepareOperation(preparedInput(env));
    expect(operation).toMatchObject({ parentWorkflowRunId: env.managerWorkflowId, expectedTargetVersionId: null, dependencyVersionIds: env.request.sourceVersionIds });

    await expect(env.repository.beginDispatch({ runId: env.runId, operationId: env.operationId, parentWorkflowRunId: env.managerWorkflowId, nowMs: 4 }))
      .rejects.toMatchObject({ code: "conflict" });
    const acknowledgements = env.attachments.map((attachment, index) => ({ role: attachment.subjectKind, subjectId: attachment.subjectId,
      assetId: attachment.assetId, artifactVersionId: attachment.artifactVersionId, uploadFileId: id(50 + index), mimeType: attachment.mimeType,
      sha256: attachment.sha256, byteLength: attachment.byteLength, width: attachment.width, height: attachment.height }));
    const journal = acknowledgements.map((acknowledgement) => ({ assetId: acknowledgement.assetId, artifactVersionId: acknowledgement.artifactVersionId,
      sha256: acknowledgement.sha256, state: "uploaded", uploadFileId: acknowledgement.uploadFileId }));
    await env.database.collections.experiment_operations.updateOne({ _id: env.operationId }, {
      $set: { referenceUploadJournalJson: JSON.stringify(journal), referenceUploadsJson: JSON.stringify(acknowledgements) },
    });
    await expect(env.repository.beginDispatch({ runId: env.runId, operationId: env.operationId, parentWorkflowRunId: null, nowMs: 5 }))
      .rejects.toMatchObject({ code: "conflict" });
    expect((await env.repository.getOperation(env.operationId))!.parentWorkflowRunId).toBe(env.managerWorkflowId);
    expect((await env.repository.beginDispatch({ runId: env.runId, operationId: env.operationId, parentWorkflowRunId: env.managerWorkflowId, nowMs: 5 })).dispatched).toBe(true);
    verifySources.mockResolvedValue({ request: { request: { ...env.request, prompt: "Changed" } }, attachments: env.attachments, warnings: [] });
    await expect(env.repository.claimOperation({ runId: env.runId, operationId: env.operationId, workflowRunId: id(70), parentWorkflowRunId: env.managerWorkflowId, nowMs: 6 }))
      .rejects.toMatchObject({ code: "conflict" });
    verifySources.mockResolvedValue({ request: { request: env.request }, attachments: env.attachments, warnings: [] });
    expect((await env.repository.claimOperation({ runId: env.runId, operationId: env.operationId, workflowRunId: id(70), parentWorkflowRunId: env.managerWorkflowId, nowMs: 7 })).started).toBe(true);
  });

  it("permits a verified empty reference route and only sets a replacement target for needs_review", async () => {
    const env = await setup(0);
    await env.database.collections.artifacts.insertOne({ _id: id(80), bookletId: env.bookletId, artifactType: "J13", taskId: "J13",
      experimentRunId: env.runId, subjectKind: "page", subjectId: env.pageId, state: "needs_review", currentVersionId: id(81), createdAtMs: 1, updatedAtMs: 1 });
    const operation = await env.repository.prepareOperation(preparedInput(env));
    expect(operation.expectedTargetVersionId).toBe(id(81));
    expect((await env.repository.beginDispatch({ runId: env.runId, operationId: env.operationId, parentWorkflowRunId: env.managerWorkflowId, nowMs: 4 })).dispatched).toBe(true);
    expect((await env.repository.claimOperation({ runId: env.runId, operationId: env.operationId, workflowRunId: id(70), parentWorkflowRunId: env.managerWorkflowId, nowMs: 5 })).started).toBe(true);
  });

  it("rejects a stale manager parent before it reserves an image", async () => {
    const env = await setup(0);
    await expect(env.repository.prepareOperation({ ...preparedInput(env), parentWorkflowRunId: id(99) }))
      .rejects.toMatchObject({ code: "conflict" });
    expect((await env.database.collections.experiment_operations.countDocuments({ runId: env.runId, taskId: "J13" }))).toBe(0);
  });

  it("permits a draft replacement only for the exact pending J13 page revision", async () => {
    const env = await setup(0);
    await env.database.collections.artifacts.insertOne({ _id: id(80), bookletId: env.bookletId, artifactType: "J13", taskId: "J13",
      experimentRunId: env.runId, subjectKind: "page", subjectId: env.pageId, state: "draft", currentVersionId: id(81), createdAtMs: 1, updatedAtMs: 1 });
    await expect(env.repository.prepareOperation(preparedInput(env))).rejects.toMatchObject({ code: "conflict" });
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: {
      pendingDecisionJson: JSON.stringify({ kind: "revision", taskId: "J13", subjectKind: "page", subjectId: env.pageId, artifactVersionId: id(81), instruction: "Adjust the expression." }),
    } });
    const operation = await env.repository.prepareOperation(preparedInput(env));
    expect(operation.expectedTargetVersionId).toBe(id(81));
  });
});
