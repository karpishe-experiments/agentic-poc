import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { specialistTaskSchema, personaSchema, type Persona, type SpecialistTask } from "@/lib/contracts/experiment-runner";

const binding = z.strictObject({
  role: z.enum(["manager", "specialist", "tester", "image"]),
  taskId: specialistTaskSchema.nullable(),
  persona: personaSchema.nullable(),
  appId: opaqueIdSchema,
  publishedWorkflowId: opaqueIdSchema,
  toolProviderId: opaqueIdSchema.nullable(),
  apiKey: z.string().min(1),
});
export type BookletBinding = z.infer<typeof binding>;
export type BookletRunnerConfig = { enabled: true; baseUrl: string; publicOrigin: string; callbackKey: string; bindings: BookletBinding[] };
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
  const parsed = z.array(binding).refine((items) => [6, 11, 13, 15, 16, 17].includes(items.length)).safeParse(raw);
  if (!baseUrl || !publicOrigin || !callbackKey || callbackKey.length < 32 || !parsed.success) return { enabled: false, reason: "invalid" };
  const bindings = parsed.data;
  const slots = bindings.map((item) => `${item.role}:${item.taskId ?? ""}:${item.persona ?? ""}`);
  const expected = ["manager::", "specialist:J01:", "specialist:J02:", "tester::playful_kid", "tester::enthusiast_parent", "tester::professional_creator"];
  if (bindings.length >= 11) expected.push(...["J03", "J04", "J05", "J06", "J07"].map((task) => `specialist:${task}:`));
  if (bindings.length >= 13) expected.push("specialist:J08:", "image::");
  if (bindings.length >= 15) expected.push("specialist:J09:", "specialist:J10:");
  if (bindings.length >= 16) expected.push("specialist:J11:");
  if (bindings.length === 17) expected.push("specialist:J12:");
  if (new Set(slots).size !== bindings.length || expected.some((slot) => !slots.includes(slot)) || new Set(bindings.map((item) => item.appId)).size !== bindings.length) return { enabled: false, reason: "invalid" };
  return { enabled: true, config: { enabled: true, baseUrl, publicOrigin, callbackKey, bindings } };
}

export function selectBinding(config: BookletRunnerConfig, role: "manager" | "specialist" | "tester" | "image", taskId: SpecialistTask | null, persona: Persona) {
  const selected = config.bindings.find((item) => item.role === role && item.taskId === (role === "image" ? null : taskId) && item.persona === (role === "tester" ? persona : null));
  if (!selected) throw new Error("No configured binding for this role and task.");
  return selected;
}

export function configurationSnapshot(config: BookletRunnerConfig, persona: Persona) {
  return config.bindings.filter((item) => item.persona === null || item.persona === persona).map(({ role, taskId, appId, publishedWorkflowId, toolProviderId }) => ({ role, taskId, appId, publishedWorkflowId, toolProviderId }));
}

export function validToolKey(candidate: string | null, expected: string): boolean {
  const left = Buffer.from(candidate ?? "");
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
export const getRunnerConfig = readBookletRunnerConfig;
export const configurationForPersona = configurationSnapshot;
export function bindingFor(config: RunnerConfig, input: { role: "manager" | "specialist" | "tester" | "image"; taskId: SpecialistTask | null; persona: Persona }) {
  return selectBinding(config, input.role, input.taskId, input.persona);
}
