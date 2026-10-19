import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { withMongoTransaction, type Database } from "@/db/client";
import { createExperimentRepository, ExperimentRepositoryError } from "@/db/experiment-repository";
import { verifyM4Accounting } from "@/db/experiment-m4-accounting";
import { createExperimentCompletionService } from "@/db/experiment-completion";
import { hasM4KnownFailure } from "@/db/experiment-provider-failure";
import type { AssetStore } from "@/lib/assets/asset-store";
import { specialistTaskSchema } from "@/lib/contracts/experiment-runner";
import { configurationSnapshot, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";
import { m4ModelOutputSchema, m4RequestBundleHash, type M4RequestSelector } from "@/lib/experiment-runner/m4-request";
import { createExperimentImageStorage } from "@/lib/experiment-runner/image-storage";
import { simulatedExperimentReport } from "@/lib/experiment-runner/report-fixtures";
import type { ReferenceUploadResult } from "@/lib/experiment-runner/reference-transport";
import type { RuntimeExecution, WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";
import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";
import manifest from "@/lib/experiment-runner/m4-campaign-manifest.json";
import { loadPublishedRehearsal, publishedReturn } from "@/tests/helpers/m4-published-rehearsal";
import { m4PolicySchema } from "@/lib/experiment-runner/m4-policy";
import { m4ObservedRoleResult } from "@/lib/experiment-runner/m4-observed-result";
import { recentDiagnostics } from "@/lib/experiment-runner/diagnostics";
import { createBookletRecovery } from "@/lib/operations/booklet-recovery";
import { inspectRecoveryWork } from "@/lib/operations/recovery-inspection";
import { OperationBudgetExpired, withOperationBudget } from "@/lib/operations/budget";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

class MemoryStore implements AssetStore {
  files = new Map<string, Uint8Array>();
  async put(uri: string, bytes: Uint8Array, mimeType: string) { this.files.set(uri, Uint8Array.from(bytes)); return { uri, mimeType, byteLength: bytes.byteLength }; }
  async get(uri: string) { const bytes = this.files.get(uri); if (!bytes) throw new Error("Missing fake image"); return Uint8Array.from(bytes); }
  async exists(uri: string) { return this.files.has(uri); }
}

// Adapt local creative fixtures to the model's restricted output. The normal
// owning service restores these fields from the saved preparation, not this fake.
const workflowOwnedFields: Record<string, string[]> = {
  J08: ["stylePromptModuleHash"],
  J09: ["finalListVersionId", "styleVersionId", "stylePromptModule", "stylePromptModuleHash", "characterId", "requiredViews", "attireRequirements", "accessories"],
  J10: ["finalListVersionId", "styleVersionId", "stylePromptModule", "stylePromptModuleHash", "locationId", "stableAnchors", "requiredFeatures"],
  J12: ["pageId", "pageIndex", "layoutVersionId", "manuscriptVersionId", "styleVersionId"],
};

async function setup(amended = false) {
  const published = process.env.M4_PUBLICATION_REHEARSAL === "1" ? await loadPublishedRehearsal() : null;
  const phases: { operationId: string; role: string; report: boolean; publicationId: string; authorizationBytes: number; resultBytes: number; authorizationMs: number; decodeReturnMs: number }[] = [];
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const policy = m4PolicySchema.parse({ ...m4TestPolicy(), requestDefinitionHash: amended ? "a".repeat(64) : m4RequestBundleHash(),
    ...(published ? { publications: manifest.policy.publications, pluginIdentity: manifest.policy.pluginIdentity } : {}) });
  const authority = { policy, grant: { campaignId: id(1), reference: "offline-dispatch-fixture-only",
    ...(amended ? { requestDefinitionUpdate: { fromBundleHash: policy.requestDefinitionHash,
      toBundleHash: m4RequestBundleHash(), reference: "prior-reviewed-amendment" } } : {}) } };
  const store = new MemoryStore();
  const repository = createExperimentRepository(database, { m4Authority: authority, m4ExecutionEnabled: true, store: () => store });
  const context = createExperimentContextService(database, { store: () => store });
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid", callbackKey: "fixture",
    m4: { state: "granted", authority },
    bindings: policy.publications.map((p) => ({ ...p, taskId: specialistTaskSchema.nullable().parse(p.taskId), apiKey: "fake-key" })) };
  const runId = id(10), bookletId = id(11); let clock = Date.now();
  await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "balanced", campaignId: id(1),
    configuration: configurationSnapshot(config, "playful_kid"), nowMs: clock });
  const saved = new Map<string, RuntimeExecution>();
  let pending = false, badCreative = false, badLayout = false, incompleteLayout = false;
  let blockCompletionTask: string | null = null;
  const runtime: WorkflowRuntime = {
    start: vi.fn<WorkflowRuntime["start"]>(async (binding, input, options) => {
      expect(input.mode).toBe("balanced");
      const before = (await repository.getOperation(input.operationId))!;
      if (binding.role !== "image") expect(before.m4Preparation?.requestDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(before.reservationCount).toBe(0);
      const workflowRunId = randomUUID();
      const identity = { runId, operationId: input.operationId, workflowRunId, parentWorkflowRunId: input.parentWorkflowRunId };
      const running: RuntimeExecution = { id: workflowRunId, task_id: randomUUID(), workflow_id: binding.publishedWorkflowId, status: "running", outputs: {} };
      saved.set(workflowRunId, running);
      await options?.onStarted?.(running);
      const isReport = ["tester", "judge"].includes(binding.role) && (await repository.getRun(runId))!.generationCompletedAtMs != null;
      const graph = published?.find((item) => item.role === binding.role &&
        (binding.role === "tester" ? isReport : binding.role === "specialist" ? binding.taskId === "J01" : !phases.some((phase) => phase.role === "manager")));
      let authorizationBody = "", authorizationMs = 0;
      if (graph) {
        const http = createBookletRunnerHttp({ database: () => database, config: () => ({ enabled: true, config }),
          runtime: () => runtime, store: () => store, mutate: (action) => action() });
        const started = performance.now();
        // HTTP uses the wall clock; keep it on the same monotonically advanced
        // fixture time as dispatcher preparation and report accounting.
        const now = vi.spyOn(Date, "now").mockImplementation(() => clock);
        let response: Response;
        try {
          response = await http.tool(new Request("https://booklet.invalid/api/experiments/booklet-tools/authorize", {
            method: "POST", headers: { "x-booklet-tool-key": config.callbackKey }, body: JSON.stringify(identity),
          }), "authorize");
        } finally { now.mockRestore(); }
        authorizationBody = await response.text(); authorizationMs = performance.now() - started;
        expect(response.status, authorizationBody).toBe(200);
        expect(JSON.parse(authorizationBody).data.started).toBe(true);
        expect(authorizationBody.length).toBeGreaterThan(0);
      } else {
      // Emulate the protected authorization endpoint's original publication GET.
      await repository.verifyDispatchPublication({ ...identity, workflowId: binding.publishedWorkflowId, nowMs: clock });
      expect((await repository.claimOperation({ ...identity, nowMs: clock })).started).toBe(true);
      }
      const operation = (await repository.getOperation(input.operationId))!;
      expect(operation.deadlineAtMs).toBe(before.deadlineAtMs);
      const report = ["tester", "judge"].includes(binding.role) && (await repository.getRun(runId))!.generationCompletedAtMs != null;
      // Balanced reports consume the pre-claim projection carried in the exact
      // prepared request. Execution-context accounting cannot precede its GET.
      const roleContext = report ? JSON.parse(operation.m4Preparation!.contextJson) as Awaited<ReturnType<typeof context.getOperationContext>> :
        await context.getOperationContext(identity);
      if (binding.role === "image") {
        expect(roleContext).toMatchObject({ role: "image", mode: "balanced", imageProvider: "simulated" });
        const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#74aadd" } }).png().toBuffer();
        const completed = await createExperimentImageStorage({ database, store, now: () => clock }).complete({
          identity: { ...identity, inputFingerprint: operation.inputFingerprint }, content: bytes,
        });
        const outputs: Record<string, unknown> = { image_result: JSON.stringify({ ...identity, inputFingerprint: operation.inputFingerprint,
          assetId: operation._id, sha256: completed.operation.resultDigest }) };
        if (operation.taskId === "J13" && input.referenceFileIds !== undefined) {
          outputs.reference_files = input.referenceFileIds.map((record_id) => ({ type: "image", transfer_method: "local_file",
            reference: `dify-file-ref:${Buffer.from(JSON.stringify({ record_id })).toString("base64url")}` }));
        }
        const execution: RuntimeExecution = { ...running, status: "succeeded", outputs };
        saved.set(workflowRunId, execution);
        return { kind: "execution", execution };
      }
      // Fixture generation is local only; saved execution and accounting stay Balanced.
      const selector = { role: binding.role, taskId: binding.taskId, persona: "playful_kid", report: "reportEvidence" in roleContext } as M4RequestSelector;
      let creative: unknown;
      if ("reportEvidence" in roleContext) {
        const report = simulatedExperimentReport({ ...roleContext.reportEvidence, mode: "simulated" });
        const { summary, intent, interaction, consistency, findings } = report;
        creative = { report: { summary, intent, interaction, consistency, findings } };
      } else {
        const result = simulateNarrativeResult(roleContext, "simulated");
        if (result.kind === "proposal") {
          for (const key of workflowOwnedFields[binding.taskId ?? ""] ?? []) delete (result.payload.content as Record<string, unknown>)[key];
        }
        creative = { result };
      }
      let content = JSON.stringify(m4ModelOutputSchema(selector).parse(creative));
      if (badLayout && binding.taskId === "J11") {
        const invalid = JSON.parse(content);
        for (const page of invalid.result.payload.content.pages) for (const panel of page.panels) {
          panel.liveTextSafeRegion = { x: 0.5, y: 0.5, width: 1, height: 1 };
        }
        content = JSON.stringify(invalid);
      }
      const wrapper = { schemaVersion: "booklet_provider_v1", content: badCreative ? '{"result":{"kind":"not-a-role-result"}}' : content, providerEvidence: {
        provider: "openai", apiBaseUrl: "https://api.openai.com/v1",
        stdioSdk: { version: "0.10.2", readerSha256: "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22" },
        responseId: `resp_fake_${input.operationId}`, requestId: `req_fake_${input.operationId}`, model: binding.role === "judge" ? "gpt-6-sol" : "gpt-6-luna", serviceTier: "default", status: "completed",
        refused: false, incompleteReason: null, requestDigest: operation.m4Preparation!.requestDigest, countedInputTokens: 100,
        usage: { source: "provider_reported", inputTokens: 100, outputTokens: 100, cachedInputTokens: 0, cacheWriteInputTokens: null, reasoningOutputTokens: 0 },
      } };
      if (incompleteLayout && binding.taskId === "J11") {
        wrapper.content = '{"result":{"kind":"proposal","payload":' + "   \n".repeat(6019);
        Object.assign(wrapper.providerEvidence, { status: "incomplete", incompleteReason: "max_output_tokens" });
        wrapper.providerEvidence.usage.outputTokens = 8192;
      }
      let output = JSON.stringify(wrapper);
      if (graph) {
        expect(operation.verifiedWorkflowId).toBe(graph.publicationId);
        const returned = publishedReturn(graph.graph, authorizationBody, output, operation.m4Preparation!.requestJson, isReport);
        output = returned.output;
        phases.push({ operationId: operation._id, role: binding.role, report: isReport, publicationId: graph.publicationId,
          authorizationBytes: Buffer.byteLength(authorizationBody), resultBytes: Buffer.byteLength(output),
          authorizationMs, decodeReturnMs: returned.decodeReturnMs });
      }
      saved.set(workflowRunId, { ...running, status: "succeeded", outputs: { booklet_provider_result: output } });
      // Even plausible stream output must not materialize before an original GET.
      return { kind: "accepted", execution: { ...running, outputs: { booklet_provider_result: "untrusted-stream-output" } } };
    }),
    retrieve: vi.fn<WorkflowRuntime["retrieve"]>(async (_binding, workflowRunId) => {
      const execution = saved.get(workflowRunId);
      if (!execution) throw new Error("Unexpected fake workflow lookup");
      if (blockCompletionTask && _binding.role === "specialist" && typeof execution.outputs?.booklet_provider_result === "string") {
        const wrapper = JSON.parse(execution.outputs.booklet_provider_result);
        if (JSON.parse(wrapper.content).result?.payload?.taskId === blockCompletionTask) {
          blockCompletionTask = null;
          // Reproduce the earlier application's definite materialization blocker
          // while retaining the same successful provider GET and claimed request.
          await repository.blockRun({ runId, category: "definite_failure", nowMs: clock });
        }
      }
      return { kind: "execution", execution: pending ? { ...execution, status: "running", outputs: {} } : execution };
    }),
    stop: vi.fn<NonNullable<WorkflowRuntime["stop"]>>(async () => ({ kind: "acknowledged" })),
  };
  const uploadReference = vi.fn(async (_binding: BookletRunnerConfig["bindings"][number], _runId: string, bytes: Uint8Array): Promise<ReferenceUploadResult> => ({
    kind: "uploaded", id: randomUUID(), byteLength: bytes.byteLength, mimeType: "image/png", sha256: createHash("sha256").update(bytes).digest("hex"),
  }));
  const dispatcher = createExperimentDispatcher({ database, config, runtime, now: () => clock, mutate: async (action) => action(), store: () => store, uploadReference });
  return { database, repository, dispatcher, runtime, runId, bookletId, store, context, uploadReference, phases, authority, config,
    tick: () => { clock += 6_000; }, now: () => clock,
    pending: (value: boolean) => { pending = value; }, badCreative: () => { badCreative = true; },
    blockCompletion: (taskId: string) => { blockCompletionTask = taskId; },
    badLayout: (value: boolean) => { badLayout = value; }, incompleteLayout: (value: boolean) => { incompleteLayout = value; } };
}

