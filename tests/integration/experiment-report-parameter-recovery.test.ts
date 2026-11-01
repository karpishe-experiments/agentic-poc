import { afterEach, describe, expect, it, vi } from "vitest";
import { withMongoTransaction, type Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExecutionAllowanceLedger } from "@/db/experiment-execution-allowance";
import { m4OperationFingerprint } from "@/db/experiment-text-sources";
import { createExecutionTextFailureRecovery } from "@/lib/operations/execution-text-recovery";
import { retainedReportParameterFailure as target } from "@/lib/operations/retained-report-parameter-failure";
import { realReadinessManifestSchema } from "@/lib/experiment-runner/real-config";
import manifest from "@/tests/fixtures/m5-retained-real-readiness.json";
import { defaultExecutionAllowance, executionPolicySnapshot, realExecutionPolicyFromM4TechnicalProfile } from "@/lib/experiment-runner/execution-policy";
import { m4AuthorizedCarrier, m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import { realReportCarrier } from "@/lib/experiment-runner/real-report-carrier";
import { createWorkflowRuntime, type WorkflowRuntime } from "@/lib/experiment-runner/transport";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { specialistTaskSchema } from "@/lib/contracts/experiment-runner";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const databases: Database[] = [];
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.splice(0).map(closeTestDatabase)); });

