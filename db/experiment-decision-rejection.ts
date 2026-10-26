import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import type { M4Authority } from "@/db/experiment-campaign";
import { CASES } from "@/lib/contracts/experiment-runner";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";
import { m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { m4CanonicalJson, m4Hash, m4SavedTesterDefinition } from "@/lib/experiment-runner/m4-request";
import { m4ObservedRoleResult } from "@/lib/experiment-runner/m4-observed-result";
import { m4OperationFingerprint } from "@/db/experiment-text-sources";

type Rejection = NonNullable<ExperimentOperationDocument["m4DecisionRejection"]>;
type Facts = Omit<Rejection, "proofDigest" | "reference" | "recordedAtMs">;

// A successful provider response can be valid JSON but request an unavailable
// action. Prove only this fixed semantic failure; never catch arbitrary source,
// storage or materialization errors and call them harmless decisions.
export function m4DecisionRejectionFacts(authority: M4Authority, run: ExperimentRunDocument,
  op: ExperimentOperationDocument): Facts | null {
  try {
    const snapshot = m4PolicySnapshot(authority.policy);
    const prep = op.m4Preparation;
    if (run.mode !== "balanced" || run.m4?.campaignId !== authority.grant.campaignId ||
        run.m4.policyHash !== snapshot.hash || run.m4.policyJson !== snapshot.json || op.runId !== run._id ||
        op.role !== "tester" || op.taskId !== null || op.subjectKind !== "book" || op.subjectId !== run.bookletId ||
        !prep || prep.operationFingerprint !== m4OperationFingerprint(op) || op.dispatchStartedAtMs == null ||
        op.reservationCount !== 1 || op.m4Observation?.issue !== null || op.lifecycle?.stop ||
        op.remoteStatus != null && op.remoteStatus !== "succeeded") return null;
    const expected = snapshot.policy.publications.filter(p => p.role === "tester" && p.persona === run.persona && p.taskId === null);
    const saved = savedConfigurationSchema.parse(JSON.parse(run.configurationJson)).filter(p => p.role === "tester" && p.taskId === null);
    if (expected.length !== 1 || saved.length !== 1 || saved[0].appId !== expected[0].appId ||
        saved[0].publishedWorkflowId !== expected[0].publishedWorkflowId || saved[0].toolProviderId !== expected[0].toolProviderId ||
        prep.publishedWorkflowId !== expected[0].publishedWorkflowId) return null;
    const definition = m4SavedTesterDefinition({ role: "tester", taskId: null, persona: run.persona, report: false }, prep.definitionHash);
    if (!definition || definition.systemPrompt !== prep.systemPrompt) return null;
    const request = JSON.parse(prep.requestJson) as { input?: { role: string; content: string }[] };
    const users = request.input?.filter(row => row.role === "user");
    if (users?.length !== 1 || users[0].content !== prep.contextJson) return null;
    const context = JSON.parse(prep.contextJson) as { role?: string; pendingDecision?: unknown;
      revisionCounts?: { text: number; image: number }; currentArtifacts?: {
        taskId: string; currentVersionId: string; state: string; subjectKind: string; subjectId: string }[] };
    if (context.role !== "tester" || context.pendingDecision != null || !context.revisionCounts || !Array.isArray(context.currentArtifacts)) return null;
    const limits = CASES[run.persona];
    if (![context.revisionCounts.text, context.revisionCounts.image].every(n => Number.isSafeInteger(n) && n >= 0) ||
        context.revisionCounts.text > limits.textRevisionLimit || context.revisionCounts.image > limits.imageRevisionLimit) return null;
    // Historical accounting verifies the original pre-generation role after a
    // later successful generation. The saved context and decision still pin it.
    const result = m4ObservedRoleResult({ ...run, generationCompletedAtMs: undefined }, op);
    if (result.kind !== "decision" || result.payload.decision.action !== "revise") return null;
    const decision = result.payload.decision;
    const count = decision.taskId === "J13" ? context.revisionCounts.image : context.revisionCounts.text;
    const limit = decision.taskId === "J13" ? limits.imageRevisionLimit : limits.textRevisionLimit;
    const currentCount = decision.taskId === "J13" ? run.imageRevisions : run.textRevisions;
    const targets = context.currentArtifacts.filter(a => a.taskId === decision.taskId &&
      a.currentVersionId === decision.artifactVersionId && ["draft", "approved"].includes(a.state));
    if (count !== limit || currentCount !== limit || targets.length !== 1 || !targets[0].subjectId ||
        !["book", "character", "location", "page"].includes(targets[0].subjectKind)) return null;
    return { kind: "revision_allowance_exhausted_v1", runId: run._id, operationId: op._id,
      policyHash: snapshot.hash, configurationHash: run.configurationHash, taskId: decision.taskId, artifactVersionId: decision.artifactVersionId,
      subjectKind: targets[0].subjectKind as Facts["subjectKind"], subjectId: targets[0].subjectId, revisionCount: count, revisionLimit: limit,
      requestDigest: prep.requestDigest, evidenceDigest: op.m4Observation!.evidenceDigest!, resultDigest: m4Hash(m4CanonicalJson(result)) };
  } catch { return null; }
}

export async function verifyM4DecisionRejection(database: Database, session: ClientSession, authority: M4Authority,
  run: ExperimentRunDocument, op: ExperimentOperationDocument): Promise<boolean> {
  const saved = op.m4DecisionRejection, facts = m4DecisionRejectionFacts(authority, run, op);
  if (!saved || !facts || !saved.reference || !Number.isSafeInteger(saved.recordedAtMs) || saved.recordedAtMs < 0 ||
      saved.proofDigest !== m4Hash(m4CanonicalJson(facts)) ||
      m4CanonicalJson({ ...facts, proofDigest: saved.proofDigest, reference: saved.reference, recordedAtMs: saved.recordedAtMs }) !== m4CanonicalJson(saved) ||
      op.resultJson !== null || op.resultDigest !== null || op.materializationJson !== null || op.imageCompletionDigest != null ||
      op.authorizationClaim || op.resultFinalizationClaim || op.imageCompletionClaim || op.lifecycle?.unresolved === true) return false;
  // Global owner queries must not hide output filed under another run/booklet.
  if (await database.collections.artifact_versions.findOne({ sourceOperationId: op._id }, { session, projection: { _id: 1 } }) ||
      await database.collections.messages.findOne({ $or: [{ _id: op._id }, { operationId: op._id }] }, { session, projection: { _id: 1 } }) ||
      await database.collections.approvals.findOne({ testerDecisionId: op._id }, { session, projection: { _id: 1 } }) ||
      await database.collections.experiment_delegations.findOne({ testerDecisionId: op._id }, { session, projection: { _id: 1 } }) ||
      await database.collections.assets.findOne({ _id: op._id }, { session, projection: { _id: 1 } })) return false;
  return true;
}

// Called only inside exact Resume's transaction. No observation, reservation or
// creative bytes change; closure and continuation roll back together on failure.
export async function closeM4DecisionRejection(database: Database, session: ClientSession, authority: M4Authority,
  run: ExperimentRunDocument, op: ExperimentOperationDocument, nowMs: number): Promise<ExperimentRunDocument | null> {
  const permission = authority.grant.continuations?.find(p => p.runId === run._id && p.operationId === op._id);
  const facts = m4DecisionRejectionFacts(authority, run, op);
  if (!permission || !facts || permission.decisionRejection !== facts.kind || run.status !== "blocked" || run.safeFailure !== "definite_failure" ||
      run.activeOperationId !== op._id || run.preparation || run.generationCompletedAtMs != null ||
      op.state !== "started" || !op.lifecycle || !["running", "reconciling"].includes(op.lifecycle.phase) ||
      op.lifecycle.attemptOutcome != null || op.m4DecisionRejection || op.m4Continuation) return null;
  const rejection: Rejection = { ...facts, proofDigest: m4Hash(m4CanonicalJson(facts)),
    reference: permission.reference, recordedAtMs: nowMs };
  if (!await verifyM4DecisionRejection(database, session, authority, run, { ...op, m4DecisionRejection: rejection })) return null;
  const target = await database.collections.artifacts.findOne({ experimentRunId: run._id, bookletId: run.bookletId,
    taskId: facts.taskId, subjectKind: facts.subjectKind, subjectId: facts.subjectId, currentVersionId: facts.artifactVersionId,
    state: { $in: ["draft", "approved"] } }, { session, projection: { _id: 1 } });
  if (!target) return null;
  const changed = await database.collections.experiment_operations.updateOne({ _id: op._id, state: "started",
    "m4Observation.wrapperDigest": op.m4Observation!.wrapperDigest }, { $set: {
    m4DecisionRejection: rejection, state: "failed", safeFailure: "definite_failure", updatedAtMs: nowMs,
    lifecycle: { ...op.lifecycle, phase: "finished", attemptOutcome: "failed", unresolved: false, endedAtMs: nowMs, lastProgressAtMs: nowMs },
  } }, { session });
  if (changed.modifiedCount !== 1) throw new Error("Decision rejection changed concurrently.");
  const updated = await database.collections.experiment_runs.findOneAndUpdate({ _id: run._id, revision: run.revision,
    activeOperationId: op._id }, { $set: { activeOperationId: null, updatedAtMs: nowMs }, $inc: { revision: 1 } },
  { session, returnDocument: "after" });
  if (!updated) throw new Error("Decision rejection run changed concurrently.");
  return updated;
}
