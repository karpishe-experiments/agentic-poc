import { afterEach, expect, it } from "vitest";
import { withMongoTransaction, type Database } from "@/db/client";
import { readExperimentEvaluationOperations, assertExperimentEvaluationOrder } from "@/db/experiment-completion";
import type { ExperimentRunDocument } from "@/db/documents";
import { buildFailureDiagnostics } from "@/lib/experiment-runner/failure-diagnostics";
import { recentDiagnostics } from "@/lib/experiment-runner/diagnostics";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

let database: Database | undefined;
afterEach(async () => { if (database) await closeTestDatabase(database); database = undefined; });

it("classifies malformed saved reports while preserving the original parse rejection", async () => {
  database = await createTestDatabase({ seedAgents: false });
  const run = { _id: "malformed-report", generationCompletedAtMs: 1, generationVersionIds: [], configurationJson: "[]" } as unknown as ExperimentRunDocument;
  await database.database.collection<{ _id: string }>("experiment_operations").insertOne({ _id: "malformed", ...{
    idempotencyKey: "malformed", runId: run._id, state: "succeeded", role: "tester", resultJson: "{malformed",
  } });
  const error = await withMongoTransaction(database, session => assertExperimentEvaluationOrder(database!, session, run, "judge")).catch(error => error);
  expect(error).toBeInstanceOf(SyntaxError);
  expect(buildFailureDiagnostics(error, { phase: "evaluation_completion", timestampMs: 1, startedAt: performance.now() }))
    .toMatchObject({ reason: "invalid_report_evidence" });
});

it.each(["playful_kid", "enthusiast_parent", "professional_creator"])(
  "keeps %s evaluation inputs exact without unused preparations", async persona => {
    database = await createTestDatabase({ seedAgents: false });
    const runId = `evaluation-${persona}`;
    const consumed = { role: "tester", taskId: null, subjectKind: "book", subjectId: "book", providerKind: "text",
      mode: "balanced", reservationCount: 1, workflowRunId: "workflow", verifiedWorkflowId: "publication", dispatchStartedAtMs: 1 };
    const payloads = ['{"kind":"decision"}', '{"kind":"feedback","payload":{"exact":"\\n雪"}}', '{malformed'];
    // Raw collection insertion permits extra legacy fields without changing the
    // application schema. The reader must neither parse nor silently skip them.
    const collection = database.database.collection<{ _id: string; [key: string]: unknown }>("experiment_operations");
    await collection.insertMany(payloads.map((resultJson, index) => ({ _id: `${runId}-${index}`, idempotencyKey: `${runId}-${index}`, runId,
      state: "succeeded", ...consumed, resultJson, m4Preparation: { requestJson: "x".repeat(300_000) },
      referenceUploadsJson: "unused", extraLegacyField: "preserve in storage" })));
    await collection.insertMany([
      { _id: `${runId}-failed`, idempotencyKey: `${runId}-failed`, runId, ...consumed, state: "failed" },
      { _id: `${runId}-manager`, idempotencyKey: `${runId}-manager`, runId, ...consumed, role: "manager", state: "succeeded" },
      { _id: `${runId}-foreign`, idempotencyKey: `${runId}-foreign`, runId: "foreign", ...consumed, state: "succeeded" },
    ]);
    const filter = { runId, state: "succeeded", role: { $in: ["tester", "judge"] } };
    const original = await collection.find(filter).toArray();
    const projected = await withMongoTransaction(database, session => readExperimentEvaluationOperations(database!, session, runId));
    expect(projected).toEqual(original.map(row => Object.fromEntries(
      ["_id", ...Object.keys(consumed), "resultJson"].map(key => [key, row[key]]))));
    expect(JSON.stringify(projected)).not.toContain("m4Preparation");
    expect(Buffer.byteLength(JSON.stringify(projected))).toBeLessThan(Buffer.byteLength(JSON.stringify(original)) / 100);
    expect(await collection.find(filter).toArray()).toEqual(original);
    const event = recentDiagnostics(runId, 10).events.find(event => event.phase === "evaluation_operations_read");
    expect(event).toMatchObject({ outcome: "succeeded", queryCount: 1, readRows: 3 });
    expect(event?.readJsonBytes).toBe(projected.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row)), 0));
    expect(projected.map(row => row.resultJson)).toEqual(payloads);
  });
