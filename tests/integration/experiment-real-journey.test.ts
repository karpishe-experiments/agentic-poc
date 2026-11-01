import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withMongoTransaction, type Database } from "@/db/client";
import { createExecutionAllowanceLedger } from "@/db/experiment-execution-allowance";
import { verifyExecutionAccounting } from "@/db/experiment-execution-accounting";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createImageReplacementService } from "@/db/experiment-image-replacement";
import { createImageReplacementParkingRecovery } from "@/lib/operations/image-replacement-parking";
import { FilesystemAssetStore } from "@/lib/assets/filesystem-asset-store";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { configurationSnapshot, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";
import { simulatedExperimentReport } from "@/lib/experiment-runner/report-fixtures";
import { createExperimentImageStorage } from "@/lib/experiment-runner/image-storage";
import { defaultExecutionAllowance, realExecutionPolicyFromM4TechnicalProfile } from "@/lib/experiment-runner/execution-policy";
import { m4PolicySnapshot, m4TokenPolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { REAL_IMAGE_ADAPTER_IDENTITY, REAL_IMAGE_MODEL } from "@/lib/experiment-runner/real-image-contract";
import { REAL_REPORT_ADAPTER_IDENTITY, realReportCarrier } from "@/lib/experiment-runner/real-report-carrier";
import { createRealImageWorkflowGraph, createRealWorkflowGraph } from "@/lib/experiment-runner/real-workflow-graph";
import { m4AuthorizedCarrier, m4CanonicalJson } from "@/lib/experiment-runner/m4-request";
import { recentDiagnostics } from "@/lib/experiment-runner/diagnostics";
import type { Persona, RoleResult } from "@/lib/contracts/experiment-runner";
import { parseStoredPageLayout } from "@/lib/contracts/experiment-pages";
import { experimentReportSchema } from "@/lib/contracts/experiment-reports";
import type { RuntimeExecution, WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestPolicy } from "@/tests/helpers/m4-policy";

const databases: Database[] = [], roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(databases.splice(0).map(closeTestDatabase));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function python(source: string, args: Record<string, unknown>): Record<string, unknown> {
  const executed = spawnSync("python", ["-c", "import json,sys\nv=json.load(sys.stdin)\nexec(v['source'])\nprint(json.dumps(main(**v['args'])))"],
    { input: JSON.stringify({ source, args }), encoding: "utf8", env: { ...process.env, PYTHONUTF8: "1" }, timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
  expect(executed.status, executed.stderr || executed.error?.message).toBe(0);
  return JSON.parse(executed.stdout);
}

// Provider creativity is deterministic; claims, saved preparation, original bytes,
// authenticated workflow readback, settlement and materialization are real services.
async function setup(persona: Persona = "playful_kid", executionVersion: "execution_v1" | "execution_v2" = "execution_v1") {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("External provider HTTP is forbidden in this fixture."); });
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const root = await mkdtemp(path.join(os.tmpdir(), "booklet-real-journey-")); roots.push(root);
  const store = new FilesystemAssetStore(root);
  const source = m4TestPolicy();
  const tokenPolicy = m4TokenPolicySnapshot({ version: "m4_context_policy_v2", basePolicyHash: m4PolicySnapshot(source).hash,
    warningInputTokens: 32000, maxInputTokens: 128000,
    requiredProviderAdapterIdentity: `langgenius/openai:1.0.7-dev5@${"a".repeat(64)}`,
    requiredProviderPackageSha256: "b".repeat(64), reference: "nonbillable-journey-fixture" });
  const adapters = { textPluginIdentity: `langgenius/openai:1.0.7-dev6@${"c".repeat(64)}`, textPackageSha256: "d".repeat(64),
    imagePluginIdentity: `langgenius/openai_tool:0.2.2-dev1@${"e".repeat(64)}`, imagePackageSha256: "f".repeat(64), executionVersion };
  const profile = realExecutionPolicyFromM4TechnicalProfile(source, tokenPolicy, source.publications, adapters);
  const bindings = profile.publications.map(item => ({ ...item, apiKey: "fake-key" })) as BookletRunnerConfig["bindings"];
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid",
    callbackKey: "fake-key", bindings, real: { state: "ready", bindings, ...adapters, sourcePolicy: source, tokenPolicy, nativeFileFormat: "base64" } };
  const campaignId = randomUUID(), runId = randomUUID(), bookletId = randomUUID();
  let clock = Date.now(); const now = () => clock++;
  await withMongoTransaction(database, session => createExecutionAllowanceLedger(database).create(session, {
    campaignId, mode: "real", persona, profile, approvalId: randomUUID(), reference: "fake-provider-test-only",
    totals: defaultExecutionAllowance(persona, 10_000_000), nowMs: now(),
  }));
  const repository = createExperimentRepository(database, { store: () => store, realExecutionEnabled: true });
  await repository.createRun({ runId, bookletId, mode: "real", persona, executionCampaignId: campaignId,
    configuration: configurationSnapshot(config, persona, "real"), nowMs: now() });
  const context = createExperimentContextService(database, { store: () => store });
  const saved = new Map<string, RuntimeExecution>(), originals = new Map<string, Uint8Array>();
  const providerErrors: unknown[] = [];
  let reviseSheet = false;
  let revisedVersionId: string | null = null;
  let imageFailure: "rejected_pre_provider" | "failed_after_provider" | "unknown_outcome" | null = null;
  let reportStatus = "completed";
  let imageFailureTask: "J13" | null = null;
  const uploads = new Map<string, Uint8Array>();
  const uploadReference = vi.fn(async (_binding: BookletRunnerConfig["bindings"][number], _runId: string, bytes: Uint8Array) => {
    const id = randomUUID(); uploads.set(id, Uint8Array.from(bytes));
    return { kind: "uploaded" as const, id, byteLength: bytes.byteLength, mimeType: "image/png" as const, sha256: sha256(bytes) };
  });
  const runtime: WorkflowRuntime = {
    start: vi.fn<WorkflowRuntime["start"]>(async (binding, input) => {
      try {
      const workflowRunId = randomUUID();
      const identity = { runId, operationId: input.operationId, workflowRunId, parentWorkflowRunId: input.parentWorkflowRunId };
      const claim = await repository.claimOperation({ ...identity, nowMs: now() }, { workflowId: binding.publishedWorkflowId });
      expect(claim.started, `claim ${binding.role}/${binding.taskId}`).toBe(true);
      const operation = (await repository.getOperation(input.operationId))!;
      let outputs: Record<string, unknown>;
      if (binding.role === "image") {
        expect(claim.realImageRequest).toBeDefined();
        if (imageFailure && (!imageFailureTask || operation.taskId === imageFailureTask)) {
          const failure = imageFailure; imageFailure = null;
          await repository.observeRealImage({ ...identity, inputFingerprint: operation.inputFingerprint,
            result: { schemaVersion: "booklet_real_image_result_v1", requestDigest: claim.realImageRequest!.requestDigest,
              adapterIdentity: REAL_IMAGE_ADAPTER_IDENTITY, requestedModel: REAL_IMAGE_MODEL,
              dispatchStarted: failure !== "rejected_pre_provider", status: failure,
              usage: failure === "failed_after_provider" ? { inputTokens: 2, outputTokens: 3 } : null,
              output: null, failure: { stage: failure === "failed_after_provider" ? "post_provider" : "pre_provider", code: "fixture_failure" } }, nowMs: now() });
          const execution: RuntimeExecution = { id: workflowRunId, workflow_id: binding.publishedWorkflowId,
            status: "failed", outputs: null };
          saved.set(workflowRunId, execution);
          return { kind: "execution" as const, execution };
        }
        const graph = createRealImageWorkflowGraph();
        const decoded = python(graph.nodes.find(node => node.id === "real_decode")!.data.code as string, {
          authorization_body: JSON.stringify({ data: { started: true, mode: "real", role: "image", taskId: operation.taskId,
            inputFingerprint: operation.inputFingerprint, requestJson: m4CanonicalJson(claim.realImageRequest) } }), status_code: 200 });
        expect(decoded.authorized).toBe("yes");
        const bytes = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#74aadd" } }).png().toBuffer();
        const providerResult = { schemaVersion: "booklet_real_image_result_v1", requestDigest: claim.realImageRequest!.requestDigest,
          adapterIdentity: REAL_IMAGE_ADAPTER_IDENTITY, requestedModel: REAL_IMAGE_MODEL, dispatchStarted: true,
          providerRequestId: `req_${workflowRunId}`, providerResponseId: `resp_${workflowRunId}`, providerModel: REAL_IMAGE_MODEL,
          status: "succeeded", usage: { inputTokens: 2, outputTokens: 3 },
          output: { sha256: sha256(bytes), byteLength: bytes.length, mimeType: "image/png", width: 1024, height: 1024 }, failure: null };
        await repository.observeRealImage({ ...identity, inputFingerprint: operation.inputFingerprint, result: providerResult, nowMs: now() });
        const stored = await createExperimentImageStorage({ database, store, now }).complete({
          identity: { ...identity, inputFingerprint: operation.inputFingerprint }, content: bytes });
        originals.set(stored.asset!._id, Uint8Array.from(bytes));
        outputs = { ...python(graph.nodes.find(node => node.id === "real_image_result")!.data.code as string, {
          tool_json: [{ result: providerResult, upload: { state: "succeeded", assetId: stored.asset!._id, sha256: stored.operation.resultDigest, reused: false } }],
          request_json: decoded.request_json, run_id: runId, operation_id: operation._id, workflow_run_id: workflowRunId,
          parent_workflow_run_id: input.parentWorkflowRunId ?? "", input_fingerprint: operation.inputFingerprint }),
          ...(input.referenceFileIds ? { reference_files: input.referenceFileIds.map(record_id => ({ type: "image", transfer_method: "local_file",
            reference: `dify-file-ref:${Buffer.from(JSON.stringify({ record_id })).toString("base64url")}` })) } : {}) };
      } else {
        const operationContext = operation.realReportPreparation
          ? JSON.parse(operation.m4Preparation!.contextJson) as Awaited<ReturnType<typeof context.getOperationContext>>
          : await context.getOperationContext(identity);
        let result: RoleResult;
        const report = operation.realReportPreparation;
        if ("reportEvidence" in operationContext) {
          expect(report).toBeDefined();
          const fixture = simulatedExperimentReport({ ...operationContext.reportEvidence, mode: "simulated" });
          result = { kind: binding.role === "tester" ? "feedback" : "assessment", payload: { ...fixture, mode: "real",
            consistency: { status: "observed", explanation: "Fake provider inspected every supplied original image." },
            evidence: { ...fixture.evidence, inspectedAssetIds: report!.orderedImages.map(item => item.assetId) } } };
          const images = report!.orderedImages.map((manifest, index) => ({ manifest, bytes: uploads.get(input.referenceFileIds![index]!)! }));
          const carrier = JSON.parse(report!.carrierJson);
          expect(realReportCarrier({ textRequestJson: carrier.textRequestJson, images, deadlineAtMs: carrier.deadlineAtMs }).carrierJson)
            .toBe(report!.carrierJson);
        } else {
          result = simulateNarrativeResult(operationContext, "simulated");
          if (operationContext.role === "specialist" && operationContext.taskId === "J09" && operationContext.matchingRevision && result.kind === "proposal") {
            const content = result.payload.content as Record<string, unknown>;
            result = { ...result, payload: { ...result.payload, content: { ...content,
              sheetPromptModule: `${content.sheetPromptModule} Make the concerned expression unmistakable through raised inner brows.` } } };
          }
          if (reviseSheet && operationContext.role === "tester" && result.kind === "decision" && result.payload.decision.action === "approve") {
            const ids = result.payload.decision.versionIds;
            const target = operationContext.currentArtifacts.find(item => item.taskId === "J09" && item.currentVersionId && ids.includes(item.currentVersionId) &&
              item.versions.find(version => version.id === item.currentVersionId)?.sourceVersionId);
            if (target) {
              revisedVersionId = target.currentVersionId!;
              reviseSheet = false;
              result = { kind: "decision", payload: { decision: { action: "revise", taskId: "J09", artifactVersionId: revisedVersionId,
                instruction: "Make the concerned expression clearer while preserving the approved character identity." } } };
            }
          }
        }
        const prepared = operation.m4Preparation!, reservation = operation.m4Reservation!;
        const graph = await createRealWorkflowGraph({ role: binding.role, taskId: binding.taskId, persona: binding.persona });
        const carrier = m4AuthorizedCarrier(prepared.requestJson, profile.tokenPolicy);
        const decoded = python(graph.nodes.find(node => node.id === "real_decode")!.data.code as string, {
          authorization_body: JSON.stringify({ data: { started: true, mode: "real", role: binding.role, taskId: binding.taskId,
            inputFingerprint: operation.inputFingerprint, m4: { requestJson: report?.carrierJson ?? carrier.requestJson,
              requestDigest: report?.finalRequestDigest ?? carrier.requestDigest, report: Boolean(report), timeoutSeconds: 120,
              deadlineAtMs: report ? JSON.parse(report.carrierJson).deadlineAtMs : operation.deadlineAtMs! - 30_000 } } }), status_code: 200 });
        expect(decoded.authorized).toBe("yes");
        let creative: unknown = { result };
        if (result.kind === "proposal" && result.payload.taskId === "J11") {
          const content = result.payload.content as { pages: Array<{ panels: Array<{ sheetReferences: Array<{ subjectKind: string; subjectId: string }> }> }> };
          creative = { result: { ...result, payload: { ...result.payload, content: { ...content, pages: content.pages.map(page => ({ ...page,
            panels: page.panels.map(({ sheetReferences, ...panel }) => ({ ...panel,
              sheetSubjects: sheetReferences.map(({ subjectKind, subjectId }) => ({ subjectKind, subjectId })) })) })) } } } };
        }
        if (result.kind === "feedback" || result.kind === "assessment") {
          const { summary, intent, consistency, interaction, findings } = experimentReportSchema.parse(result.payload);
          creative = { report: { summary, intent, consistency, interaction, findings } };
        }
        const wrapper = { schemaVersion: report ? "booklet_provider_v3" : "booklet_provider_v2", content: JSON.stringify(creative),
          providerEvidence: { provider: "openai", apiBaseUrl: "https://api.openai.com/v1",
            stdioSdk: { version: "0.10.2", readerSha256: "546de8f0c5171a924e80190df2f917782ae6ddda85db4515b6c021c4d9ce6e22" },
            responseId: `resp_${workflowRunId}`, requestId: `req_${workflowRunId}`, model: profile.models[reservation.bucket].model,
            serviceTier: "default", status: report ? reportStatus : "completed", refused: false, incompleteReason: null,
            requestDigest: report?.finalRequestDigest ?? prepared.requestDigest, countedInputTokens: 100,
            usage: { source: "provider_reported", inputTokens: 100, outputTokens: 100, cachedInputTokens: 0,
              cacheWriteInputTokens: null, reasoningOutputTokens: 0 },
            effectivePolicy: { version: "m4_context_policy_v2", hash: profile.tokenPolicy.hash, maxInputTokens: 128000, warningInputTokens: 32000 }, contextWarnings: [],
            ...(report ? { adapterVersion: REAL_REPORT_ADAPTER_IDENTITY, manifestDigest: report.manifestDigest,
              textRequestDigest: report.textRequestDigest, inspectedAssetIds: report.orderedImages.map(item => item.assetId), orderedImages: report.orderedImages } : {}),
          } };
        outputs = { booklet_provider_result: JSON.stringify(wrapper) };
      }
      const execution: RuntimeExecution = { id: workflowRunId, workflow_id: binding.publishedWorkflowId, status: "succeeded", outputs };
      saved.set(workflowRunId, execution);
      return { kind: "execution" as const, execution };
      } catch (error) { providerErrors.push(error instanceof Error ? error.stack : error); throw error; }
    }),
    retrieve: vi.fn(async (_binding, id) => saved.has(id) ? { kind: "execution" as const, execution: saved.get(id)! } : { kind: "unknown" as const }),
  };
  const advance = () => createExperimentDispatcher({ database, config, runtime, uploadReference, store: () => new FilesystemAssetStore(root),
    mutate: async fn => fn(), now }).advance(runId);
  return { database, root, repository, context, runId, campaignId, runtime, originals, uploads, advance, providerErrors,
    diagnosticRelease: () => {
      config.real!.textPluginIdentity = `langgenius/openai:1.0.7-dev7@${"a".repeat(64)}`;
      config.real!.textPackageSha256 = "b".repeat(64);
      config.real!.imagePluginIdentity = `langgenius/openai_tool:0.2.2-dev3@${"c".repeat(64)}`;
      config.real!.imagePackageSha256 = "d".repeat(64);
      config.real!.bindings.find(b => b.role === "image")!.publishedWorkflowId = randomUUID();
    },
    replacementService: () => createImageReplacementService({ database, config, store, runtime, now }),
    parkingService: () => createImageReplacementParkingRecovery({ database, config, store, runtime, now }),
    cycle: () => createExperimentDispatcher({ database, config, runtime, store: () => store, mutate: async fn => fn(), now }).cycle(),
    expireOperation: () => { clock += 300_001; vi.spyOn(Date, "now").mockImplementation(now); },
    unknownReportOutcome: () => { reportStatus = "unknown"; },
    inspect: (operationId: string) => createExperimentDispatcher({ database, config, runtime, store: () => store,
      mutate: async fn => fn(), now }).inspect({ runId, operationId }),
    failNextImage: (status: "rejected_pre_provider" | "failed_after_provider" | "unknown_outcome", task: "J13" | null = null) => {
      imageFailure = status; imageFailureTask = task;
    },
    reviseNextSheet: () => { reviseSheet = true; }, revisedVersion: () => revisedVersionId };
}

async function advance(env: Awaited<ReturnType<typeof setup>>, step: number) {
  const outcome = await env.advance();
  const run = (await env.repository.getRun(env.runId))!;
  const last = (await env.repository.listOperations(env.runId)).at(-1);
  expect(run.status, JSON.stringify({ step, outcome, errors: env.providerErrors, status: run.status,
    last: last ? { taskId: last.taskId, role: last.role, state: last.state, issue: last.m4Observation?.issue, failure: last.safeFailure } : null,
    diagnostics: run.status === "blocked" ? recentDiagnostics(env.runId, 3) : null })).not.toBe("blocked");
}

describe("Real shared journey with fake providers and durable originals", () => {
  it("replaces one explicitly approved unknown image and completes Kid with its original liability intact", async () => {
    const env = await setup("playful_kid", "execution_v2");
    env.failNextImage("unknown_outcome", "J13");
    for (let step = 0; step < 180; step++) {
      await env.advance();
      if ((await env.repository.getRun(env.runId))!.status === "blocked") break;
    }
    const blocked = (await env.repository.getRun(env.runId))!;
    const original = (await env.repository.getOperation(blocked.activeOperationId!))!;
    expect(original).toMatchObject({ state: "unknown", realImageObservation: { chargeBasis: "unknown_outcome" } });
    const retained = structuredClone(original.realImageReservation);
    const calls = vi.mocked(env.runtime.start).mock.calls.length;
    await expect(env.replacementService().preview(env.runId, original._id)).rejects.toThrow();
    env.expireOperation();
    env.diagnosticRelease();
    await env.database.collections.deployment_control.insertOne({ _id: "_staging", schemaVersion: "1", environment: "_staging",
      maintenance: false, draining: false, activeMutations: 0, mutationOwners: [], reason: "fixture", updatedAtMs: Date.now() });
    const target = { runId: env.runId, operationId: original._id, expectedRevision: blocked.revision };
    const parking = env.parkingService(), parkingPreview = await parking.preview(target);
    await env.database.collections.deployment_control.updateOne({ _id: "_staging" }, { $set: { maintenance: true } });
    expect(await parking.verifyUnapplied(target, parkingPreview.previewDigest)).toMatchObject({ outcome: "unapplied" });
    let checkpoint;
    await parking.apply(target, parkingPreview.previewDigest, async proof => { checkpoint = proof.snapshot; });
    expect(await parking.verifyCompleted(target, checkpoint!)).toMatchObject({ outcome: "image_parked", providerPosts: 0 });
    expect(await parking.verifyCompleted(target, checkpoint!)).toMatchObject({ outcome: "image_parked" });
    const waitingRunId = randomUUID(), waitingBookletId = randomUUID();
    await env.repository.createRun({ runId: waitingRunId, bookletId: waitingBookletId, persona: "playful_kid", mode: "simulated",
      configuration: JSON.parse(blocked.configurationJson), nowMs: Date.now() + 1 });
    expect(await env.cycle()).toBe("waiting");
    expect(vi.mocked(env.runtime.start).mock.calls).toHaveLength(calls);
    expect((await env.repository.getRun(waitingRunId))!.status).toBe("queued");
    await env.database.collections.experiment_runs.deleteOne({ _id: waitingRunId });
    await env.database.collections.booklets.deleteOne({ _id: waitingBookletId });
    expect((await env.repository.getOperation(original._id))!.realImageReservation).toEqual(retained);
    await env.database.collections.deployment_control.updateOne({ _id: "_staging" }, { $set: { maintenance: false } });
    const preview = await env.replacementService().preview(env.runId, original._id);
    const approval = { runId: env.runId, operationId: original._id, approvalId: randomUUID(),
      reference: "fixture approval: accept unknown charge and one replacement", expectedRevision: preview.expectedRevision,
      expectedCampaignRevision: preview.expectedCampaignRevision, previewDigest: preview.previewDigest,
      expiresAtMs: preview.expiresAtMs, acknowledgeUnknownCharge: true as const };
    await expect(env.replacementService().approve(approval)).rejects.toThrow("additional allowance");
    expect(vi.mocked(env.runtime.start).mock.calls).toHaveLength(calls);
    const input = { ...approval, totals: { ...preview.totals, maxMicrodollars: preview.totals.maxMicrodollars + 1_000_000 } };
    await expect(env.replacementService().approve({ ...input, expiresAtMs: Date.now() - 1 })).rejects.toThrow("expired");
    await expect(env.replacementService().approve({ ...input, expiresAtMs: input.expiresAtMs - 1 })).rejects.toThrow("changed");
    await expect(env.replacementService().approve({ ...input, expectedRevision: input.expectedRevision + 1 })).rejects.toThrow("changed");
    await env.database.collections.experiment_operations.updateOne({ _id: original._id }, { $set: { authorizationClaim: { id: randomUUID(), expiresAtMs: Date.now() + 10000 } } });
    await expect(env.replacementService().preview(env.runId, original._id)).rejects.toThrow("owner");
    await env.database.collections.experiment_operations.updateOne({ _id: original._id }, { $unset: { authorizationClaim: "" } });
    const results = await Promise.all([env.replacementService().approve(input), env.replacementService().approve(input)]);
    expect(new Set(results.map(r => r.replacementOperationId)).size).toBe(1);
    expect(results.filter(r => !r.reused)).toHaveLength(1);
    const receipt = results[0];
    expect(await env.replacementService().approve(input)).toMatchObject({ replacementOperationId: receipt.replacementOperationId, reused: true });
    expect((await env.repository.getOperation(original._id))!.realImageReservation).toEqual(retained);
    await expect(env.replacementService().approve({ ...input, reference: "different terms" })).rejects.toThrow("different terms");
    for (let step = 0; step < 180; step++) {
      if ((await env.repository.getRun(env.runId))!.status === "completed") break;
      await advance(env, step);
    }
    const complete = (await env.repository.getRun(env.runId))!;
    expect(complete.status).toBe("completed");
    expect(complete.imageReplacementApprovals).toHaveLength(1);
    expect(complete.executionAmendments).toHaveLength(1);
    expect(complete.execution!.profileHash).not.toBe(complete.executionAmendments![0].profileHash);
    expect((await env.repository.getOperation(original._id))!.realImageReservation).toEqual(retained);
    const operations = await env.repository.listOperations(env.runId);
    expect(operations.filter(op => op.replacesImageOperationId === original._id)).toHaveLength(1);
    expect(operations.filter(op => op.realReportPreparation).map(op => op.state)).toEqual(["succeeded", "succeeded"]);
    await withMongoTransaction(env.database, session => verifyExecutionAccounting(env.database, session, complete));
    expect(env.originals.size).toBe(9);
    const replacement = operations.find(op => op._id === receipt.replacementOperationId)!;
    const late = { ...JSON.parse(replacement.realImageObservation!.resultJson), requestDigest: original.realImagePreparation!.requestDigest };
    const beforeLate = await env.database.collections.experiment_campaigns.findOne({ _id: env.campaignId });
    await env.repository.observeRealImage({ runId: env.runId, operationId: original._id, workflowRunId: original.workflowRunId!,
      parentWorkflowRunId: original.parentWorkflowRunId, inputFingerprint: original.inputFingerprint, result: late, nowMs: Date.now() });
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: env.campaignId })).toEqual(beforeLate);
    expect(await env.repository.getOperation(original._id)).toMatchObject({ state: "unknown", resultJson: null,
      externalErrors: [expect.objectContaining({ stage: "late_superseded_evidence" })] });
    expect((await env.repository.getOperation(original._id))!.realImageReservation).toEqual(retained);
    await withMongoTransaction(env.database, session => verifyExecutionAccounting(env.database, session, complete));
    await env.database.collections.experiment_operations.updateOne({ _id: original._id }, { $set: { "imageReplacement.evidenceDigest": "0".repeat(64) } });
    await expect(withMongoTransaction(env.database, session => verifyExecutionAccounting(env.database, session, complete))).rejects.toThrow("accounting");
    expect(fetch).not.toHaveBeenCalled();
  }, 180_000);
  it("keeps an attributable unknown report outcome owned instead of closing it as a terminal failure", async () => {
    const env = await setup(); env.unknownReportOutcome();
    for (let step = 0; step < 180; step++) {
      await env.advance();
      if ((await env.repository.getRun(env.runId))!.status === "blocked") break;
    }
    const run = (await env.repository.getRun(env.runId))!;
    expect(run).toMatchObject({ status: "blocked", safeFailure: "unknown_outcome", activeOperationId: expect.any(String) });
    expect(run.generationCompletedAtMs).toBeTypeOf("number");
    const report = (await env.repository.getOperation(run.activeOperationId!))!;
    expect(report.realReportPreparation).toBeDefined();
    expect(report).toMatchObject({ state: "started", m4Observation: { issue: "provider_failure" },
      m4Reservation: { settledMicrodollars: expect.any(Number), unsettledMicrodollars: 0 } });
    expect(JSON.parse(report.m4Observation!.evidenceJson!).status).toBe("unknown");
    const before = await env.database.collections.experiment_campaigns.findOne({ _id: env.campaignId });
    const calls = vi.mocked(env.runtime.start).mock.calls.length;
    expect(await env.inspect(report._id)).toMatchObject({ state: "started" });
    expect((await env.repository.getRun(env.runId))!.activeOperationId).toBe(report._id);
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: env.campaignId })).toEqual(before);
    expect(vi.mocked(env.runtime.start).mock.calls).toHaveLength(calls);
  }, 120_000);
  it.each(["rejected_pre_provider", "failed_after_provider"] as const)("inspects retained %s image failure without replay or accounting drift", async status => {
    const env = await setup(); env.failNextImage(status, status === "failed_after_provider" ? "J13" : null);
    let failed;
    for (let step = 0; step < 100; step++) {
      await env.advance();
      failed = (await env.repository.listOperations(env.runId)).find(item => item.state === "failed" && item.realImageObservation);
      if (failed) break;
    }
    expect(failed).toMatchObject({ state: "failed", safeFailure: "definite_failure", lifecycle: { unresolved: false } });
    if (status === "failed_after_provider") {
      expect(failed?.taskId).toBe("J13");
      const item = await env.database.collections.generation_items.findOne({ itemKey: failed!.subjectId, status: "failed" });
      expect(item).toBeTruthy();
      expect(await env.database.collections.generation_jobs.findOne({ _id: item!.jobId })).toMatchObject({ status: "failed" });
    }
    const before = await env.database.collections.experiment_campaigns.findOne({ _id: env.campaignId });
    const calls = vi.mocked(env.runtime.start).mock.calls.length;
    await expect(env.inspect(failed!._id)).resolves.toMatchObject({ state: "failed", safeFailure: "definite_failure" });
    await expect(env.inspect(failed!._id)).resolves.toMatchObject({ state: "failed", lifecycle: { unresolved: false } });
    expect(await env.database.collections.experiment_campaigns.findOne({ _id: env.campaignId })).toEqual(before);
    expect(vi.mocked(env.runtime.start).mock.calls).toHaveLength(calls);
    expect((await env.repository.getOperation(failed!._id))?.realImageReservation).toEqual(failed!.realImageReservation);
    await env.database.collections.experiment_operations.updateOne({ _id: failed!._id },
      { $set: { "realImageReservation.evidenceDigest": "0".repeat(64) } });
    await expect(env.inspect(failed!._id)).rejects.toThrow("Retained Real image failure evidence differs.");
    expect(vi.mocked(env.runtime.start).mock.calls).toHaveLength(calls);
  }, 90_000);
  it("completes Kid generation and both multimodal reports without manual data repair", async () => {
    const env = await setup("playful_kid", "execution_v2");
    for (let step = 0; step < 180; step++) {
      const run = (await env.repository.getRun(env.runId))!;
      if (run.status === "completed") break;
      await advance(env, step);
    }
    const run = (await env.repository.getRun(env.runId))!;
    expect(run.status).toBe("completed");
    expect(run.generationCompletedAtMs).toBeTypeOf("number");
    const operations = await env.repository.listOperations(env.runId);
    const reports = operations.filter(item => item.realReportPreparation);
    expect(reports.map(item => item.role)).toEqual(["tester", "judge"]);
    for (const report of reports) {
      expect(report.state).toBe("succeeded");
      expect(report.realReportPreparation!.orderedImages).toHaveLength(4);
      expect(report.m4Observation?.issue).toBeNull();
      const throughReport = operations.filter(item => item.createdAtMs <= report.createdAtMs);
      const exposure = throughReport.reduce((total, item) => total +
        (item.m4Reservation?.settledMicrodollars ?? 0) + (item.m4Reservation?.unsettledMicrodollars ?? 0) +
        (item.realImageReservation?.settledMicrodollars ?? 0) + (item.realImageReservation?.unsettledMicrodollars ?? 0), 0);
      expect(report.m4Observation?.costEvidence?.estimatedUsd).toBe(exposure / 1_000_000);
    }
    expect(run.counters.payableImage).toBeGreaterThan(0);
    expect(run.counters.payableImage).toBe(run.counters.logicalImage);
    const artifacts = await env.database.collections.artifacts.find({ experimentRunId: env.runId }).toArray();
    expect(artifacts.length).toBeGreaterThan(0);
    for (const artifact of artifacts) {
      expect(artifact.state).toBe("approved");
      expect(await env.database.collections.approvals.findOne({ artifactVersionId: artifact.currentVersionId! })).toBeTruthy();
    }
    const reopened = new FilesystemAssetStore(env.root);
    const retainedFiles = [];
    for (const [id, bytes] of env.originals) {
      const asset = (await env.database.collections.assets.findOne({ _id: id }))!;
      expect(Uint8Array.from(await reopened.get(asset.uri))).toEqual(bytes);
      retainedFiles.push({ path: path.join(env.root, asset.uri), sha256: sha256(bytes) });
    }
    const independent = spawnSync(process.execPath, ["-e",
      "const fs=require('node:fs'),crypto=require('node:crypto');const files=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(files.map(f=>crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex')===f.sha256)))"],
    { input: JSON.stringify(retainedFiles), encoding: "utf8", timeout: 10_000 });
    expect(independent.status, independent.stderr).toBe(0);
    expect(JSON.parse(independent.stdout)).toEqual(retainedFiles.map(() => true));
    await withMongoTransaction(env.database, session => verifyExecutionAccounting(env.database, session, run));
    expect(env.runtime.retrieve).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  }, 180_000);

  it("preserves Parent multi-panel page sources in the first Real story-page image request", async () => {
    const env = await setup("enthusiast_parent");
    let storyImage;
    for (let step = 0; step < 160; step++) {
      await advance(env, step);
      storyImage = (await env.repository.listOperations(env.runId)).find(item => item.role === "image" && item.taskId === "J13" &&
        item.realImagePreparation && JSON.parse(item.realImagePreparation.requestJson).references.length > 0);
      if (storyImage) break;
    }
    expect(storyImage?.state).toBe("succeeded");
    const layoutArtifact = (await env.database.collections.artifacts.findOne({ experimentRunId: env.runId, taskId: "J11" }))!;
    const version = (await env.database.collections.artifact_versions.findOne({ _id: layoutArtifact.currentVersionId! }))!;
    const layout = parseStoredPageLayout("enthusiast_parent", JSON.parse(version.contentJson));
    expect(layout.pages).toHaveLength(6);
    expect(layout.pages.some(page => page.panels.length > 1)).toBe(true);
    expect(JSON.parse(storyImage!.realImagePreparation!.requestJson).operation).toBe("edit");
    expect(storyImage!.referenceUploadsJson).toBeTruthy();
  }, 180_000);

  it("revises a Creator reference sheet through the paid text/image contracts before explicit approval", async () => {
    const env = await setup("professional_creator"); env.reviseNextSheet();
    let revisedSheet;
    for (let step = 0; step < 120; step++) {
      await advance(env, step);
      const old = env.revisedVersion();
      if (!old) continue;
      const version = (await env.database.collections.artifact_versions.findOne({ _id: old }))!;
      revisedSheet = await env.database.collections.artifacts.findOne({ _id: version.artifactId });
      if (revisedSheet?.state === "approved" && revisedSheet.currentVersionId !== old) break;
    }
    expect(env.revisedVersion()).toBeTruthy();
    expect(revisedSheet).toMatchObject({ state: "approved" });
    expect(revisedSheet!.currentVersionId).not.toBe(env.revisedVersion());
    const approved = await env.database.collections.approvals.findOne({ artifactVersionId: revisedSheet!.currentVersionId! });
    expect(approved).toMatchObject({ origin: "explicit" });
    const images = (await env.repository.listOperations(env.runId)).filter(item => item.role === "image" && item.taskId === "J09");
    expect(images.length).toBeGreaterThanOrEqual(2);
    expect(images.every(item => item.state === "succeeded" && item.realImageObservation && item.realImageReservation)).toBe(true);
  }, 180_000);
});
