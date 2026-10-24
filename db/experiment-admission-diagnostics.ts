import type { Database } from "@/db/client";
import { withMongoTransaction } from "@/db/client";
import type { M4Authority } from "@/db/experiment-campaign";
import { m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { candidateProofMetrics, isUnclaimedPauseFailure, m4FailedProofProjection, readM4AccountingOperations, readM4CandidateProofs } from "@/db/experiment-m4-accounting-evidence";
import { observeMongoRead, withMongoReadPhase } from "@/db/mongo-read-diagnostics";
import { retainAdmissionRead } from "@/lib/experiment-runner/diagnostics";
import type { AdmissionReadDiagnostic, AdmissionReadPart } from "@/lib/contracts/experiment-admission-diagnostics";
import { m4Hash } from "@/lib/experiment-runner/m4-request";
import { verifyExperimentGeneration } from "@/db/experiment-completion";

export type AdmissionDiagnosticPersona = "playful_kid" | "enthusiast_parent";
export type AdmissionDiagnosticPart = AdmissionReadPart;

function summarizePlan(raw: Record<string, unknown>): NonNullable<NonNullable<AdmissionReadDiagnostic["value"]>["plan"]> {
  const stages = new Set<string>();
  // Inspect only the winning plan. Rejected plans do not describe execution.
  const visit = (value: unknown, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 32) return;
    const row = value as Record<string, unknown>;
    if (typeof row.stage === "string" && ["IXSCAN", "IDHACK", "EXPRESS_IXSCAN", "EXPRESS_CLUSTERED_IXSCAN", "CLUSTERED_IXSCAN", "COLLSCAN"].includes(row.stage)) stages.add(row.stage);
    for (const child of Object.values(row)) if (child && typeof child === "object") {
      if (Array.isArray(child)) child.forEach(item => visit(item, depth + 1)); else visit(child, depth + 1);
    }
  };
  visit((raw.queryPlanner as { winningPlan?: unknown } | undefined)?.winningPlan);
  const stats = raw.executionStats as Record<string, unknown> | undefined;
  const number = (key: string): number | null => typeof stats?.[key] === "number" && Number.isFinite(stats[key]) ? stats[key] as number : null;
  return { scan: stages.has("COLLSCAN") ? "collection" : stages.size ? "index" : "unavailable",
    returned: number("nReturned"), documentsExamined: number("totalDocsExamined"), keysExamined: number("totalKeysExamined"), executionMs: number("executionTimeMillis") };
}

export async function diagnoseAdmissionRead(database: Database, authority: M4Authority,
  persona: AdmissionDiagnosticPersona, part: AdmissionDiagnosticPart) {
  const started = performance.now();
  const snapshot = m4PolicySnapshot(authority.policy);
  const campaign = await database.collections.experiment_campaigns.findOne({ _id: authority.grant.campaignId });
  if (!campaign || campaign.policyHash !== snapshot.hash || campaign.policyJson !== snapshot.json ||
      campaign.grantReference !== authority.grant.reference || campaign.state !== "stopped") throw new Error("Diagnostic campaign is unavailable.");
  const runId = campaign.slots[persona];
  if (!runId || campaign.slots.playful_kid !== authority.grant.remainingPersonaAdmission?.anchorRunId) throw new Error("Diagnostic target is unavailable.");
  const observed = await observeMongoRead(async () => {
    // The same snapshot semantics as admission; no campaign activation or writes.
    const selected = await withMongoTransaction(database, async session => {
      const run = await withMongoReadPhase("selection", () => database.collections.experiment_runs.findOne({ _id: runId }, { session }));
      if (!run || run.mode !== "balanced" || run.persona !== persona || run.m4?.campaignId !== campaign._id ||
          run.status !== "completed" || !run.generationCompletedAtMs || run.activeOperationId || run.preparation ||
          run.pendingDecisionJson || run.pauseRequested || run.safeFailure) throw new Error("Diagnostic run is unavailable.");
      const operations = await withMongoReadPhase("selection", () => readM4AccountingOperations(database, session, runId));
      const failedIds = operations.filter(operation => operation.state === "failed" && !isUnclaimedPauseFailure(operation)).map(operation => operation._id);
      if (part === "plan") return { failedIds, rows: null, decodedJsonBytes: null, queryElapsedMs: null };
      const start = performance.now();
      const candidate = candidateProofMetrics();
      if (part === "candidate-audit") {
        const { createAssetStore } = await import("@/lib/assets/create-asset-store");
        await withMongoReadPhase(part, () => verifyExperimentGeneration(database, session, run, createAssetStore(), undefined, "completion", undefined, {
          failedProofReader: (targetRunId, ids) => readM4CandidateProofs(database, session, targetRunId, ids, candidate),
        }));
        return { failedIds, rows: candidate.selectedRows, decodedJsonBytes: candidate.returnedJsonBytes,
          queryElapsedMs: Math.round(performance.now() - start), candidate, auditPassed: true, runRevision: run.revision,
          selectionDigest: m4Hash(JSON.stringify([...failedIds].sort())) };
      }
      const rows = await withMongoReadPhase(part, () => part === "candidate-proofs"
        ? readM4CandidateProofs(database, session, runId, failedIds, candidate)
        : database.collections.experiment_operations.find({ runId, _id: { $in: failedIds } },
          { session, projection: m4FailedProofProjection }).toArray());
      const queryElapsedMs = Math.round(performance.now() - start);
      return { failedIds, rows: rows.length, decodedJsonBytes: part === "candidate-proofs" ? candidate.returnedJsonBytes
        : rows.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row), "utf8"), 0),
        queryElapsedMs, runRevision: run.revision, selectionDigest: m4Hash(JSON.stringify([...failedIds].sort())),
        ...(part === "candidate-proofs" ? { candidate } : {}) };
    });
    if (part !== "plan") return { ...selected, failedIds: undefined, plan: null };
    // MongoDB cannot explain within a transaction. This separate read-only plan
    // is diagnostic evidence only, never an admission proof.
    const plan = await withMongoReadPhase("plan", () => database.collections.experiment_operations.find({ runId, _id: { $in: selected.failedIds } },
      { projection: m4FailedProofProjection }).explain("executionStats"));
    return { rows: null, decodedJsonBytes: null, queryElapsedMs: null, plan: summarizePlan(plan) };
  });
  const result: AdmissionReadDiagnostic = { runId, persona, part, compression: { state: "configured", requested: "zlib", negotiated: "unavailable" },
    ...observed, metricsStatus: observed.metrics.commands.length ? "observed" : "unavailable",
    totalElapsedMs: Math.round(performance.now() - started) };
  retainAdmissionRead(result);
  return result;
}