// Seed the retained failure boundary, not a pretend accepted generation. The
// separate Real journey suite exercises original generation and report assembly.
async function setup() {
  const ready = realReadinessManifestSchema.parse(manifest);
  if (ready.state !== "ready") throw Error("Retained profile absent");
  const profile = realExecutionPolicyFromM4TechnicalProfile(ready.sourcePolicy, ready.tokenPolicy, ready.publications, ready);
  expect(executionPolicySnapshot(profile).hash).toBe(target.profileHash);
  const db = await createTestDatabase({ seedAgents: false }); databases.push(db);
  const ledger = createExecutionAllowanceLedger(db), repository = createExperimentRepository(db, { realExecutionEnabled: true });
  await withMongoTransaction(db, session => ledger.create(session, { campaignId: id(1), mode: "real", persona: "playful_kid",
    profile, approvalId: id(2), reference: "fake-provider-fixture", totals: defaultExecutionAllowance("playful_kid", 5_000_000), nowMs: 1 }));
  await repository.createRun({ runId: target.runId, bookletId: id(3), persona: "playful_kid", mode: "real", executionCampaignId: id(1), nowMs: 2,
    configuration: profile.publications.filter(row => row.persona === null || row.persona === "playful_kid")
      .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({ role, taskId, appId, publishedWorkflowId,
        toolProviderId, ...(finalPageIllustration ? { finalPageIllustration } : {}) })) });
  await db.collections.experiment_runs.updateOne({ _id: target.runId }, { $set: { generationCompletedAtMs: 3, generationVersionIds: [id(4)] } });
  let run = (await repository.getRun(target.runId))!;
  const op = await repository.prepareOperation({ runId: target.runId, operationId: target.operationId, expectedRevision: run.revision,
    role: "tester", taskId: null, subjectKind: "book", subjectId: run.bookletId, inputFingerprint: "a".repeat(64), attempt: 1, providerKind: "text", nowMs: 4 });
  const requestJson = m4CanonicalJson({ model: "gpt-6-luna", input: [{ type: "message", role: "system", content: "fixture" },
    { type: "message", role: "user", content: "report fixture" }], max_output_tokens: 8192, reasoning: { effort: "none", mode: "standard" },
    text: { format: { type: "json_schema", name: "fixture", strict: true, schema: { type: "object", properties: {}, additionalProperties: false } } },
    service_tier: "default", store: false, truncation: "disabled", include: ["reasoning.encrypted_content"] });
  const bytes = Buffer.from("fake original bytes");
  const report = realReportCarrier({ textRequestJson: m4AuthorizedCarrier(requestJson, profile.tokenPolicy).requestJson,
    deadlineAtMs: op.deadlineAtMs! - 30_000, images: Array.from({ length: 4 }, (_, i) => ({ bytes, manifest: {
      assetId: id(10 + i), versionId: id(20 + i), sha256: m4Hash(bytes.toString()), byteLength: bytes.length,
      mimeType: "image/png" as const, width: 1024, height: 1024 } })) });
  const prep = { policyHash: target.profileHash, configurationHash: run.configurationHash, definitionHash: "b".repeat(64),
    requestDigest: m4Hash(requestJson), requestJson, tokenPolicy: profile.tokenPolicy, contextJson: "{}", systemPrompt: "fixture",
    modelParametersJson: "{}", sourceFingerprint: "c".repeat(64), operationFingerprint: m4OperationFingerprint(op),
    publishedWorkflowId: target.publishedWorkflowId, parentWorkflowRunId: null, preparedAtMs: 5 };
  await db.collections.experiment_operations.updateOne({ _id: op._id }, { $set: { m4Preparation: prep,
    realReportPreparation: { carrierJson: report.carrierJson, manifestDigest: report.carrier.manifestDigest,
      finalRequestDigest: report.carrier.finalRequestDigest, textRequestDigest: report.carrier.textRequestDigest,
      orderedImages: report.carrier.orderedImages, uploadFileIds: [id(30), id(31), id(32), id(33)], preparedAtMs: 5 } } });
  run = (await repository.getRun(target.runId))!;
  await withMongoTransaction(db, session => ledger.reserveText(session, run, op, prep.requestDigest, 6));
  const now = op.deadlineAtMs! + 1;
  await db.collections.experiment_operations.updateOne({ _id: op._id }, { $set: { state: "unknown", reservationCount: 1,
    dispatchStartedAtMs: 7, workflowRunId: target.workflowRunId, verifiedWorkflowId: target.publishedWorkflowId,
    remoteStatus: "running", m4Observation: { workflowRunId: target.workflowRunId, publishedWorkflowId: target.publishedWorkflowId,
      wrapperDigest: null, content: null, evidenceJson: null, evidenceDigest: null, remoteStatus: "failed", observedAtMs: 8, issue: "missing_wrapper" },
    lifecycle: { ...op.lifecycle!, phase: "finished", unresolved: true, attemptOutcome: "failed", endedAtMs: now,
      timeoutAtMs: now, stop: { requestedAtMs: now, reason: "deadline", delivery: "acknowledged" } } } });
  await db.collections.experiment_runs.updateOne({ _id: run._id }, { $set: { status: "blocked", safeFailure: "unknown_outcome",
    counters: { logicalText: 1, payableText: 1, logicalImage: 0, payableImage: 0, steps: 1 } } });
  await db.collections.deployment_control.insertOne({ _id: "control", schemaVersion: "1", environment: "_staging", maintenance: false,
    draining: false, activeMutations: 0, interruptedMutations: 0, mutationOwners: [], reason: null, updatedAtMs: now });
  const bindings = profile.publications.map(row => ({ ...row, taskId: specialistTaskSchema.nullable().parse(row.taskId), apiKey: "fake-key" }));
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid", callbackKey: "fake",
    bindings, real: { ...ready, bindings } };
  let remote: { id: string; workflow_id: string; status: string; outputs: Record<string, unknown>;
    error: string; total_tokens: number; total_steps: number } = { id: target.workflowRunId, workflow_id: target.publishedWorkflowId, status: "failed", outputs: {},
    error: target.error, total_tokens: 0, total_steps: 8 };
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    expect(init?.method ?? "GET").toBe("GET"); return new Response(JSON.stringify(remote));
  });
  const runtime: WorkflowRuntime = { ...createWorkflowRuntime(config, fetcher), start: vi.fn(async () => { throw Error("No provider POST"); }) };
  const recoveryTarget = { runId: target.runId, operationId: target.operationId, expectedRevision: (await repository.getRun(run._id))!.revision };
  return { db, repository, runtime, config, target: recoveryTarget, now,
    remote: (change: Partial<typeof remote>) => { remote = { ...remote, ...change }; },
    closeAdmission: () => db.collections.deployment_control.updateOne({ _id: "control" }, { $set: { maintenance: true } }),
    service: createExecutionTextFailureRecovery({ database: db, config, runtime, now: Date.now }) };
}

