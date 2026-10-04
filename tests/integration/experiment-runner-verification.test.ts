import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { verifyExperimentData } from "@/db/verify";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

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
