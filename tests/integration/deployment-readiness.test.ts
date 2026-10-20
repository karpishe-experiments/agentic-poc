import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { initializeMongoData } from "@/db/initialize";
import { verifyDeploymentState } from "@/db/deployment-readiness";
import { verifyExperimentData } from "@/db/verify";
import type { AssetStore } from "@/lib/assets/asset-store";
import { withOperationBudget } from "@/lib/operations/budget";
import { seedDefaultAgents, assertActiveAgentCoverage } from "@/db/setup";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const databases: Database[] = [];
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  await Promise.all(databases.splice(0).map(closeTestDatabase));
});

function configure() {
  const slots = [["manager", null, null], ["specialist", "J01", null], ["specialist", "J02", null],
    ["tester", null, "playful_kid"], ["tester", null, "enthusiast_parent"], ["tester", null, "professional_creator"]];
  for (const [key, value] of Object.entries({ DEPLOYMENT_ENV: "local", DIFY_BOOKLET_RUNNER_ENABLED: "true",
    DIFY_BOOKLET_BASE_URL: "https://dify.test", DIFY_BOOKLET_PUBLIC_ORIGIN: "http://localhost:3000",
    DIFY_BOOKLET_TOOL_KEY: "x".repeat(32), DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(slots.map(([role, taskId, persona]) =>
      ({ role, taskId, persona, appId: randomUUID(), publishedWorkflowId: randomUUID(), toolProviderId: null, apiKey: "private-fixture" }))) })) vi.stubEnv(key, value);
}

function assets(): AssetStore {
  const bytes = new Map<string, Uint8Array>();
  return {
    async put(uri, content, mimeType) { bytes.set(uri, content); return { uri, mimeType, byteLength: content.byteLength }; },
    async get(uri) { return bytes.get(uri)!; }, async exists(uri) { return bytes.has(uri); },
  };
}

async function setup() {
  configure();
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const store = assets();
  await initializeMongoData(database, store);
  return { database, store };
}

it("initializes and checks readiness without reading retained history while explicit integrity audit still detects corruption", async () => {
  const { database, store } = await setup();
  const retained = { _id: randomUUID(), idempotencyKey: randomUUID(), runId: randomUUID(), role: "specialist",
    dependencyVersionIds: [], expectedTargetVersionId: null, resultJson: JSON.stringify({ privateResult: "x".repeat(1_000_000) }) };
  const raw = database.database.collection<typeof retained>("experiment_operations");
  await raw.insertOne(retained);
  const history = [database.collections.experiment_runs, database.collections.experiment_operations,
    database.collections.experiment_delegations, database.collections.artifacts, database.collections.artifact_versions,
    database.collections.approvals, database.collections.messages];
  const reads = history.flatMap(collection => [
    vi.spyOn(collection, "find").mockImplementation(() => { throw new Error("Unexpected experiment history scan"); }),
    vi.spyOn(collection, "findOne").mockImplementation(() => { throw new Error("Unexpected experiment history read"); }),
  ]);
  await withOperationBudget(Date.now() + 60_000, async () => {
    await initializeMongoData(database, store);
    await verifyDeploymentState(database, store);
  });
  for (const read of reads) { expect(read).not.toHaveBeenCalled(); read.mockRestore(); }
  expect(await raw.findOne({ _id: retained._id })).toEqual(retained);
  await expect(verifyExperimentData(database)).rejects.toThrow(`Experiment operation ${retained._id} has a missing run`);
});

it("rejects unsupported admission schema without changing its metadata", async () => {
  const { database, store } = await setup();
  await database.database.collection("deployment_control").updateOne({ _id: "environment:local" } as never, { $set: { schemaVersion: "unsupported" } });
  const before = await database.collections.deployment_control.findOne({ environment: "local" });
  await expect(verifyDeploymentState(database, store)).rejects.toThrow("Deployment admission metadata is incompatible");
  expect(await database.collections.deployment_control.findOne({ environment: "local" })).toEqual(before);
});

it.each(["style", "asset"])("rejects a missing required %s seed", async kind => {
  const { database, store } = await setup();
  const style = (await database.collections.style_catalog.findOne({ _id: "soft-watercolor" }))!;
  if (kind === "style") await database.collections.style_catalog.deleteOne({ _id: style._id });
  else await database.collections.assets.deleteOne({ _id: style.previewAssetId });
  await expect(verifyDeploymentState(database, store)).rejects.toThrow(kind === "style" ? "Required style seed is missing" : "Required style asset is unavailable");
});

