import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import type { AssetStore } from "@/lib/assets/asset-store";
import { initializeMongoData } from "@/db/initialize";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const databases: Database[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(databases.splice(0).map(closeTestDatabase)); });
function assets(): AssetStore {
  const content = new Map<string, Uint8Array>();
  return {
    async put(uri, bytes, mimeType) { content.set(uri, bytes); return { uri, mimeType, byteLength: bytes.byteLength }; },
    async exists(uri) { return content.has(uri); }, async get(uri) { return content.get(uri)!; },
  };
}
function configure() {
  const slots = [["manager", null, null], ["specialist", "J01", null], ["specialist", "J02", null], ["tester", null, "playful_kid"], ["tester", null, "enthusiast_parent"], ["tester", null, "professional_creator"]];
  for (const [key, value] of Object.entries({ DEPLOYMENT_ENV: "local", DIFY_BOOKLET_RUNNER_ENABLED: "true", DIFY_BOOKLET_BASE_URL: "https://dify.test", DIFY_BOOKLET_PUBLIC_ORIGIN: "http://localhost:3000", DIFY_BOOKLET_TOOL_KEY: "x".repeat(32), DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(slots.map(([role, taskId, persona]) => ({ role, taskId, persona, appId: randomUUID(), publishedWorkflowId: randomUUID(), toolProviderId: null, apiKey: "private-fixture" }))) })) vi.stubEnv(key, value);
}
describe("experiment initialization profile", () => {
  it("initializes twice without agent seeds or host provider execution", async () => {
    configure(); vi.stubEnv("OPENAI_API_KEY", "");
    const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
    const store = assets();
    await initializeMongoData(database, store);
    await initializeMongoData(database, store);
    expect(await database.collections.agent_definitions.countDocuments()).toBe(0);
    expect(await database.collections.agent_versions.countDocuments()).toBe(0);
    expect(await database.collections.assets.countDocuments()).toBe(4);
    expect(await database.collections.deployment_control.countDocuments()).toBe(1);
  });
  it("preserves existing legacy seeds when the experiment is enabled", async () => {
    configure();
    const database = await createTestDatabase(); databases.push(database);
    const before = await database.collections.agent_versions.find().toArray();
    await initializeMongoData(database, assets());
    expect(await database.collections.agent_versions.find().toArray()).toEqual(before);
  });
});
