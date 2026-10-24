import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { withMongoTransaction, type Database } from "@/db/client";
import { createExperimentRepository, ExperimentRepositoryError } from "@/db/experiment-repository";
import { verifyM4Accounting } from "@/db/experiment-m4-accounting";
import { createExperimentCompletionService } from "@/db/experiment-completion";
import { hasM4KnownFailure } from "@/db/experiment-provider-failure";
import type { AssetStore } from "@/lib/assets/asset-store";
import { CASES, specialistTaskSchema } from "@/lib/contracts/experiment-runner";
import { configurationSnapshot, readBookletRunnerConfig, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";
import { m4ModelOutputSchema, m4RequestBundleHash, type M4RequestSelector } from "@/lib/experiment-runner/m4-request";
import * as m4Request from "@/lib/experiment-runner/m4-request";
import * as textPreparation from "@/db/experiment-text-preparation";
import { createExperimentImageStorage } from "@/lib/experiment-runner/image-storage";
import { simulatedExperimentReport } from "@/lib/experiment-runner/report-fixtures";
import type { ReferenceUploadResult } from "@/lib/experiment-runner/reference-transport";
import type { RuntimeExecution, WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";
import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";
import manifest from "@/lib/experiment-runner/m4-campaign-manifest.json";
import { loadPublishedRehearsal, publishedReturn } from "@/tests/helpers/m4-published-rehearsal";
import { type M4Grant, m4PolicySchema } from "@/lib/experiment-runner/m4-policy";
import { m4ObservedRoleResult } from "@/lib/experiment-runner/m4-observed-result";
import { recentDiagnostics } from "@/lib/experiment-runner/diagnostics";
import { createBookletRecovery } from "@/lib/operations/booklet-recovery";
import { inspectRecoveryWork } from "@/lib/operations/recovery-inspection";
import { OperationBudgetExpired, withOperationBudget } from "@/lib/operations/budget";
import { initializeMongoData } from "@/db/initialize";
import { verifyDeploymentState } from "@/db/deployment-readiness";
import { checkProbeReadiness } from "@/lib/experiment-runner/probe-preflight";
import { verifyMongoStructure } from "@/db/setup";
import { LEGACY_COUNT_PLUGIN_IDENTITY, LEGACY_COUNT_GUARD_SOURCE_SHA256 } from "@/lib/experiment-runner/m4-legacy-count-failure";

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

async function setup(amended = false, legacyCount = false, persona: "playful_kid" | "enthusiast_parent" | "professional_creator" = "playful_kid",
  reportFailure?: "tester" | "judge" | "count", shared?: {
    database: Database; store: MemoryStore; runId: string; bookletId: string; grant: M4Grant; skipCreate?: boolean;
  }) {
  const published = process.env.M4_PUBLICATION_REHEARSAL === "1" ? await loadPublishedRehearsal() : null;
  const phases: { operationId: string; role: string; report: boolean; publicationId: string; authorizationBytes: number; resultBytes: number; authorizationMs: number; decodeReturnMs: number }[] = [];
  const database = shared?.database ?? await createTestDatabase({ seedAgents: false });
  if (!shared) databases.push(database);
  const policy = m4PolicySchema.parse({ ...m4TestPolicy(), requestDefinitionHash: amended ? "a".repeat(64) : m4RequestBundleHash(),
    ...(legacyCount ? { pluginIdentity: LEGACY_COUNT_PLUGIN_IDENTITY } : {}),
    ...(published ? { publications: manifest.policy.publications, pluginIdentity: manifest.policy.pluginIdentity } : {}) });
  const authority = { policy, grant: shared?.grant ?? { campaignId: id(1), reference: "offline-dispatch-fixture-only",
    ...(reportFailure === "count" ? { providerAdapterUpdate: { fromIdentity: policy.pluginIdentity, version: "1.0.7-dev3" as const,
      packageSha256: "b".repeat(64), reference: "offline-count-fixture-only" } } : {}),
    ...(amended ? { requestDefinitionUpdate: { fromBundleHash: policy.requestDefinitionHash,
      toBundleHash: m4RequestBundleHash(), reference: "prior-reviewed-amendment" } } : {}) } };
  const store = shared?.store ?? new MemoryStore();
  const repository = createExperimentRepository(database, { m4Authority: authority, m4ExecutionEnabled: true, store: () => store });
  const context = createExperimentContextService(database, { store: () => store });
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid", callbackKey: "fixture",
    m4: { state: "granted", authority },
    bindings: policy.publications.map((p) => ({ ...p, taskId: specialistTaskSchema.nullable().parse(p.taskId), apiKey: "fake-key" })) };
  const runId = shared?.runId ?? id(10), bookletId = shared?.bookletId ?? id(11); let clock = Date.now();
  // Earlier personas are admission-only fixture records; this isolated test
  // executes every generation and evaluation operation of the selected persona.
  for (const [index, priorPersona] of (["playful_kid", "enthusiast_parent"] as const).entries()) {
    if (shared || priorPersona === persona) break;
    const prior = await repository.createRun({ runId: id(20 + index), bookletId: id(30 + index), persona: priorPersona,
      mode: "balanced", campaignId: id(1), configuration: configurationSnapshot(config, priorPersona), nowMs: clock });
    await database.collections.experiment_runs.updateOne({ _id: prior._id }, { $set: {
      status: "completed", evaluationStatus: "complete", generationCompletedAtMs: clock,
    } });
  }
  if (!shared?.skipCreate) await repository.createRun({ runId, bookletId, persona, mode: "balanced", campaignId: id(1),
    configuration: configurationSnapshot(config, persona), nowMs: clock });
  const saved = new Map<string, RuntimeExecution>();
  let pending = false, badCreative = false, badLayout = false, incompleteLayout = false;
  let blockCompletionTask: string | null = null;
  let blockManagerPageBible = false;
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
      if (legacyCount && binding.role === "manager" && (await repository.getRun(runId))!.counters.logicalImage === 7) {
        legacyCount = false;
        saved.set(workflowRunId, { ...running, status: "failed", outputs: null,
          legacyCountFailure: { code: "legacy_input_count_guard", totalTokens: 0 } });
        return { kind: "accepted", execution: running };
      }
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
      const selector = { role: binding.role, taskId: binding.taskId, persona, report: "reportEvidence" in roleContext } as M4RequestSelector;
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
      const layoutSubjects = binding.taskId === "J11" && JSON.parse(operation.m4Preparation!.contextJson).layoutContract === m4Request.M4_LAYOUT_CONTRACT;
      if (layoutSubjects) {
        const output = creative as { result: { kind: string; payload: { content: { pages: Array<{ panels: Array<Record<string, unknown>> }> } } } };
        if (output.result.kind === "proposal") for (const page of output.result.payload.content.pages) for (const panel of page.panels) {
          panel.sheetSubjects = (panel.sheetReferences as Array<{ subjectKind: string; subjectId: string }>).map(({ subjectKind, subjectId }) => ({ subjectKind, subjectId }));
          delete panel.sheetReferences;
        }
      }
      let content = JSON.stringify(m4ModelOutputSchema(selector, layoutSubjects).parse(creative));
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
      if (isReport && binding.role === reportFailure) {
        wrapper.content = '{"report":null}';
        output = JSON.stringify(wrapper);
      }
      if (isReport && binding.role === "tester" && reportFailure === "count") {
        output = JSON.stringify({ schemaVersion: "booklet_pre_generation_failure_v1", content: "", failureEvidence: {
          provider: "openai", apiBaseUrl: "https://api.openai.com/v1", adapterVersion: "1.0.7-dev3",
          stdioSdk: wrapper.providerEvidence.stdioSdk, model: "gpt-6-luna", serviceTier: "default",
          requestDigest: operation.m4Preparation!.requestDigest, stage: "input_count", code: "input_limit_exceeded",
          countedInputTokens: 39891, limit: 32000, generationStarted: false, elapsedMs: 100, countRequestId: "count_fixture",
        } });
      }
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
      if (blockManagerPageBible && _binding.role === "manager" && typeof execution.outputs?.booklet_provider_result === "string") {
        const result = JSON.parse(JSON.parse(execution.outputs.booklet_provider_result).content).result;
        if (result?.kind === "delegate" && result.payload?.taskId === "J12" && result.payload?.subjectKind === "page") {
          blockManagerPageBible = false;
          await repository.blockRun({ runId, category: "definite_failure", nowMs: clock });
        }
      }
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
    blockManagerPageBible: () => { blockManagerPageBible = true; },
    badLayout: (value: boolean) => { badLayout = value; }, incompleteLayout: (value: boolean) => { incompleteLayout = value; } };
}