describe("offline Balanced dispatcher", () => {
  it("prepares tester then manager and J01, admits each once, and only materializes original GET output", async () => {
    const env = await setup();
    env.pending(true);
    await env.dispatcher.advance(env.runId);
    expect(env.runtime.start).toHaveBeenCalledTimes(1);
    const first = (await env.repository.listOperations(env.runId))[0];
    expect(first).toMatchObject({ role: "tester", state: "started", reservationCount: 1 });
    expect(first.m4Observation).toBeUndefined();
    expect(await env.database.collections.artifacts.countDocuments({ experimentRunId: env.runId })).toBe(0);
    for (let i = 0; i < 3; i++) { env.tick(); await env.dispatcher.advance(env.runId); }
    expect(env.runtime.start).toHaveBeenCalledTimes(1);
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ requests: 1, settledMicrodollars: 0 });
    env.pending(false); env.tick(); await env.dispatcher.advance(env.runId);
    expect(await env.repository.getOperation(first._id)).toMatchObject({ state: "succeeded", m4Observation: { remoteStatus: "succeeded", issue: null } });
    for (let i = 0; i < 2; i++) {
      env.tick(); await env.dispatcher.advance(env.runId);
      env.tick(); await env.dispatcher.advance(env.runId);
    }
    const operations = await env.repository.listOperations(env.runId);
    expect(operations.map((op) => [op.role, op.taskId, op.state, op.reservationCount])).toEqual([
      ["tester", null, "succeeded", 1], ["manager", null, "succeeded", 1], ["specialist", "J01", "succeeded", 1],
    ]);
    expect(operations[2].parentWorkflowRunId).toBe(operations[1].workflowRunId);
    expect(operations.every((op) => op.m4Observation?.content && op.m4Reservation?.settledMicrodollars === 63)).toBe(true);
    expect(env.runtime.start).toHaveBeenCalledTimes(3);
    expect(await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J01" })).toMatchObject({ state: "approved" });
    expect(await env.database.collections.approvals.findOne({ experimentRunId: env.runId })).toMatchObject({ origin: "delegated", action: "approve" });
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ requests: 3, settledMicrodollars: 189, reservedMicrodollars: 0 });
    expect((await env.repository.getRun(env.runId))!.counters).toMatchObject({ logicalText: 3, payableText: 3, logicalImage: 0, payableImage: 0, steps: 3 });
  });

  it("retains charged malformed creative output, stops the campaign, and never POSTs a replacement", async () => {
    const env = await setup(); env.badCreative();
    await env.dispatcher.advance(env.runId); env.tick(); await env.dispatcher.advance(env.runId);
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ state: "stopped", requests: 1, settledMicrodollars: 63, reservedMicrodollars: 0 });
    const operations = await env.repository.listOperations(env.runId);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ reservationCount: 1, m4Observation: { remoteStatus: "succeeded" }, m4Reservation: { settledMicrodollars: 63 } });
    expect(operations[0].resultJson).toBeNull();
    expect(await env.database.collections.artifacts.countDocuments({ experimentRunId: env.runId })).toBe(0);
    const closedRun = (await env.repository.getRun(env.runId))!;
    expect(closedRun).toMatchObject({ status: "blocked", safeFailure: "definite_failure", activeOperationId: null });
    expect(operations[0].lifecycle).toMatchObject({ phase: "finished", attemptOutcome: "failed", unresolved: false });
    for (let i = 0; i < 2; i++) {
      env.tick();
      const current = (await env.repository.getRun(env.runId))!;
      expect(await env.dispatcher.inspect({ runId: env.runId, operationId: operations[0]._id, expectedRevision: current.revision }))
        .toEqual({ ...operations[0], remoteStatus: "succeeded" });
      expect(await env.repository.getRun(env.runId)).toEqual(closedRun);
    }
    for (const failure of ["unknown", "throw"] as const) {
      for (const stop of [undefined, "deadline"] as const) {
        env.tick();
        if (failure === "unknown") vi.mocked(env.runtime.retrieve).mockResolvedValueOnce({ kind: "unknown" });
        else vi.mocked(env.runtime.retrieve).mockRejectedValueOnce(new Error("Fake GET unavailable"));
        const current = (await env.repository.getRun(env.runId))!;
        expect(await env.dispatcher.inspect({ runId: env.runId, operationId: operations[0]._id, expectedRevision: current.revision, stop }))
          .toEqual({ ...operations[0], remoteStatus: "succeeded" });
        expect(await env.repository.getRun(env.runId)).toEqual(closedRun);
      }
    }
    for (let i = 0; i < 2; i++) { env.tick(); await env.dispatcher.advance(env.runId); }
    expect(env.runtime.start).toHaveBeenCalledTimes(1);
    expect(env.runtime.stop).not.toHaveBeenCalled();
  });

  it("closes malformed output first discovered by deadline Stop inspection without sending Stop", async () => {
    const env = await setup(); env.badCreative();
    await env.dispatcher.advance(env.runId);
    const operation = (await env.repository.listOperations(env.runId))[0];
    expect(operation).toMatchObject({ state: "started", reservationCount: 1 });
    expect(operation.workflowTaskId).toBeTruthy();
    expect(operation.m4Observation).toBeUndefined();
    expect(env.runtime.retrieve).not.toHaveBeenCalled();
    while (env.now() <= operation.deadlineAtMs!) env.tick();
    const run = (await env.repository.getRun(env.runId))!;
    expect(await env.dispatcher.inspect({ runId: env.runId, operationId: operation._id, expectedRevision: run.revision, stop: "deadline" }))
      .toMatchObject({ state: "failed", safeFailure: "definite_failure", reservationCount: 1,
        m4Observation: { remoteStatus: "succeeded", issue: "creative_invalid" },
        lifecycle: { phase: "finished", attemptOutcome: "failed", unresolved: false } });
    expect(await env.repository.getRun(env.runId)).toMatchObject({ status: "blocked", safeFailure: "definite_failure", activeOperationId: null });
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) }))
      .toMatchObject({ state: "stopped", requests: 1, settledMicrodollars: 63, reservedMicrodollars: 0 });
    expect(env.runtime.start).toHaveBeenCalledTimes(1);
    expect(env.runtime.stop).not.toHaveBeenCalled();
  });

  it("does not dispatch or reserve while Pause is requested", async () => {
    const env = await setup();
    await env.repository.pause({ runId: env.runId, expectedRevision: 0, nowMs: env.now() });
    await env.dispatcher.advance(env.runId);
    expect(env.runtime.start).not.toHaveBeenCalled();
    expect(await env.repository.listOperations(env.runId)).toHaveLength(0);
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ requests: 0, reservedMicrodollars: 0 });
  });

  it("settles an already claimed result after Pause without starting the manager", async () => {
    const env = await setup();
    await env.dispatcher.advance(env.runId);
    const run = (await env.repository.getRun(env.runId))!;
    await env.repository.pause({ runId: env.runId, expectedRevision: run.revision, nowMs: env.now() });
    env.tick(); await env.dispatcher.advance(env.runId);
    const operations = await env.repository.listOperations(env.runId);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ state: "succeeded", reservationCount: 1, m4Reservation: { settledMicrodollars: 63 } });
    expect(await env.repository.getRun(env.runId)).toMatchObject({ status: "paused", pauseRequested: true });
    env.tick(); await env.dispatcher.advance(env.runId);
    expect(env.runtime.start).toHaveBeenCalledTimes(1);
  });

  it("expires the original prepared deadline before any POST or reservation", async () => {
    const env = await setup();
    const operation = await env.repository.prepareOperation({ runId: env.runId, operationId: id(12), expectedRevision: 0,
      role: "tester", taskId: null, subjectKind: "book", subjectId: env.bookletId,
      inputFingerprint: "d".repeat(64), attempt: 1, providerKind: "text", nowMs: env.now() });
    while (env.now() <= operation.deadlineAtMs!) env.tick();
    expect(await env.dispatcher.advance(env.runId)).toBe("blocked");
    expect(env.runtime.start).not.toHaveBeenCalled();
    expect(await env.repository.getOperation(operation._id)).toMatchObject({ reservationCount: 0 });
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ requests: 0, reservedMicrodollars: 0 });
  });

  it("completes all Kid tasks offline with simulated images and freezes each report's own settled cost", async () => {
    const env = await setup();
    let testerSnapshot: unknown, testerResult: string | null = null;
    for (let step = 0; step < 120; step++) {
      const outcome = await env.dispatcher.advance(env.runId);
      // Surface fixture assertions that the dispatcher correctly converts into
      // uncertain dispatch, rather than hiding their cause behind "blocked".
      for (const result of vi.mocked(env.runtime.start).mock.results) await result.value;
      const run = (await env.repository.getRun(env.runId))!;
      expect(outcome, `Offline step ${step}: ${run.status}/${run.safeFailure}`).not.toBe("blocked");
      const operations = await env.repository.listOperations(env.runId);
      const tester = operations.find((op) => op.role === "tester" && op.state === "succeeded" &&
        JSON.parse(op.resultJson ?? "null")?.kind === "feedback");
      if (tester && testerSnapshot === undefined) {
        expect(operations.some((op) => op.role === "judge")).toBe(false);
        testerSnapshot = structuredClone(tester.m4Observation!.costEvidence);
        testerResult = tester.resultJson;
        const ownAndEarlierUpper = operations.reduce((sum, op) => sum + (op.m4Reservation?.settledMicrodollars ?? 0) +
          (op.m4Reservation?.unsettledMicrodollars ?? 0), 0);
        expect(tester.m4Reservation).toMatchObject({ settledMicrodollars: 63, unsettledMicrodollars: 0 });
        expect(testerSnapshot).toMatchObject({ status: "partial", actualUsd: null, estimatedUsd: ownAndEarlierUpper / 1_000_000 });
        expect(JSON.parse(tester.resultJson!).payload.costEvidence).toEqual(testerSnapshot);
      }
      if (run.status === "completed") break;
      env.tick();
    }
    const run = (await env.repository.getRun(env.runId))!;
    expect(run).toMatchObject({ status: "completed", evaluationStatus: "complete", activeOperationId: null,
      counters: { logicalText: 39, payableText: 39, logicalImage: 9, payableImage: 0, steps: 48 } });
    expect(run.generationCompletedAtMs).toBeTypeOf("number");
    const operations = await env.repository.listOperations(env.runId);
    expect(operations).toHaveLength(48);
    expect(operations.every((op) => op.state === "succeeded" && op.reservationCount === 1 && op.verifiedWorkflowId)).toBe(true);
    expect(env.runtime.start).toHaveBeenCalledTimes(48);
    const tester = operations.find((op) => op.role === "tester" && JSON.parse(op.resultJson ?? "null")?.kind === "feedback")!;
    const judge = operations.find((op) => op.role === "judge")!;
    expect(testerSnapshot).toBeDefined();
    expect(tester.m4Observation!.costEvidence).toEqual(testerSnapshot);
    expect(tester.resultJson).toBe(testerResult);
    expect(testerSnapshot).toMatchObject({ estimatedUsd: 2394 / 1_000_000 });
    expect(judge.m4Reservation).toMatchObject({ settledMicrodollars: 1250, unsettledMicrodollars: 0 });
    expect(judge.m4Observation!.costEvidence).toMatchObject({ status: "partial", actualUsd: null, estimatedUsd: 3644 / 1_000_000 });
    expect(JSON.parse(judge.resultJson!).payload.costEvidence).toEqual(judge.m4Observation!.costEvidence);
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ state: "active", requests: 39,
      requestCounts: { playful_kid: 39 }, judgeRunIds: [env.runId], settledMicrodollars: 3644, reservedMicrodollars: 0 });
    await withMongoTransaction(env.database, (session) => verifyM4Accounting(env.database, session, run));
    const view = (await env.context.getRunView(env.runId))!;
    expect(view.reports).toHaveLength(2);
    expect(view.reports!.every((report) => report.matchesCurrentVersions)).toBe(true);
    expect(new Set(view.currentArtifacts.map((artifact) => artifact.taskId)))
      .toEqual(new Set(Array.from({ length: 13 }, (_, index) => `J${String(index + 1).padStart(2, "0")}`)));
    expect(view.currentArtifacts.every((artifact) => artifact.state === "approved")).toBe(true);
    expect(view.currentArtifacts.filter((artifact) => artifact.taskId === "J13")).toHaveLength(4);
    const images = operations.filter((op) => op.providerKind === "image");
    expect(images).toHaveLength(9);
    expect(env.store.files.size).toBe(9);
    for (const image of images) {
      const asset = await env.database.collections.assets.findOne({ _id: image._id });
      expect(asset).not.toBeNull();
      const bytes = await env.store.get(asset!.uri);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(image.resultDigest);
      expect(await sharp(bytes).metadata()).toMatchObject({ width: 8, height: 8, format: "png" });
    }
    expect(env.uploadReference).toHaveBeenCalled();
    // Re-run the owning completion verifier after both immutable cost snapshots.
    const completion = createExperimentCompletionService(env.database, env.store);
    expect((await completion.completeEvaluation({ runId: env.runId, expectedRevision: run.revision, nowMs: env.now() })).revision).toBe(run.revision);
    expect(env.runtime.stop).not.toHaveBeenCalled();
    if (process.env.M4_PUBLICATION_REHEARSAL === "1") {
      expect(env.phases.map(({ role, report }) => ({ role, report }))).toEqual([
        { role: "manager", report: false }, { role: "specialist", report: false }, { role: "tester", report: true },
      ]);
      console.info("M4 publication rehearsal (fake providers; isolated persistence)", JSON.stringify(env.phases));
      const observation = recentDiagnostics(env.runId, 5000).events.filter((event) =>
        env.phases.some((phase) => phase.operationId === event.operationId) &&
        ["publication_readback", "completion_reconciliation"].includes(event.phase));
      expect(observation.every((event) => event.outcome === "succeeded")).toBe(true);
      expect(new Set(observation.map((event) => event.operationId)).size).toBe(3);
      writeFileSync("output/issue65-m4-rehearsal-phases.json", JSON.stringify({ providerRequests: 0, phases: env.phases, observation }, null, 2));
    }
  }, 120_000);
});


