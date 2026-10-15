import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

async function setup() {
  const db = await createTestDatabase({ seedAgents: false });
  databases.push(db);
  const policy = m4TestPolicy();
  const repository = createExperimentRepository(db, {
    m4Authority: { policy, grant: { campaignId: id(1), reference: "fake-provider-test-grant-only" } },
  });
  const run = await repository.createRun({ runId: id(10), bookletId: id(11), persona: "playful_kid",
    mode: "balanced", campaignId: id(1), nowMs: 1,
    configuration: policy.publications.filter((p) => p.persona === null || p.persona === "playful_kid")
      .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({
        role, taskId, appId, publishedWorkflowId, toolProviderId,
        ...(finalPageIllustration === true ? { finalPageIllustration } : {}),
      })),
  });
  await repository.prepareOperation({ runId: run._id, operationId: id(12), expectedRevision: run.revision,
    role: "manager", taskId: null, subjectKind: "book", subjectId: run.bookletId,
    inputFingerprint: "b".repeat(64), attempt: 1, providerKind: "text", nowMs: 2 });
  const context = createExperimentContextService(db, { store: () => { throw new Error("No asset access during this preparation slice"); } });
  const identity = { runId: id(10), operationId: id(12), nowMs: 3 };
  const records = async () => ({
    run: await db.collections.experiment_runs.findOne({ _id: id(10) }),
    operation: await db.collections.experiment_operations.findOne({ _id: id(12) }),
    campaign: await db.collections.experiment_campaigns.findOne({ _id: id(1) }),
  });
  return { db, context, identity, records };
}

describe("internal M4 preparation context", () => {
  it("projects before claim without granting execution or changing saved records", async () => {
    const { context, identity, records } = await setup();
    const before = await records();
    const projection = await context.getPreparationContext(identity);
    expect(projection).toMatchObject({ role: "manager", run: { runId: id(10), mode: "balanced", revision: before.run!.revision } });
    expect(projection).not.toHaveProperty("started");
    await expect(context.getOperationContext({ runId: id(10), operationId: id(12), workflowRunId: id(13), parentWorkflowRunId: null }))
      .rejects.toThrow("Operation claim identity is not current");
    expect(await records()).toEqual(before);
  });

  it("rejects Pause, deadline expiry, inactive ownership and reserved or dispatched work without mutation", async () => {
    const { db, context, identity, records } = await setup();
    const original = await records();
    const changes: { run?: Partial<ExperimentRunDocument>; operation?: Partial<ExperimentOperationDocument> }[] = [
      { run: { pauseRequested: true } }, { run: { status: "blocked" } }, { run: { activeOperationId: null } },
      { run: { mode: "simulated" } }, { run: { m4: undefined } },
      { operation: { deadlineAtMs: identity.nowMs } }, { operation: { deadlineAtMs: null } },
      { operation: { state: "started" } }, { operation: { reservationCount: 1 } },
      { operation: { m4Reservation: { campaignId: id(1), policyHash: original.run!.m4!.policyHash,
        requestDigest: "c".repeat(64), bucket: "decision", maximumMicrodollars: 5024,
        unsettledMicrodollars: 5024, settledMicrodollars: null, evidenceDigest: null } } },
      { operation: { dispatchStartedAtMs: 2 } }, { operation: { workflowRunId: id(13) } },
      { operation: { role: "image", providerKind: "image" } },
    ];
    for (const change of changes) {
      await db.collections.experiment_runs.replaceOne({ _id: id(10) }, { ...original.run!, ...change.run });
      await db.collections.experiment_operations.replaceOne({ _id: id(12) }, { ...original.operation!, ...change.operation });
      const before = await records();
      await expect(context.getPreparationContext(identity)).rejects.toThrow("not eligible for internal request preparation");
      expect(await records()).toEqual(before);
    }
  });

  it("rejects final tester and judge reports when saved generation evidence is incomplete", async () => {
    const { db, context, identity, records } = await setup();
    await db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { generationCompletedAtMs: 2 } });
    for (const role of ["tester", "judge"] as const) {
      await db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { role } });
      const before = await records();
      await expect(context.getPreparationContext(identity)).rejects.toThrow("Report preparation requires complete current generation evidence");
      expect(await records()).toEqual(before);
    }
  });
});
