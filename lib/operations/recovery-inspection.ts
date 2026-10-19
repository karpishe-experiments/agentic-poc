import type { Collection, Filter } from "mongodb";
import { z } from "zod";
import type { MongoDatabaseContext } from "@/db/client";

type RecoveryRow = { _id: string; [key: string]: unknown };

const identifier = z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/);
const optionsSchema = z.object({
  environment: z.literal("_staging"),
  // The caller must verify eligibility and authorization before supplying exclusions.
  validatedTargets: z.array(z.object({ runId: identifier, operationId: identifier }).strict()).max(20).default([]),
  page: z.number().int().min(0).max(10_000).default(0),
  limit: z.number().int().min(1).max(50).default(5),
  nowMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();

export type RecoveryInspectionOptions = z.input<typeof optionsSchema>;
export type RecoveryBlockerCode = "admission_missing" | "admission_invalid" | "active_mutations" | "interrupted_mutations" | "mutation_owners"
  | "generation_jobs" | "generation_items" | "execution_items" | "model_calls" | "card_responses"
  | "runnable_runs" | "preparations" | "unresolved_runs" | "operations";
export type RecoveryOperationDetail = { id: string; runId: string; state: string; role: string; taskId: string;
  claims: { kind: string; expired: boolean | null }[]; hasResult: boolean; hasMaterialization: boolean; hasRecovery: boolean };
export type RecoveryBlocker = { code: RecoveryBlockerCode; count: number; ids: string[]; page: number; limit: number; hasMore: boolean;
  operations?: RecoveryOperationDetail[] };
export type RecoveryAdmission = { maintenance: boolean; draining: boolean; activeMutations: number; interruptedMutations: number; mutationOwnerCount: number; updatedAtMs: number };
export type RecoveryInspection = {
  schemaVersion: "1"; environment: "_staging"; inspectedAtMs: number;
  outcome: "clear" | "blocked" | "inspection_error";
  admission: RecoveryAdmission | null; blockers: RecoveryBlocker[];
  inspectionError?: { stage: string; errorKind: string };
};

const safeId = (value: unknown) => identifier.safeParse(value).success ? value as string : "unavailable";
const errorKinds = new Set(["MongoOperationTimeoutError", "MongoNetworkError", "MongoServerError", "MongoServerSelectionError", "AbortError", "OperationBudgetExpired", "TypeError", "Error"]);
const counter = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Read-only diagnostics, not an admission grant or an atomic quiescence proof.
 * Apply must repeat this inspection under ownership with admission closed.
 */
export async function inspectRecoveryWork(context: MongoDatabaseContext, input: RecoveryInspectionOptions): Promise<RecoveryInspection> {
  const options = optionsSchema.parse(input);
  if (new Set(options.validatedTargets.map((target) => target.operationId)).size !== options.validatedTargets.length) {
    throw new Error("Recovery targets must have distinct operation IDs.");
  }
  const { page, limit } = options;
  const result: RecoveryInspection = { schemaVersion: "1", environment: "_staging", inspectedAtMs: options.nowMs ?? Date.now(), outcome: "clear", admission: null, blockers: [] };
  let stage = "admission";
  const add = (code: RecoveryBlockerCode, count: number, ids: unknown[] = []) => {
    if (count > 0) result.blockers.push({ code, count, ids: ids.map(safeId), page, limit, hasMore: (page + 1) * limit < count });
  };
  try {
    const control = await context.collections.deployment_control.findOne({ environment: "_staging" }, {
      projection: { maintenance: 1, draining: 1, activeMutations: 1, interruptedMutations: 1, mutationOwners: 1, updatedAtMs: 1 },
    });
    if (!control) add("admission_missing", 1);
    else if (typeof control.maintenance !== "boolean" || (control.draining !== undefined && typeof control.draining !== "boolean")
      || !counter(control.activeMutations) || !counter(control.interruptedMutations ?? 0) || !counter(control.updatedAtMs)
      || (control.mutationOwners !== undefined && !Array.isArray(control.mutationOwners))) add("admission_invalid", 1);
    else {
      const owners = control.mutationOwners ?? [];
      result.admission = { maintenance: control.maintenance, draining: control.draining ?? false,
        activeMutations: control.activeMutations, interruptedMutations: control.interruptedMutations ?? 0,
        mutationOwnerCount: owners.length, updatedAtMs: control.updatedAtMs };
      add("active_mutations", control.activeMutations);
      add("interrupted_mutations", control.interruptedMutations ?? 0);
      add("mutation_owners", owners.length, owners.slice(page * limit, (page + 1) * limit).map((owner) => owner?.id));
    }
    const inspect = async (code: RecoveryBlockerCode, collection: Collection<RecoveryRow>, filter: Filter<RecoveryRow>) => {
      stage = code;
      const count = await collection.countDocuments(filter);
      const projection = code === "operations" ? { _id: 1, runId: 1, state: 1, role: 1, taskId: 1,
        "authorizationClaim.expiresAtMs": 1, "resultFinalizationClaim.expiresAtMs": 1, "imageCompletionClaim.expiresAtMs": 1,
        resultJson: { $type: "$resultJson" }, materializationJson: { $type: "$materializationJson" },
        m4CompletionRecovery: { $type: "$m4CompletionRecovery" } } : { _id: 1 };
      const rows = count > 0 ? await collection.find(filter, { projection }).sort({ _id: 1 }).skip(page * limit).limit(limit).toArray() : [];
      add(code, count, rows.map((row) => row._id));
      if (code === "operations" && count > 0) {
        const present = (value: unknown) => typeof value === "string" && value !== "missing" && value !== "null";
        result.blockers.at(-1)!.operations = rows.map(row => ({ id: safeId(row._id), runId: safeId(row.runId),
          state: ["prepared", "started", "unknown", "succeeded", "failed"].includes(String(row.state)) ? String(row.state) : "unavailable",
          role: ["manager", "specialist", "tester", "judge", "image"].includes(String(row.role)) ? String(row.role) : "unavailable",
          taskId: safeId(row.taskId),
          claims: ["authorizationClaim", "resultFinalizationClaim", "imageCompletionClaim"].flatMap(kind => {
            const claim = row[kind];
            if (!claim || typeof claim !== "object") return [];
            const expires = (claim as { expiresAtMs?: unknown }).expiresAtMs;
            return [{ kind, expired: counter(expires) ? expires <= result.inspectedAtMs : null }];
          }), hasResult: present(row.resultJson), hasMaterialization: present(row.materializationJson), hasRecovery: present(row.m4CompletionRecovery) }));
      }
    };
    const collections = context.collections;
    for (const name of ["generation_jobs", "generation_items", "execution_items", "model_calls"] as const) {
      await inspect(name, collections[name] as unknown as Collection<RecoveryRow>, { status: "running" });
    }
    await inspect("card_responses", collections.card_responses as unknown as Collection<RecoveryRow>, { followupStatus: "running" });
    const runs = collections.experiment_runs as unknown as Collection<RecoveryRow>;
    await inspect("runnable_runs", runs, { status: { $in: ["queued", "running"] }, pauseRequested: { $ne: true } });
    // Explicit existence prevents absent historical preparation fields from matching.
    await inspect("preparations", runs, { preparation: { $exists: true, $ne: null }, $or: [
      { "preparation.outcome": { $ne: "failed" } }, { "preparation.unresolved": true },
    ] });
    const runExclusions = options.validatedTargets.map(({ runId, operationId }) => ({ _id: runId, activeOperationId: operationId }));
    await inspect("unresolved_runs", runs, { ...(runExclusions.length ? { $nor: runExclusions } : {}), $or: [
      { activeOperationId: { $exists: true, $ne: null } }, { safeFailure: "unknown_outcome" },
    ] });
    const operationExclusions = options.validatedTargets.map(({ runId, operationId }) => ({ _id: operationId, runId }));
    await inspect("operations", collections.experiment_operations as unknown as Collection<RecoveryRow>, {
      ...(operationExclusions.length ? { $nor: operationExclusions } : {}), $or: [
        { state: { $in: ["prepared", "started", "unknown"] } }, { "lifecycle.unresolved": true },
        { state: "succeeded", dispatchStartedAtMs: { $exists: true, $ne: null }, verifiedWorkflowId: null },
        // Expiration alone is not evidence that a claim's write did not commit.
        ...["authorizationClaim", "resultFinalizationClaim", "imageCompletionClaim"].map((key) => ({ [key]: { $exists: true, $ne: null } })),
      ],
    });
    result.outcome = result.blockers.length ? "blocked" : "clear";
  } catch (error) {
    const name = error instanceof Error ? error.name : "Other";
    result.outcome = "inspection_error";
    result.inspectionError = { stage, errorKind: errorKinds.has(name) ? name : "Other" };
  }
  return result;
}
