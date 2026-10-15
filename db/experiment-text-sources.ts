import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

// Current immutable-version identities and mutable approval/dialogue/selection
// metadata only. Never load full historical content inside the atomic claim.
export async function m4SourceFingerprint(database: Database, session: ClientSession, run: ExperimentRunDocument): Promise<string> {
  const c = database.collections;
  const artifacts = await c.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId },
    { session, projection: { _id: 1, taskId: 1, subjectKind: 1, subjectId: 1, state: 1, currentVersionId: 1 } }).sort({ _id: 1 }).toArray();
  const ids = artifacts.flatMap((a) => a.currentVersionId ? [a.currentVersionId] : []);
  const versions = await c.artifact_versions.find({ _id: { $in: ids } }, { session,
    projection: { _id: 1, artifactId: 1, dependencyVersionIdsJson: 1, sourceVersionId: 1, sourceOperationId: 1, warningsJson: 1 } }).sort({ _id: 1 }).toArray();
  const approvals = await c.approvals.find({ experimentRunId: run._id, bookletId: run.bookletId, artifactVersionId: { $in: ids } },
    { session }).sort({ _id: 1 }).toArray();
  const messages = await c.messages.find({ experimentRunId: run._id, role: "user" },
    { session, projection: { _id: 1, sequence: 1, uiMessageJson: 1 } }).sort({ sequence: 1 }).toArray();
  const delegation = run.activeDelegationId ? await c.experiment_delegations.findOne({ _id: run.activeDelegationId, runId: run._id }, { session }) : null;
  const manager = await c.experiment_operations.findOne({ runId: run._id, role: "manager", state: "succeeded" },
    { session, sort: { createdAtMs: -1, _id: -1 }, projection: { _id: 1, workflowRunId: 1, verifiedWorkflowId: 1, resultDigest: 1 } });
  const questions = await c.experiment_operations.find({ runId: run._id, state: "succeeded", resultJson: { $regex: '^\\{"kind":"(ask|clarification)"' } },
    { session, projection: { _id: 1, role: 1, taskId: 1, subjectId: 1, resultDigest: 1 } }).sort({ _id: 1 }).toArray();
  const batches = await c.generation_jobs.find({ bookletId: run.bookletId, jobType: "dify_pages" },
    { session, projection: { _id: 1, inputJson: 1, status: 1, supersededByJobId: 1 } }).sort({ _id: 1 }).toArray();
  const booklet = await c.booklets.findOne({ _id: run.bookletId, experimentRunId: run._id },
    { session, projection: { _id: 1, workingTitle: 1, lifecycle: 1, currentStage: 1, coverAssetId: 1 } });
  return m4Hash(m4CanonicalJson(plain({ artifacts, versions, approvals, messages, delegation, manager, questions, batches, booklet,
    run: { brief: run.brief, persona: run.persona, mode: run.mode, configurationHash: run.configurationHash,
      counters: run.counters, limits: run.limits, pendingDecisionJson: run.pendingDecisionJson, activeDelegationId: run.activeDelegationId,
      decisionSequence: run.decisionSequence, textRevisions: run.textRevisions, imageRevisions: run.imageRevisions,
      generationCompletedAtMs: run.generationCompletedAtMs ?? null, generationVersionIds: run.generationVersionIds ?? null },
  })));
}

export function m4OperationFingerprint(operation: ExperimentOperationDocument): string {
  return m4Hash(m4CanonicalJson({ id: operation._id, runId: operation.runId, role: operation.role, taskId: operation.taskId,
    subjectKind: operation.subjectKind, subjectId: operation.subjectId, inputFingerprint: operation.inputFingerprint,
    expectedTargetVersionId: operation.expectedTargetVersionId, dependencyVersionIds: operation.dependencyVersionIds,
    deadlineAtMs: operation.deadlineAtMs }));
}
