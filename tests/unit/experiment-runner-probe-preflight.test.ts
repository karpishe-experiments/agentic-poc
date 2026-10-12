import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { checkProbeReadiness } from "@/lib/experiment-runner/probe-preflight";

const identity = { appId: "00000000-0000-4000-8000-000000000001", publication: "00000000-0000-4000-8000-000000000002" };
const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.example", publicOrigin: "https://booklet.example",
  callbackKey: "private-test-callback", bindings: [{ role: "manager", taskId: null, persona: null,
    appId: identity.appId, publishedWorkflowId: identity.publication, toolProviderId: null, apiKey: "private-test-key" }] };
function fixture(control: object = {}, active = 0) {
  const findOne = vi.fn().mockResolvedValue({ maintenance: false, activeMutations: 0, ...control });
  const countDocuments = vi.fn().mockResolvedValue(active);
  // The fixture deliberately implements no write operation.
  const database = { collections: Object.fromEntries(["deployment_control", "experiment_operations", "experiment_runs",
    "generation_items", "execution_items", "model_calls", "card_responses"].map(name => [name, { findOne, countDocuments }])) } as unknown as Database;
  return { database, findOne, countDocuments };
}
describe("disposable probe preflight", () => {
  it("rejects a mismatched publication before database access", async () => {
    const f = fixture();
    await expect(checkProbeReadiness(f.database, config, { ...identity, publication: "wrong" })).rejects.toThrow("binding differs");
    expect(f.findOne).not.toHaveBeenCalled(); expect(f.countDocuments).not.toHaveBeenCalled();
  });
  it.each([{ maintenance: true }, { draining: true }, { activeMutations: 1 }, { interruptedMutations: 1 },
    { mutationOwners: [{ id: "retained-owner" }] }])("rejects non-idle admission %j", async control => {
    await expect(checkProbeReadiness(fixture(control).database, config, identity)).rejects.toThrow("idle admission");
  });
  it("rejects active or unresolved work without creating a run", async () => {
    await expect(checkProbeReadiness(fixture({}, 1).database, config, identity)).rejects.toThrow("resolved work");
  });
  it("reports only runtime readiness, not workspace secret verification", async () => {
    expect(await checkProbeReadiness(fixture().database, config, identity)).toEqual({ ready: true, schemaVersion: "1",
      ...identity, callbackConfigured: true, idle: true, difySecretPresence: "verify_through_workspace_control" });
  });
});
