import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createM4TextPreparation } from "@/db/experiment-text-preparation";
import { createM4ProviderResults } from "@/db/experiment-provider-results";
import { closeM4KnownFailure } from "@/db/experiment-provider-failure";
import { m4RequestBundleHash } from "@/lib/experiment-runner/m4-request";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import type { RuntimeResult, WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { specialistTaskSchema } from "@/lib/contracts/experiment-runner";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
async function setup() {
  const db = await createTestDatabase({ seedAgents: false }); databases.push(db);
  const policy = { ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash(),
    countChargeStatus: "assumed" as const, countChargeCeilingMicrodollars: 900 };
  const authority = { policy, grant: { campaignId: id(1), reference: "fake-provider-only" } };
  const repository = createExperimentRepository(db, { m4Authority: authority, m4ExecutionEnabled: true, elapsedNow: () => 0 });
  const configuration = policy.publications.filter((p) => p.persona === null || p.persona === "playful_kid")
    .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({ role, taskId, appId, publishedWorkflowId, toolProviderId,
      ...(finalPageIllustration ? { finalPageIllustration } : {}) }));
  await repository.createRun({ runId: id(10), bookletId: id(11), persona: "playful_kid", mode: "balanced", campaignId: id(1), nowMs: 1, configuration });
  await repository.prepareOperation({ runId: id(10), operationId: id(12), expectedRevision: 0, role: "manager", taskId: null,
    subjectKind: "book", subjectId: id(11), inputFingerprint: "b".repeat(64), attempt: 1, providerKind: "text", nowMs: 2 });
  const prepared = await createM4TextPreparation(db, authority, { elapsedNow: () => 0 }).prepare({ runId: id(10), operationId: id(12), nowMs: 3 });
  await repository.beginDispatch({ runId: id(10), operationId: id(12), parentWorkflowRunId: null, nowMs: 4 });
  const claim = { runId: id(10), operationId: id(12), workflowRunId: id(13), parentWorkflowRunId: null, nowMs: 5 };
  await repository.recordDispatchIdentity(claim);
  await repository.verifyDispatchPublication({ ...claim, workflowId: policy.publications[0].publishedWorkflowId });
  await repository.claimOperation(claim);
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid", callbackKey: "fixture",
    bindings: policy.publications.map((p) => ({ ...p, taskId: specialistTaskSchema.nullable().parse(p.taskId), apiKey: `fake-key-${p.appId}` })) };
  const wrapper = { schemaVersion: "booklet_provider_v1", content: JSON.stringify({ result: { kind: "delegate",
    payload: { taskId: "J01", subjectKind: "book", subjectId: id(11) } } }), providerEvidence: {
    provider: "openai", apiBaseUrl: "https://api.openai.com/v1",
    stdioSdk: { version: "0.10.2", readerSha256: "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22" },
    responseId: "resp_fake", requestId: "req_fake", model: "gpt-6-luna", serviceTier: "default", status: "completed",
    refused: false, incompleteReason: null as string | null, requestDigest: prepared.requestDigest, countedInputTokens: 100,
    usage: { source: "provider_reported", inputTokens: 100 as number | null, outputTokens: 100,
      cachedInputTokens: 0, cacheWriteInputTokens: null, reasoningOutputTokens: 0 },
  } };
  const execution = { id: id(13), workflow_id: policy.publications[0].publishedWorkflowId, status: "succeeded" as const,
    outputs: { booklet_provider_result: JSON.stringify(wrapper) } };
  const runtime: WorkflowRuntime = { start: vi.fn(async () => { throw new Error("No POST allowed"); }),
    retrieve: vi.fn(async (): Promise<RuntimeResult> => ({ kind: "execution", execution: { ...execution,
      outputs: { booklet_provider_result: JSON.stringify(wrapper) } } })) };
  const observer = createM4ProviderResults(db, authority, config, runtime);
  const input = { runId: id(10), operationId: id(12), nowMs: 8 };
  const campaign = () => db.collections.experiment_campaigns.findOne({ _id: id(1) });
  return { db, repository, authority, config, runtime, wrapper, execution, observer, input, campaign };
}

