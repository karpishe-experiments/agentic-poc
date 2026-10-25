import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";

const mocks = vi.hoisted(() => ({ retain: vi.fn() }));
vi.mock("@/db/client", () => ({ withMongoTransaction: async (_database: unknown, work: (session: object) => Promise<unknown>) => work({}) }));
vi.mock("@/lib/experiment-runner/m4-policy", () => ({ m4PolicySnapshot: () => ({ hash: "hash", json: "policy" }) }));
vi.mock("@/lib/experiment-runner/diagnostics", () => ({ retainPreparationRead: mocks.retain }));
import { diagnosePreparationRead } from "@/db/experiment-preparation-diagnostics";

const runId = "47894c71-7991-4b15-8dc2-810395ec3f01";
const campaignId = "690b0237-9c0d-4eb2-99ec-edf02356b70a";
const failureId = "928cb32d-daf7-4703-b005-fdaf076d6cb6";
const authority = { policy: {}, grant: { campaignId, reference: "grant" } } as never;
const campaign = { _id: campaignId, state: "stopped", slots: { professional_creator: runId },
  policyHash: "hash", policyJson: "policy", grantReference: "grant" };
const run = { _id: runId, persona: "professional_creator", mode: "balanced", m4: { campaignId, policyHash: "hash", policyJson: "policy" },
  generationCompletedAtMs: null, activeOperationId: null, preparation: null, pauseRequested: false, pendingDecisionJson: null,
  activeDelegationId: null, status: "blocked", bookletId: "book", revision: 470 };
const failure = { _id: failureId, runId, state: "failed", role: "specialist", taskId: "J12", subjectKind: "page",
  subjectId: "page-4", providerKind: "text", reservationCount: 0, workflowRunId: null,
  lifecycle: { phase: "finished", endedAtMs: 10 } };

function fixture(overrides: { run?: object; failure?: object; projectedResult?: string } = {}) {
  const queries: { collection: string; filter: unknown; options: unknown; sort?: unknown; limit?: number }[] = [];
  const operation = { _id: "op", taskId: "J12", resultJson: "private result", privatePrompt: "never expose" };
  const message = { _id: "message", uiMessageJson: "private user content", privateField: "never expose" };
  const manager = { _id: "manager", workflowRunId: "workflow", mode: "balanced", reservationCount: 1,
    verifiedWorkflowId: "published", resultJson: "private manager result", privatePrompt: "never expose" };
  const cursor = (collection: string, filter: unknown, options: unknown) => {
    const query = { collection, filter, options } as typeof queries[number]; queries.push(query);
    return { sort(value: unknown) { query.sort = value; return this; }, limit(value: number) { query.limit = value; return this; },
      async toArray() {
        const projected = Boolean((options as { projection?: unknown })?.projection);
        if (collection === "messages") return projected ? [{ uiMessageJson: message.uiMessageJson }] : [message];
        if ((filter as { role?: string }).role === "manager") return projected
          ? [{ _id: manager._id, workflowRunId: manager.workflowRunId, mode: manager.mode,
            reservationCount: manager.reservationCount, verifiedWorkflowId: manager.verifiedWorkflowId,
            resultJson: overrides.projectedResult ?? manager.resultJson }] : [manager];
        return projected ? [{ _id: operation._id, taskId: operation.taskId, resultJson: overrides.projectedResult ?? operation.resultJson }] : [operation];
      } };
  };
  const database = { collections: {
    experiment_campaigns: { findOne: vi.fn().mockResolvedValue(campaign) },
    experiment_runs: { findOne: vi.fn().mockResolvedValue({ ...run, ...overrides.run }) },
    experiment_operations: { findOne: vi.fn().mockImplementation((filter: { _id?: string }) =>
      filter._id === failureId ? { ...failure, ...overrides.failure } : null),
      find: (filter: unknown, options: unknown) => cursor("operations", filter, options) },
    deployment_control: { findOne: vi.fn().mockResolvedValue(null) },
    messages: { find: (filter: unknown, options: unknown) => cursor("messages", filter, options) },
  } } as unknown as Database;
  return { database, queries };
}

afterEach(() => vi.clearAllMocks());
describe("fixed preparation read", () => {
  it.each(["questions", "manager"] as const)("compares %s original and projected reads without exposing content", async part => {
    const { database, queries } = fixture();
    const result = await diagnosePreparationRead(database, authority, part);
    expect(result.runRevision).toBe(470);
    expect(Object.values(result.reads).every(read => read.equivalent && read.original.returnedJsonBytes > read.projected.returnedJsonBytes)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/private|prompt|content/i);
    expect(queries.length).toBe(part === "questions" ? 4 : 2);
    expect(queries.every(query => query.options && (query.options as { session?: object }).session)).toBe(true);
    if (part === "questions") {
      expect(queries[0].filter).toMatchObject({ runId, state: "succeeded", $or: [{ taskId: null }, { taskId: "J12", subjectId: "page-4" }] });
      expect(queries[0].sort).toEqual({ createdAtMs: 1, _id: 1 });
      expect(queries[2].sort).toEqual({ sequence: 1 });
    } else {
      expect(queries[0].filter).toEqual({ runId, role: "manager", state: "succeeded" });
      expect(queries[0].sort).toEqual({ createdAtMs: -1, _id: -1 });
      expect(queries[0].limit).toBe(1);
    }
    expect(mocks.retain).toHaveBeenCalledExactlyOnceWith(result);
  });

  it("reports projection mismatch and rejects changed ownership before data reads", async () => {
    const mismatch = fixture({ projectedResult: "different" });
    expect((await diagnosePreparationRead(mismatch.database, authority, "manager")).reads.manager.equivalent).toBe(false);
    const owned = fixture({ run: { activeOperationId: "other" } });
    const result = await diagnosePreparationRead(owned.database, authority, "questions");
    expect(result.failure).toBeDefined(); expect(result.reads).toEqual({}); expect(owned.queries).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain("other");
  });
});
