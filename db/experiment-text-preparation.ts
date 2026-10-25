import type { ClientSession } from "mongodb";
import { z } from "zod";
import { withMongoTransaction, type Database } from "@/db/client";
import type { ExperimentOperationDocument } from "@/db/documents";
import type { M4Authority } from "@/db/experiment-campaign";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentTaskSchema, type SpecialistTask } from "@/lib/contracts/experiment-runner";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { m4GrantSchema, m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { M4ReportSizeError, prepareM4Request, projectM4Context, m4RequestBundleMatches, m4RequestDefinition, m4CanonicalJson,
  type M4AllowedValues, type M4RequestSelector } from "@/lib/experiment-runner/m4-request";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import type { AssetStore } from "@/lib/assets/asset-store";
import { m4OperationFingerprint, m4SourceFingerprint } from "@/db/experiment-text-sources";
import { measurePhase, countVerificationQuery, countVerificationRead } from "@/lib/experiment-runner/diagnostics";

const identity = z.strictObject({ runId: opaqueIdSchema, operationId: opaqueIdSchema, nowMs: z.number().int().nonnegative() });
function conflict(message: string): never { throw new ExperimentRepositoryError("conflict", message); }

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
const rows = (value: unknown): ObjectValue[] => Array.isArray(value) ? value.map(object) : [];

// Private server-owned context is the only source of these choices. A caller's
// self-calculated digest or list of identities never supplies authorization.
export function m4AllowedContextValues(selector: M4RequestSelector, contextRaw: unknown): M4AllowedValues {
  const context = object(contextRaw);
  const sets = new Map<string, Set<string>>();
  const put = (name: string, values: unknown[]) => {
    const set = sets.get(name) ?? new Set<string>();
    for (const value of values) if (typeof value === "string") set.add(value);
    sets.set(name, set);
  };
  for (const name of ["subjectId", "versionIds", "questionId", "artifactVersionId", "delegationId",
    "charactersPresent", "characterId", "characterIds", "speakerId", "speakerEntityId", "locationId", "locationIds", "unitIds", "manuscriptUnitIds", "assetId",
    "runId", "artifactId", "versionId", "pageId"]) put(name, []);
  function collect(value: unknown) {
    if (Array.isArray(value)) { for (const item of value) collect(item); return; }
    for (const [key, item] of Object.entries(object(value))) {
      const list = Array.isArray(item) ? item : [item];
      if (key === "characterId") for (const name of ["characterId", "characterIds", "charactersPresent", "speakerId", "speakerEntityId", "subjectId"]) put(name, list);
      if (key === "locationId") for (const name of ["locationId", "locationIds", "subjectId"]) put(name, list);
      if (key === "unitId") for (const name of ["unitIds", "manuscriptUnitIds"]) put(name, list);
      if (["assetId", "pageId", "artifactVersionId"].includes(key)) put(key, list);
      if (item && typeof item === "object") collect(item);
    }
  }
  const sources = rows(context.approvedSources);
  for (const source of sources) collect(source.content);
  if (selector.role === "specialist") {
    put("taskId", [selector.taskId]); put("subjectKind", ["character", "location"]);
  }
  const artifacts = rows(context.currentArtifacts ?? object(context.run).currentArtifacts);
  for (const artifact of artifacts) {
    put("artifactId", [artifact.id]); put("versionId", [artifact.currentVersionId]);
    if (artifact.subjectKind === "page") put("pageId", [artifact.subjectId]);
  }
  put("runId", [object(context.reportEvidence).runId]);
  if (selector.role === "manager") {
    const target = object(context.eligibleTarget);
    put("taskId", experimentTaskSchema.safeParse(context.eligibleRoute).success ? [context.eligibleRoute] : []);
    put("subjectId", [target.subjectId ?? object(context.run).bookletId]);
    put("subjectKind", [target.subjectKind ?? "book"]);
  } else if (selector.role === "tester" && !selector.report) {
    const pending = object(context.pendingDecision); const grant = object(context.activeDelegation);
    put("subjectId", [context.bookletId]); put("subjectKind", ["book"]);
    put("taskId", Array.isArray(context.eligibleTaskIds) ? context.eligibleTaskIds : []);
    put("taskIds", Array.isArray(context.eligibleTaskIds) ? context.eligibleTaskIds : []);
    put("questionId", [pending.questionId]); put("delegationId", [grant.id]);
    const current = artifacts.filter((a) => a.currentVersionId);
    put("versionIds", current.filter((a) => a.state !== "approved").map((a) => a.currentVersionId));
    put("artifactVersionId", current.map((a) => a.currentVersionId));
    put("action", pending.kind === "question" ? ["answer"] : ["approve", "revise",
      ...(selector.persona !== "professional_creator" && !grant.id ? ["delegate"] : []), ...(grant.id ? ["revoke_delegation"] : [])]);
  }
  if (selector.role === "specialist" && (selector.taskId === "J11" || selector.taskId === "J12")) {
    // Page routing may use only sheet assets/versions, not style sample images.
    sets.set("artifactVersionId", new Set()); sets.set("assetId", new Set());
    for (const source of sources) {
      if (source.taskId === "J09" || source.taskId === "J10") {
        put("artifactVersionId", [source.id]); put("assetId", [object(object(source.content).build).assetId]);
      }
      if (source.taskId === "J11") {
        for (const page of rows(object(source.content).pages)) for (const panel of rows(page.panels)) {
          for (const reference of rows(panel.sheetReferences)) {
            put("artifactVersionId", [reference.artifactVersionId]); put("assetId", [reference.assetId]);
          }
        }
      }
    }
  }
  return Object.fromEntries([...sets].map(([key, value]) => [key, [...value].sort()]));
}

export function createM4TextPreparation(database: Database, authority: M4Authority, options: { store?: () => AssetStore; elapsedNow?: () => number } = {}) {
  const snapshot = m4PolicySnapshot(authority.policy); const grant = m4GrantSchema.parse(authority.grant);
  const contexts = createExperimentContextService(database, options);
  const elapsedNow = options.elapsedNow ?? (() => performance.now());
  async function prepare(raw: unknown): Promise<NonNullable<ExperimentOperationDocument["m4Preparation"]>> {
    if (!m4RequestBundleMatches(snapshot.policy, grant)) conflict("M4 request definitions or amendment are not current.");
    const input = identity.parse(raw); const started = elapsedNow();
    const now = () => input.nowMs + Math.floor(elapsedNow() - started);
    const load = async (session: ClientSession) => {
      const run = await database.collections.experiment_runs.findOne({ _id: input.runId }, { session });
      const operation = await database.collections.experiment_operations.findOne({ _id: input.operationId, runId: input.runId }, { session });
      if (!run || !operation || run.mode !== "balanced" || operation.mode !== run.mode || operation.providerKind !== "text" ||
          operation.role === "image" || run.activeOperationId !== operation._id || operation.state !== "prepared" || operation.reservationCount !== 0 ||
          run.pauseRequested || operation.lifecycle?.stop != null || !["queued", "running"].includes(run.status) || operation.deadlineAtMs == null || operation.deadlineAtMs <= now() ||
          run.m4?.campaignId !== grant.campaignId || run.m4.policyHash !== snapshot.hash || run.m4.policyJson !== snapshot.json) conflict("M4 preparation is not current or admitted for this protected policy.");
      return { run, operation, sourceFingerprint: await m4SourceFingerprint(database, session, run) };
    };
    const before = await measurePhase(input, "preparation_initial_snapshot", () => withMongoTransaction(database, load));
    const selector: M4RequestSelector = { role: before.operation.role as M4RequestSelector["role"], taskId: before.operation.taskId as SpecialistTask | null,
      persona: before.run.persona, report: (before.operation.role === "tester" || before.operation.role === "judge") && before.run.generationCompletedAtMs != null };
    if (before.operation.localReportFailure) {
      // A retained local rejection is terminal even after a lost acknowledgement.
      // The completion verifier checks its current sources before acceptance.
      const saved = before.operation.localReportFailure;
      throw new M4ReportSizeError(saved.requestBytes, saved.byteLimit, saved.definitionHash, saved.requestDigest, saved.scope);
    }
    if (before.operation.m4Preparation) {
      const saved = before.operation.m4Preparation;
      if (saved.policyHash !== snapshot.hash || saved.sourceFingerprint !== before.sourceFingerprint ||
          saved.definitionHash !== m4RequestDefinition(selector).hash ||
          m4CanonicalJson(saved.definitionUpdate ?? null) !== m4CanonicalJson(grant.requestDefinitionUpdate ?? null) ||
          m4CanonicalJson(saved.adapterUpdate ?? null) !== m4CanonicalJson(grant.providerAdapterUpdate ?? null) ||
          saved.operationFingerprint !== m4OperationFingerprint(before.operation)) conflict("Saved M4 preparation became stale; do not replay it.");
      return saved;
    }
    if (before.operation.dispatchStartedAtMs != null) conflict("M4 preparation must precede dispatch.");
    const rawContext = await measurePhase(input, "preparation_current_role_evidence", () => contexts.getPreparationContext({ ...input, nowMs: now() }));
    const { context, contextJson } = await measurePhase(input, "preparation_context_projection", async () => {
      const context = projectM4Context(selector, { ...rawContext,
        revisionCounts: { text: before.run.textRevisions, image: before.run.imageRevisions } }, input.operationId);
      return { context, contextJson: JSON.stringify(context) };
    });
    let request: ReturnType<typeof prepareM4Request>;
    try {
      request = await measurePhase(input, "preparation_request_construction", async () =>
        prepareM4Request(snapshot.policy, selector, contextJson, m4AllowedContextValues(selector, context), grant));
    } catch (error) {
      if (!(error instanceof M4ReportSizeError) || !selector.report) throw error;
      await withMongoTransaction(database, async (session) => {
        const current = await load(session);
        const op = current.operation;
        if (current.sourceFingerprint !== before.sourceFingerprint || m4OperationFingerprint(op) !== m4OperationFingerprint(before.operation) ||
            op.dispatchStartedAtMs != null || op.workflowRunId || op.parentWorkflowRunId || op.verifiedWorkflowId || op.workflowTaskId || op.remoteStatus ||
            op.m4Preparation || op.m4Reservation || op.m4Observation || op.authorizationClaim || op.resultFinalizationClaim || op.imageCompletionClaim ||
            op.resultJson || op.resultDigest || op.materializationJson || current.run.generationCompletedAtMs == null || !current.run.generationVersionIds?.length) {
          conflict("Report sources or ownership changed before local rejection.");
        }
        const proof = { code: "report_request_too_large" as const, scope: error.scope, requestBytes: error.requestBytes, byteLimit: error.byteLimit,
          definitionHash: error.definitionHash, requestDigest: error.requestDigest, policyHash: snapshot.hash,
          configurationHash: current.run.configurationHash, sourceFingerprint: current.sourceFingerprint,
          operationFingerprint: m4OperationFingerprint(op), generationCompletedAtMs: current.run.generationCompletedAtMs,
          generationVersionIds: current.run.generationVersionIds, recordedAtMs: now() };
        if (op.localReportFailure) return;
        const changed = await database.collections.experiment_operations.updateOne({ _id: op._id, state: "prepared", localReportFailure: { $exists: false } },
          { $set: { localReportFailure: proof } }, { session });
        if (changed.modifiedCount !== 1) conflict("Report rejection changed concurrently.");
        const touched = await database.collections.experiment_runs.updateOne({ _id: current.run._id, revision: current.run.revision },
          { $inc: { revision: 1 } }, { session });
        if (touched.modifiedCount !== 1) conflict("Run changed before local rejection was retained.");
      });
      throw error;
    }
    const publication = snapshot.policy.publications.find((p) => p.role === selector.role && p.taskId === selector.taskId &&
      p.persona === (selector.role === "tester" ? selector.persona : null));
    if (!publication) conflict("M4 publication is not in the frozen policy.");
    const manager = selector.role === "specialist" ? await measurePhase(input, "preparation_manager_parent", async () => {
      countVerificationQuery();
      const manager = await database.collections.experiment_operations.findOne({ runId: input.runId, role: "manager", state: "succeeded" },
        { sort: { createdAtMs: -1, _id: -1 }, projection: { _id: 1, workflowRunId: 1, mode: 1, reservationCount: 1, verifiedWorkflowId: 1, resultJson: 1 } });
      countVerificationRead(manager ? [manager] : []); return manager;
    }) : null;
    if (selector.role === "specialist" && !manager?.workflowRunId) conflict("M4 specialist requires its saved manager parent.");
    if (manager) {
      const selected = JSON.parse(manager.resultJson ?? "null") as { kind?: string; payload?: { taskId?: string; subjectId?: string; subjectKind?: string } } | null;
      const expectedManager = snapshot.policy.publications.find((p) => p.role === "manager");
      if (manager.mode !== "balanced" || manager.reservationCount !== 1 || manager.verifiedWorkflowId !== expectedManager?.publishedWorkflowId ||
          selected?.kind !== "delegate" || selected.payload?.taskId !== before.operation.taskId ||
          selected.payload?.subjectKind !== before.operation.subjectKind || selected.payload?.subjectId !== before.operation.subjectId) {
        conflict("M4 specialist differs from the latest verified manager selection.");
      }
    }
    const saved = { policyHash: snapshot.hash, configurationHash: before.run.configurationHash, definitionHash: request.definitionHash,
      ...(grant.providerAdapterUpdate ? { adapterUpdate: grant.providerAdapterUpdate } : {}),
      ...(grant.requestDefinitionUpdate ? { definitionUpdate: grant.requestDefinitionUpdate } : {}),
      requestDigest: request.requestDigest, requestJson: request.requestJson, contextJson, systemPrompt: request.systemPrompt,
      modelParametersJson: JSON.stringify(request.modelParameters), sourceFingerprint: before.sourceFingerprint,
      operationFingerprint: m4OperationFingerprint(before.operation),
      publishedWorkflowId: publication.publishedWorkflowId, parentWorkflowRunId: manager?.workflowRunId ?? null, preparedAtMs: now() };
    return measurePhase(input, "preparation_attachment_transaction", () => withMongoTransaction(database, async (session) => {
      const current = await measurePhase(input, "preparation_final_source_recheck", () => load(session));
      if (current.sourceFingerprint !== before.sourceFingerprint || current.operation.dispatchStartedAtMs != null) conflict("M4 sources changed during preparation.");
      if (current.operation.localReportFailure) conflict("A retained local report rejection forbids preparation replay.");
      if (current.operation.m4Preparation) {
        if (current.operation.m4Preparation.requestDigest !== saved.requestDigest) conflict("M4 preparation identity conflicts.");
        return current.operation.m4Preparation;
      }
      const changed = await database.collections.experiment_operations.updateOne({ _id: input.operationId, m4Preparation: { $exists: false }, state: "prepared" },
        { $set: { m4Preparation: saved } }, { session });
      if (changed.modifiedCount !== 1) conflict("M4 preparation was attached concurrently.");
      const touched = await database.collections.experiment_runs.updateOne({ _id: input.runId, revision: current.run.revision, pauseRequested: false },
        { $inc: { revision: 1 } }, { session });
      if (touched.modifiedCount !== 1) conflict("Run changed before preparation was retained.");
      return saved;
    }));
  }
  return { prepare };
}
