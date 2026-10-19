import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { verifyExperimentData } from "@/db/verify";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const databases: Database[] = [];
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
  await database.database.collection<{ _id: string }>("experiment_operations").insertMany(ids.map((_id, index) => ({
    _id, idempotencyKey: _id, runId, role: "specialist", taskId: "J01", subjectKind: "book", subjectId: bookletId,
    attempt: index + 1, dependencyVersionIds: [], expectedTargetVersionId: null,
    resultJson: JSON.stringify({ privateContent: "x".repeat(90_000) }),
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
