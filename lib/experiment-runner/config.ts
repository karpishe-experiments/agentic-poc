import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentRoleSchema, experimentTaskSchema, specialistTaskSchema, personaSchema, type Persona, type SpecialistTask } from "@/lib/contracts/experiment-runner";
import type { M4Authority } from "@/db/experiment-campaign";

const binding = z.strictObject({
  role: z.enum(["manager", "specialist", "tester", "image", "judge"]),
  taskId: specialistTaskSchema.nullable(),
  persona: personaSchema.nullable(),
  appId: opaqueIdSchema,
  publishedWorkflowId: opaqueIdSchema,
  toolProviderId: opaqueIdSchema.nullable(),
  apiKey: z.string().min(1),
  // This is configuration evidence only. Its presence does not enable image
  // dispatch; that remains a later J13 admission and runtime decision.
  finalPageIllustration: z.literal(true).optional(),
});
export type BookletBinding = z.infer<typeof binding>;
export const savedConfigurationItemSchema = z.strictObject({
  // Preserve the pre-J13 persistence contract when the optional evidence is
  // absent. J13 remains an image responsibility, not a text specialist binding.
  role: experimentRoleSchema,
  taskId: experimentTaskSchema.nullable(),
  appId: opaqueIdSchema,
  publishedWorkflowId: opaqueIdSchema,
  toolProviderId: opaqueIdSchema.nullable(),
  finalPageIllustration: z.literal(true).optional(),
});

const savedFinalPageSlots = [
  "manager::",
  ...Array.from({ length: 12 }, (_, index) => `specialist:J${String(index + 1).padStart(2, "0")}:`),
  "tester::",
  "image::",
];
function completeSavedFinalPageProfile(items: z.infer<typeof savedConfigurationItemSchema>[]): boolean {
  const expectedSlots = items.some((item) => item.role === "judge") ? [...savedFinalPageSlots, "judge::"] : savedFinalPageSlots;
  if (items.length !== expectedSlots.length ||
      new Set(items.map((item) => `${item.role}:${item.taskId ?? ""}:`)).size !== items.length ||
      !expectedSlots.every((slot) => items.some((item) => `${item.role}:${item.taskId ?? ""}:` === slot)) ||
      new Set(items.map((item) => item.appId)).size !== items.length) return false;
  return items.filter((item) => item.finalPageIllustration === true).length === 1 &&
    items.some((item) => item.role === "image" && item.taskId === null && item.finalPageIllustration === true);
}

// Legacy snapshots deliberately keep their original shape and bytes. When the
// new evidence is present, require the complete persona-filtered J12 profile.
export const savedConfigurationSchema = z.array(savedConfigurationItemSchema).max(100).superRefine((items, context) => {
  if (items.some((item) => item.finalPageIllustration === true) && !completeSavedFinalPageProfile(items)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Final-page illustration requires the complete saved J12 profile." });
  }
});
export type BookletRunnerConfig = { enabled: true; baseUrl: string; publicOrigin: string; callbackKey: string; bindings: BookletBinding[];
  m4?: { state: "disabled" | "invalid" | "ready" | "granted"; authority?: M4Authority };
  real?: { state: "ready"; bindings: BookletBinding[]; textPluginIdentity: string;
    textPackageSha256: string; imagePluginIdentity: string; imagePackageSha256: string;
    nativeFileFormat: "base64"; sourcePolicy: import("@/lib/experiment-runner/m4-policy").M4Policy;
    tokenPolicy: import("@/lib/experiment-runner/m4-policy").M4TokenPolicy } };
export type RunnerConfig = BookletRunnerConfig;
export type RunnerBinding = BookletBinding;
export type ConfigState = { enabled: false; reason: "disabled" | "production" } | { enabled: true; config: BookletRunnerConfig } | { enabled: false; reason: "invalid" };

function origin(raw: string | undefined, local: boolean): string | null {
  try {
    if (!raw) return null;
    const url = new URL(raw);
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || (url.protocol !== "https:" && !(local && loopback && url.protocol === "http:"))) return null;
    return url.origin;
  } catch { return null; }
}

