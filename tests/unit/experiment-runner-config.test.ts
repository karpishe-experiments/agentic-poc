import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { configurationForPersona, getRunnerConfig, bindingFor, savedConfigurationSchema } from "@/lib/experiment-runner/config";

const ids = Array.from({ length: 18 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const entries = [
  ["manager", null, null], ["specialist", "J01", null], ["specialist", "J02", null],
  ["tester", null, "playful_kid"], ["tester", null, "enthusiast_parent"], ["tester", null, "professional_creator"],
] as const;
const bindings = entries.map(([role, taskId, persona], index) => ({ role, taskId, persona, appId: ids[index], publishedWorkflowId: ids[index + 6], toolProviderId: ids[index + 12], apiKey: `private-${index}` }));
const env = { DEPLOYMENT_ENV: "local", DIFY_BOOKLET_RUNNER_ENABLED: "true", DIFY_BOOKLET_BASE_URL: "https://dify.example.test", DIFY_BOOKLET_PUBLIC_ORIGIN: "http://localhost:3000", DIFY_BOOKLET_TOOL_KEY: "x".repeat(32), DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(bindings) };

describe("booklet runner configuration", () => {
  it("requires the exact seventeen-slot J12 profile and saves fifteen persona bindings", () => {
    const later = Array.from({ length: 10 }, (_, index) => ({
      role: "specialist", taskId: `J${String(index + 3).padStart(2, "0")}`, persona: null,
      appId: `00000000-0000-4000-8000-${String(index + 30).padStart(12, "0")}`,
      publishedWorkflowId: ids[17], toolProviderId: null, apiKey: `pages-${index}`,
    }));
    const image = { role: "image", taskId: null, persona: null, appId: ids[16], publishedWorkflowId: ids[17], toolProviderId: null, apiKey: "image-key" };
    const expanded = [...bindings, ...later, image];
    const state = getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(expanded) });
    if (!state.enabled) throw new Error("Expected J12 profile");
    expect(configurationForPersona(state.config, "playful_kid")).toHaveLength(15);
    expect(bindingFor(state.config, { role: "specialist", taskId: "J12", persona: "playful_kid" }).apiKey).toBe("pages-9");
    expect(getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(expanded.filter((row) => row.taskId !== "J12")) }).enabled).toBe(true);
    for (const bad of [expanded.map((row) => row.taskId === "J12" ? { ...row, taskId: "J10" } : row),
      expanded.map((row) => row.taskId === "J12" ? { ...row, appId: bindings[0].appId } : row),
      expanded.map((row) => row.role === "image" ? { ...row, taskId: "J12" } : row)]) {
      expect(getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(bad) })).toEqual({ enabled: false, reason: "invalid" });
    }
  });
  it("records final-page evidence only for the complete image binding and preserves legacy snapshots", () => {
    const later = Array.from({ length: 10 }, (_, index) => ({
      role: "specialist", taskId: `J${String(index + 3).padStart(2, "0")}`, persona: null,
      appId: `00000000-0000-4000-8000-${String(index + 30).padStart(12, "0")}`,
      publishedWorkflowId: ids[17], toolProviderId: null, apiKey: `pages-${index}`,
    }));
    const image = { role: "image", taskId: null, persona: null, appId: ids[16], publishedWorkflowId: ids[17], toolProviderId: null, apiKey: "image-key" };
    const legacy = [...bindings, ...later, image];
    const legacyState = getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(legacy) });
    if (!legacyState.enabled) throw new Error("Expected legacy J12 profile");
    const legacySnapshot = configurationForPersona(legacyState.config, "playful_kid");
    const expectedLegacySnapshot = legacy.filter((item) => item.persona === null || item.persona === "playful_kid").map(({ role, taskId, appId, publishedWorkflowId, toolProviderId }) => ({ role, taskId, appId, publishedWorkflowId, toolProviderId }));
    expect(JSON.stringify(legacySnapshot)).not.toContain("finalPageIllustration");
    expect(JSON.stringify(legacySnapshot)).toBe(JSON.stringify(expectedLegacySnapshot));
    const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    expect(hash(legacySnapshot)).toBe(hash(expectedLegacySnapshot));
    expect(savedConfigurationSchema.safeParse(legacySnapshot).success).toBe(true);

    const enabled = legacy.map((row) => row.role === "image" ? { ...row, finalPageIllustration: true } : row);
    const enabledState = getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(enabled) });
    if (!enabledState.enabled) throw new Error("Expected enabled J13 evidence profile");
    const snapshot = configurationForPersona(enabledState.config, "playful_kid");
    expect(snapshot).toHaveLength(15);
    expect(snapshot.filter((row) => row.finalPageIllustration === true)).toEqual([expect.objectContaining({ role: "image", taskId: null })]);
    expect(hash(snapshot)).not.toBe(hash(legacySnapshot));
    expect(savedConfigurationSchema.safeParse(snapshot).success).toBe(true);

    const wrongRole = enabled.map((row) => row.role === "image" ? { ...row, finalPageIllustration: undefined } : row.taskId === "J12" ? { ...row, finalPageIllustration: true } : row);
    const partial = enabled.filter((row) => row.taskId !== "J12");
    for (const rows of [wrongRole, partial, enabled.map((row) => row.role === "image" ? { ...row, finalPageIllustration: false } : row)]) {
      expect(getRunnerConfig({ ...env, DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(rows) })).toEqual({ enabled: false, reason: "invalid" });
    }
    expect(savedConfigurationSchema.safeParse(snapshot.map((row) => row.role === "image" ? { ...row, finalPageIllustration: undefined } : row.taskId === "J12" ? { ...row, finalPageIllustration: true } : row)).success).toBe(false);
    expect(savedConfigurationSchema.safeParse(snapshot.filter((row) => row.taskId !== "J12")).success).toBe(false);
  });
  it("preserves legacy saved judge and J13 records when final-page evidence is absent", () => {
    const legacy = [
      { role: "judge", taskId: "J13", appId: ids[0], publishedWorkflowId: ids[1], toolProviderId: null },
      { role: "specialist", taskId: "J13", appId: ids[2], publishedWorkflowId: ids[3], toolProviderId: null },
    ];
    expect(savedConfigurationSchema.safeParse(legacy).success).toBe(true);
    expect(savedConfigurationSchema.safeParse([...legacy, { role: "image", taskId: null, appId: ids[4], publishedWorkflowId: ids[5], toolProviderId: null, finalPageIllustration: true }]).success).toBe(false);
  });
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
