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
  it("requires all sixteen pagination bindings and retains a fourteen-slot private snapshot", () => {
    const later = ["J03", "J04", "J05", "J06", "J07", "J08", "J09", "J10", "J11"].map((taskId, index) => ({
      role: "specialist", taskId, persona: null, appId: ids[index + 6], publishedWorkflowId: ids[17], toolProviderId: null, apiKey: `pagination-${index}`,
    }));
    const image = { role: "image", taskId: null, persona: null, appId: ids[15], publishedWorkflowId: ids[17], toolProviderId: null, apiKey: "image-key" };
    const expanded = [...bindings, ...later, image];
    const state = getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(expanded) });
    if (!state.enabled) throw new Error("Expected pagination profile");
    expect(configurationForPersona(state.config, "professional_creator")).toHaveLength(14);
    expect(bindingFor(state.config, { role: "specialist", taskId: "J11", persona: "professional_creator" }).apiKey).toBe("pagination-8");
    for (const bad of [expanded.map((item) => item.taskId === "J11" ? { ...item, taskId: "J10" } : item),
      expanded.map((item) => item.taskId === "J11" ? { ...item, appId: ids[0] } : item),
      expanded.map((item) => item.taskId === "J09" ? { ...item, taskId: "J12" } : item)]) {
      expect(getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(bad) })).toEqual({ enabled: false, reason: "invalid" });
    }
  });
  it("requires the complete fifteen-slot sheet profile", () => {
    const later = ["J03", "J04", "J05", "J06", "J07", "J08", "J09", "J10"].map((taskId, index) => ({
      role: "specialist", taskId, persona: null, appId: ids[index + 6], publishedWorkflowId: ids[17], toolProviderId: null, apiKey: `sheet-${index}`,
    }));
    const image = { role: "image", taskId: null, persona: null, appId: ids[14], publishedWorkflowId: ids[17], toolProviderId: null, apiKey: "image-key" };
    const expanded = [...bindings, ...later, image];
    const state = getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(expanded) });
    if (!state.enabled) throw new Error("Expected sheet profile");
    expect(bindingFor(state.config, { role: "specialist", taskId: "J09", persona: "playful_kid" }).apiKey).toBe("sheet-6");
    expect(configurationForPersona(state.config, "playful_kid")).toHaveLength(13);
    for (const bad of [expanded.slice(0, 14), [...expanded.slice(0, 13), later[6], image],
      expanded.map((item) => item.taskId === "J10" ? { ...item, appId: ids[0] } : item)]) {
      expect(getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(bad) })).toEqual({ enabled: false, reason: "invalid" });
    }
  });
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
  it("accepts exactly eleven distinct narrative bindings and rejects partial profiles", () => {
    const later = ["J03", "J04", "J05", "J06", "J07"].map((taskId, index) => ({
      role: "specialist", taskId, persona: null, appId: ids[index + 6],
      publishedWorkflowId: ids[index + 11], toolProviderId: null, apiKey: `later-${index}`,
    }));
    const expanded = [...bindings, ...later];
    const state = getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(expanded) });
    if (!state.enabled) throw new Error("Expected eleven-slot profile");
    expect(configurationForPersona(state.config, "playful_kid")).toHaveLength(9);
    expect(bindingFor(state.config, { role: "specialist", taskId: "J07", persona: "playful_kid" }).apiKey).toBe("later-4");
    for (const bad of [expanded.slice(0, 10), [...expanded.slice(0, 10), later[0]], expanded.map((item, index) => index === 10 ? { ...item, appId: expanded[0].appId } : item)]) {
      expect(getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(bad) })).toEqual({ enabled: false, reason: "invalid" });
    }
  });
  it("requires J08 and a separate generic image binding together", () => {
    const later = ["J03", "J04", "J05", "J06", "J07", "J08"].map((taskId, index) => ({
      role: "specialist", taskId, persona: null, appId: ids[index + 6],
      publishedWorkflowId: ids[index + 11], toolProviderId: null, apiKey: `later-${index}`,
    }));
    const image = { role: "image", taskId: null, persona: null, appId: ids[12], publishedWorkflowId: ids[13], toolProviderId: null, apiKey: "private-image" };
    const expanded = [...bindings, ...later, image];
    const state = getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(expanded) });
    if (!state.enabled) throw new Error("Expected thirteen-slot profile");
    expect(bindingFor(state.config, { role: "image", taskId: "J08", persona: "playful_kid" })).toEqual(image);
    expect(configurationForPersona(state.config, "playful_kid")).toHaveLength(11);
    for (const bad of [expanded.slice(0, 12), [...bindings, ...later.slice(0, 5), image],
      [...expanded.slice(0, 12), { ...image, taskId: "J08" }],
      [...expanded.slice(0, 12), { ...image, persona: "playful_kid" }]]) {
      expect(getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(bad) })).toEqual({ enabled: false, reason: "invalid" });
    }
  });
});
