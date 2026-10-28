import { afterEach, describe, expect, it } from "vitest";
import { withMongoTransaction, type Database } from "@/db/client";
import type { ExperimentOperationDocument } from "@/db/documents";
import { createExecutionAllowanceLedger } from "@/db/experiment-execution-allowance";
import { createExperimentRepository } from "@/db/experiment-repository";
import { defaultExecutionAllowance, realExecutionPolicyFromM4TechnicalProfile } from "@/lib/experiment-runner/execution-policy";
import { m4PolicySnapshot, m4TokenPolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import type { RealImageResult } from "@/lib/experiment-runner/real-image-contract";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

// Ledger proof uses real disposable persistence. It does not stand in for
// claim authorization, original-byte materialization or the full persona journey.
async function setup(maxMicrodollars = 5000) {
  const db = await createTestDatabase({ seedAgents: false }); databases.push(db);
  const source = m4TestPolicy();
  const tokenPolicy = m4TokenPolicySnapshot({ version: "m4_context_policy_v2", basePolicyHash: m4PolicySnapshot(source).hash,
    warningInputTokens: 32000, maxInputTokens: 128000,
    requiredProviderAdapterIdentity: `langgenius/openai:1.0.7-dev5@${"a".repeat(64)}`,
    requiredProviderPackageSha256: "b".repeat(64), reference: "fake-provider-policy" });
  const profile = realExecutionPolicyFromM4TechnicalProfile(source, tokenPolicy, source.publications, {
    textPluginIdentity: `langgenius/openai:1.0.7-dev6@${"c".repeat(64)}`, textPackageSha256: "d".repeat(64),
    imagePluginIdentity: `langgenius/openai_tool:0.2.2-dev1@${"e".repeat(64)}`, imagePackageSha256: "f".repeat(64),
  });
  const ledger = createExecutionAllowanceLedger(db);
  await withMongoTransaction(db, session => ledger.create(session, { campaignId: id(1), mode: "real", persona: "playful_kid",
    profile, approvalId: id(2), reference: "nonbillable-persistence-fixture", totals: defaultExecutionAllowance("playful_kid", maxMicrodollars), nowMs: 1 }));
  const repository = createExperimentRepository(db, { realExecutionEnabled: true });
  await repository.createRun({ runId: id(10), bookletId: id(11), mode: "real", persona: "playful_kid",
    executionCampaignId: id(1), configuration: profile.publications.filter(item => item.persona === null || item.persona === "playful_kid")
      .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({
        role, taskId, appId, publishedWorkflowId, toolProviderId, ...(finalPageIllustration ? { finalPageIllustration } : {}),
      })), nowMs: 2 });
  const run = async () => (await repository.getRun(id(10)))!;
  const operation = (operationId = id(12)) => db.collections.experiment_operations.findOne({ _id: operationId });
  async function reserve(operationId = id(12)) {
    const row = { _id: operationId, runId: id(10), mode: "real", role: "image", providerKind: "image",
      state: "prepared", reservationCount: 0, idempotencyKey: `fake-${operationId}` } as ExperimentOperationDocument;
    await db.collections.experiment_operations.insertOne(row);
    return withMongoTransaction(db, async session => ledger.reserveRealImage(session, await run(), row, "1".repeat(64), 3));
  }
  const campaign = () => withMongoTransaction(db, session => ledger.current(session, id(1)));
  const settle = async (result: RealImageResult) => withMongoTransaction(db, async session =>
    ledger.settleRealImage(session, await run(), (await operation())!, result, 4));
  return { db, ledger, run, reserve, operation, campaign, settle };
}

const known = (outputTokens = 100): RealImageResult => ({ schemaVersion: "booklet_real_image_result_v1",
  requestDigest: "1".repeat(64), adapterIdentity: "m5-openai-image-bounded@1", dispatchStarted: true,
  requestedModel: "gpt-image-2.5-sunburst-2026-09-08", providerRequestId: "req_fake",
  status: "failed_after_provider", usage: { inputTokens: 1, outputTokens }, output: null,
  failure: { stage: "post_provider", code: "output_invalid" } });