describe("Exact retained pre-provider report closure", () => {
  it("closes once, preserves original evidence and full liability, and reconciles lost acknowledgement", async () => {
    const env = await setup(), proof = await env.service.preview(env.target);
    expect(proof.snapshot.scope).toBe("report-parameter-failure-target-v1");
    const before = (await env.repository.getOperation(target.operationId))!;
    const campaign = await env.db.collections.experiment_campaigns.findOne({ _id: id(1) });
    await env.closeAdmission();
    expect((await env.service.preview(env.target, true)).previewDigest).toBe(proof.previewDigest);
    await env.service.apply(env.target, proof.previewDigest, async checkpoint => { expect(checkpoint.snapshot).toEqual(proof.snapshot); });
    await env.service.verifyCompleted(env.target, proof.snapshot);
    const closed = (await env.repository.getOperation(target.operationId))!, run = await env.repository.getRun(target.runId);
    expect(closed).toMatchObject({ state: "failed", safeFailure: "definite_failure", m4Reservation: before.m4Reservation,
      m4Observation: before.m4Observation, realReportPreparation: before.realReportPreparation, deadlineAtMs: before.deadlineAtMs,
      lifecycle: { unresolved: false, endedAtMs: before.lifecycle!.endedAtMs, timeoutAtMs: before.lifecycle!.timeoutAtMs, stop: before.lifecycle!.stop } });
    expect(run).toMatchObject({ status: "blocked", pauseRequested: true, activeOperationId: null, generationCompletedAtMs: 3 });
    expect(await env.db.collections.experiment_campaigns.findOne({ _id: id(1) })).toEqual(campaign);
    await env.service.verifyCompleted(env.target, proof.snapshot);
    expect(await env.repository.getOperation(target.operationId)).toEqual(closed);
    expect(await env.repository.getRun(target.runId)).toEqual(run);
    expect(env.runtime.start).not.toHaveBeenCalled();
  });
  it.each(["publication", "package", "error", "steps", "tokens", "output", "claim", "other_attempt", "saved_output"])("rejects %s without mutation", async kind => {
    const env = await setup();
    if (kind === "publication") env.remote({ workflow_id: id(90) });
    if (kind === "package") await env.db.collections.experiment_runs.updateOne({ _id: target.runId }, { $set: { "execution.profileJson": "{}" } });
    if (kind === "error") env.remote({ error: "another failure" });
    if (kind === "steps") env.remote({ total_steps: 9 });
    if (kind === "tokens") env.remote({ total_tokens: 1 });
    if (kind === "output") env.remote({ outputs: { retained: "unexamined" } });
    if (kind === "claim") await env.db.collections.experiment_operations.updateOne({ _id: target.operationId }, { $set: { authorizationClaim: { id: "active", expiresAtMs: env.now + 1000 } } });
    if (kind === "other_attempt") {
      const op = (await env.repository.getOperation(target.operationId))!;
      await env.db.collections.experiment_operations.insertOne({ ...op, _id: id(91), idempotencyKey: "other-attempt", attempt: 2 });
    }
    if (kind === "saved_output") await env.db.collections.experiment_operations.updateOne({ _id: target.operationId }, { $set: { resultJson: "{}" } });
    await expect(env.service.preview(env.target)).rejects.toThrow();
    expect(await env.repository.getRun(target.runId)).toMatchObject({ activeOperationId: target.operationId });
    expect(env.runtime.start).not.toHaveBeenCalled();
  });
  it.each(["revision", "source", "owner"])("rejects %s drift after preview and keeps ownership", async kind => {
    const env = await setup(), proof = await env.service.preview(env.target); await env.closeAdmission();
    const mutate = async () => {
      if (kind === "revision") await env.db.collections.experiment_runs.updateOne({ _id: target.runId }, { $inc: { revision: 1 } });
      if (kind === "source") await env.db.collections.booklets.updateOne({ _id: id(3) }, { $set: { workingTitle: "changed" } });
      if (kind === "owner") await env.db.collections.deployment_control.updateOne({ _id: "control" }, { $set: { activeMutations: 1 } });
    };
    await expect(env.service.apply(env.target, proof.previewDigest, mutate)).rejects.toThrow();
    expect(await env.repository.getOperation(target.operationId)).toMatchObject({ state: "unknown", lifecycle: { unresolved: true } });
    expect(await env.repository.getRun(target.runId)).toMatchObject({ activeOperationId: target.operationId });
  });
});