describe("offline Balanced dispatcher", () => {
  it("recovers a claimed count failure, delivers readiness and completes the same Kid without replay", async () => {
    const env = await setup(false, true);
    for (let step = 0; step < 120; step++) {
      await env.dispatcher.advance(env.runId);
      if ((await env.repository.getRun(env.runId))!.status === "blocked") break;
      env.tick();
    }
    const blocked = (await env.repository.getRun(env.runId))!;
    expect(blocked).toMatchObject({ status: "blocked", safeFailure: "unknown_outcome", counters: { logicalImage: 7 } });
    const failed = (await env.repository.getOperation(blocked.activeOperationId!))!;
    expect(failed.m4Reservation?.unsettledMicrodollars).toBe(failed.m4Reservation?.maximumMicrodollars);
    // Retained history must not enter this closure or normal readiness. These
    // unrelated terminal rows hold much larger contexts than the target request.
    await env.database.collections.experiment_operations.insertMany(Array.from({ length: 80 }, (_, index) => ({ ...failed,
      _id: id(5000 + index), runId: id(4999), idempotencyKey: `retained-large-${index}`, state: "failed" as const,
      lifecycle: { ...failed.lifecycle!, phase: "finished" as const, unresolved: false },
      m4Reservation: undefined, m4Preparation: { ...failed.m4Preparation!, requestJson: "x".repeat(300000), contextJson: "y".repeat(300000) },
    })));
    const authority = { ...env.authority, grant: { ...env.authority.grant,
      continuations: [{ runId: env.runId, operationId: failed._id, reference: "explicit legacy fixture continuation" }],
      preGenerationRecoveries: [{ runId: env.runId, operationId: failed._id, workflowRunId: failed.workflowRunId!,
        publishedWorkflowId: failed.verifiedWorkflowId!, pluginIdentity: LEGACY_COUNT_PLUGIN_IDENTITY,
        guardSourceSha256: LEGACY_COUNT_GUARD_SOURCE_SHA256, nodeTraceDigest: "e".repeat(64), reference: "reviewed retained fixture trace" }] } };
    while (env.now() <= failed.deadlineAtMs!) env.tick();
    await env.database.collections.experiment_operations.updateOne({ _id: failed._id }, { $set: {
      "lifecycle.stop": { requestedAtMs: failed.deadlineAtMs! - 29_006, reason: "deadline", delivery: "acknowledged" },
      "lifecycle.timeoutAtMs": failed.deadlineAtMs! - 29_005,
    } });
    await env.database.collections.deployment_control.insertOne({ _id: "environment:_staging", schemaVersion: "1", environment: "_staging",
      maintenance: true, draining: false, activeMutations: 0, mutationOwners: [], interruptedMutations: 0, reason: "fixture delivery", updatedAtMs: env.now() });
    const config = { ...env.config, m4: { state: "granted" as const, authority } };
    const service = createBookletRecovery({ database: env.database, config, runtime: env.runtime, store: () => env.store, now: env.now });
    const target = { runId: env.runId, operationId: failed._id, expectedRevision: blocked.revision };
    const starts = vi.mocked(env.runtime.start).mock.calls.length;
    const preview = await service.preview(target, true);
    expect(preview.snapshot.scope).toBe("pre-generation-target-v1");
    await withOperationBudget(env.now() + 150_000, () => service.apply(target, preview.previewDigest, async () => {}), { now: env.now });
    expect(await service.verifyCompleted(target, preview.snapshot)).toMatchObject({ verified: true, outcome: "failure_closed" });
    // Lost acknowledgement after commit is resolved by verification, not replay.
    expect(await service.verifyCompleted(target, preview.snapshot)).toMatchObject({ verified: true, outcome: "failure_closed" });
    expect(env.runtime.start).toHaveBeenCalledTimes(starts);
    for (const [key, value] of Object.entries({ DEPLOYMENT_ENV: "_staging", RUNNER_ENABLED: "false", DIFY_BOOKLET_RUNNER_ENABLED: "true",
      DIFY_BOOKLET_BASE_URL: config.baseUrl, DIFY_BOOKLET_PUBLIC_ORIGIN: config.publicOrigin, DIFY_BOOKLET_TOOL_KEY: "x".repeat(32),
      DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(config.bindings) })) vi.stubEnv(key, value);
    try {
      await initializeMongoData(env.database, env.store);
      await verifyDeploymentState(env.database, env.store);
      await env.database.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: false } });
      const manager = config.bindings.find(binding => binding.role === "manager")!;
      expect(await checkProbeReadiness(env.database, config, { appId: manager.appId, publication: manager.publishedWorkflowId })).toMatchObject({ ready: true });
      const repository = createExperimentRepository(env.database, { m4Authority: authority, m4ExecutionEnabled: true, store: () => env.store });
      const paused = (await repository.getRun(env.runId))!;
      await repository.resume({ runId: env.runId, expectedRevision: paused.revision, nowMs: env.now() });
      const dispatcher = createExperimentDispatcher({ database: env.database, config, runtime: env.runtime, now: env.now,
        mutate: async action => action(), store: () => env.store, uploadReference: env.uploadReference });
      for (let step = 0; step < 60; step++) {
        const outcome = await dispatcher.advance(env.runId);
        const run = (await repository.getRun(env.runId))!;
        expect(outcome, `Same-Kid continuation ${step}: ${run.status}/${run.safeFailure}`).not.toBe("blocked");
        if (run.status === "completed") break;
        env.tick();
      }
      const completed = (await repository.getRun(env.runId))!;
      expect(completed).toMatchObject({ status: "completed", evaluationStatus: "complete", counters: { logicalText: 40, payableText: 40, logicalImage: 9, payableImage: 0, steps: 49 } });
      expect((await repository.getOperation(failed._id))!.m4Reservation).toEqual(failed.m4Reservation);
      expect(vi.mocked(env.runtime.start).mock.calls.filter(([, input]) => input.operationId === failed._id)).toHaveLength(1);
      await withMongoTransaction(env.database, session => verifyM4Accounting(env.database, session, completed));
      const view = (await env.context.getRunView(env.runId))!;
      expect(view.reports).toHaveLength(2); expect(view.reports!.every(report => report.matchesCurrentVersions)).toBe(true);
      expect(view.currentArtifacts.every(artifact => artifact.state === "approved")).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  }, 120_000);
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

  it.each([
    ["playful_kid", "count"], ["playful_kid", "tester"], ["playful_kid", "judge"],
  ] as const)("completes %s generation with advisory %s failure without replay", async (persona, failure) => {
    const env = await setup(false, false, persona, failure);
    let generation: { versions: string[]; at: number; assets: unknown[]; approvals: unknown[] } | undefined;
    for (let step = 0; step < 240; step++) {
      await env.dispatcher.advance(env.runId);
      for (const result of vi.mocked(env.runtime.start).mock.results) await result.value;
      const current = (await env.repository.getRun(env.runId))!;
      if (current.generationCompletedAtMs != null && !generation) {
        generation = { versions: current.generationVersionIds!, at: current.generationCompletedAtMs,
          assets: await env.database.collections.assets.find({ bookletId: env.bookletId }).toArray(),
          approvals: await env.database.collections.approvals.find({ bookletId: env.bookletId }).toArray() };
      }
      if (current.status === "completed" || current.status === "blocked") break;
      env.tick();
    }
    const failedRun = (await env.repository.getRun(env.runId))!;
    const operations = await env.repository.listOperations(env.runId);
    expect(generation, JSON.stringify({ status: failedRun.status, failure: failedRun.safeFailure,
      last: operations.at(-1) && { role: operations.at(-1)!.role, taskId: operations.at(-1)!.taskId,
        state: operations.at(-1)!.state, lifecycle: operations.at(-1)!.lifecycle } })).toBeDefined();
    const failed = operations.find(op => op.state === "failed")!;
    expect(failed).toMatchObject({ role: failure === "count" ? "tester" : failure, safeFailure: "definite_failure",
      lifecycle: { phase: "finished", unresolved: false }, reservationCount: 1 });
    const completion = createExperimentCompletionService(env.database, env.store);
    await env.database.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { state: "stopped" } });
    const before = { operations: structuredClone(operations), campaign: await env.database.collections.experiment_campaigns.findOne({ _id: id(1) }),
      counters: failedRun.counters, calls: vi.mocked(env.runtime.start).mock.calls.length };
    // A retained failure can be finalized through the same service even if the
    // dispatcher has already observed and finalized the terminal result.
    // Emulate a retained pre-correction run, then exercise the existing HTTP
    // Resume control. This must finalize without reopening its stopped campaign.
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: {
      status: "blocked", evaluationStatus: "pending", safeFailure: "definite_failure",
    } });
    const http = createBookletRunnerHttp({ database: () => env.database, config: () => ({ enabled: true, config: env.config }),
      runtime: () => env.runtime, store: () => env.store, mutate: action => action() });
    const response = await http.control(new Request(`https://booklet.invalid/api/experiments/booklet-runs/${env.runId}/resume`, {
      method: "POST", headers: { origin: env.config.publicOrigin }, body: JSON.stringify({ expectedRevision: failedRun.revision, responseMode: "receipt" }),
    }), env.runId, "resume");
    expect(response.status, await response.clone().text()).toBe(200);
    const complete = (await env.repository.getRun(env.runId))!;
    const repeatedResponse = await http.control(new Request(`https://booklet.invalid/api/experiments/booklet-runs/${env.runId}/resume`, {
      method: "POST", headers: { origin: env.config.publicOrigin }, body: JSON.stringify({ expectedRevision: failedRun.revision, responseMode: "receipt" }),
    }), env.runId, "resume");
    expect(repeatedResponse.status, await repeatedResponse.clone().text()).toBe(200);
    expect(await response.json()).toMatchObject({ data: { runId: env.runId, status: "completed", evaluationStatus: "failed", revision: complete.revision } });
    const readback = await http.detail(new Request(`https://booklet.invalid/api/experiments/booklet-runs/${env.runId}?view=control`), env.runId);
    expect(await readback.json()).toEqual(await repeatedResponse.json());
    expect(await env.repository.getRun(env.runId)).toEqual(complete);
    expect(complete).toMatchObject({ status: "completed", evaluationStatus: "failed", activeOperationId: null,
      generationCompletedAtMs: generation!.at, generationVersionIds: generation!.versions, counters: before.counters });
    expect(await env.database.collections.assets.find({ bookletId: env.bookletId }).toArray()).toEqual(generation!.assets);
    expect(await env.database.collections.approvals.find({ bookletId: env.bookletId }).toArray()).toEqual(generation!.approvals);
    expect(await env.repository.listOperations(env.runId)).toEqual(before.operations);
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toEqual(before.campaign);
    expect(operations.filter(op => op.role === "judge")).toHaveLength(failure === "judge" ? 1 : 0);
    if (failure === "count") {
      expect(failed.m4Reservation).toMatchObject({ settledMicrodollars: null,
        unsettledMicrodollars: failed.m4Reservation!.maximumMicrodollars });
      expect(JSON.parse(failed.m4Observation!.evidenceJson!)).toMatchObject({ failureEvidence: { generationStarted: false, countedInputTokens: 39891 } });
    }
    await withMongoTransaction(env.database, session => verifyM4Accounting(env.database, session, complete));
    const repeated = await Promise.all([1, 2].map(() => completion.completeAdvisoryFailure({
      runId: env.runId, expectedRevision: complete.revision, nowMs: env.now() })));
    expect(repeated.map(run => run.revision)).toEqual([complete.revision, complete.revision]);
    await env.dispatcher.advance(env.runId);
    expect(env.runtime.start).toHaveBeenCalledTimes(before.calls);
    // Unknown ownership, active preparations and changed generation evidence
    // cannot use the advisory outcome to bypass verification.
    for (const patch of [{ activeOperationId: failed._id }, { safeFailure: "unknown_outcome" as const },
      { preparation: { ownerId: id(998), startedAtMs: env.now(), deadlineAtMs: env.now() + 10_000 } },
      { generationVersionIds: [id(999)] }]) {
      await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: patch });
      await expect(completion.completeAdvisoryFailure({ runId: env.runId, expectedRevision: complete.revision, nowMs: env.now() })).rejects.toThrow();
      await env.database.collections.experiment_runs.replaceOne({ _id: env.runId }, complete);
    }
    await env.database.collections.experiment_operations.updateOne({ _id: failed._id }, { $set: { "lifecycle.unresolved": true } });
    await expect(completion.completeAdvisoryFailure({ runId: env.runId, expectedRevision: complete.revision, nowMs: env.now() })).rejects.toThrow();
    await env.database.collections.experiment_operations.replaceOne({ _id: failed._id }, failed);
    await env.database.collections.experiment_operations.updateOne({ _id: failed._id }, { $set: {
      authorizationClaim: { id: id(997), expiresAtMs: env.now() + 10_000 },
    } });
    await expect(completion.completeAdvisoryFailure({ runId: env.runId, expectedRevision: complete.revision, nowMs: env.now() })).rejects.toThrow();
    await env.database.collections.experiment_operations.replaceOne({ _id: failed._id }, failed);
    await env.database.collections.deployment_control.insertOne({ _id: "advisory-owner-fixture", environment: "local", schemaVersion: "1",
      maintenance: false, activeMutations: 1, reason: null, updatedAtMs: env.now(),
      mutationOwners: [{ id: id(996), processId: id(995), runId: env.runId, operationId: failed._id, startedAtMs: env.now(), state: "active" }] });
    await expect(completion.completeAdvisoryFailure({ runId: env.runId, expectedRevision: complete.revision, nowMs: env.now() })).rejects.toThrow();
    await env.database.collections.deployment_control.deleteOne({ _id: "advisory-owner-fixture" });
    await expect(completion.completeAdvisoryFailure({ runId: env.runId, expectedRevision: complete.revision + 1, nowMs: env.now() }))
      .rejects.toThrow("revision");
    const [assetUri, originalBytes] = [...env.store.files][0];
    env.store.files.set(assetUri, Uint8Array.of(0));
    await expect(completion.completeAdvisoryFailure({ runId: env.runId, expectedRevision: complete.revision, nowMs: env.now() })).rejects.toThrow();
    env.store.files.set(assetUri, originalBytes);
    expect(env.runtime.start).toHaveBeenCalledTimes(before.calls);
    if (failure === "count") {
      const creation = { runId: id(800), bookletId: id(801), persona: "enthusiast_parent" as const, mode: "balanced" as const,
        campaignId: id(1), configuration: configurationSnapshot(env.config, "enthusiast_parent"), nowMs: env.now() };
      await expect(env.repository.createRun(creation)).rejects.toThrow("not active");
      const authority = { ...env.authority, grant: { ...env.authority.grant, remainingPersonaAdmission: {
        anchorRunId: env.runId, anchorRevision: complete.revision,
        personas: ["enthusiast_parent", "professional_creator"] as ["enthusiast_parent", "professional_creator"], reference: "offline remaining slots grant",
      } } };
      const repository = createExperimentRepository(env.database, { m4Authority: authority, m4ExecutionEnabled: true, store: () => env.store });
      // Expired claims also remain unresolved ownership, and damaged evidence
      // rolls back temporary activation and the persona slot together.
      await env.database.collections.experiment_operations.updateOne({ _id: failed._id }, { $set: { authorizationClaim: { id: id(997), expiresAtMs: 0 } } });
      await expect(repository.createRun(creation)).rejects.toThrow("ownership");
      await env.database.collections.experiment_operations.replaceOne({ _id: failed._id }, failed);
      env.store.files.set(assetUri, Uint8Array.of(0));
      await expect(repository.createRun(creation)).rejects.toThrow();
      env.store.files.set(assetUri, originalBytes);
      expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toEqual(before.campaign);
      const attempts = await Promise.allSettled([repository.createRun(creation), repository.createRun({ ...creation, runId: id(802), bookletId: id(803) })]);
      expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const campaign = (await env.database.collections.experiment_campaigns.findOne({ _id: id(1) }))!;
      expect(campaign).toMatchObject({ state: "active", requests: before.campaign!.requests,
        reservedMicrodollars: before.campaign!.reservedMicrodollars, settledMicrodollars: before.campaign!.settledMicrodollars });
      expect(await repository.getRun(env.runId)).toEqual(complete);
      expect(await repository.listOperations(env.runId)).toEqual(before.operations);
      const winner = attempts.find(result => result.status === "fulfilled") as PromiseFulfilledResult<typeof complete>;
      expect(await repository.createRun({ ...creation, runId: winner.value._id, bookletId: winner.value.bookletId })).toEqual(winner.value);
      expect(env.runtime.start).toHaveBeenCalledTimes(before.calls);
    }
  }, 120_000);

  it.each(["enthusiast_parent", "professional_creator"] as const)("completes %s with the actual bounded manager requests", async persona => {
    const env = await setup(false, false, persona);
    for (let step = 0; step < 280; step++) {
      const outcome = await env.dispatcher.advance(env.runId);
      for (const result of vi.mocked(env.runtime.start).mock.results) await result.value;
      const run = (await env.repository.getRun(env.runId))!;
      expect(outcome, JSON.stringify({ persona, step, status: run.status, failure: run.safeFailure })).not.toBe("blocked");
      if (run.status === "completed") break;
      env.tick();
    }
    const run = (await env.repository.getRun(env.runId))!;
    expect(run).toMatchObject({ status: "completed", generationCompletedAtMs: expect.any(Number), evaluationStatus: "complete", activeOperationId: null });
    const view = (await env.context.getRunView(env.runId))!;
    expect(view.currentArtifacts.every(artifact => artifact.state === "approved")).toBe(true);
    expect(view.currentArtifacts.filter(artifact => artifact.taskId === "J13")).toHaveLength(CASES[persona].storyPages + 1);
    expect(view.reports).toHaveLength(2);
    const operations = await env.repository.listOperations(env.runId);
    for (const operation of operations.filter(operation => operation.role === "manager")) {
      expect(Buffer.byteLength(operation.m4Preparation!.requestJson)).toBeLessThan(16 * 1024);
    }
    await withMongoTransaction(env.database, session => verifyM4Accounting(env.database, session, run));
    const calls = vi.mocked(env.runtime.start).mock.calls.length;
    await env.dispatcher.advance(env.runId);
    expect(env.runtime.start).toHaveBeenCalledTimes(calls);
  }, 120_000);

  it("completes generation with an oversized local advisory request before reservation or provider dispatch", async () => {
    const env = await setup();
    // The fixture advances time between operations, so preparation must use
    // that same clock rather than adding wall-clock time inside one operation.
    const createPreparation = textPreparation.createM4TextPreparation;
    const preparationClock = vi.spyOn(textPreparation, "createM4TextPreparation").mockImplementation((database, authority, options) =>
      createPreparation(database, authority, { ...options, elapsedNow: () => 0 }));
    const original = m4Request.prepareM4Request;
    const prepared = vi.spyOn(m4Request, "prepareM4Request").mockImplementation((...args) => {
      if (args[1].report) {
        const context = JSON.parse(args[2]);
        context.brief = "Full retained creative evidence. ".repeat(6_000);
        return original(args[0], args[1], JSON.stringify(context), args[3], args[4]);
      }
      return original(...args);
    });
    try {
      for (let step = 0; step < 180; step++) {
        await env.dispatcher.advance(env.runId);
        const run = (await env.repository.getRun(env.runId))!;
        if (run.status === "completed" || run.status === "blocked") break;
        env.tick();
      }
      const run = (await env.repository.getRun(env.runId))!;
      expect(run).toMatchObject({ status: "completed", evaluationStatus: "failed", activeOperationId: null });
      expect(run.generationCompletedAtMs).toBeTypeOf("number");
      const operations = await env.repository.listOperations(env.runId);
      const local = operations.find(op => op.localReportFailure)!;
      expect(local).toMatchObject({ role: "tester", state: "failed", reservationCount: 0, workflowRunId: null });
      expect(local.m4Reservation).toBeUndefined();
      expect(operations.filter(op => op.role === "judge")).toHaveLength(0);
      expect(vi.mocked(env.runtime.start).mock.calls.some(([, input]) => input.operationId === local._id)).toBe(false);
      const campaign = await env.database.collections.experiment_campaigns.findOne({ _id: id(1) });
      expect(campaign?.requests).toBe(run.counters.payableText);
      await withMongoTransaction(env.database, session => verifyM4Accounting(env.database, session, run));
      const calls = vi.mocked(env.runtime.start).mock.calls.length;
      await env.dispatcher.advance(env.runId);
      expect(env.runtime.start).toHaveBeenCalledTimes(calls);
    } finally { prepared.mockRestore(); preparationClock.mockRestore(); }
  }, 120_000);

  it("completes all Kid tasks offline with simulated images and freezes each report's own settled cost", async () => {
    const env = await setup();
    const sizes: { role: string; report: boolean; contextBytes: number; requestBytes: number | null; outcome: string }[] = [];
    const prepare = m4Request.prepareM4Request;
    const measured = vi.spyOn(m4Request, "prepareM4Request").mockImplementation((...args) => {
      const row = { role: args[1].role, report: args[1].report, contextBytes: Buffer.byteLength(args[2]), requestBytes: null as number | null, outcome: "failed" };
      sizes.push(row);
      const request = prepare(...args); row.requestBytes = Buffer.byteLength(request.requestJson); row.outcome = "prepared";
      return request;
    });
    try {
    let testerSnapshot: unknown, testerResult: string | null = null;
    for (let step = 0; step < 120; step++) {
      const outcome = await env.dispatcher.advance(env.runId);
      // Surface fixture assertions that the dispatcher correctly converts into
      // uncertain dispatch, rather than hiding their cause behind "blocked".
      for (const result of vi.mocked(env.runtime.start).mock.results) await result.value;
      const run = (await env.repository.getRun(env.runId))!;
      expect(outcome, `Offline step ${step}: ${run.status}/${run.safeFailure}; request ${JSON.stringify(sizes.at(-1))}`).not.toBe("blocked");
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
    } finally {
      measured.mockRestore();
      writeFileSync("output/m4-kid-request-sizes.json", JSON.stringify({ fakeProviders: true, sizes }, null, 2));
    }
  }, 120_000);
});


