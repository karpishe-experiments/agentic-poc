import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { verifyExperimentData } from "@/db/verify";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { verificationMetadata } from "@/db/experiment-verification-metadata";
import { createVerificationAttempt } from "@/lib/experiment-runner/verification-attempt";

const databases: Database[] = [];

it("image verification excludes large retained text payloads and preserves image/manager lineage", async () => {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const runId = randomUUID(), bookletId = randomUUID();
  await createExperimentRepository(database).createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 });
  const imageId = randomUUID();
  await database.database.collection<{ _id: string; [key: string]: unknown }>("experiment_operations").insertMany([
    ...Array.from({ length: 37 }, () => ({ _id: randomUUID(), idempotencyKey: randomUUID(), runId, role: "manager", providerKind: "text",
      taskId: null, m4Preparation: { privateUnusedPayload: "x".repeat(500_000) } })),
    { _id: imageId, idempotencyKey: imageId, runId, role: "image", providerKind: "image", taskId: "J09",
      imageRequestJson: "retained image request", resultDigest: "retained digest", m4Preparation: { privateUnusedPayload: "private" } },
  ]);
  const store = { async get() { throw new Error("Metadata must not fetch bytes"); }, async put() { throw new Error("Metadata must not write bytes"); }, async exists() { return true; } };
  const find = vi.spyOn(database.collections.experiment_operations, "find");
  const metadata = await database.client.withSession(session => verificationMetadata(database, session, runId, createVerificationAttempt(store)));
  expect(metadata.operations.find(row => row._id === imageId)).toEqual({ _id: imageId, runId, role: "image", providerKind: "image", taskId: "J09",
    imageRequestJson: "retained image request", resultDigest: "retained digest" });
  expect(metadata.operations).toHaveLength(38);
  expect(JSON.stringify(metadata.operations)).not.toContain("privateUnusedPayload");
  expect(Buffer.byteLength(JSON.stringify(metadata.operations))).toBeLessThan(20_000);
  expect(find.mock.calls[0][0]).toEqual({ runId, role: { $in: ["image", "manager"] } });
  expect(find.mock.calls[0][1]?.projection).not.toHaveProperty("m4Preparation");
  expect(await database.collections.experiment_operations.countDocuments({ runId })).toBe(38);
});
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.splice(0).map(closeTestDatabase)); });

it("verifies experiment ownership without legacy agent seeds and detects broken ownership", async () => {
  const database = await createTestDatabase({ seedAgents: false });
  databases.push(database);
  const repository = createExperimentRepository(database);
  const runId = randomUUID(), bookletId = randomUUID();
  await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 });
  await expect(verifyExperimentData(database)).resolves.toBeUndefined();
  expect(await database.collections.agent_versions.countDocuments()).toBe(0);
  await database.collections.booklets.updateOne({ _id: bookletId }, { $set: { experimentRunId: randomUUID() } });
  await expect(verifyExperimentData(database)).rejects.toThrow("incompatible booklet");
});

it("rejects an active operation that belongs to another experiment run", async () => {
  const database = await createTestDatabase({ seedAgents: false });
  databases.push(database);
  const repository = createExperimentRepository(database);
  const runId = randomUUID(), bookletId = randomUUID();
  await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 });
  await database.collections.experiment_runs.updateOne({ _id: runId }, { $set: { activeOperationId: randomUUID() } });
  await expect(verifyExperimentData(database)).rejects.toThrow("incompatible active operation");
});

it("verifies every projected page and rejects a broken reference on the final page without loading saved output", async () => {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const runId = randomUUID(), bookletId = randomUUID();
  await createExperimentRepository(database).createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 });
  // Retained completed operations can contain large provider preparation/results.
  // The verifier needs only their ownership and version-reference fields.
  const ids = Array.from({ length: 205 }, (_, index) => `operation-${String(index).padStart(4, "0")}`);
  const recovery = { reference: "retained-fixture", evidenceDigest: "a".repeat(64), requestDigest: "b".repeat(64), recoveredAtMs: 1 };
  await database.database.collection<{ _id: string }>("experiment_operations").insertMany(ids.map((_id, index) => ({
    _id, idempotencyKey: _id, runId, role: "specialist", taskId: "J01", subjectKind: "book", subjectId: bookletId,
    attempt: index + 1, dependencyVersionIds: [], expectedTargetVersionId: null,
    resultJson: JSON.stringify({ privateContent: "x".repeat(90_000) }),
    m4CompletionRecovery: recovery,
  })));
  const find = vi.spyOn(database.collections.experiment_operations, "find");
  await expect(verifyExperimentData(database)).resolves.toBeUndefined();
  expect(find).toHaveBeenCalledTimes(3);
  expect(find.mock.calls[0][1]?.projection).toEqual({ _id: 1, runId: 1, dependencyVersionIds: 1, expectedTargetVersionId: 1, role: 1 });
  expect(find.mock.calls[1][0]).toEqual({ $and: [{}, { _id: { $gt: ids[99] } }] });
  expect(find.mock.calls[2][0]).toEqual({ $and: [{}, { _id: { $gt: ids[199] } }] });
  await database.collections.experiment_operations.updateOne({ _id: ids[204] }, { $set: { dependencyVersionIds: [randomUUID()] } });
  await expect(verifyExperimentData(database)).rejects.toThrow(`Experiment operation ${ids[204]} has an incompatible artifact version`);
  expect((await database.collections.experiment_operations.findOne({ _id: ids[204] }))?.resultJson).toBe(JSON.stringify({ privateContent: "x".repeat(90_000) }));
  expect((await database.collections.experiment_operations.findOne({ _id: ids[204] }))?.m4CompletionRecovery).toEqual(recovery);
});

it("preserves a failed read and emits only bounded collection diagnostics", async () => {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const failure = Object.assign(new Error("private provider content and connection URL"), { name: "MongoOperationTimeoutError" });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(database.collections.experiment_operations, "find").mockImplementation(() => { throw failure; });
  await expect(verifyExperimentData(database)).rejects.toBe(failure);
  expect(log).toHaveBeenCalledTimes(1);
  expect(JSON.parse(log.mock.calls[0][0])).toEqual({ verified: false, phase: "experiment_integrity_read",
    collection: "experiment_operations", errorKind: "MongoOperationTimeoutError", elapsedMs: expect.any(Number), completedRows: 0 });
  expect(JSON.stringify(log.mock.calls)).not.toContain("private provider");
});