export function readBookletRunnerConfig(env: Record<string, string | undefined> = process.env): ConfigState {
  if (env.DEPLOYMENT_ENV === "_prod") return { enabled: false, reason: "production" };
  if (env.DIFY_BOOKLET_RUNNER_ENABLED !== "true") return { enabled: false, reason: env.DIFY_BOOKLET_RUNNER_ENABLED === undefined || env.DIFY_BOOKLET_RUNNER_ENABLED === "false" ? "disabled" : "invalid" };
  const local = !env.DEPLOYMENT_ENV || env.DEPLOYMENT_ENV === "local";
  if (!local && env.DEPLOYMENT_ENV !== "_staging") return { enabled: false, reason: "invalid" };
  const baseUrl = origin(env.DIFY_BOOKLET_BASE_URL, false);
  const publicOrigin = origin(env.DIFY_BOOKLET_PUBLIC_ORIGIN, local);
  const callbackKey = env.DIFY_BOOKLET_TOOL_KEY;
  let raw: unknown;
  try { raw = JSON.parse(env.DIFY_BOOKLET_BINDINGS_JSON ?? ""); } catch { return { enabled: false, reason: "invalid" }; }
  const parsed = z.array(binding).refine((items) => [6, 11, 13, 15, 16, 17, 18].includes(items.length)).safeParse(raw);
  if (!baseUrl || !publicOrigin || !callbackKey || callbackKey.length < 32 || !parsed.success) return { enabled: false, reason: "invalid" };
  const bindings = parsed.data;
  const slots = bindings.map((item) => `${item.role}:${item.taskId ?? ""}:${item.persona ?? ""}`);
  const expected = ["manager::", "specialist:J01:", "specialist:J02:", "tester::playful_kid", "tester::enthusiast_parent", "tester::professional_creator"];
  if (bindings.length >= 11) expected.push(...["J03", "J04", "J05", "J06", "J07"].map((task) => `specialist:${task}:`));
  if (bindings.length >= 13) expected.push("specialist:J08:", "image::");
  if (bindings.length >= 15) expected.push("specialist:J09:", "specialist:J10:");
  if (bindings.length >= 16) expected.push("specialist:J11:");
  if (bindings.length >= 17) expected.push("specialist:J12:");
  if (bindings.length === 18) expected.push("judge::");
  const finalPageBindings = bindings.filter((item) => item.finalPageIllustration === true);
  if (new Set(slots).size !== bindings.length || expected.some((slot) => !slots.includes(slot)) || new Set(bindings.map((item) => item.appId)).size !== bindings.length ||
      (bindings.length === 18 && finalPageBindings.length !== 1) ||
      (finalPageBindings.length > 0 && (![17, 18].includes(bindings.length) || finalPageBindings.length !== 1 || finalPageBindings[0].role !== "image" || finalPageBindings[0].taskId !== null || finalPageBindings[0].persona !== null))) return { enabled: false, reason: "invalid" };
  return { enabled: true, config: { enabled: true, baseUrl, publicOrigin, callbackKey, bindings } };
}

export function selectBinding(config: BookletRunnerConfig, role: BookletBinding["role"], taskId: SpecialistTask | null, persona: Persona,
  mode: "simulated" | "balanced" | "real" = "balanced") {
  const available = mode === "real" ? config.real?.state === "ready" ? config.real.bindings : [] : config.bindings;
  const selected = available.find((item) => item.role === role && item.taskId === (role === "image" ? null : taskId) && item.persona === (role === "tester" ? persona : null));
  if (!selected) throw new Error("No configured binding for this role and task.");
  return selected;
}

export function configurationSnapshot(config: BookletRunnerConfig, persona: Persona,
  mode: "simulated" | "balanced" | "real" = "balanced") {
  const available = mode === "real" ? config.real?.state === "ready" ? config.real.bindings : [] : config.bindings;
  return available.filter((item) => item.persona === null || item.persona === persona).map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) =>
    finalPageIllustration === true ? { role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration } : { role, taskId, appId, publishedWorkflowId, toolProviderId });
}

export function validToolKey(candidate: string | null, expected: string): boolean {
  const left = Buffer.from(candidate ?? "");
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
export const getRunnerConfig = readBookletRunnerConfig;
export const configurationForPersona = configurationSnapshot;
export function bindingFor(config: RunnerConfig, input: { role: BookletBinding["role"]; taskId: SpecialistTask | null; persona: Persona }) {
  return selectBinding(config, input.role, input.taskId, input.persona);
}
