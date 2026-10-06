import { pathToFileURL } from "node:url";
import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { personaSchema } from "@/lib/contracts/experiment-runner";

const optionsSchema = z.object({
  action: z.enum(["observe", "create", "pause", "resume"]),
  origin: z.string(),
  runId: opaqueIdSchema.optional(),
  requestId: opaqueIdSchema.optional(),
  persona: personaSchema.optional(),
  predecessorRunId: opaqueIdSchema.optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
  apply: z.boolean(),
});
export type RunnerOptions = z.infer<typeof optionsSchema>;
const help = "Usage: tsx scripts/experiment-runner.ts --action observe|create|pause|resume --origin <staging-or-loopback-origin> [--run-id <uuid>] [--persona <persona> --request-id <uuid> --predecessor-run-id <uuid>] [--expected-revision <number>] [--apply]\nMutations default to preview. Apply uses BOOKLET_RUNNER_PASSWORD privately; username is booklet. Only Simulated mode is supported. Observe without --run-id lists saved runs. No automatic request retries.";

export function parseRunnerOptions(args: string[]): RunnerOptions {
  const raw: Record<string, unknown> = { apply: false };
  const names: Record<string, string> = {
    "--action": "action", "--origin": "origin", "--run-id": "runId", "--request-id": "requestId",
    "--persona": "persona", "--predecessor-run-id": "predecessorRunId", "--expected-revision": "expectedRevision",
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--apply" && !raw.apply) { raw.apply = true; continue; }
    const name = names[arg];
    if (!name || raw[name] !== undefined || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error(help);
    const value = args[++index];
    if (name === "expectedRevision" && !/^\d+$/.test(value)) throw new Error(help);
    raw[name] = name === "expectedRevision" ? Number(value) : value;
  }
  let options: RunnerOptions;
  try { options = optionsSchema.parse(raw); } catch { throw new Error(help); }
  let url: URL;
  try { url = new URL(options.origin); } catch { throw new Error("Select the staging or a loopback origin."); }
  const staging = url.origin === "https://booklet-staging.uniwares.co.uk";
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol);
  if ((!staging && !local) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Select the staging or a loopback origin.");
  options.origin = url.origin;
  if (options.action === "create") {
    if (!options.persona || !options.requestId || options.runId || options.expectedRevision !== undefined) throw new Error(help);
  } else if (options.persona || options.requestId || options.predecessorRunId) throw new Error(help);
  if (options.action === "pause" || options.action === "resume") {
    if (!options.runId || options.expectedRevision === undefined) throw new Error(help);
  } else if (options.expectedRevision !== undefined) throw new Error(help);
  return options;
}

// Return only allowlisted diagnostic fields, not prompts, decisions or response bodies.
const summarySchema = z.object({
  runId: opaqueIdSchema, bookletId: opaqueIdSchema, persona: personaSchema,
  mode: z.literal("simulated"), status: z.string(), revision: z.number().int().nonnegative(),
  nextNarrativeTask: z.string().nullable(), activeOperationId: opaqueIdSchema.nullable(),
  safeFailure: z.string().nullable(), pauseRequested: z.boolean(),
  counters: z.object({ logicalText: z.number(), logicalImage: z.number(), payableText: z.literal(0), payableImage: z.literal(0), steps: z.number() }),
  operationHistory: z.array(z.object({ id: opaqueIdSchema, role: z.string(), taskId: z.string().nullable(), state: z.string(), workflowRunId: opaqueIdSchema.nullable(), parentWorkflowRunId: opaqueIdSchema.nullable(), verifiedWorkflowId: opaqueIdSchema.nullable() })),
  currentArtifacts: z.array(z.object({ id: opaqueIdSchema, taskId: z.string(), state: z.string(), currentVersionId: opaqueIdSchema.nullable() })),
});
export async function executeRunner(options: RunnerOptions, deps: { password?: string; fetcher?: typeof fetch } = {}) {
  if (options.action !== "observe" && !options.apply) return { preview: true, action: options.action, origin: options.origin, runId: options.runId ?? null, requestId: options.requestId ?? null, persona: options.persona ?? null, mode: "simulated" };
  if (!deps.password) throw new Error("BOOKLET_RUNNER_PASSWORD is required privately. Do not paste it into chat or command arguments.");
  const suffix = options.action === "create" ? "" : options.runId ? `/${options.runId}${options.action === "observe" ? "" : `/${options.action}`}` : "";
  const headers: Record<string, string> = { Authorization: `Basic ${Buffer.from(`booklet:${deps.password}`).toString("base64")}`, Origin: options.origin };
  let body: string | undefined;
  if (options.action === "create") {
    headers["Idempotency-Key"] = options.requestId!;
    body = JSON.stringify({ persona: options.persona, mode: "simulated", ...(options.predecessorRunId ? { predecessorRunId: options.predecessorRunId } : {}) });
  } else if (options.action !== "observe") body = JSON.stringify({ expectedRevision: options.expectedRevision });
  if (body) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await (deps.fetcher ?? fetch)(`${options.origin}/api/experiments/booklet-runs${suffix}`, {
      method: options.action === "observe" ? "GET" : "POST", headers, body,
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error(options.action === "observe" ? "Observation failed. Inspect the same run before retrying." : `Mutation outcome is unknown. No retry was sent. Retain ${options.requestId ? `request ID ${options.requestId}` : `run ID ${options.runId}`}; inspect saved state before another mutation.`);
  }
  if (!response.ok) throw new Error(`Runner returned HTTP ${response.status}. No retry was sent. Inspect saved state.`);
  try {
    const envelope = await response.json() as { data?: unknown };
    const result = options.action === "observe" && !options.runId ? z.array(summarySchema).parse(envelope.data) : summarySchema.parse(envelope.data);
    if (!Array.isArray(result) && options.runId && result.runId !== options.runId) throw new Error("Wrong run identity.");
    return { preview: false, action: options.action, result };
  } catch {
    throw new Error("Runner response is not a verified simulated projection. Inspect saved state; do not repeat the mutation automatically.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.slice(2).join(" ") === "--help") console.log(help);
    else {
      const options = parseRunnerOptions(process.argv.slice(2));
      if (options.action === "create" && options.apply) console.log(`Retain request ID: ${options.requestId}`);
      console.log(JSON.stringify(await executeRunner(options, { password: process.env.BOOKLET_RUNNER_PASSWORD }), null, 2));
    }
  } catch (error) { console.error(error instanceof Error ? error.message : "Runner check failed."); process.exitCode = 1; }
}
