import { describe, expect, it } from "vitest";
import { configurationForPersona, getRunnerConfig, bindingFor } from "@/lib/experiment-runner/config";

const ids = Array.from({ length: 18 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const entries = [
  ["manager", null, null], ["specialist", "J01", null], ["specialist", "J02", null],
  ["tester", null, "playful_kid"], ["tester", null, "enthusiast_parent"], ["tester", null, "professional_creator"],
] as const;
const bindings = entries.map(([role, taskId, persona], index) => ({ role, taskId, persona, appId: ids[index], publishedWorkflowId: ids[index + 6], toolProviderId: ids[index + 12], apiKey: `private-${index}` }));
const env = { DEPLOYMENT_ENV: "local", DIFY_BOOKLET_RUNNER_ENABLED: "true", DIFY_BOOKLET_BASE_URL: "https://dify.example.test", DIFY_BOOKLET_PUBLIC_ORIGIN: "http://localhost:3000", DIFY_BOOKLET_TOOL_KEY: "x".repeat(32), DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(bindings) };

describe("booklet runner configuration", () => {
  it("defaults off and cannot enable production", () => {
    expect(getRunnerConfig({}).enabled).toBe(false);
    expect(getRunnerConfig({ ...env, DEPLOYMENT_ENV: "_prod" })).toEqual({ enabled: false, reason: "production" });
  });
  it("rejects malformed, duplicate, and credential-less bindings", () => {
    expect(getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: "{" })).toEqual({ enabled: false, reason: "invalid" });
    expect(getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify([...bindings.slice(0, 5), bindings[0]]) })).toEqual({ enabled: false, reason: "invalid" });
    expect(getRunnerConfig({ ...env, DIFY_BOOKLET_TOOL_KEY: "short" })).toEqual({ enabled: false, reason: "invalid" });
  });
  it("selects one persona and omits private keys from saved evidence", () => {
    const state = getRunnerConfig(env);
    if (!state.enabled) throw new Error("Expected valid configuration");
    expect(bindingFor(state.config, { role: "tester", taskId: null, persona: "playful_kid" }).apiKey).toBe("private-3");
    const snapshot = configurationForPersona(state.config, "playful_kid");
    expect(snapshot).toHaveLength(4);
    expect(JSON.stringify(snapshot)).not.toContain("private-");
    expect(JSON.stringify(snapshot)).not.toContain("persona");
  });
});