describe("M4 original authenticated provider observation", () => {
  it("retrieves the exact saved app/key, persists before parsing, settles once under concurrent duplicates, and never materializes", async () => {
    const env = await setup();
    const results = await Promise.all([env.observer.observe(env.input), env.observer.observe(env.input)]);
    expect(results.every((result) => result.kind === "result")).toBe(true);
    expect(results.filter((result) => result.kind === "result" && !result.reused)).toHaveLength(1);
    expect(env.runtime.retrieve).toHaveBeenCalledWith(env.config.bindings[0], id(13));
    expect(env.runtime.start).not.toHaveBeenCalled();
    expect(await env.repository.getOperation(id(12))).toMatchObject({ state: "started", reservationCount: 1, resultJson: null,
      m4Observation: { content: env.wrapper.content, issue: null }, m4Reservation: { settledMicrodollars: 63, unsettledMicrodollars: 900 } });
    expect(await env.campaign()).toMatchObject({ state: "active", requests: 1, reservedMicrodollars: 900, settledMicrodollars: 63 });
    expect((await env.repository.getRun(id(10)))!.activeOperationId).toBe(id(12));
  });
  it("settles known usage before malformed, refused or incomplete creative output blocks the campaign", async () => {
    for (const kind of ["malformed", "refused", "incomplete", "failed"] as const) {
      const env = await setup();
      if (kind === "malformed") env.wrapper.content = '{"result":';
      if (kind === "refused") env.wrapper.providerEvidence.refused = true;
      if (kind === "incomplete") Object.assign(env.wrapper.providerEvidence, { status: "incomplete", incompleteReason: "max_output_tokens" });
      if (kind === "failed") vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "execution", execution: {
        ...env.execution, status: "failed", outputs: { booklet_provider_result: JSON.stringify(env.wrapper) } } });
      expect(await env.observer.observe(env.input)).toEqual({ kind: "blocked" });
      expect(await env.campaign()).toMatchObject({ state: "stopped", reservedMicrodollars: 900, settledMicrodollars: 63 });
      const op = (await env.repository.getOperation(id(12)))!;
      expect(op).toMatchObject({ state: "failed", safeFailure: "definite_failure", lifecycle: { phase: "finished", unresolved: false, attemptOutcome: "failed" },
        m4Observation: { content: env.wrapper.content, issue: kind === "malformed" ? "creative_invalid" : "provider_failure" } });
      expect(await env.repository.getRun(id(10))).toMatchObject({ status: "blocked", safeFailure: "definite_failure", activeOperationId: null });
      const before = { op, run: await env.repository.getRun(id(10)), campaign: await env.campaign() };
      expect(await closeM4KnownFailure(env.db, env.authority, { ...env.input, nowMs: 9 })).toBe("closed");
      expect({ op: await env.repository.getOperation(id(12)), run: await env.repository.getRun(id(10)), campaign: await env.campaign() }).toEqual(before);
    }
  });
  it("retains the full maximum for missing wrapper, unavailable usage and invalid usage", async () => {
    for (const kind of ["missing", "unavailable", "invalid"] as const) {
      const env = await setup();
      if (kind === "missing") vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "execution", execution: { ...env.execution, outputs: {} } });
      if (kind === "unavailable") Object.assign(env.wrapper.providerEvidence.usage, { source: "unavailable", inputTokens: null });
      if (kind === "invalid") env.wrapper.providerEvidence.usage.inputTokens = -1;
      expect(await env.observer.observe(env.input)).toEqual({ kind: "blocked" });
      expect(await env.campaign()).toMatchObject({ state: "stopped", reservedMicrodollars: 5924, settledMicrodollars: 0 });
      const op = (await env.repository.getOperation(id(12)))!;
      expect(op.m4Observation).toBeDefined();
      if (kind !== "missing") expect(op.m4Observation!.content).toBe(env.wrapper.content);
      expect(await closeM4KnownFailure(env.db, env.authority, env.input)).toBe("deferred");
      expect((await env.repository.getRun(id(10)))!.activeOperationId).toBe(id(12));
    }
  });
  it("preserves original evidence and settlement when any full-wrapper byte changes", async () => {
    const env = await setup(); await env.observer.observe(env.input);
    const original = (await env.repository.getOperation(id(12)))!.m4Observation;
    env.wrapper.content += " ";
    expect(await env.observer.observe(env.input)).toEqual({ kind: "blocked" });
    expect((await env.repository.getOperation(id(12)))!.m4Observation).toEqual({ ...original, issue: "conflicting_evidence" });
    expect(await closeM4KnownFailure(env.db, env.authority, env.input)).toBe("deferred");
    expect(await env.campaign()).toMatchObject({ state: "stopped", reservedMicrodollars: 900, settledMicrodollars: 63 });
  });
  it("rejects configuration drift before GET and remote publication, run or digest drift before settlement", async () => {
    for (const kind of ["config", "publication", "workflow", "digest"] as const) {
      const env = await setup();
      if (kind === "config") {
        const config = structuredClone(env.config); config.bindings[0].publishedWorkflowId = id(99);
        await expect(createM4ProviderResults(env.db, env.authority, config, env.runtime).observe(env.input)).rejects.toMatchObject({ code: "conflict" });
        expect(env.runtime.retrieve).not.toHaveBeenCalled();
      } else {
        if (kind === "digest") env.wrapper.providerEvidence.requestDigest = "c".repeat(64);
        else vi.mocked(env.runtime.retrieve).mockResolvedValue({ kind: "execution", execution: { ...env.execution,
          ...(kind === "publication" ? { workflow_id: id(99) } : { id: id(99) }) } });
        expect(await env.observer.observe(env.input)).toEqual({ kind: "blocked" });
        expect(await env.campaign()).toMatchObject({ state: "stopped" });
      }
      expect(await env.campaign()).toMatchObject({ reservedMicrodollars: 5924, settledMicrodollars: 0 });
      expect(await closeM4KnownFailure(env.db, env.authority, env.input)).toBe("deferred");
    }
  });
  it("rechecks policy and ownership after remote I/O, retaining every reservation", async () => {
    for (const field of ["m4.policyHash", "activeOperationId"] as const) {
      const env = await setup();
      vi.mocked(env.runtime.retrieve).mockImplementation(async () => {
        await env.db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { [field]: field === "activeOperationId" ? null : "c".repeat(64) } });
        return { kind: "execution", execution: env.execution };
      });
      await expect(env.observer.observe(env.input)).rejects.toMatchObject({ code: "conflict" });
      expect((await env.repository.getOperation(id(12)))!.m4Observation).toBeUndefined();
      expect(await env.campaign()).toMatchObject({ reservedMicrodollars: 5924, settledMicrodollars: 0 });
    }
  });
  it("retains uncertainty without replay and returns Pause/Stop state with a valid in-flight result", async () => {
    const env = await setup();
    vi.mocked(env.runtime.retrieve).mockResolvedValueOnce({ kind: "unknown" })
      .mockResolvedValueOnce({ kind: "execution", execution: { ...env.execution, status: "running" } });
    expect(await env.observer.observe(env.input)).toEqual({ kind: "pending" });
    expect(await env.observer.observe(env.input)).toEqual({ kind: "pending" });
    expect(await env.campaign()).toMatchObject({ state: "active", reservedMicrodollars: 5924, settledMicrodollars: 0 });
    await env.db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { pauseRequested: true, status: "paused" } });
    await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { "lifecycle.stop": { requestedAtMs: 7, reason: "manual", delivery: "pending" } } });
    expect(await env.observer.observe(env.input)).toMatchObject({ kind: "result", pauseRequested: true, stopRequested: true });
    expect(env.runtime.start).not.toHaveBeenCalled();
  });
  it("defers each active save claim, then closes known failure without changing reservations or retained lifecycle history", async () => {
    for (const field of ["authorizationClaim", "resultFinalizationClaim", "imageCompletionClaim"] as const) {
      const env = await setup(); env.wrapper.providerEvidence.refused = true;
      await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: {
        [field]: { id: id(90), digest: "d".repeat(64), expiresAtMs: 10 },
        "lifecycle.timeoutAtMs": 6, "lifecycle.endedAtMs": 7,
        "lifecycle.stop": { requestedAtMs: 6, reason: "manual", delivery: "acknowledged" },
      } });
      expect(await env.observer.observe(env.input)).toEqual({ kind: "blocked" });
      expect((await env.repository.getOperation(id(12)))!.state).toBe("started");
      expect(await closeM4KnownFailure(env.db, env.authority, env.input)).toBe("deferred");
      const before = (await env.repository.getOperation(id(12)))!;
      const counters = (await env.repository.getRun(id(10)))!.counters;
      expect(await closeM4KnownFailure(env.db, env.authority, { ...env.input, nowMs: 10 })).toBe("closed");
      const after = (await env.repository.getOperation(id(12)))!;
      expect(after.m4Reservation).toEqual(before.m4Reservation);
      expect(after.deadlineAtMs).toBe(before.deadlineAtMs);
      expect(after.lifecycle).toMatchObject({ timeoutAtMs: 6, endedAtMs: 7, stop: before.lifecycle!.stop, unresolved: false });
      expect(after[field]).toEqual(before[field]);
      expect((await env.repository.getRun(id(10)))!.counters).toEqual(counters);
    }
  });
  it("does not close conflicting evidence, saved materialization, or a corrupted evidence hash", async () => {
    for (const kind of ["conflict", "materialization", "evidence", "content_valid"] as const) {
      const env = await setup(); env.wrapper.providerEvidence.refused = kind !== "content_valid";
      if (kind === "content_valid") env.wrapper.content = '{"result":';
      await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { resultFinalizationClaim: { id: id(91), expiresAtMs: 10 } } });
      await env.observer.observe(env.input);
      if (kind === "conflict") {
        env.wrapper.content += " "; await env.observer.observe(env.input);
      } else if (kind === "materialization") {
        await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { materializationJson: "{}" } });
      } else if (kind === "evidence") {
        await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { "m4Observation.evidenceDigest": "e".repeat(64) } });
      } else {
        await env.db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { "m4Observation.content": JSON.stringify({ result: {
          kind: "delegate", payload: { taskId: "J01", subjectKind: "book", subjectId: id(11) } } }) } });
      }
      expect(await closeM4KnownFailure(env.db, env.authority, { ...env.input, nowMs: 10 })).toBe("deferred");
      expect((await env.repository.getRun(id(10)))!.activeOperationId).toBe(id(12));
      expect((await env.repository.getOperation(id(12)))!.state).toBe("started");
    }
  });
});
