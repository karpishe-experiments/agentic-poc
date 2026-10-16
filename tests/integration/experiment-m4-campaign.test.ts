import { afterEach, describe, expect, it } from "vitest";
import { withMongoTransaction, type Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExperimentCampaignLedger } from "@/db/experiment-campaign";
import { m4MaximumCharge } from "@/lib/experiment-runner/m4-policy";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";
import type { Persona } from "@/lib/contracts/experiment-runner";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
async function setup(assumedCount = false) {
  const db = await createTestDatabase({ seedAgents: false }); databases.push(db);
  const policy = m4TestPolicy();
  if (assumedCount) { policy.countChargeStatus = "assumed"; policy.countChargeCeilingMicrodollars = 900; }
  const authority = { policy, grant: { campaignId: id(1), reference: "fake-provider-test-grant-only" } };
  const repo = createExperimentRepository(db, { m4Authority: authority });
  const ledger = createExperimentCampaignLedger(db, authority);
  const creation = (n: number, persona: Persona = "playful_kid") => ({ runId: id(n), bookletId: id(n + 1), persona,
    mode: "balanced", campaignId: id(1), configuration: policy.publications.filter((p) => p.persona === null || p.persona === persona)
      .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({ role, taskId, appId, publishedWorkflowId, toolProviderId,
        ...(finalPageIllustration === true ? { finalPageIllustration } : {}) })), nowMs: 1 });
  async function prepare(n: number, operationId: number, role: "manager" | "judge" = "manager") {
    const run = (await repo.getRun(id(n)))!;
    // Judge fixtures exercise ledger limits, not the report-order repository gate.
    const operation = await repo.prepareOperation({ runId: run._id, operationId: id(operationId), expectedRevision: run.revision,
      role: "manager", taskId: null, subjectKind: "book", subjectId: run.bookletId,
      inputFingerprint: "b".repeat(64), attempt: 1, providerKind: "text", nowMs: 2 });
    if (role === "judge") await db.collections.experiment_operations.updateOne({ _id: operation._id }, { $set: { role } });
    return operation;
  }
  const reserve = (n: number, op: number, digest = "c".repeat(64)) => withMongoTransaction(db, async (session) => {
    const run = (await db.collections.experiment_runs.findOne({ _id: id(n) }, { session }))!;
    const operation = (await db.collections.experiment_operations.findOne({ _id: id(op) }, { session }))!;
    return ledger.reserve(session, run, operation, digest, 3);
  });
  const settle = (op: number, chargeMicrodollars: number, digest = "d".repeat(64)) => withMongoTransaction(db, async (session) =>
    ledger.settle(session, (await db.collections.experiment_operations.findOne({ _id: id(op) }, { session }))!, { digest, chargeMicrodollars }, 4));
  return { db, policy, authority, repo, ledger, creation, prepare, reserve, settle };
}