describe("Creator admission after two completed booklets", () => {
  it("audits both real predecessor graphs within the existing HTTP contract and preserves their evidence", async () => {
    const kid = await setup(false, false, "playful_kid", "count");
    const finish = async (env: Awaited<ReturnType<typeof setup>>) => {
      for (let step = 0; step < 180; step++) {
        await env.dispatcher.advance(env.runId);
        const run = (await env.repository.getRun(env.runId))!;
        if (run.status === "completed") return run;
        expect(run.status, `Unexpected generation blocker at ${step}`).not.toBe("blocked");
        env.tick();
      }
      throw new Error("Fixture did not complete");
    };
    const completedKid = await finish(kid);
    const grant: M4Grant = { ...kid.authority.grant, remainingPersonaAdmission: {
      anchorRunId: kid.runId, anchorRevision: completedKid.revision,
      personas: ["enthusiast_parent", "professional_creator"], reference: "two populated predecessors fixture",
    } };
    const parent = await setup(false, false, "enthusiast_parent", "count", {
      database: kid.database, store: kid.store, runId: id(110), bookletId: id(111), grant,
    });
    const completedParent = await finish(parent);
    expect(completedKid.evaluationStatus).toBe("failed"); expect(completedParent.evaluationStatus).toBe("failed");
    const creator = await setup(false, false, "professional_creator", "count", {
      database: kid.database, store: kid.store, runId: id(210), bookletId: id(211), grant, skipCreate: true,
    });
    const beforeCampaign = (await kid.database.collections.experiment_campaigns.findOne({ _id: id(1) }))!;
    expect(beforeCampaign.state).toBe("stopped");
    const collections = ["experiment_runs", "artifacts", "artifact_versions", "artifact_dependencies", "approvals", "assets", "experiment_operations"] as const;
    const before = await Promise.all(collections.map(name => kid.database.collections[name].find({}).sort({ _id: 1 }).toArray()));
    const bytes = [...kid.store.files.entries()];
    const calls = [kid.runtime.start, parent.runtime.start, creator.runtime.start].map(start => vi.mocked(start).mock.calls.length);
    vi.stubEnv("ACCESS_GATE_PASSWORD", "fixture-password-at-least-16");
    const http = createBookletRunnerHttp({ database: () => kid.database, config: () => ({ enabled: true, config: creator.config }),
      store: () => kid.store, runtime: () => creator.runtime, mutate: async action => action() });
    const request = () => new Request("https://booklet.invalid/api/experiments/booklet-runs", { method: "POST",
      headers: { origin: "https://booklet.invalid", authorization: `Basic ${btoa("booklet:fixture-password-at-least-16")}`,
        "content-type": "application/json", "idempotency-key": id(990) },
      body: JSON.stringify({ persona: "professional_creator", mode: "balanced" }) });
    try {
      const [uri, original] = bytes[0]; kid.store.files.set(uri, Uint8Array.of(0));
      expect((await http.create(request())).status).toBe(409);
      kid.store.files.set(uri, original);
      expect(await kid.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toEqual(beforeCampaign);
      const result = await http.create(request());
      expect(result.status).toBe(201);
      const created = (await result.json()).data;
      expect(created).toMatchObject({ persona: "professional_creator", mode: "balanced", status: "queued", counters: { logicalText: 0, logicalImage: 0 } });
      expect((await http.create(request())).status).toBe(200);
      for (const [index, name] of collections.entries()) {
        expect(await kid.database.collections[name].find({ _id: { $in: before[index].map(row => row._id) } }).sort({ _id: 1 }).toArray()).toEqual(before[index]);
      }
      expect([...kid.store.files.entries()]).toEqual(bytes);
      expect([kid.runtime.start, parent.runtime.start, creator.runtime.start].map(start => vi.mocked(start).mock.calls.length)).toEqual(calls);
      expect(await kid.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ state: "active",
        requests: beforeCampaign.requests, reservedMicrodollars: beforeCampaign.reservedMicrodollars, settledMicrodollars: beforeCampaign.settledMicrodollars });
      const phases = recentDiagnostics(undefined, 500).events;
      expect(phases.some(event => event.runId === kid.runId && event.phase === "admission_predecessor_generation")).toBe(true);
      expect(phases.some(event => event.runId === parent.runId && event.phase === "admission_predecessor_generation")).toBe(true);
      expect(phases.some(event => event.runId === created.runId && event.phase === "create_transaction" && event.outcome === "succeeded" && event.transactionAttempts >= 1)).toBe(true);
      expect(phases.some(event => event.phase === "create_mutation" && event.outcome === "failed" && event.failure)).toBe(true);
      expect(phases.some(event => event.runId === created.runId && event.phase === "create_detail" && event.outcome === "succeeded")).toBe(true);
    } finally { vi.unstubAllEnvs(); }
  }, 120_000);
});