describe("focused J11 paid-failure continuation", () => {
  it.each(["layout", "incomplete"] as const)("retains sources/assets and the %s failure charge while new work completes layout", async (failure) => {
    const env = await setup(failure === "incomplete");
    env.badLayout(failure === "layout"); env.incompleteLayout(failure === "incomplete");
    for (let i = 0; i < 85 && (await env.repository.getRun(env.runId))!.status !== "blocked"; i++) {
      env.tick(); await env.dispatcher.advance(env.runId);
    }
    const blocked = (await env.repository.getRun(env.runId))!;
    const history = await env.repository.listOperations(env.runId);
    const failed = history.at(-1)!;
    expect(failed).toMatchObject({ role: "specialist", taskId: "J11", state: "failed", safeFailure: "definite_failure",
      lifecycle: { unresolved: false }, m4Observation: { issue: failure === "layout" ? "creative_invalid" : "provider_failure" } });
    if (failure === "incomplete") {
      expect(failed.m4Preparation?.definitionUpdate).toEqual(env.authority.grant.requestDefinitionUpdate);
      const revisedAuthority = { ...env.authority, grant: { ...env.authority.grant,
        requestDefinitionUpdate: { ...env.authority.grant.requestDefinitionUpdate!, reference: "new-reviewed-amendment" } } };
      await withMongoTransaction(env.database, async session => {
        expect(await hasM4KnownFailure(env.database, session, revisedAuthority, blocked, failed, env.now())).toBe(true);
      });
    }
    expect(blocked.activeOperationId).toBeNull();
    const beforeArtifacts = await env.database.collections.artifacts.find({ experimentRunId: env.runId }).toArray();
    const beforeVersions = await env.database.collections.artifact_versions.find({ artifactId: { $in: beforeArtifacts.map(a => a._id) } }).sort({ _id: 1 }).toArray();
    const beforeAssets = [...env.store.files.entries()];
    const beforeCampaign = (await env.database.collections.experiment_campaigns.findOne({ _id: id(1) }))!;
    const authority = { ...env.authority, grant: { ...env.authority.grant,
      continuations: [{ runId: env.runId, operationId: failed._id, reference: "inspected-J11-fixture-only" }] } };
    const recovery = createExperimentRepository(env.database, { m4Authority: authority, m4ExecutionEnabled: true, store: () => env.store });
    const resumed = await recovery.resume({ runId: env.runId, expectedRevision: blocked.revision, nowMs: env.now() });
    expect(resumed.counters).toEqual(blocked.counters);
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({
      state: "active", requests: beforeCampaign.requests, settledMicrodollars: beforeCampaign.settledMicrodollars,
      reservedMicrodollars: beforeCampaign.reservedMicrodollars });
    env.badLayout(false);
    env.incompleteLayout(false);
    const dispatcher = createExperimentDispatcher({ database: env.database, config: { ...env.config, m4: { state: "granted", authority } },
      runtime: env.runtime, now: env.now, mutate: async (action) => action(), store: () => env.store, uploadReference: env.uploadReference });
    for (let i = 0; i < 8 && !await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J11", state: "approved" }); i++) {
      env.tick(); await dispatcher.advance(env.runId);
    }
    expect(await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J11", state: "approved" })).not.toBeNull();
    const after = await env.repository.listOperations(env.runId);
    expect(after.slice(history.length).map(op => [op.role, op.taskId, op.state])).toEqual([
      ["manager", null, "succeeded"], ["specialist", "J11", "succeeded"] ]);
    expect(after[history.length].m4ContinuedFromOperationId).toBe(failed._id);
    const retained = (await env.repository.getOperation(failed._id))!;
    expect(retained.m4Observation).toEqual(failed.m4Observation); expect(retained.m4Reservation).toEqual(failed.m4Reservation);
    expect(retained.state).toBe("failed");
    expect(await env.database.collections.artifact_versions.find({ _id: { $in: beforeVersions.map(v => v._id) } }).sort({ _id: 1 }).toArray()).toEqual(beforeVersions);
    expect([...env.store.files.entries()]).toEqual(beforeAssets);
    await withMongoTransaction(env.database, async session => verifyM4Accounting(env.database, session, (await env.repository.getRun(env.runId))!));
    expect((await env.repository.getRun(env.runId))!.counters.payableText).toBe(blocked.counters.payableText + 2);
    expect((await env.database.collections.experiment_campaigns.findOne({ _id: id(1) }))!.requests).toBe(beforeCampaign.requests + 2);
  }, 120_000);
});

describe("focused J11 retained completion recovery", () => {
  async function blockedCompletion(taskId = "J11") {
    const env = await setup(); env.blockCompletion(taskId);
    for (let i = 0; i < 85 && (await env.repository.getRun(env.runId))!.status !== "blocked"; i++) {
      env.tick(); await env.dispatcher.advance(env.runId);
    }
    const run = (await env.repository.getRun(env.runId))!;
    const operation = (await env.repository.listOperations(env.runId)).at(-1)!;
    expect(run).toMatchObject({ status: "blocked", safeFailure: "definite_failure", activeOperationId: operation._id });
    expect(operation).toMatchObject({ taskId, state: "started", reservationCount: 1, resultJson: null,
      m4Observation: { remoteStatus: "succeeded", issue: null }, m4Reservation: { settledMicrodollars: 63 } });
    const result = m4ObservedRoleResult(run, operation);
    const input = () => ({ envelope: { runId: env.runId, operationId: operation._id,
      workflowRunId: operation.workflowRunId!, inputFingerprint: operation.inputFingerprint, result },
      parentWorkflowRunId: operation.parentWorkflowRunId, nowMs: env.now() });
    const permission = { runId: env.runId, operationId: operation._id, reference: "inspected-retained-J11-completion" };
    const authority = { ...env.authority, grant: { ...env.authority.grant, completionRecoveries: [permission] } };
    const recovery = createExperimentRepository(env.database, { m4Authority: authority, m4ExecutionEnabled: true, store: () => env.store });
    return { ...env, run, operation, input, permission, recovery, recoveryAuthority: authority };
  }

  async function supportedRecovery() {
    const env = await blockedCompletion();
    while (env.now() <= env.operation.deadlineAtMs!) env.tick();
    await env.database.collections.deployment_control.insertOne({ _id: "environment:_staging", schemaVersion: "1", environment: "_staging",
      maintenance: false, draining: false, activeMutations: 0, mutationOwners: [], interruptedMutations: 0, reason: null, updatedAtMs: env.now() });
    const service = createBookletRecovery({ database: env.database, config: { ...env.config, m4: { state: "granted", authority: env.recoveryAuthority } },
      runtime: env.runtime, store: () => env.store, now: env.now });
    const boundedService = { ...service, apply: (...args: Parameters<typeof service.apply>) =>
      withOperationBudget(env.now() + 150_000, () => service.apply(...args), { now: env.now }) };
    return { ...env, service: boundedService, target: { runId: env.runId, operationId: env.operation._id, expectedRevision: env.run.revision } };
  }

  it("maintenance recovery reuses its own authenticated GET and completes past interactive Inspect's window", async () => {
    const env = await supportedRecovery();
    const proof = await env.service.preview(env.target);
    expect(proof).not.toHaveProperty("observed");
    const gets = vi.mocked(env.runtime.retrieve).mock.calls.length;
    const starts = vi.mocked(env.runtime.start).mock.calls.length;
    await env.database.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    const ops = env.database.collections.experiment_operations;
    const write = ops.findOneAndUpdate.bind(ops);
    let delayed = false;
    vi.spyOn(ops, "findOneAndUpdate").mockImplementation(async (...args) => {
      if (!delayed && (args[1] as { $set?: { state?: string } }).$set?.state === "succeeded") {
        delayed = true; for (let i = 0; i < 4; i++) env.tick();
      }
      return write(...args);
    });
    try {
      await env.service.apply(env.target, proof.previewDigest, async () => {});
      expect(delayed).toBe(true);
      expect(env.runtime.retrieve).toHaveBeenCalledTimes(gets + 1);
      expect(await env.service.verifyCompleted(env.target, proof.snapshot)).toMatchObject({ verified: true, accounting: "preserved" });
      expect(env.runtime.retrieve).toHaveBeenCalledTimes(gets + 1);
      const saved = (await env.repository.getOperation(env.operation._id))!;
      expect(saved).toMatchObject({ state: "succeeded", deadlineAtMs: env.operation.deadlineAtMs,
        lifecycle: { attemptOutcome: "failed", unresolved: false }, m4Reservation: env.operation.m4Reservation });
      expect(await env.repository.getRun(env.runId)).toMatchObject({ status: "paused", pauseRequested: true, counters: env.run.counters });
      expect(env.runtime.start).toHaveBeenCalledTimes(starts);
      expect(env.runtime.stop).not.toHaveBeenCalled();
    } finally { vi.restoreAllMocks(); }
  }, 120_000);

  it("internal maintenance reconciliation rejects missing budget, grant and changed response identity", async () => {
    const env = await supportedRecovery();
    const binding = env.config.bindings.find(item => item.role === "specialist" && item.taskId === "J11")!;
    const observed = await env.runtime.retrieve(binding, env.operation.workflowRunId!);
    const inspector = (granted: boolean) => createExperimentDispatcher({ database: env.database, runtime: env.runtime,
      config: { ...env.config, m4: { state: "granted", authority: granted ? env.recoveryAuthority : env.authority } }, now: env.now });
    await expect(inspector(true).reconcileRetainedCompletion(env.target, observed)).rejects.toThrow("bounded maintenance");
    const bounded = (action: () => Promise<void>) => withOperationBudget(env.now() + 150_000, action, { now: env.now });
    await expect(bounded(() => inspector(false).reconcileRetainedCompletion(env.target, observed))).rejects.toThrow("exact bounded maintenance proof");
    if (observed.kind !== "execution") throw new Error("Expected execution fixture");
    await expect(bounded(() => inspector(true).reconcileRetainedCompletion(env.target,
      { ...observed, execution: { ...observed.execution, id: id(999) } }))).rejects.toThrow("exact bounded maintenance proof");
    expect(await env.repository.getOperation(env.operation._id)).toEqual(env.operation);
    expect(await env.database.collections.artifact_versions.countDocuments({ sourceOperationId: env.operation._id })).toBe(0);
  }, 120_000);

  it.each(["foreign_asset", "approval", "grant"])("pinned apply rejects %s changes during its authenticated GET before checkpoint", async fault => {
    const env = await supportedRecovery();
    const proof = await env.service.preview(env.target);
    await env.database.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    const originalGet = vi.mocked(env.runtime.retrieve).getMockImplementation()!;
    vi.mocked(env.runtime.retrieve).mockImplementationOnce(async (...args) => {
      const result = await originalGet(...args);
      if (fault === "foreign_asset") {
        const asset = (await env.database.collections.assets.findOne({}))!;
        await env.database.collections.assets.updateOne({ _id: asset._id }, { $set: { metadataJson: '{"proofDrift":true}' } });
      }
      if (fault === "approval") {
        const source = (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J05" }))!;
        await env.database.collections.approvals.deleteOne({ artifactVersionId: source.currentVersionId! });
      }
      if (fault === "grant") env.recoveryAuthority.grant.completionRecoveries[0].reference = "changed-during-read";
      return result;
    });
    const checkpoint = vi.fn();
    await expect(env.service.apply(env.target, proof.previewDigest, checkpoint)).rejects.toThrow("preview_changed");
    expect(checkpoint).not.toHaveBeenCalled();
    expect(await env.repository.getOperation(env.operation._id)).toEqual(env.operation);
    expect(await env.database.collections.artifact_versions.countDocuments({ sourceOperationId: env.operation._id })).toBe(0);
  }, 120_000);

  it.each(["source", "approval", "budget"])("maintenance recovery rejects post-checkpoint %s drift without completion", async fault => {
    const env = await supportedRecovery();
    const proof = await env.service.preview(env.target);
    const starts = vi.mocked(env.runtime.start).mock.calls.length;
    await env.database.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    await expect(env.service.apply(env.target, proof.previewDigest, async () => {
      const source = (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J05" }))!;
      if (fault === "source") await env.database.collections.artifacts.updateOne({ _id: source._id }, { $set: { state: "needs_review" } });
      if (fault === "approval") await env.database.collections.approvals.deleteOne({ artifactVersionId: source.currentVersionId! });
      if (fault === "budget") for (let i = 0; i < 26; i++) env.tick();
    })).rejects.toThrow();
    expect(await env.database.collections.artifact_versions.countDocuments({ sourceOperationId: env.operation._id })).toBe(0);
    expect((await env.repository.getOperation(env.operation._id))?.resultFinalizationClaim).toBeNull();
    expect(env.runtime.start).toHaveBeenCalledTimes(starts);
    expect(env.runtime.stop).not.toHaveBeenCalled();
  }, 120_000);

  it.each(["progress", "lost_commit", "transaction_unknown", "validation", "validation_secondary"] as const)(
    "classifies completion %s without replay or invalidating committed output", async fault => {
      const env = await blockedCompletion();
      await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { status: "running", safeFailure: null } });
      await env.database.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { state: "active" } });
      const before = (await env.repository.getRun(env.runId))!;
      const calls = vi.mocked(env.runtime.start).mock.calls.length;
      const error = fault.startsWith("validation") ? new ExperimentRepositoryError("invalid_result", "private invalid output")
        : Object.assign(new Error("private database failure"), { name: "MongoOperationTimeoutError" });
      const ops = env.database.collections.experiment_operations;
      const update = ops.findOneAndUpdate.bind(ops);
      let armed = false, committed = false;
      vi.spyOn(ops, "findOneAndUpdate").mockImplementation(async (...args) => {
        if ((args[1] as { $set?: { state?: string } }).$set?.state === "succeeded") {
          if (fault === "transaction_unknown" || fault.startsWith("validation")) throw error;
          armed = true;
        }
        return update(...args);
      });
      const start = env.database.client.startSession.bind(env.database.client);
      vi.spyOn(env.database.client, "startSession").mockImplementation(options => {
        const session = start(options); const commit = session.commitTransaction.bind(session);
        vi.spyOn(session, "commitTransaction").mockImplementation(async () => {
          await commit(); if (armed) { armed = false; committed = true; if (fault === "lost_commit") throw error; }
        });
        return session;
      });
      const runs = env.database.collections.experiment_runs;
      const read = runs.findOne.bind(runs), write = runs.updateOne.bind(runs);
      vi.spyOn(runs, "findOne").mockImplementation(async (...args) => {
        if (fault === "progress" && committed && !args[1]?.session) { committed = false; throw error; }
        return read(...args);
      });
      vi.spyOn(runs, "updateOne").mockImplementation(async (...args) => {
        if (fault === "validation_secondary" && (args[1] as { $set?: { safeFailure?: string } }).$set?.safeFailure === "definite_failure") {
          throw new Error("private secondary write failure");
        }
        return write(...args);
      });
      const inspector = createExperimentDispatcher({ database: env.database, config: env.config, runtime: env.runtime,
        now: env.now, store: () => env.store, mutate: async action => action() });
      const observed = inspector.inspect({ runId: env.runId, operationId: env.operation._id });
      if (fault === "lost_commit") await expect(observed).resolves.toMatchObject({ state: "succeeded" });
      else await expect(observed).rejects.toMatchObject({ diagnostic: { stage: fault === "progress" ? "completion_progress" : "completion_transaction",
        code: fault.startsWith("validation") ? "repository_invalid_result" : "completion_failed",
        commitState: fault === "progress" ? "committed" : "uncommitted" } });
      vi.restoreAllMocks();
      const saved = (await env.repository.getOperation(env.operation._id))!;
      const run = (await env.repository.getRun(env.runId))!;
      expect(run.counters).toEqual(before.counters);
      expect(saved.m4Reservation).toEqual(env.operation.m4Reservation);
      expect(env.runtime.start).toHaveBeenCalledTimes(calls);
      if (fault === "progress" || fault === "lost_commit") {
        expect(saved).toMatchObject({ state: "succeeded", resultFinalizationClaim: null });
        expect(run.safeFailure).toBeNull();
        expect(await env.database.collections.artifact_versions.countDocuments({ sourceOperationId: saved._id })).toBe(1);
        expect(await env.repository.blockCompletionFailure(env.input())).toBe(false);
        if (fault === "progress") {
          const versions = env.database.collections.artifact_versions;
          const find = versions.find.bind(versions);
          const retry = vi.spyOn(versions, "find").mockImplementation((...args) => {
            if (args[1]?.projection?.versionNumber === 1 && args[1]?.projection?.artifactId === 1) throw error;
            return find(...args);
          });
          expect(await inspector.advance(env.runId)).toBe("waiting");
          retry.mockRestore();
          expect((await env.repository.getRun(env.runId))!.safeFailure).toBeNull();
          expect(env.runtime.start).toHaveBeenCalledTimes(calls);
          const operations = env.database.collections.experiment_operations;
          const readOperation = operations.findOne.bind(operations);
          let preProgressFailed = false;
          const preProgress = vi.spyOn(operations, "findOne").mockImplementation(async (...args) => {
            if (args[1]?.sort && !(args[0] as { _id?: string })._id) { preProgressFailed = true; throw error; }
            return readOperation(...args);
          });
          expect(await inspector.advance(env.runId)).toBe("waiting");
          expect(preProgressFailed).toBe(true);
          preProgress.mockRestore();
          const runCollection = env.database.collections.experiment_runs;
          const updateRun = runCollection.findOneAndUpdate.bind(runCollection);
          const readRun = runCollection.findOne.bind(runCollection);
          let progressSaved = false, postProgressFailed = false;
          const progressWrite = vi.spyOn(runCollection, "findOneAndUpdate").mockImplementation(async (...args) => {
            const result = await updateRun(...args);
            if ((args[1] as { $set?: { progressOperationId?: string } }).$set?.progressOperationId === saved._id) progressSaved = true;
            return result;
          });
          const postProgress = vi.spyOn(runCollection, "findOne").mockImplementation(async (...args) => {
            if (progressSaved && !args[1]?.session) { progressSaved = false; postProgressFailed = true; throw error; }
            return readRun(...args);
          });
          expect(await inspector.advance(env.runId)).toBe("waiting");
          expect(postProgressFailed).toBe(true);
          progressWrite.mockRestore(); postProgress.mockRestore();
          expect((await env.repository.getRun(env.runId))!.safeFailure).toBeNull();
          expect(env.runtime.start).toHaveBeenCalledTimes(calls);
        }
      } else {
        expect(saved).toMatchObject({ state: fault === "transaction_unknown" ? "unknown" : "started", resultJson: null, resultFinalizationClaim: null });
        expect(run.safeFailure).toBe(fault === "validation" ? "definite_failure" : fault === "transaction_unknown" ? "unknown_outcome" : null);
      }
      expect((await env.database.collections.experiment_campaigns.findOne({ _id: id(1) }))!.state).toBe(["validation", "transaction_unknown"].includes(fault) ? "stopped" : "active");
      if (fault === "progress") {
        const preparation = (await env.repository.getRun(env.runId))!.preparation!;
        expect(preparation).not.toBeNull();
        while (env.now() <= preparation.deadlineAtMs) env.tick();
        expect(await inspector.advance(env.runId)).toBe("blocked");
        expect(await env.repository.getRun(env.runId)).toMatchObject({ status: "blocked", safeFailure: "unknown_outcome",
          preparation: { unresolved: true, outcome: "failed", deadlineAtMs: preparation.deadlineAtMs } });
        expect((await env.repository.getOperation(saved._id))!.state).toBe("succeeded");
        expect(env.runtime.start).toHaveBeenCalledTimes(calls);
        const expired = await env.repository.getRun(env.runId);
        expect(await inspector.advance(env.runId)).toBe("blocked");
        expect(await env.repository.getRun(env.runId)).toEqual(expired);
        await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { safeFailure: "definite_failure" } });
        const definite = await env.repository.getRun(env.runId);
        expect(await inspector.advance(env.runId)).toBe("blocked");
        expect(await env.repository.getRun(env.runId)).toEqual(definite);
        // Reproduce terminal commit followed by lost preparation-cleanup reply.
        await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: {
          status: "completed", safeFailure: null, generationCompletedAtMs: env.now(), evaluationStatus: "complete", preparation,
        } });
        const terminal = (await env.repository.getRun(env.runId))!;
        const campaign = await env.database.collections.experiment_campaigns.findOne({ _id: id(1) });
        await env.database.collections.experiment_operations.updateOne({ _id: saved._id }, { $set: {
          resultFinalizationClaim: { id: "unresolved-owner", expiresAtMs: env.now() + 1000 },
        } });
        expect(await inspector.advance(env.runId)).toBe("boundary");
        expect(await env.repository.getRun(env.runId)).toEqual(terminal);
        await env.database.collections.experiment_operations.updateOne({ _id: saved._id }, { $set: { resultFinalizationClaim: null } });
        const updateTerminal = env.database.collections.experiment_runs.updateOne.bind(env.database.collections.experiment_runs);
        const failedCleanup = vi.spyOn(env.database.collections.experiment_runs, "updateOne").mockImplementation(async (...args) => {
          if ((args[1] as { $set?: { preparation?: unknown } }).$set?.preparation === null) throw error;
          return updateTerminal(...args);
        });
        expect(await inspector.advance(env.runId)).toBe("boundary");
        expect(await env.repository.getRun(env.runId)).toEqual(terminal);
        failedCleanup.mockRestore();
        expect(await inspector.advance(env.runId)).toBe("boundary");
        const cleaned = (await env.repository.getRun(env.runId))!;
        expect(cleaned).toEqual({ ...terminal, revision: terminal.revision + 1, preparation: null });
        expect(await inspector.advance(env.runId)).toBe("boundary");
        expect(await env.repository.getRun(env.runId)).toEqual(cleaned);
        expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toEqual(campaign);
        expect(env.runtime.start).toHaveBeenCalledTimes(calls);
        await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { status: "failed", preparation } });
        const failed = await env.repository.getRun(env.runId);
        expect(await inspector.advance(env.runId)).toBe("blocked");
        expect(await env.repository.getRun(env.runId)).toEqual(failed);
      }
    }, 120_000);

  it.each([false, true])("failed completion cleans only its own claim after budget cancellation (replaced=%s)", async replaced => {
    const env = await blockedCompletion();
    const controller = new AbortController();
    const operations = env.database.collections.experiment_operations;
    const originalFind = operations.findOne.bind(operations);
    const find = vi.spyOn(operations, "findOne").mockImplementationOnce(async () => {
      if (replaced) await operations.updateOne({ _id: env.operation._id }, { $set: {
        resultFinalizationClaim: { id: "successor-owner", expiresAtMs: env.now() + 1000 } } });
      const error = new OperationBudgetExpired(); controller.abort(error); throw error;
    });
    try {
      await expect(withOperationBudget(Date.now() + 60_000, () => env.recovery.completeOperation(env.input()), { signal: controller.signal }))
        .rejects.toThrow("budget expired");
    } finally { find.mockRestore(); }
    const operation = await originalFind({ _id: env.operation._id });
    expect(operation?.resultFinalizationClaim?.id ?? null).toBe(replaced ? "successor-owner" : null);
    expect(operation).toMatchObject({ state: "started", resultJson: null, materializationJson: null });
    expect(await env.repository.getRun(env.runId)).toEqual(env.run);
  }, 120_000);

  it("supported recovery preview is read only and changed retained data changes its proof", async () => {
    const env = await supportedRecovery();
    const calls = vi.mocked(env.runtime.start).mock.calls.length;
    const campaign = await env.database.collections.experiment_campaigns.findOne({ _id: id(1) });
    const before = await env.service.preview(env.target);
    expect(await env.repository.getRun(env.runId)).toEqual(env.run);
    expect(await env.repository.getOperation(env.operation._id)).toEqual(env.operation);
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toEqual(campaign);
    expect(env.runtime.start).toHaveBeenCalledTimes(calls);
    expect(env.runtime.stop).not.toHaveBeenCalled();
    await env.database.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    const getsBeforeUnapplied = vi.mocked(env.runtime.retrieve).mock.calls.length;
    expect(await env.service.verifyUnapplied(env.target, before.previewDigest)).toEqual({ verified: true, outcome: "unapplied", admission: "closed", providerPosts: 0 });
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(getsBeforeUnapplied);
    expect(await env.repository.getRun(env.runId)).toEqual(env.run);
    expect(await env.repository.getOperation(env.operation._id)).toEqual(env.operation);
    const source = (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J05" }))!;
    await env.database.collections.artifacts.updateOne({ _id: source._id }, { $set: { updatedAtMs: source.updatedAtMs + 1 } });
    await expect(env.service.verifyUnapplied(env.target, before.previewDigest)).rejects.toThrow("state_changed");
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(getsBeforeUnapplied);
    const changed = await env.service.preview(env.target, true);
    expect(changed.previewDigest).not.toBe(before.previewDigest);
    await env.database.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    const checkpoint = vi.fn();
    await expect(env.service.apply(env.target, before.previewDigest, checkpoint)).rejects.toThrow("preview_changed");
    expect(checkpoint).not.toHaveBeenCalled();
    expect(await env.repository.getOperation(env.operation._id)).toEqual(env.operation);
    expect(env.runtime.start).toHaveBeenCalledTimes(calls);
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $inc: { revision: 1 } });
    await expect(env.service.preview(env.target)).rejects.toThrow("revision_changed");
  }, 120_000);

  it.each(["missing", "null"] as const)("supported claim release restores the exact %s representation without provider work", async restoreAs => {
    const env = await supportedRecovery();
    await env.database.collections.experiment_operations.updateOne({ _id: env.operation._id }, restoreAs === "null"
      ? { $set: { resultFinalizationClaim: null } } : { $unset: { resultFinalizationClaim: "" } });
    const before = await env.service.preview(env.target);
    const gets = vi.mocked(env.runtime.retrieve).mock.calls.length;
    const starts = vi.mocked(env.runtime.start).mock.calls.length;
    await env.database.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    const claim = { id: "interrupted-owner", expiresAtMs: env.now() - 1 };
    await env.database.collections.experiment_operations.updateOne({ _id: env.operation._id }, { $set: { resultFinalizationClaim: claim } });
    const proof = await env.service.previewClaimRelease(env.target, before.snapshot);
    expect(proof.restoreAs).toBe(restoreAs);
    const checkpoint = vi.fn();
    expect(await env.service.applyClaimRelease(env.target, before.snapshot, proof.previewDigest, checkpoint)).toMatchObject({
      verified: true, outcome: "claim_released", accounting: "preserved", admission: "closed", providerPosts: 0 });
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(await env.service.verifyClaimRelease(env.target, before.snapshot)).toMatchObject({ verified: true });
    expect(await env.service.verifyUnapplied(env.target, before.previewDigest)).toMatchObject({ verified: true });
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(gets);
    expect(env.runtime.start).toHaveBeenCalledTimes(starts);
    expect(env.runtime.stop).not.toHaveBeenCalled();
    expect(await env.repository.getRun(env.runId)).toEqual(env.run);
  }, 120_000);

  it("supported claim release rejects active ownership, retained output and any preservation drift", async () => {
    const env = await supportedRecovery();
    const before = await env.service.preview(env.target);
    await env.database.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    const ops = env.database.collections.experiment_operations;
    const claim = { id: "interrupted-owner", expiresAtMs: env.now() - 1 };
    await ops.updateOne({ _id: env.operation._id }, { $set: { resultFinalizationClaim: { ...claim, expiresAtMs: env.now() + 1000 } } });
    await expect(env.service.previewClaimRelease(env.target, before.snapshot)).rejects.toThrow("claim_not_releasable");
    await ops.updateOne({ _id: env.operation._id }, { $set: { resultFinalizationClaim: claim, resultJson: "retained-output" } });
    await expect(env.service.previewClaimRelease(env.target, before.snapshot)).rejects.toThrow("unsupported_operation");
    await ops.updateOne({ _id: env.operation._id }, { $set: { resultJson: null } });
    const artifact = (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J05" }))!;
    const source = (await env.database.collections.artifact_versions.findOne({ _id: artifact.currentVersionId! }))!;
    await env.database.collections.artifact_versions.updateOne({ _id: source._id }, { $set: { contentJson: "changed-source" } });
    await expect(env.service.previewClaimRelease(env.target, before.snapshot)).rejects.toThrow("claim_not_only_change");
    await env.database.collections.artifact_versions.replaceOne({ _id: source._id }, source);
    const approval = (await env.database.collections.approvals.findOne({ artifactVersionId: source._id }))!;
    await env.database.collections.approvals.updateOne({ _id: approval._id }, { $set: { state: "revoked" } } as never);
    await expect(env.service.previewClaimRelease(env.target, before.snapshot)).rejects.toThrow("claim_not_only_change");
    await env.database.collections.approvals.replaceOne({ _id: approval._id }, approval);
    const campaign = (await env.database.collections.experiment_campaigns.findOne({ _id: id(1) }))!;
    await env.database.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $inc: { reservedMicrodollars: 1 } });
    await expect(env.service.previewClaimRelease(env.target, before.snapshot)).rejects.toThrow("claim_not_only_change");
    await env.database.collections.experiment_campaigns.replaceOne({ _id: id(1) }, campaign);
    const proof = await env.service.previewClaimRelease(env.target, before.snapshot);
    await expect(env.service.applyClaimRelease(env.target, before.snapshot, proof.previewDigest, async () => {
      await ops.updateOne({ _id: env.operation._id }, { $set: { resultFinalizationClaim: { ...claim, id: "successor-owner" } } });
    })).rejects.toThrow("preview_changed");
    expect((await env.repository.getOperation(env.operation._id))?.resultFinalizationClaim?.id).toBe("successor-owner");
  }, 120_000);

  it.each(["MongoOperationTimeoutError", "OperationBudgetExpired"])("supported recovery identifies %s without mutation or remote replay", async (errorKind) => {
    const env = await supportedRecovery();
    const calls = vi.mocked(env.runtime.start).mock.calls.length;
    const gets = vi.mocked(env.runtime.retrieve).mock.calls.length;
    const originalFind = env.database.collections.experiment_operations.find.bind(env.database.collections.experiment_operations);
    const read = vi.spyOn(env.database.collections.experiment_operations, "find").mockImplementation((...args) => {
      if (!args[0] || Object.keys(args[0]).length === 0) {
        throw Object.assign(new Error("private database details"), { name: errorKind });
      }
      return originalFind(...args);
    });
    try {
      await expect(env.service.preview(env.target)).rejects.toMatchObject({
        code: "inspection_or_verification_failed", stage: "snapshot.experiment_operations", errorKind,
      });
      expect(await env.repository.getRun(env.runId)).toEqual(env.run);
      expect(await env.repository.getOperation(env.operation._id)).toEqual(env.operation);
      expect(env.runtime.start).toHaveBeenCalledTimes(calls);
      expect(env.runtime.retrieve).toHaveBeenCalledTimes(gets);
    } finally { read.mockRestore(); }
  }, 120_000);

  it("supported recovery rechecks revision after its durable checkpoint", async () => {
    const env = await supportedRecovery();
    const proof = await env.service.preview(env.target);
    const calls = vi.mocked(env.runtime.start).mock.calls.length;
    await env.database.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    await expect(env.service.apply(env.target, proof.previewDigest, async () => {
      await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $inc: { revision: 1 } });
    })).rejects.toThrow("revision_changed");
    expect(await env.repository.getOperation(env.operation._id)).toEqual(env.operation);
    expect(await env.database.collections.artifact_versions.countDocuments({ sourceOperationId: env.operation._id })).toBe(0);
    expect(env.runtime.start).toHaveBeenCalledTimes(calls);
  }, 120_000);

  it("supported recovery preserves charges and bytes, then verifies duplicate completion without provider dispatch", async () => {
    const env = await supportedRecovery();
    // Cross page boundaries with historical rows using the real MongoDB cursor.
    await env.database.collections.assets.insertMany(Array.from({ length: 600 }, (_, index) => ({
      _id: `retained-${String(index).padStart(4, "0")}`, bookletId: null, kind: "font", uri: `_seed/retained-${index}`,
      mimeType: "font/ttf", width: null, height: null, sourceAssetId: null, metadataJson: null, createdAtMs: env.now(),
    })));
    const calls = vi.mocked(env.runtime.start).mock.calls.length;
    const before = await env.service.preview(env.target);
    const campaign = (await env.database.collections.experiment_campaigns.findOne({ _id: id(1) }))!;
    const bytes = [...env.store.files.entries()];
    await env.database.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    await env.service.preview(env.target, true);
    const assetReads = vi.spyOn(env.database.collections.assets, "find");
    const checkpoint = vi.fn(async proof => { expect(proof.snapshot).toEqual(before.snapshot); });
    const applied = await env.service.apply(env.target, before.previewDigest, checkpoint);
    expect(applied.snapshot).toEqual(before.snapshot);
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(await env.service.verifyCompleted(env.target, before.snapshot)).toMatchObject({ verified: true, outcome: "completed", accounting: "preserved", admission: "closed", providerPosts: 0 });
    // One complete post-GET snapshot against pinned preview and one post-write
    // verification snapshot, three pages each. No preservation rows omitted.
    expect(assetReads.mock.calls.filter(([, options]) => options?.batchSize === 256)).toHaveLength(6);
    assetReads.mockRestore();
    const savedRun = await env.repository.getRun(env.runId);
    const savedOperation = await env.repository.getOperation(env.operation._id);
    const getsAfterCommit = vi.mocked(env.runtime.retrieve).mock.calls.length;
    await expect(env.service.verifyUnapplied(env.target, before.previewDigest)).rejects.toThrow();
    expect(env.runtime.retrieve).toHaveBeenCalledTimes(getsAfterCommit);
    expect(savedRun).toMatchObject({ status: "paused", pauseRequested: true, counters: env.run.counters, activeOperationId: null });
    expect(savedOperation).toMatchObject({ state: "succeeded", deadlineAtMs: env.operation.deadlineAtMs, m4Reservation: env.operation.m4Reservation });
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ state: "active", requests: campaign.requests,
      settledMicrodollars: campaign.settledMicrodollars, reservedMicrodollars: campaign.reservedMicrodollars });
    await env.service.verifyCompleted(env.target, before.snapshot);
    expect(await env.repository.getRun(env.runId)).toEqual(savedRun);
    expect(await env.repository.getOperation(env.operation._id)).toEqual(savedOperation);
    expect(await env.database.collections.artifact_versions.countDocuments({ sourceOperationId: env.operation._id })).toBe(1);
    expect([...env.store.files.entries()]).toEqual(bytes);
    expect(env.runtime.start).toHaveBeenCalledTimes(calls);
    expect(env.runtime.stop).not.toHaveBeenCalled();
  }, 120_000);

  it("requires exact authority and current sources, then saves the original expired result once without another request", async () => {
    const env = await blockedCompletion();
    const beforeCampaign = (await env.database.collections.experiment_campaigns.findOne({ _id: id(1) }))!;
    expect(beforeCampaign.state).toBe("stopped");
    const beforeCalls = vi.mocked(env.runtime.start).mock.calls.length;
    const beforeHistory = await env.repository.listOperations(env.runId);
    const beforeAssets = [...env.store.files.entries()];
    const beforeVersions = await env.database.collections.artifact_versions.find({}).sort({ _id: 1 }).toArray();
    const beforeApprovals = await env.database.collections.approvals.find({}).sort({ _id: 1 }).toArray();
    await expect(env.repository.completeOperation(env.input())).rejects.toThrow();
    const wrong = createExperimentRepository(env.database, { m4Authority: { ...env.recoveryAuthority,
      grant: { ...env.recoveryAuthority.grant, completionRecoveries: [{ ...env.permission, operationId: id(999) }] } },
      m4ExecutionEnabled: true, store: () => env.store });
    await expect(wrong.completeOperation(env.input())).rejects.toThrow();
    expect(env.operation.lifecycle?.stop).toBeUndefined();
    await env.database.collections.experiment_operations.updateOne({ _id: env.operation._id }, { $set: {
      "lifecycle.stop": { requestedAtMs: env.now(), reason: "manual", delivery: "acknowledged" },
    } });
    await expect(env.recovery.completeOperation(env.input())).rejects.toThrow(/definite blocker/);
    expect(await env.repository.getRun(env.runId)).toEqual(env.run);
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toEqual(beforeCampaign);
    await env.database.collections.experiment_operations.updateOne({ _id: env.operation._id }, { $unset: { "lifecycle.stop": "" } });
    const conflicting = structuredClone(env.input());
    if (conflicting.envelope.result.kind !== "proposal") throw new Error("Expected saved J11 proposal");
    (conflicting.envelope.result.payload.content as { title: string }).title = "Conflicting callback output";
    await expect(env.recovery.completeOperation(conflicting)).rejects.toThrow(/retained provider evidence/);
    const source = (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J05" }))!;
    await env.database.collections.artifacts.updateOne({ _id: source._id }, { $set: { state: "needs_review" } });
    await expect(env.recovery.completeOperation(env.input())).rejects.toThrow();
    expect(await env.database.collections.artifact_versions.countDocuments({ sourceOperationId: env.operation._id })).toBe(0);
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toEqual(beforeCampaign);
    expect(await env.repository.getRun(env.runId)).toEqual(env.run);
    await env.database.collections.artifacts.updateOne({ _id: source._id }, { $set: { state: source.state } });
    // Accounting is checked after transaction-local materialization/reopening.
    // A mismatch must roll back both, not expose a runnable partial recovery.
    await env.database.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $inc: { settledMicrodollars: 1 } });
    await expect(env.recovery.completeOperation(env.input())).rejects.toThrow(/attributable accounting/);
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) }))
      .toEqual({ ...beforeCampaign, settledMicrodollars: beforeCampaign.settledMicrodollars + 1 });
    expect(await env.database.collections.artifact_versions.countDocuments({ sourceOperationId: env.operation._id })).toBe(0);
    expect(await env.repository.getRun(env.runId)).toEqual(env.run);
    expect(await env.repository.getOperation(env.operation._id)).not.toHaveProperty("m4CompletionRecovery");
    await env.database.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { settledMicrodollars: beforeCampaign.settledMicrodollars } });
    while (env.now() <= env.operation.deadlineAtMs!) env.tick();
    const dispatcher = createExperimentDispatcher({ database: env.database,
      config: { ...env.config, m4: { state: "granted", authority: env.recoveryAuthority } }, runtime: env.runtime,
      now: env.now, mutate: async (action) => action(), store: () => env.store, uploadReference: env.uploadReference });
    await dispatcher.inspect({ runId: env.runId, operationId: env.operation._id, expectedRevision: env.run.revision });
    const saved = (await env.repository.getOperation(env.operation._id))!;
    expect(saved).toMatchObject({ state: "succeeded", reservationCount: 1, deadlineAtMs: env.operation.deadlineAtMs,
      m4Preparation: env.operation.m4Preparation, m4Observation: env.operation.m4Observation,
      m4Reservation: env.operation.m4Reservation,
      m4CompletionRecovery: { reference: env.permission.reference, evidenceDigest: env.operation.m4Observation!.evidenceDigest,
        requestDigest: env.operation.m4Preparation!.requestDigest, recoveredAtMs: env.now() } });
    const recoveredRun = (await env.repository.getRun(env.runId))!;
    expect(recoveredRun).toMatchObject({ status: "paused", pauseRequested: true, activeOperationId: null, counters: env.run.counters });
    const campaign = (await env.database.collections.experiment_campaigns.findOne({ _id: id(1) }))!;
    expect(campaign).toMatchObject({ state: "active", requests: beforeCampaign.requests, requestCounts: beforeCampaign.requestCounts,
      settledMicrodollars: beforeCampaign.settledMicrodollars, reservedMicrodollars: beforeCampaign.reservedMicrodollars });
    expect(await env.database.collections.artifact_versions.find({ _id: { $in: beforeVersions.map(v => v._id) } }).sort({ _id: 1 }).toArray()).toEqual(beforeVersions);
    expect(await env.database.collections.approvals.find({ _id: { $in: beforeApprovals.map(a => a._id) } }).sort({ _id: 1 }).toArray()).toEqual(beforeApprovals);
    expect([...env.store.files.entries()]).toEqual(beforeAssets);
    await withMongoTransaction(env.database, session => verifyM4Accounting(env.database, session, recoveredRun));
    await dispatcher.inspect({ runId: env.runId, operationId: env.operation._id, expectedRevision: recoveredRun.revision });
    expect(await env.repository.getOperation(env.operation._id)).toEqual(saved);
    expect(await env.repository.getRun(env.runId)).toEqual(recoveredRun);
    expect(await env.database.collections.artifact_versions.countDocuments({ sourceOperationId: env.operation._id })).toBe(1);
    expect(await env.repository.listOperations(env.runId)).toHaveLength(beforeHistory.length);
    expect(env.runtime.start).toHaveBeenCalledTimes(beforeCalls);
    expect(env.runtime.stop).not.toHaveBeenCalled();
    const resumed = await env.recovery.resume({ runId: env.runId, expectedRevision: recoveredRun.revision, nowMs: env.now() });
    expect(resumed).toMatchObject({ status: "queued", pauseRequested: false, counters: env.run.counters });
    expect(env.runtime.start).toHaveBeenCalledTimes(beforeCalls);
  }, 120_000);

  it("keeps the ordinary definite-blocker guard for a non-J11 operation even with an exact completion grant", async () => {
    const env = await blockedCompletion("J01");
    await expect(env.recovery.completeOperation(env.input())).rejects.toThrow();
    expect(await env.repository.getRun(env.runId)).toEqual(env.run);
    expect(await env.repository.getOperation(env.operation._id)).toMatchObject({ state: "started", resultJson: null, reservationCount: 1 });
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ state: "stopped" });
  }, 120_000);
});