describe("M4 campaign ledger with real persistence and no providers", () => {
  it("still rejects missing, duplicate or changed binding identities before saving the run", async () => {
    const { db, repo, creation } = await setup();
    const input = creation(10);
    const expected = input.configuration;
    for (const configuration of [expected.slice(1), [expected[0], ...expected.slice(0, -1)],
      expected.map((binding, i) => i ? binding : { ...binding, publishedWorkflowId: id(999) }),
      expected.map((binding) => binding.role === "image" ? { ...binding, finalPageIllustration: undefined } : binding)]) {
      await expect(repo.createRun({ ...input, configuration })).rejects.toThrow();
      expect(await db.collections.experiment_runs.countDocuments({})).toBe(0);
      expect(await db.collections.experiment_campaigns.countDocuments({})).toBe(0);
    }
  });
  it("retains the unverified count allowance after attributable model usage settles", async () => {
    const { db, repo, creation, prepare, reserve, settle } = await setup(true);
    await repo.createRun(creation(10)); await prepare(10, 12); await reserve(10, 12);
    expect(await db.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ reservedMicrodollars: 5924 });
    expect(await settle(12, 123)).toBe("settled");
    expect(await settle(12, 123)).toBe("reused");
    expect(await db.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ reservedMicrodollars: 900, settledMicrodollars: 123 });
    expect(await db.collections.experiment_operations.findOne({ _id: id(12) })).toMatchObject({ m4Reservation: { unsettledMicrodollars: 900 } });
  });
  it("requires protected authority, freezes policy separately, claims slots once and preserves historical snapshots", async () => {
    const { db, repo, creation } = await setup();
    await expect(createExperimentRepository(db).createRun(creation(10))).rejects.toMatchObject({ code: "invalid_state" });
    const [first, duplicate] = await Promise.all([repo.createRun(creation(10)), repo.createRun(creation(10))]);
    expect(first.m4).toEqual(duplicate.m4);
    expect(first.configurationHash).toEqual(duplicate.configurationHash);
    await expect(repo.createRun(creation(20))).rejects.toThrow("Persona already");
    await expect(repo.createRun(creation(30, "enthusiast_parent"))).rejects.toThrow("preceding persona");
    await db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { status: "completed", evaluationStatus: "complete", generationCompletedAtMs: 5 } });
    expect((await repo.createRun(creation(30, "enthusiast_parent"))).persona).toBe("enthusiast_parent");
    await expect(repo.createRun({ ...creation(40, "professional_creator"), predecessorRunId: id(10) })).rejects.toThrow("initial run");
    expect(await db.collections.experiment_runs.countDocuments()).toBe(2);
    const old = await repo.createRun({ ...creation(50), mode: "simulated", campaignId: undefined, configuration: [] });
    expect(old).not.toHaveProperty("m4");
    expect(old.configurationJson).toBe("[]");
    expect(await db.collections.booklets.findOne({ _id: id(21) })).toBeNull();
  });
  it("reserves once under duplicate concurrency, retains uncertain charges and settles once", async () => {
    const { db, repo, creation, prepare, reserve, settle } = await setup();
    await repo.createRun(creation(10)); await prepare(10, 12);
    const values = await Promise.all([reserve(10, 12), reserve(10, 12)]);
    expect(values[0]).toEqual(values[1]);
    let campaign = (await db.collections.experiment_campaigns.findOne({ _id: id(1) }))!;
    expect(campaign).toMatchObject({ requests: 1, reservedMicrodollars: 5024, settledMicrodollars: 0 });
    await db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { state: "unknown" } });
    expect((await db.collections.experiment_campaigns.findOne({ _id: id(1) }))!.reservedMicrodollars).toBe(5024);
    const results = await Promise.all([settle(12, 123), settle(12, 123)]);
    expect(results.sort()).toEqual(["reused", "settled"]);
    campaign = (await db.collections.experiment_campaigns.findOne({ _id: id(1) }))!;
    expect(campaign).toMatchObject({ requests: 1, reservedMicrodollars: 0, settledMicrodollars: 123 });
    expect(await settle(12, 124)).toBe("conflict");
    expect(await db.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ state: "stopped", settledMicrodollars: 123 });
  });
  it("admits exactly $5 and rejects one microdollar above without a partial write", async () => {
    const { db, repo, creation, prepare, reserve } = await setup();
    await repo.createRun(creation(10)); await prepare(10, 12);
    await db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { settledMicrodollars: 5_000_000 - 5024 + 1 } });
    await expect(reserve(10, 12)).rejects.toThrow("monetary allowance");
    expect(await db.collections.experiment_operations.findOne({ _id: id(12) })).not.toHaveProperty("m4Reservation");
    await db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $inc: { settledMicrodollars: -1 } });
    await reserve(10, 12);
    const campaign = (await db.collections.experiment_campaigns.findOne({ _id: id(1) }))!;
    expect(campaign.settledMicrodollars + campaign.reservedMicrodollars).toBe(5_000_000);
  });
  it("rolls back reservation writes when the owning claim transaction aborts", async () => {
    const { db, repo, ledger, creation, prepare } = await setup();
    await repo.createRun(creation(10)); await prepare(10, 12);
    await expect(withMongoTransaction(db, async (session) => {
      const run = (await db.collections.experiment_runs.findOne({ _id: id(10) }, { session }))!;
      const operation = (await db.collections.experiment_operations.findOne({ _id: id(12) }, { session }))!;
      await ledger.reserve(session, run, operation, "c".repeat(64), 3);
      throw new Error("owning claim failed");
    })).rejects.toThrow("owning claim failed");
    expect(await db.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ requests: 0, reservedMicrodollars: 0 });
    expect(await db.collections.experiment_operations.findOne({ _id: id(12) })).not.toHaveProperty("m4Reservation");
  });
  it("serializes competing reservations at the campaign boundary", async () => {
    const { db, repo, creation, prepare, reserve } = await setup();
    await repo.createRun(creation(10)); await prepare(10, 12);
    // Adversarial ledger fixture: two active owners. Normal persona order cannot
    // create this state, but the shared dollar cap must still hold under overlap.
    const run = (await db.collections.experiment_runs.findOne({ _id: id(10) }))!;
    const operation = (await db.collections.experiment_operations.findOne({ _id: id(12) }))!;
    await db.collections.experiment_runs.insertOne({ ...run, _id: id(20), bookletId: id(21), persona: "enthusiast_parent", activeOperationId: id(22) });
    await db.collections.experiment_operations.insertOne({ ...operation, _id: id(22), runId: id(20), subjectId: id(21), idempotencyKey: "another-fixture-operation" });
    await db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { "slots.enthusiast_parent": id(20), settledMicrodollars: 5_000_000 - 5024 } });
    const outcomes = await Promise.allSettled([reserve(10, 12), reserve(20, 22)]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const campaign = (await db.collections.experiment_campaigns.findOne({ _id: id(1) }))!;
    expect(campaign).toMatchObject({ requests: 1, reservedMicrodollars: 5024 });
    expect(campaign.reservedMicrodollars + campaign.settledMicrodollars).toBe(5_000_000);
  });
  it("rejects request exhaustion, Pause, expired deadlines and changed request identity", async () => {
    const { db, repo, creation, prepare, reserve } = await setup();
    await repo.createRun(creation(10)); await prepare(10, 12);
    for (const fields of [{ requests: 500 }, { "requestCounts.playful_kid": 120 }]) {
      await db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: fields });
      await expect(reserve(10, 12)).rejects.toThrow("request allowance");
      await db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { requests: 0, "requestCounts.playful_kid": 0 } });
    }
    await db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { pauseRequested: true } });
    await expect(reserve(10, 12)).rejects.toThrow("cannot reserve");
    await db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { pauseRequested: false } });
    await db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { deadlineAtMs: 3 } });
    await expect(reserve(10, 12)).rejects.toThrow("cannot reserve");
    await db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { deadlineAtMs: 100 } });
    await reserve(10, 12);
    await expect(reserve(10, 12, "e".repeat(64))).rejects.toThrow("identity changed");
    expect(await repo.claimOperation({ runId: id(10), operationId: id(12), workflowRunId: id(13), parentWorkflowRunId: null, nowMs: 4 })).toMatchObject({ started: false, reason: "blocked" });
  });
  it("bounds judges and retains above-reservation attributable charges while stopping admission", async () => {
    const { db, repo, policy, creation, prepare, reserve, settle } = await setup();
    await repo.createRun(creation(10)); await prepare(10, 12, "judge");
    await db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { judgeRunIds: [id(20), id(30), id(40)] } });
    await expect(reserve(10, 12)).rejects.toThrow("Judge allowance");
    await db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { judgeRunIds: [id(10)] } });
    await expect(reserve(10, 12)).rejects.toThrow("Judge allowance");
    await db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { judgeRunIds: [] } });
    await reserve(10, 12);
    const charge = m4MaximumCharge(policy, "judge") + 1;
    await settle(12, charge);
    expect(await db.collections.experiment_campaigns.findOne({ _id: id(1) })).toMatchObject({ state: "stopped", settledMicrodollars: charge, reservedMicrodollars: 0, requests: 1 });
  });
});