describe("Real image planning liability persistence", () => {
  it("reserves one full balance when two image claims compete", async () => {
    const state = await setup();
    const results = await Promise.allSettled([state.reserve(), state.reserve(id(13))]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await state.campaign()).toMatchObject({ settledMicrodollars: 0, reservedMicrodollars: 5000, imageRequests: 1 });
    expect(await state.db.collections.experiment_operations.countDocuments({ runId: id(10), realImageReservation: { $exists: true } })).toBe(1);
  });
  it("reserves only the balance after prior charges and liabilities, then retains the attributable failed-output charge", async () => {
    const state = await setup();
    // A prior text attempt has a settled estimate and an outstanding fee hold.
    await state.db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { settledMicrodollars: 100, reservedMicrodollars: 50 } });
    expect(await state.reserve()).toMatchObject({ planningHoldMicrodollars: 4850, unsettledMicrodollars: 4850 });
    expect(await state.campaign()).toMatchObject({ settledMicrodollars: 100, reservedMicrodollars: 4900, imageRequests: 1 });
    expect(await state.settle(known())).toMatchObject({ reused: false, chargeMicrodollars: 3008, overrunMicrodollars: 0 });
    expect(await state.campaign()).toMatchObject({ settledMicrodollars: 3108, reservedMicrodollars: 50, imageRequests: 1 });
    expect((await state.operation())?.realImageObservation?.chargeBasis).toBe("upper_estimate");
  });

  it("persists the full known overrun once and verifies a lost acknowledgement after repository reconstruction", async () => {
    const state = await setup(100);
    await state.reserve();
    expect(await state.settle(known())).toMatchObject({ reused: false, chargeMicrodollars: 3008, overrunMicrodollars: 2908 });
    const before = await state.campaign();
    const restartedLedger = createExecutionAllowanceLedger(state.db);
    const receipt = await withMongoTransaction(state.db, async session => restartedLedger.settleRealImage(
      session, await state.run(), (await state.operation())!, known(), 5));
    expect(receipt).toEqual({ reused: true, chargeMicrodollars: 3008, overrunMicrodollars: 2908 });
    expect(await state.campaign()).toEqual(before);
    expect(before).toMatchObject({ settledMicrodollars: 3008, reservedMicrodollars: 0, imageRequests: 1 });
    expect(await withMongoTransaction(state.db, async session => state.ledger.check(session, await state.run(), "image", "image")))
      .toMatchObject({ reason: "monetary" });
    await expect(state.settle(known(101))).rejects.toThrow("observation changed");
  });

  it("keeps the full planning hold for unknown usage and does not reserve another image", async () => {
    const state = await setup();
    await state.reserve();
    const unknown: RealImageResult = { ...known(), status: "unknown_outcome", usage: null,
      failure: { stage: "provider", code: "request_failed" } };
    expect(await state.settle(unknown)).toMatchObject({ chargeMicrodollars: null, overrunMicrodollars: 0 });
    const before = await state.campaign();
    expect(before).toMatchObject({ settledMicrodollars: 0, reservedMicrodollars: 5000, imageRequests: 1 });
    expect(await state.settle(unknown)).toMatchObject({ reused: true, chargeMicrodollars: null });
    expect(await state.campaign()).toEqual(before);
    await expect(state.reserve(id(13))).rejects.toThrow("allowance is exhausted");
    expect(await state.campaign()).toEqual(before);
  });

  it("rejects evidence for another request without releasing the original reservation", async () => {
    const state = await setup();
    await state.reserve();
    const before = await state.campaign();
    await expect(state.settle({ ...known(), requestDigest: "2".repeat(64) })).rejects.toThrow("attributable hold");
    expect(await state.campaign()).toEqual(before);
    expect((await state.operation())?.realImageReservation?.unsettledMicrodollars).toBe(5000);
  });
});