describe("supported recovery Mongo inspection", () => {
  it("distinguishes absent, null and failed preparations and excludes only the exact target pair", async () => {
    const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
    await database.collections.deployment_control.insertOne({ _id: "environment:_staging", schemaVersion: "1", environment: "_staging",
      maintenance: true, activeMutations: 0, reason: null, updatedAtMs: Date.now() });
    // Deliberately minimal historical rows exercise Mongo's missing/null behavior.
    const runs = database.database.collection("experiment_runs");
    await runs.insertMany([
      { _id: "absent", status: "failed" }, { _id: "null", status: "failed", preparation: null },
      { _id: "failed", status: "failed", preparation: { outcome: "failed", unresolved: false } },
      { _id: "unresolved", status: "blocked", preparation: { outcome: "failed", unresolved: true } },
      { _id: "pending", status: "blocked", preparation: { ownerId: "owner" } },
      { _id: "target-run", status: "blocked", activeOperationId: "target-op", safeFailure: "unknown_outcome" },
      { _id: "other-run", status: "blocked", activeOperationId: "target-op", safeFailure: "unknown_outcome" },
    ].map((row) => ({ ...row, bookletId: `booklet-${row._id}` })) as never);
    await database.database.collection("experiment_operations").insertMany([
      { _id: "target-op", runId: "target-run", state: "started" },
      { _id: "other-op", runId: "target-run", state: "started" },
      { _id: "expired-claim", runId: "other-run", state: "failed", role: "specialist", taskId: "J11",
        resultFinalizationClaim: { id: "private-claim", expiresAtMs: 1 }, resultJson: "private-result", materializationJson: null,
        m4CompletionRecovery: { private: "private-recovery" } },
    ].map((row) => ({ ...row, idempotencyKey: `key-${row._id}` })) as never);
    const report = await inspectRecoveryWork(database, { environment: "_staging", validatedTargets: [{ runId: "target-run", operationId: "target-op" }] });
    expect(report.outcome).toBe("blocked");
    expect(report.blockers.map(({ code, count, ids }) => ({ code, count, ids }))).toEqual([
      { code: "preparations", count: 2, ids: ["pending", "unresolved"] },
      { code: "unresolved_runs", count: 1, ids: ["other-run"] },
      { code: "operations", count: 2, ids: ["expired-claim", "other-op"] },
    ]);
    expect(report.blockers.find(({ code }) => code === "operations")?.operations).toEqual([
      { id: "expired-claim", runId: "other-run", state: "failed", role: "specialist", taskId: "J11",
        claims: [{ kind: "resultFinalizationClaim", expired: true }], hasResult: true, hasMaterialization: false, hasRecovery: true },
      { id: "other-op", runId: "target-run", state: "started", role: "unavailable", taskId: "unavailable",
        claims: [], hasResult: false, hasMaterialization: false, hasRecovery: false },
    ]);
    expect(JSON.stringify(report)).not.toContain("private");
    const page = await inspectRecoveryWork(database, { environment: "_staging", validatedTargets: [{ runId: "target-run", operationId: "target-op" }], page: 1, limit: 1 });
    expect(page.blockers.find(({ code }) => code === "operations")).toMatchObject({ count: 2, ids: ["other-op"], hasMore: false });
  });
});
