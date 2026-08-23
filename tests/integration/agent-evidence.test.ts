import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { BookletService } from "@/lib/application/booklet-service";
import { ManagerService } from "@/lib/application/manager-service";
import { ChatService } from "@/lib/application/chat-service";
import { CardService } from "@/lib/application/card-service";
import { AgentConfigurationUnavailableError } from "@/lib/application/agent-resolver";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

describe("persisted agent evidence", () => {
  it("records the manager route and freezes a candidate pool for the selected-run workflow", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "A robin shares rainwater." });
    const manager = new ManagerService({ database, runtimeMode: "fake" });
    const prepared = await manager.preflight();
    const routed = await manager.route({ bookletId: booklet.id, stage: "audience_profile", operation: "guided_intake", intent: "Start guided intake.", knownFacts: [], recentMessages: [], approvedArtifactVersionIds: [], traceId: randomUUID() }, { cardId: randomUUID() }, prepared);
    expect(routed.skillId).toBe("intake_readiness@1");
    expect(routed.prepared.candidatePools.get(routed.skillId)).toHaveLength(1);
    await expect(createRepositories(database).evidence.listModelCalls(booklet.id)).resolves.toContainEqual(expect.objectContaining({ operation: "manager", status: "succeeded", agentConfigSnapshot: expect.objectContaining({ role: "manager" }) }));
  });

  it("rejects a malformed candidate pool before creating a new turn", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "A robin shares rainwater." });
    await database.collections.agent_versions.updateMany({ skillId: "quality_review_targeted_repair@1" }, { $set: { modelId: "unsupported-model" } });
    await expect(new ChatService({ database }).createTurn(booklet.id, { id: randomUUID(), role: "user", parts: [{ type: "text", text: "Start guided intake." }] })).rejects.toBeInstanceOf(AgentConfigurationUnavailableError);
  });

  it("keeps a ready Agent run unchanged when its target becomes malformed", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "A robin shares rainwater." });
    const turn = await new ChatService({ database }).createTurn(booklet.id, { id: randomUUID(), role: "user", parts: [{ type: "text", text: "Please help me begin." }] });
    const part = turn.assistantMessage.parts.find((item) => item.type === "data-card");
    if (!part || part.type !== "data-card" || part.data.family !== "agent_run") throw new Error("Expected Agent Run card.");
    await database.collections.agent_versions.updateMany({ skillId: "intake_readiness@1" }, { $set: { modelId: "unsupported-model" } });
    await expect(new CardService({ database }).submit(booklet.id, { cardId: part.data.cardId, responseId: randomUUID(), action: "run_agents", value: part.data.payload.selectedAgentIds })).rejects.toBeInstanceOf(AgentConfigurationUnavailableError);
    await expect(createRepositories(database).conversation.getCard(booklet.id, part.data.cardId)).resolves.toMatchObject({ payload: { state: "ready", batchId: null } });
  });
});
