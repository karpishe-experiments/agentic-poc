import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, closeTestDatabase } from "@/tests/helpers/mongodb";
import type { Database } from "@/db/client";
import { m4TestPolicy } from "@/tests/helpers/m4-policy";
import { m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { withOperationBudget } from "@/lib/operations/budget";
import { diagnosePreparationRead } from "@/db/experiment-preparation-diagnostics";

const runId = "47894c71-7991-4b15-8dc2-810395ec3f01";
const campaignId = "690b0237-9c0d-4eb2-99ec-edf02356b70a";
const failureId = "928cb32d-daf7-4703-b005-fdaf076d6cb6";
const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

describe("saved preparation read probe", () => {
  it("compares the fixed saved rows under snapshot and leaves every source document unchanged", async () => {
    const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
    const policy = m4TestPolicy(), snapshot = m4PolicySnapshot(policy);
    const authority = { policy, grant: { campaignId, reference: "fixed-reference" } } as never;
    const c = database.database;
    const raw = (name: string) => c.collection<{ _id: string; [key: string]: unknown }>(name);
    await raw("experiment_campaigns").insertOne({ _id: campaignId, state: "stopped", slots: { professional_creator: runId },
      policyHash: snapshot.hash, policyJson: snapshot.json, grantReference: "fixed-reference" });
    await raw("experiment_runs").insertOne({ _id: runId, persona: "professional_creator", mode: "balanced",
      m4: { campaignId, policyHash: snapshot.hash, policyJson: snapshot.json }, status: "blocked", revision: 470,
      bookletId: "book", generationCompletedAtMs: null, activeOperationId: null, preparation: null, pauseRequested: false,
      pendingDecisionJson: null, activeDelegationId: null });
    await raw("experiment_operations").insertMany([
      { _id: failureId, idempotencyKey: "failure", runId, state: "failed", role: "specialist", taskId: "J12", subjectKind: "page", subjectId: "page-4",
        providerKind: "text", reservationCount: 0, workflowRunId: null, lifecycle: { phase: "finished", unresolved: false } },
      { _id: "prior", idempotencyKey: "prior", runId, state: "succeeded", role: "manager", taskId: null, subjectKind: "book", subjectId: "book",
        createdAtMs: 1, resultJson: "private manager result", workflowRunId: "workflow", mode: "balanced",
        reservationCount: 1, verifiedWorkflowId: "published", m4Preparation: { systemPrompt: "private prompt" } },
      { _id: "question", idempotencyKey: "question", runId, state: "succeeded", role: "specialist", taskId: "J12", subjectKind: "page", subjectId: "page-4",
        createdAtMs: 2, resultJson: "private question", m4Preparation: { systemPrompt: "private prompt" } },
    ]);
    await raw("messages").insertOne({ _id: "message", experimentRunId: runId, role: "user", sequence: 1,
      uiMessageJson: "private answer", privateField: "private metadata" });
    const before = await Promise.all(["experiment_campaigns", "experiment_runs", "experiment_operations", "messages"]
      .map(async name => [name, await raw(name).find().sort({ _id: 1 }).toArray()]));
    for (const part of ["questions", "manager"] as const) {
      const result = await withOperationBudget(Date.now() + 30_000, () => diagnosePreparationRead(database, authority, part));
      expect(Object.values(result.reads).every(read => read.equivalent && read.original.returnedJsonBytes > read.projected.returnedJsonBytes)).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(/private|prompt|answer/i);
      expect(result.failure).toBeUndefined();
    }
    const after = await Promise.all(["experiment_campaigns", "experiment_runs", "experiment_operations", "messages"]
      .map(async name => [name, await raw(name).find().sort({ _id: 1 }).toArray()]));
    expect(after).toEqual(before);
  });
});
