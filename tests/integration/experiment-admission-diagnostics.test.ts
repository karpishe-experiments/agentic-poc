import { afterEach, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import type { M4Authority } from "@/db/experiment-campaign";
import { diagnoseAdmissionRead } from "@/db/experiment-admission-diagnostics";
import { observeMongoRead } from "@/db/mongo-read-diagnostics";
import { withOperationBudget } from "@/lib/operations/budget";
import { recentDiagnostics } from "@/lib/experiment-runner/diagnostics";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { m4TestId as id, m4TestPolicy } from "@/tests/helpers/m4-policy";
const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); vi.unstubAllEnvs(); });

it("reads only retained predecessor proofs and plans without changing persisted evidence", async () => {
  vi.stubEnv("DEPLOYMENT_ENV", "_staging");
  const db = await createTestDatabase({ seedAgents: false }); databases.push(db);
  const policy = m4TestPolicy();
  const authority: M4Authority = { policy, grant: { campaignId: id(1), reference: "diagnostic-fixture",
    remainingPersonaAdmission: { anchorRunId: id(10), anchorRevision: 0, personas: ["enthusiast_parent", "professional_creator"], reference: "diagnostic-fixture" } } };
  const repository = createExperimentRepository(db, { m4Authority: authority, m4ExecutionEnabled: true, elapsedNow: () => 0 });
  await repository.createRun({ runId: id(10), bookletId: id(11), persona: "playful_kid", mode: "balanced", campaignId: id(1), nowMs: 1,
    configuration: policy.publications.filter(p => p.persona === null || p.persona === "playful_kid")
      .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({
        role, taskId, appId, publishedWorkflowId, toolProviderId, ...(finalPageIllustration ? { finalPageIllustration } : {}),
      })) });
  await repository.prepareOperation({ runId: id(10), operationId: id(12), expectedRevision: 0, role: "manager", taskId: null,
    subjectKind: "book", subjectId: id(11), inputFingerprint: "b".repeat(64), attempt: 1, providerKind: "text", nowMs: 2 });
  const proof = "private retained proof ".repeat(50_000);
  await db.collections.experiment_operations.updateOne({ _id: id(12) }, { $set: { state: "failed", resultJson: proof, safeFailure: "definite_failure" } });
  await db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { status: "completed", activeOperationId: null, generationCompletedAtMs: 3, evaluationStatus: "failed" } });
  const kid = (await db.collections.experiment_runs.findOne({ _id: id(10) }))!;
  await db.collections.experiment_runs.insertOne({ ...kid, _id: id(20), bookletId: id(21), persona: "enthusiast_parent" });
  await db.collections.experiment_campaigns.updateOne({ _id: id(1) }, { $set: { state: "stopped", "slots.enthusiast_parent": id(20) } });
  const snapshot = async () => ({ campaign: await db.collections.experiment_campaigns.findOne({ _id: id(1) }),
    runs: await db.collections.experiment_runs.find({}).sort({ _id: 1 }).toArray(), operations: await db.collections.experiment_operations.find({}).toArray() });
  const before = await snapshot();
  for (const persona of ["playful_kid", "enthusiast_parent"] as const) for (const part of ["proofs", "plan"] as const) {
    const result = await withOperationBudget(Date.now() + 30_000, () => diagnoseAdmissionRead(db, authority, persona, part));
    expect(result).not.toHaveProperty("failure");
    expect(result.metricsStatus).toBe("observed");
    expect(result.compression).toEqual({ state: "configured", requested: "zlib", negotiated: "unavailable" });
    expect(result.metrics.commands.some(command => command.command === (part === "plan" ? "explain" : "find"))).toBe(true);
    expect(result.metrics.checkoutCount).toBeGreaterThan(0);
    expect(result.metrics.commands.some(command => command.phase === part)).toBe(true);
    if (part === "proofs") expect(result.value).toMatchObject({ rows: persona === "playful_kid" ? 1 : 0 });
    else expect(result.value).toMatchObject({ plan: { scan: persona === "playful_kid" ? "index" : "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("private retained proof");
    const retained = recentDiagnostics(result.runId, 1).admissionReads[0];
    expect(retained).toMatchObject(result);
    expect(retained.timestamp).toBeTruthy();
  }
  expect(await snapshot()).toEqual(before);
  await db.collections.experiment_runs.updateOne({ _id: id(10) }, { $set: { activeOperationId: id(12) } });
  const blocked = await diagnoseAdmissionRead(db, authority, "playful_kid", "proofs"); expect(blocked).toHaveProperty("failure");
  await expect(withOperationBudget(Date.now() - 1, () => diagnoseAdmissionRead(db, authority, "playful_kid", "proofs"))).rejects.toThrow();
  const batches = await observeMongoRead(() => db.collections.experiment_runs.find({}, { batchSize: 1 }).toArray());
  expect(batches.metrics.commands.some(command => command.command === "getMore" && command.batchRows === 1)).toBe(true);
});