describe("focused J11 paid-failure continuation", () => {
  it.each([["layout", "playful_kid"], ["incomplete", "playful_kid"], ["layout", "enthusiast_parent"]] as const)("retains sources/assets and the %s failure charge for %s while new work completes layout", async (failure, persona) => {
    const env = await setup(failure === "incomplete", false, persona);
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
  async function blockedCompletion(taskId: string | null = "J11") {
    const env = await setup();
    if (taskId === null) env.blockManagerPageBible(); else env.blockCompletion(taskId);
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

  async function supportedRecovery(manager = false) {
    const env = await blockedCompletion(manager ? null : "J11");
    while (env.now() <= env.operation.deadlineAtMs!) env.tick();
    await env.database.collections.deployment_control.insertOne({ _id: "environment:_staging", schemaVersion: "1", environment: "_staging",
      maintenance: false, draining: false, activeMutations: 0, mutationOwners: [], interruptedMutations: 0, reason: null, updatedAtMs: env.now() });
    const service = createBookletRecovery({ database: env.database, config: { ...env.config, m4: { state: "granted", authority: env.recoveryAuthority } },
      runtime: env.runtime, store: () => env.store, now: env.now });
    const boundedService = { ...service, apply: (...args: Parameters<typeof service.apply>) =>
      withOperationBudget(env.now() + 150_000, () => service.apply(...args), { now: env.now }) };
    return { ...env, service: boundedService, target: { runId: env.runId, operationId: env.operation._id, expectedRevision: env.run.revision } };
  }

  it.each(["snapshot.invariants", "preview.digest"])("managerRecovery diagnostic identifies %s failure without mutation", async stage => {
    const env = await supportedRecovery(true);
    const starts = vi.mocked(env.runtime.start).mock.calls.length;
    const uploads = env.uploadReference.mock.calls.length;
    const original = m4Request.m4CanonicalJson;
    const hash = vi.spyOn(m4Request, "m4CanonicalJson").mockImplementation(value => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const row = value as Record<string, unknown>;
        if (stage === "snapshot.invariants" ? "m4Preparation" in row && !("state" in row) : "target" in row && "snapshot" in row && "grant" in row) {
          throw new Error("private retained value must not escape");
        }
      }
      return original(value);
    });
    try {
      await expect(env.service.preview(env.target)).rejects.toMatchObject({ code: "inspection_or_verification_failed", stage,
        errorKind: "Error", diagnostic: { elapsedMs: expect.any(Number) } });
      expect(await env.repository.getOperation(env.operation._id)).toEqual(env.operation);
      expect(await env.repository.getRun(env.runId)).toEqual(env.run);
      expect(env.runtime.start).toHaveBeenCalledTimes(starts);
      expect(env.uploadReference).toHaveBeenCalledTimes(uploads);
    } finally { hash.mockRestore(); }
  });

  it("managerRecovery preserves the original J12 delegation through verified recovery, duplicate inspection and same-run Resume", async () => {
    const env = await supportedRecovery(true);
    expect(env.operation).toMatchObject({ role: "manager", taskId: null });
    expect(env.input().envelope.result).toMatchObject({ kind: "delegate", payload: { taskId: "J12", subjectKind: "page" } });
    const j11 = (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J11", state: "approved" }))!;
    expect(j11).not.toBeNull();
    const retained = async () => ({
      artifacts: await env.database.collections.artifacts.find({}).sort({ _id: 1 }).toArray(),
      versions: await env.database.collections.artifact_versions.find({}).sort({ _id: 1 }).toArray(),
      approvals: await env.database.collections.approvals.find({}).sort({ _id: 1 }).toArray(),
      dependencies: await env.database.collections.artifact_dependencies.find({}).sort({ _id: 1 }).toArray(),
      booklets: await env.database.collections.booklets.find({}).sort({ _id: 1 }).toArray(),
      assets: await env.database.collections.assets.find({}).sort({ _id: 1 }).toArray(),
      bytes: [...env.store.files].map(([uri, bytes]) => [uri, Uint8Array.from(bytes)]),
    });
    const before = await retained();
    const campaign = (await env.database.collections.experiment_campaigns.findOne({ _id: id(1) }))!;
    const starts = vi.mocked(env.runtime.start).mock.calls.length;
    const uploads = env.uploadReference.mock.calls.length;
    const proof = await env.service.preview(env.target);
    expect(await env.repository.getOperation(env.operation._id)).toEqual(env.operation);
    await env.database.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    const checkpoint = vi.fn();
    await env.service.apply(env.target, proof.previewDigest, checkpoint);
    expect(checkpoint).toHaveBeenCalledOnce();
    for (let duplicate = 0; duplicate < 2; duplicate++) {
      expect(await env.service.verifyCompleted(env.target, proof.snapshot)).toMatchObject({ verified: true, admission: "closed", providerPosts: 0 });
    }
    expect((await env.recovery.completeOperation(env.input())).reused).toBe(true);
    const completed = (await env.repository.getOperation(env.operation._id))!;
    expect(completed).toMatchObject({ state: "succeeded", reservationCount: 1, deadlineAtMs: env.operation.deadlineAtMs,
      m4Reservation: env.operation.m4Reservation, resultFinalizationClaim: null, lifecycle: { attemptOutcome: "failed", unresolved: false } });
    expect(JSON.parse(completed.materializationJson!)).toMatchObject({ delegatedTaskId: "J12" });
    const paused = (await env.repository.getRun(env.runId))!;
    expect(paused).toMatchObject({ status: "paused", pauseRequested: true, activeOperationId: null, counters: env.run.counters });
    expect(await retained()).toEqual(before);
    const recoveredCampaign = (await env.database.collections.experiment_campaigns.findOne({ _id: id(1) }))!;
    expect(recoveredCampaign).toMatchObject({ state: "active", requests: campaign.requests, requestCounts: campaign.requestCounts,
      settledMicrodollars: campaign.settledMicrodollars, reservedMicrodollars: campaign.reservedMicrodollars });
    await env.database.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: false } });
    expect(await env.recovery.resume({ runId: env.runId, expectedRevision: paused.revision, nowMs: env.now() }))
      .toMatchObject({ status: "queued", pauseRequested: false, counters: env.run.counters });
    expect(await env.repository.getOperation(env.operation._id)).toEqual(completed);
    expect(await retained()).toEqual(before);
    expect(env.runtime.start).toHaveBeenCalledTimes(starts);
    expect(env.uploadReference).toHaveBeenCalledTimes(uploads);
    expect(env.runtime.stop).not.toHaveBeenCalled();
    await withMongoTransaction(env.database, async session => verifyM4Accounting(env.database, session, (await env.repository.getRun(env.runId))!));
  }, 120_000);

  it("managerRecovery rejects missing or mismatched grants and changed source or approval evidence", async () => {
    const env = await supportedRecovery(true);
    for (const completionRecoveries of [[], [{ ...env.permission, operationId: id(999) }]]) {
      const authority = { ...env.recoveryAuthority, grant: { ...env.recoveryAuthority.grant, completionRecoveries } };
      const service = createBookletRecovery({ database: env.database, config: { ...env.config, m4: { state: "granted", authority } },
        runtime: env.runtime, store: () => env.store, now: env.now });
      await expect(service.preview(env.target)).rejects.toThrow("exact_completion_grant_missing");
    }
    const proof = await env.service.preview(env.target);
    await env.database.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    const layout = (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J11" }))!;
    const source = (await env.database.collections.artifact_versions.findOne({ _id: layout.currentVersionId! }))!;
    expect(source).not.toBeNull();
    const checkpoint = vi.fn();
    await env.database.collections.artifact_versions.updateOne({ _id: source._id }, { $set: { contentJson: "changed-source" } });
    await expect(env.service.apply(env.target, proof.previewDigest, checkpoint)).rejects.toThrow();
    expect(checkpoint).not.toHaveBeenCalled();
    await env.database.collections.artifact_versions.replaceOne({ _id: source._id }, source);
    const approval = (await env.database.collections.approvals.findOne({ experimentRunId: env.runId }))!;
    await env.database.collections.approvals.updateOne({ _id: approval._id }, { $set: { testerDecisionId: id(998) } });
    await expect(env.service.apply(env.target, proof.previewDigest, checkpoint)).rejects.toThrow("preview_changed");
    expect(checkpoint).not.toHaveBeenCalled();
    expect(await env.repository.getOperation(env.operation._id)).toEqual(env.operation);
    expect(await env.repository.getRun(env.runId)).toEqual(env.run);
  }, 120_000);

  it("keeps committed completion through recovery, deployment readiness and explicit Resume without replay", async () => {
    const env = await supportedRecovery();
    const starts = vi.mocked(env.runtime.start).mock.calls.length;
    const proof = await env.service.preview(env.target);
    await env.database.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: true } });
    await env.service.apply(env.target, proof.previewDigest, async () => {});
    await expect(env.service.verifyCompleted(env.target, proof.snapshot)).resolves.toMatchObject({ verified: true, admission: "closed" });
    const completed = (await env.repository.getOperation(env.operation._id))!;
    const paused = (await env.repository.getRun(env.runId))!;
    const campaign = (await env.database.collections.experiment_campaigns.findOne({ _id: id(1) }))!;
    const versions = await env.database.collections.artifact_versions.find({}).sort({ _id: 1 }).toArray();
    const approvals = await env.database.collections.approvals.find({}).sort({ _id: 1 }).toArray();
    const assets = await env.database.collections.assets.find({}).sort({ _id: 1 }).toArray();
    const bytes = [...env.store.files].map(([uri, content]) => [uri, Uint8Array.from(content)] as const);
    const history = await env.repository.listOperations(env.runId);
    // Host commands and host journals use the shell fixtures' isolated mocks.
    // The application stages below share this real MongoDB database and store;
    // no container, VPS, external storage or provider is used by this journey.
    const bash = process.platform === "win32" ? `${process.env.ProgramFiles ?? "C:/Program Files"}/Git/bin/bash.exe` : "bash";
    for (const [key, value] of Object.entries({ DEPLOYMENT_ENV: "_staging", RUNNER_ENABLED: "false",
      DIFY_BOOKLET_RUNNER_ENABLED: "true", DIFY_BOOKLET_BASE_URL: env.config.baseUrl,
      DIFY_BOOKLET_PUBLIC_ORIGIN: env.config.publicOrigin, DIFY_BOOKLET_TOOL_KEY: "x".repeat(32),
      DIFY_BOOKLET_BINDINGS_JSON: JSON.stringify(env.config.bindings) })) vi.stubEnv(key, value);
    try {
      const shell = readFileSync("scripts/deploy/vps-deployment.sh", "utf8");
      const inline = shell.match(/if \[\[ "\$phase" == legacy-compatibility \]\]; then\s*command=\(node --import tsx --input-type=module -e '([\s\S]*?)'\)/)?.[1];
      expect(inline).toBeDefined();
      const body = inline!.replace(/^\s*import .*;\r?\n/gm, "");
      expect(body).not.toMatch(/\bimport\s/);
      expect(env.database.database.databaseName).toMatch(/^kids_booklet_test_/);
      const compatibility = async () => {
        const logs: string[] = [], diagnostics: string[] = [];
        const find = vi.spyOn(env.database.collections.experiment_operations, "find");
        const findOne = vi.spyOn(env.database.collections.experiment_operations, "findOne");
        try {
          // Execute the exact production inline body, changing only its imports
          // and host bindings. Its guarded database name is an injected string;
          // getDatabase still returns ONLY this disposable test database.
          await runInNewContext(`(async () => {${body}\n})()`, {
            getDatabase: () => ({ ...env.database, close: async () => {} }),
            verifyMongoStructure, readBookletRunnerConfig, createHash,
            process: { env: { RUNNER_ENABLED: "false", DEPLOYMENT_ENV: "_staging",
              MONGODB_DATABASE: "kids_booklet", ASSETS_BUCKET: "kids-booklet-staging-assets" },
            argv: ["node", env.runId, completed._id] },
            console: { log: (value: string) => logs.push(value), error: (value: string) => diagnostics.push(value) },
          });
          // The driver may implement findOne with a single-batch find. Every
          // operation body read must still target only the saved completion.
          for (const [filter] of find.mock.calls) expect(filter).toEqual({ _id: completed._id, runId: env.runId });
          expect(findOne.mock.calls.map(([filter]) => filter)).toEqual([{ _id: completed._id, runId: env.runId }]);
          expect(diagnostics.map(line => JSON.parse(line))).toEqual([expect.objectContaining({
            diagnostic: "deployment_read", phase: "structure", operation: "collections_and_indexes", outcome: "completed" }), expect.objectContaining({ diagnostic: "deployment_read", phase: "target", operation: "completion_dependencies", outcome: "completed" })]);
          expect(logs).toHaveLength(1);
          const result = JSON.parse(logs[0]) as { verified: boolean; compatible: boolean; targetDigest: string };
          expect(result).toEqual({ verified: true, compatible: true, targetDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
          return result.targetDigest;
        } finally { find.mockRestore(); findOne.mockRestore(); }
      };
      // Model the prior release's existing seeds before host recovery. The same
      // initializer runs again at normal delivery, without rewriting the result.
      await initializeMongoData(env.database, env.store);
      const targetDigest = await compatibility();
      for (const scenario of ["expired-recovery-bridge-apply", "release"]) {
        execFileSync(bash, ["tests/shell/vps-host.test.sh", scenario], { cwd: process.cwd(), timeout: 45_000, encoding: "utf8" });
        if (scenario === "release") await initializeMongoData(env.database, env.store);
        expect(await compatibility()).toBe(targetDigest);
      }
      await verifyDeploymentState(env.database, env.store);
      const dispatcher = createExperimentDispatcher({ database: env.database,
        config: { ...env.config, m4: { state: "granted", authority: env.recoveryAuthority } }, runtime: env.runtime,
        now: env.now, mutate: async action => action(), store: () => env.store, uploadReference: env.uploadReference });
      expect(await dispatcher.advance(env.runId)).toBe("waiting");
      expect(await env.repository.getRun(env.runId)).toEqual(paused);
      await env.database.collections.deployment_control.updateOne({ environment: "_staging" }, { $set: { maintenance: false } });
      const manager = env.config.bindings.find(binding => binding.role === "manager")!;
      await expect(checkProbeReadiness(env.database, env.config, { appId: manager.appId, publication: manager.publishedWorkflowId }))
        .resolves.toMatchObject({ ready: true, idle: true });
      expect(await dispatcher.advance(env.runId)).toBe("waiting");
      expect(await env.repository.getRun(env.runId)).toEqual(paused);
      expect(env.runtime.start).toHaveBeenCalledTimes(starts);
      expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toEqual(campaign);
      const resumed = await env.recovery.resume({ runId: env.runId, expectedRevision: paused.revision, nowMs: env.now() });
      expect(resumed).toMatchObject({ status: "queued", pauseRequested: false, counters: paused.counters });
      expect(env.runtime.start).toHaveBeenCalledTimes(starts);
      await dispatcher.advance(env.runId);
      const next = (await env.repository.listOperations(env.runId)).at(-1)!;
      expect(next).toMatchObject({ role: "manager", state: "started", reservationCount: 1 });
      expect(next._id).not.toBe(completed._id);
      env.tick(); await dispatcher.advance(env.runId);
      expect(await env.repository.getOperation(next._id)).toMatchObject({ state: "succeeded", reservationCount: 1 });
      expect(env.runtime.start).toHaveBeenCalledTimes(starts + 1);
      expect(vi.mocked(env.runtime.start).mock.calls.at(-1)![1].operationId).toBe(next._id);
      expect(await env.repository.listOperations(env.runId)).toHaveLength(history.length + 1);
      expect(await env.repository.getOperation(completed._id)).toEqual(completed);
      expect(await env.database.collections.artifact_versions.find({ _id: { $in: versions.map(row => row._id) } }).sort({ _id: 1 }).toArray()).toEqual(versions);
      expect(await env.database.collections.approvals.find({ _id: { $in: approvals.map(row => row._id) } }).sort({ _id: 1 }).toArray()).toEqual(approvals);
      expect(await env.database.collections.assets.find({ _id: { $in: assets.map(row => row._id) } }).sort({ _id: 1 }).toArray()).toEqual(assets);
      for (const [uri, content] of bytes) expect(env.store.files.get(uri)).toEqual(content);
      const continued = (await env.repository.getRun(env.runId))!;
      expect(continued.counters).toEqual({ ...paused.counters, logicalText: paused.counters.logicalText + 1,
        payableText: paused.counters.payableText + 1, steps: paused.counters.steps + 1 });
      expect(await env.database.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({
        state: "active", requests: campaign.requests + 1, requestCounts: { playful_kid: campaign.requestCounts.playful_kid + 1 } });
      await withMongoTransaction(env.database, session => verifyM4Accounting(env.database, session, continued));
      expect(env.runtime.stop).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  }, 180_000);

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

  it("preserves a retained result when observation readback fails without blocking or replay", async () => {
    const env = await blockedCompletion();
    await env.database.collections.experiment_runs.updateOne({ _id: env.runId }, { $set: { status: "running", safeFailure: null } });
    await env.database.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { state: "active" } });
    const before = (await env.repository.getRun(env.runId))!;
    const calls = vi.mocked(env.runtime.start).mock.calls.length;
    const failure = Object.assign(new Error("private read failure"), { name: "MongoOperationTimeoutError" });
    let armed = false;
    const retrieve = vi.mocked(env.runtime.retrieve).getMockImplementation()!;
    vi.spyOn(env.runtime, "retrieve").mockImplementation(async (...args) => { const result = await retrieve(...args); armed = true; return result; });
    const ops = env.database.collections.experiment_operations;
    const read = ops.findOne.bind(ops);
    let observedReads = 0;
    vi.spyOn(ops, "findOne").mockImplementation(async (...args) => {
      if (armed && !args[1]?.session && ++observedReads === 2) throw failure;
      return read(...args);
    });
    const inspector = createExperimentDispatcher({ database: env.database, config: env.config, runtime: env.runtime,
      now: env.now, store: () => env.store, mutate: async action => action() });
    await expect(inspector.inspect({ runId: env.runId, operationId: env.operation._id })).rejects.toMatchObject({
      diagnostic: { stage: "completion_readback", errorKind: "MongoOperationTimeoutError", commitState: "unknown" } });
    vi.restoreAllMocks();
    expect(await env.repository.getRun(env.runId)).toMatchObject({ status: "running", safeFailure: null, counters: before.counters });
    expect(await env.repository.getOperation(env.operation._id)).toMatchObject({ resultJson: null,
      m4Observation: { issue: null }, m4Reservation: env.operation.m4Reservation });
    expect(env.runtime.start).toHaveBeenCalledTimes(calls);
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
