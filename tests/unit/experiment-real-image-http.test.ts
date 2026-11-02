import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import * as repositoryModule from "@/db/experiment-repository";
import * as contextModule from "@/lib/experiment-runner/context";
import type { AssetStore } from "@/lib/assets/asset-store";
import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";
import { diagnosticExecutionAmendment } from "@/lib/experiment-runner/execution-amendment";
import { executionPolicySnapshot, realExecutionPolicyFromM4TechnicalProfile } from "@/lib/experiment-runner/execution-policy";
import { m4CanonicalJson } from "@/lib/experiment-runner/m4-request";
import { m4TokenPolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import type { BookletRunnerConfig } from "@/lib/experiment-runner/config";
import type { WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { imageReplacementEvidence } from "@/db/experiment-image-replacement";
import { isUnclaimedImageFailure } from "@/lib/experiment-runner/image-pre-provider-failure";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";

afterEach(() => vi.restoreAllMocks());

function fixture(amended = true) {
  const source = m4TestPolicy(), token = m4TokenPolicySnapshot({ version: "m4_context_policy_v2", basePolicyHash: "a".repeat(64),
    maxInputTokens: 128000, warningInputTokens: 32000, requiredProviderAdapterIdentity: `langgenius/openai:1.0.7-dev5@${"b".repeat(64)}`,
    requiredProviderPackageSha256: "c".repeat(64), reference: "nonbillable-http-fixture" });
  const adapters = { textPluginIdentity: `langgenius/openai:1.0.7-dev6@${"d".repeat(64)}`, textPackageSha256: "e".repeat(64),
    imagePluginIdentity: `langgenius/openai_tool:0.2.2-dev2@${"f".repeat(64)}`, imagePackageSha256: "a".repeat(64) };
  const original = executionPolicySnapshot(realExecutionPolicyFromM4TechnicalProfile(source, token, source.publications, adapters));
  const configuration = (policy: typeof original.policy) => m4CanonicalJson(policy.publications.filter(p => p.persona === null || p.persona === "playful_kid")
    .map(({ persona: _persona, ...binding }) => { void _persona; return binding; }));
  const run = { _id: id(1), mode: "real", persona: "playful_kid", execution: { campaignId: id(2), profileHash: original.hash, profileJson: original.json },
    configurationJson: configuration(original.policy) } as ExperimentRunDocument;
  const next = structuredClone(original.policy);
  if (amended) next.publications.find(p => p.role === "image")!.publishedWorkflowId = id(400);
  const amendment = diagnosticExecutionAmendment(run, next, configuration(next), "operator-approved diagnostic release", 1);
  run.executionAmendments = amendment ? [amendment] : [];
  const operation = { _id: id(3), runId: run._id, mode: "real", role: "image", taskId: "J13", providerKind: "image",
    state: "prepared", parentWorkflowRunId: id(4), workflowRunId: id(5), dispatchStartedAtMs: Date.now(), deadlineAtMs: Date.now() + 300000,
    inputFingerprint: "1".repeat(64), realImagePreparation: { requestJson: "immutable prepared request" },
    ...(amendment ? { executionAmendmentId: amendment.id } : {}) } as ExperimentOperationDocument;
  const bindings = next.publications.map(binding => ({ ...binding, apiKey: "fake-key" })) as BookletRunnerConfig["bindings"];
  const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid",
    callbackKey: "x".repeat(32), bindings, real: { state: "ready", bindings, ...adapters, sourcePolicy: source, tokenPolicy: token, nativeFileFormat: "base64" } };
  const claim = vi.fn().mockResolvedValue({ started: true });
  vi.spyOn(repositoryModule, "createExperimentRepository").mockReturnValue({ getRun: async () => run,
    getOperation: async () => operation, claimOperation: claim } as unknown as ReturnType<typeof repositoryModule.createExperimentRepository>);
  vi.spyOn(contextModule, "createExperimentContextService").mockReturnValue({} as ReturnType<typeof contextModule.createExperimentContextService>);
  const retrieve = vi.fn().mockResolvedValue({ kind: "execution", execution: { id: id(5),
    workflow_id: bindings.find(b => b.role === "image")!.publishedWorkflowId, status: "running", outputs: {} } });
  const http = createBookletRunnerHttp({ database: () => ({} as Database), config: () => ({ enabled: true, config }),
    store: () => ({} as AssetStore), mutate: async action => action(), runtime: () => ({ retrieve } as unknown as WorkflowRuntime) });
  const authorize = () => http.tool(new Request(`${config.publicOrigin}/api/experiments/booklet-tools/authorize`, {
    method: "POST", headers: { "x-booklet-tool-key": config.callbackKey }, body: JSON.stringify({ runId: run._id,
      operationId: operation._id, parentWorkflowRunId: operation.parentWorkflowRunId, workflowRunId: id(5) }),
  }), "authorize");
  return { run, operation, config, claim, retrieve, authorize };
}

describe("Real image HTTP authorization publication ownership", () => {
  it.each([false, true])("authorizes the operation's saved publication (amended=%s)", async amended => {
    const env = fixture(amended), baseline = env.run.configurationJson;
    const response = await env.authorize();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { started: true, requestJson: "immutable prepared request" } });
    expect(env.claim).toHaveBeenCalledWith(expect.objectContaining({ operationId: env.operation._id }),
      { workflowId: env.config.real!.bindings.find(b => b.role === "image")!.publishedWorkflowId });
    expect(env.run.configurationJson).toBe(baseline);
  });

  it.each(["missing", "corrupt", "unamended", "different", "duplicate"] as const)("rejects %s binding evidence without claiming", async kind => {
    const env = fixture();
    if (kind === "missing") env.operation.executionAmendmentId = "missing";
    if (kind === "corrupt") env.run.executionAmendments![0].profileHash = "0".repeat(64);
    if (kind === "unamended") delete env.operation.executionAmendmentId;
    if (kind === "different") env.config.real!.bindings.find(b => b.role === "image")!.publishedWorkflowId = id(401);
    if (kind === "duplicate") env.config.real!.bindings.push({ ...env.config.real!.bindings.find(b => b.role === "image")! });
    expect((await env.authorize()).status).toBe(409);
    expect(env.claim).not.toHaveBeenCalled();
    expect(env.retrieve).not.toHaveBeenCalled();
  });
});

describe("unclaimed image failure eligibility", () => {
  function failed() {
    const env = fixture();
    Object.assign(env.operation, { state: "failed", safeFailure: "definite_failure", remoteStatus: "failed",
      reservationCount: 0, imageRequestJson: "{}", dependencyVersionIds: [], deadlineAtMs: 100,
      verifiedWorkflowId: undefined });
    env.run.configurationHash = "a".repeat(64);
    return env;
  }
  it("hashes absent reservation and observation without changing the retained attempt", () => {
    const env = failed(), before = JSON.stringify(env.operation);
    expect(isUnclaimedImageFailure(env.operation)).toBe(true);
    expect(imageReplacementEvidence(env.run, env.operation)).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(env.operation)).toBe(before);
  });
  it.each(["reservationCount", "verifiedWorkflowId", "authorizationClaim", "resultFinalizationClaim",
    "imageCompletionClaim", "resultJson", "materializationJson", "realImageReservation", "m4Reservation",
    "realImageObservation", "remoteStatus"])("rejects ambiguous or authorized evidence: %s", key => {
    const env = failed();
    Object.assign(env.operation, { [key]: key === "reservationCount" ? 1 : "present" });
    expect(isUnclaimedImageFailure(env.operation)).toBe(false);
  });
});
