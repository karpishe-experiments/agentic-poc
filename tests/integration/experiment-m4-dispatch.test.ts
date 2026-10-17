import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { withMongoTransaction, type Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
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
import { recentDiagnostics } from "@/lib/experiment-runner/diagnostics";

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
