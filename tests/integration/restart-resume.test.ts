import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { createRepositories } from "@/db/repositories";
import { ExecutionService } from "@/lib/application/execution-service";
import { CandidatePoolService } from "@/lib/application/candidate-pool-service";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

describe("restart recovery", () => {
  it("preserves Dify running and unknown work outside the legacy worker", async () => {
    const database = await createTestDatabase({ seedAgents: false });
    databases.push(database);
    const repositories = createRepositories(database);
    for (const [position, status] of ["running", "unknown"].entries()) {
      const jobId = `dify-job-${position}`, itemId = `dify-item-${position}`;
      await database.collections.generation_jobs.insertOne({ _id: jobId, bookletId: "dify-booklet", jobType: "dify_pages", status,
        idempotencyKey: jobId, inputJson: "{}", errorJson: null, createdAtMs: 1, startedAtMs: 2, finishedAtMs: null, updatedAtMs: 2 });
      await database.collections.generation_items.insertOne({ _id: itemId, jobId, itemKey: itemId, position: 0, status, attemptCount: 1,
        inputJson: "{}", resultJson: null, assetId: null, errorJson: null, executionCardId: null, executionBatchId: null, startedAtMs: 2, finishedAtMs: null });
    }
    const jobs = await database.collections.generation_jobs.find({}).toArray();
    const items = await database.collections.generation_items.find({}).toArray();
    expect(await repositories.jobs.recoverInterrupted()).toBe(0);
    expect(await database.collections.generation_jobs.find({}).toArray()).toEqual(jobs);
    expect(await database.collections.generation_items.find({}).toArray()).toEqual(items);
    expect(await repositories.jobs.listRunnable()).toEqual([]);
    expect(await repositories.jobs.listActiveByBooklet("dify-booklet")).toEqual([]);
  });

  it("retains interrupted legacy items as failed until an explicit retry", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const repositories = createRepositories(database);
    const bookletId = "00000000-0000-4000-8000-000000000a01";
    const jobId = "00000000-0000-4000-8000-000000000a03";
    const itemId = "00000000-0000-4000-8000-000000000a04";
    const pausedJobId = "00000000-0000-4000-8000-000000000a05";
    const pausedItemId = "00000000-0000-4000-8000-000000000a06";
    await database.collections.generation_jobs.insertMany([
      { _id: jobId, bookletId, jobType: "pages", status: "running", idempotencyKey: `pages:restart:${bookletId}`, inputJson: "{}", errorJson: null, createdAtMs: 1, startedAtMs: 2, finishedAtMs: null, updatedAtMs: 2 },
      { _id: pausedJobId, bookletId, jobType: "pages", status: "paused", idempotencyKey: `pages:paused:${bookletId}`, inputJson: "{}", errorJson: null, createdAtMs: 1, startedAtMs: 2, finishedAtMs: null, updatedAtMs: 2 },
    ]);
    await database.collections.generation_items.insertMany([
      { _id: itemId, jobId, itemKey: "page:restart", position: 0, status: "running", attemptCount: 1, inputJson: "{}", resultJson: null, assetId: null, errorJson: null, executionCardId: null, executionBatchId: null, startedAtMs: 2, finishedAtMs: null },
      { _id: pausedItemId, jobId: pausedJobId, itemKey: "page:paused", position: 0, status: "running", attemptCount: 1, inputJson: "{}", resultJson: null, assetId: null, errorJson: null, executionCardId: null, executionBatchId: null, startedAtMs: 2, finishedAtMs: null },
    ]);

    expect(await repositories.conversation.recoverInterruptedFollowups()).toBe(0);
    expect(await repositories.jobs.recoverInterrupted()).toBe(2);
    expect(await repositories.jobs.getStatus(jobId)).toMatchObject({ status: "failed", items: [{ id: itemId, status: "failed", attemptCount: 1, error: { kind: "interrupted" } }] });
    expect(await repositories.jobs.getStatus(pausedJobId)).toMatchObject({ status: "paused", items: [{ id: pausedItemId, status: "failed", attemptCount: 1, error: { kind: "interrupted" } }] });
    expect(await repositories.jobs.listRunnable()).not.toEqual(expect.arrayContaining([{ id: jobId, bookletId, jobType: "pages" }]));
    expect(await repositories.jobs.listRunnable()).not.toEqual(expect.arrayContaining([{ id: pausedJobId, bookletId, jobType: "pages" }]));
  });

  it("does not requeue an interrupted legacy candidate batch", async () => {
    const database = await createTestDatabase({ seedAgents: false });
    databases.push(database);
    const repositories = createRepositories(database);
    const batchId = "00000000-0000-4000-8000-000000000a07";
    const itemId = "00000000-0000-4000-8000-000000000a08";
    await database.collections.execution_batches.insertOne({ _id: batchId, bookletId: "00000000-0000-4000-8000-000000000a01", cardId: "00000000-0000-4000-8000-000000000a02", targetKey: "skill:intake_readiness@1", subjectKind: "text", subjectId: "audience", previousBatchId: null, poolFingerprint: "restart", status: "running", materializationStatus: "idle", resultChoicePolicy: "implicit_sole", canonicalInputJson: "{}", workflowFingerprintJson: "{}", schemaVersion: "1", selectedItemId: null, selectionMode: null, selectionResponseId: null, producedArtifactVersionId: null, producedQualityReviewId: null, producedAssetId: null, queuedAtMs: 1, startedAtMs: 2, terminalAtMs: null, completedAtMs: null, updatedAtMs: 2 });
    await database.collections.execution_items.insertOne({ _id: itemId, batchId, agentId: "00000000-0000-4000-8000-000000000a09", agentVersionId: "00000000-0000-4000-8000-000000000a10", profileId: "fake", profileVersion: 1, agentSnapshotJson: "{}", profileSnapshotJson: "{}", status: "running", attemptCount: 1, attemptsJson: "[]", resultSummaryJson: null, canonicalResultJson: null, candidateAssetId: null, safeErrorJson: null, startedAtMs: 2, finishedAtMs: null, updatedAtMs: 2 });

    // Recovery returns terminal batches for display reconciliation, not requeue.
    expect(await repositories.execution.recoverInterrupted(3)).toContain(batchId);
    expect(await repositories.execution.getBatch(batchId)).toMatchObject({ status: "results" });
    expect(await repositories.execution.getItems(batchId)).toMatchObject([{ id: itemId, status: "failed", attemptCount: 1, safeError: { kind: "interrupted" }, attempts: [{ status: "failed", safeError: { kind: "interrupted" } }] }]);
    const execute = vi.fn(async () => ({ result: {}, summary: {} }));
    await new ExecutionService(repositories, new CandidatePoolService(repositories, "fake")).run(batchId, execute);
    expect(execute).not.toHaveBeenCalled();

    await repositories.execution.retryFailed(batchId, 4);
    expect(await repositories.execution.getBatch(batchId)).toMatchObject({ status: "queued" });
    expect(await repositories.execution.getItems(batchId)).toMatchObject([{ id: itemId, status: "queued", attemptCount: 1, safeError: null }]);
  });

  it("does not silently retry a candidate whose provider outcome is unknown", async () => {
    const database = await createTestDatabase({ seedAgents: false });
    databases.push(database);
    const repositories = createRepositories(database);
    const batchId = "00000000-0000-4000-8000-000000000a21";
    const itemId = "00000000-0000-4000-8000-000000000a22";
    await database.collections.execution_batches.insertOne({ _id: batchId, bookletId: "00000000-0000-4000-8000-000000000a01", cardId: "00000000-0000-4000-8000-000000000a02", targetKey: "skill:intake_readiness@1", subjectKind: "text", subjectId: "audience", previousBatchId: null, poolFingerprint: "unknown", status: "results", materializationStatus: "idle", resultChoicePolicy: "implicit_sole", canonicalInputJson: "{}", workflowFingerprintJson: "{}", schemaVersion: "1", selectedItemId: null, selectionMode: null, selectionResponseId: null, producedArtifactVersionId: null, producedQualityReviewId: null, producedAssetId: null, queuedAtMs: 1, startedAtMs: 2, terminalAtMs: 3, completedAtMs: null, updatedAtMs: 3 });
    await database.collections.execution_items.insertOne({ _id: itemId, batchId, agentId: "00000000-0000-4000-8000-000000000a23", agentVersionId: "00000000-0000-4000-8000-000000000a24", profileId: "fake", profileVersion: 1, agentSnapshotJson: "{}", profileSnapshotJson: "{}", status: "failed", attemptCount: 1, attemptsJson: "[]", resultSummaryJson: null, canonicalResultJson: null, candidateAssetId: null, safeErrorJson: JSON.stringify({ kind: "unknown", message: "The candidate timed out before its outcome could be confirmed. Inspect saved output before retrying." }), startedAtMs: 2, finishedAtMs: 3, updatedAtMs: 3 });

    await repositories.execution.retryFailed(batchId, 4);

    expect(await repositories.execution.getBatch(batchId)).toMatchObject({ status: "results" });
    expect(await repositories.execution.getItems(batchId)).toMatchObject([{ id: itemId, status: "failed", safeError: { kind: "unknown" } }]);
  });

  it("preserves a legacy job whose saved item is already terminal", async () => {
    const database = await createTestDatabase({ seedAgents: false });
    databases.push(database);
    const repositories = createRepositories(database);
    const jobId = "00000000-0000-4000-8000-000000000a11";
    const itemId = "00000000-0000-4000-8000-000000000a12";
    await database.collections.generation_jobs.insertOne({ _id: jobId, bookletId: "00000000-0000-4000-8000-000000000a01", jobType: "pages", status: "running", idempotencyKey: "saved-legacy-job", inputJson: "{}", errorJson: null, createdAtMs: 1, startedAtMs: 2, finishedAtMs: null, updatedAtMs: 2 });
    await database.collections.generation_items.insertOne({ _id: itemId, jobId, itemKey: "page:saved", position: 0, status: "succeeded", attemptCount: 1, inputJson: "{}", resultJson: JSON.stringify({ saved: true }), assetId: "00000000-0000-4000-8000-000000000a13", errorJson: null, executionCardId: null, executionBatchId: null, startedAtMs: 2, finishedAtMs: 3 });

    expect(await repositories.jobs.recoverInterrupted()).toBe(0);
    expect(await repositories.jobs.getStatus(jobId)).toMatchObject({ status: "succeeded", items: [{ id: itemId, status: "succeeded", error: null }] });
    expect(await repositories.jobs.getItems(jobId)).toMatchObject([{ id: itemId, result: { saved: true }, assetId: "00000000-0000-4000-8000-000000000a13" }]);
  });
});