it("requires the legacy manager seed only when the Booklet runner is disabled", async () => {
  const { database, store } = await setup();
  await expect(verifyDeploymentState(database, store)).resolves.toBeUndefined();
  vi.stubEnv("DIFY_BOOKLET_RUNNER_ENABLED", "false");
  await expect(verifyDeploymentState(database, store)).rejects.toThrow("Active runtime-agent coverage");
});

it.each(["valid", "specialist", "reference", "page", "duplicate_manager", "unprofiled_specialist"])("checks projected legacy agent coverage: %s", async kind => {
  const { database, store } = await setup();
  await seedDefaultAgents(database);
  vi.stubEnv("DIFY_BOOKLET_RUNNER_ENABLED", "false");
  if (kind === "specialist" || kind === "unprofiled_specialist") {
    const specialist = (await database.collections.agent_versions.findOne({ isActive: true, role: "specialist" }))!;
    if (kind === "specialist") await database.collections.agent_versions.updateOne({ _id: specialist._id }, { $set: { isActive: false } });
    else await database.collections.agent_versions.updateOne({ _id: specialist._id }, { $set: { profileId: null } });
  } else if (kind === "reference" || kind === "page") {
    await database.collections.agent_versions.updateMany({ isActive: true, role: "image", imageTarget: kind }, { $set: { isActive: false } });
  } else if (kind === "duplicate_manager") {
    const manager = (await database.collections.agent_versions.findOne({ isActive: true, role: "manager" }))!;
    // The verified unique index prevents this saved state. Check the shared
    // predicate too, without dropping the index or weakening real persistence.
    await expect(database.collections.agent_versions.insertOne({ ...manager, _id: randomUUID(), agentId: randomUUID() })).rejects.toMatchObject({ code: 11000 });
    const active = await database.collections.agent_versions.find({ isActive: true }).toArray();
    expect(() => assertActiveAgentCoverage([...active, manager])).toThrow("Active runtime-agent coverage");
    await expect(verifyDeploymentState(database, store)).resolves.toBeUndefined();
    return;
  }
  const read = vi.spyOn(database.collections.agent_versions, "find");
  if (kind === "valid") await expect(verifyDeploymentState(database, store)).resolves.toBeUndefined();
  else await expect(verifyDeploymentState(database, store)).rejects.toThrow("Active runtime-agent coverage");
  expect(read).toHaveBeenCalledWith({ isActive: true }, expect.objectContaining({ projection: { _id: 0, isActive: 1, role: 1, skillId: 1, imageTarget: 1, profileId: 1, profileVersion: 1 } }));
});

it("retains a failed ping and emits sanitized diagnostics with the inherited budget", async () => {
  const { database, store } = await setup();
  const failure = Object.assign(new Error("private connection URL and credentials"), { name: "MongoOperationTimeoutError" });
  vi.spyOn(database.database, "command").mockRejectedValueOnce(failure);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(withOperationBudget(Date.now() + 20_000, () => verifyDeploymentState(database, store))).rejects.toBe(failure);
  expect(log).toHaveBeenCalledTimes(1);
  const diagnostic = JSON.parse(log.mock.calls[0][0]);
  expect(diagnostic).toMatchObject({ diagnostic: "deployment_read", phase: "connection", operation: "ping", outcome: "failed", errorKind: "MongoOperationTimeoutError" });
  expect(diagnostic.remainingBudgetMs).toBeGreaterThan(0);
  expect(diagnostic.remainingBudgetMs).toBeLessThanOrEqual(20_000);
  expect(JSON.stringify(log.mock.calls)).not.toContain("private");
});

it("identifies an initial setup failure before readiness and retains its original error", async () => {
  const { database, store } = await setup();
  const failure = Object.assign(new Error("private setup connection details"), { name: "MongoOperationTimeoutError" });
  vi.spyOn(database.database, "command").mockRejectedValueOnce(failure);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(initializeMongoData(database, store)).rejects.toBe(failure);
  expect(log).toHaveBeenCalledTimes(1);
  expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ diagnostic: "deployment_read", phase: "structure", operation: "setup_structure", outcome: "failed", errorKind: "MongoOperationTimeoutError" });
  expect(JSON.stringify(log.mock.calls)).not.toContain("private");
});
