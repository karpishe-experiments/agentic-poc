import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { BookletService } from "@/lib/application/booklet-service";
import { ManagerService } from "@/lib/application/manager-service";
import { AgentManagementService } from "@/lib/application/agent-management-service";
import { ChatService } from "@/lib/application/chat-service";
import { CardService } from "@/lib/application/card-service";
import { ArtifactService } from "@/lib/application/artifact-service";
import { QualityService } from "@/lib/application/quality-service";
import { AgentConfigurationUnavailableError, AgentResolver } from "@/lib/application/agent-resolver";
import { toErrorEnvelope } from "@/lib/http/errors";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

describe("persisted agent evidence", () => {
  it("attributes fake manager and specialist calls to immutable resolved snapshots", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "A robin shares rainwater." });
    await new ManagerService({ database, runtimeMode: "fake" }).run({ bookletId: booklet.id, stage: "audience_profile", operation: "guided_intake", intent: "Start guided intake.", knownFacts: [], recentMessages: [], approvedArtifactVersionIds: [], traceId: randomUUID() }, { cardId: randomUUID() });
    const calls = await createRepositories(database).evidence.listModelCalls(booklet.id);
    expect(calls).toHaveLength(2);
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: "manager", provider: "fake", model: "fake-manager-v1", agentDefinitionId: expect.any(String), agentVersionId: expect.any(String), agentConfigSnapshot: expect.objectContaining({ runtimeMode: "fake", role: "manager", modelId: "gpt-5.6-luna" }) }),
      expect.objectContaining({ operation: "skill", skillId: "intake_readiness@1", provider: "fake", model: "fake-skill-v1", agentDefinitionId: expect.any(String), agentVersionId: expect.any(String), agentConfigSnapshot: expect.objectContaining({ runtimeMode: "fake", role: "specialist", skillId: "intake_readiness@1" }) }),
    ]));
  });

  it("attributes a direct fake quality review to its persisted quality specialist", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "A robin shares rainwater." });
    const artifacts = new ArtifactService({ database });
    const audience = await artifacts.revise(booklet.id, "audience_profile", {
      schemaVersion: "1", ageBand: "6-8", interests: ["garden stories"], readingNeeds: "Concrete, warm language.", tone: "Playful and reassuring", avoidList: ["frightening danger"], knownFacts: ["A robin helps a friend."], openAssumptions: ["It is spring."],
    }, { createdBy: "agent" });
    await artifacts.approve(booklet.id, "audience_profile", audience.currentVersion!.id);
    await artifacts.revise(booklet.id, "story_plan", {
      schemaVersion: "1", premise: "Robin shares rainwater.", theme: "Care",
      characters: [{ entityId: randomUUID(), name: "Robin", narrativeRole: "hero", goal: "Share water", relationships: [], named: true, continuityRelevant: true, recurringVisualSubject: true }],
      settings: [{ entityId: randomUUID(), name: "Garden", narrativeRole: "setting", named: true, continuityRelevant: true, recurringVisualSubject: true }],
      storyArc: "Robin learns to share.", keyEvents: ["Robin finds rainwater."], ending: "Everyone shares.", ageFitNotes: "Suitable for ages 6–8.", continuityConstraints: ["Keep the garden calm."],
    }, { createdBy: "agent" });

    const prepared = await new AgentResolver({ database }).prepareCompleteActiveSet("fake");
    const quality = prepared.specialists.get("quality_review_targeted_repair@1")!;
    await database.collections.agent_versions.updateOne({ _id: quality.version.id }, { $set: { modelId: "unsupported-model" } });
    await new QualityService({ database, runtimeMode: "fake" }).runStoryReadiness(booklet.id, quality);

    await expect(createRepositories(database).evidence.listModelCalls(booklet.id)).resolves.toContainEqual(expect.objectContaining({
      operation: "quality_review", skillId: "quality_review_targeted_repair@1", provider: "fake", model: "fake-review-v1",
      agentDefinitionId: expect.any(String), agentVersionId: expect.any(String),
      agentConfigSnapshot: expect.objectContaining({ runtimeMode: "fake", role: "specialist", skillId: "quality_review_targeted_repair@1", modelId: "gpt-5.6-sol" }),
    }));
  });

  it("normalizes malformed active configuration into a repairable specialist error", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    await database.collections.agent_versions.updateMany({ skillId: "quality_review_targeted_repair@1" }, { $set: { modelId: "unsupported-model" } });

    const error = await new AgentResolver({ database }).resolveSpecialist("quality_review_targeted_repair@1", "fake").catch((caught) => caught);

    expect(error).toBeInstanceOf(AgentConfigurationUnavailableError);
    expect(toErrorEnvelope(error)).toEqual(expect.objectContaining({ status: 503, body: { error: expect.objectContaining({ code: "agent_configuration_unavailable", details: { adminPath: "/admin/agents", target: "quality_review_targeted_repair@1" } }) } }));
  });

  it("keeps direct legacy execution pinned to its deterministic active candidate", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "A robin shares rainwater." });
    const agents = new AgentManagementService({ database });
    const seeded = await agents.getAdminSnapshot();
    const seededIntake = seeded.versions.find((version) => version.isActive && version.skillId === "intake_readiness@1")!;
    const draft = await agents.create({ displayName: "Live intake experiment", purpose: "Verify fresh agent resolution.", role: "specialist", skillId: "intake_readiness@1", instructions: "FIRST INSTRUCTION", provider: "openai", modelId: "gpt-5.6-terra", reasoningEffort: "medium", maxTurns: 1 });
    const activeDraft = await agents.activate({ id: draft.id, expectedRevision: draft.revision, observedSlotVersionId: seededIntake.id, observedLogicalActiveVersionId: null });
    const manager = new ManagerService({ database, runtimeMode: "fake" });
    const context = () => ({ bookletId: booklet.id, stage: "audience_profile" as const, operation: "guided_intake", intent: "Start guided intake.", knownFacts: [], recentMessages: [], approvedArtifactVersionIds: [], traceId: randomUUID() });
    await manager.run(context(), { cardId: randomUUID() });
    await agents.updateDraft({ id: activeDraft.id, expectedRevision: activeDraft.revision, displayName: activeDraft.displayName, purpose: activeDraft.purpose, role: activeDraft.role, skillId: activeDraft.skillId, instructions: "SECOND INSTRUCTION", provider: activeDraft.provider, modelId: activeDraft.modelId, reasoningEffort: activeDraft.reasoningEffort, maxTurns: activeDraft.maxTurns });
    await manager.run(context(), { cardId: randomUUID() });

    const specialistCalls = (await createRepositories(database).evidence.listModelCalls(booklet.id)).filter((call) => call.operation === "skill" && call.skillId === "intake_readiness@1");
    expect(specialistCalls).toHaveLength(2);
    expect(specialistCalls.map((call) => call.agentConfigSnapshot)).toEqual([
      expect.objectContaining({ agentId: seededIntake.agentId }),
      expect.objectContaining({ agentId: seededIntake.agentId }),
    ]);
  });

  it("keeps a preflighted active set frozen for the current manager turn", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "A robin shares rainwater." });
    const manager = new ManagerService({ database, runtimeMode: "fake" });
    const prepared = await manager.preflight();
    const intake = prepared.specialists.get("intake_readiness@1")!;

    await database.collections.agent_versions.updateOne({ _id: intake.version.id }, { $set: { instructions: "A later database edit must not affect this turn." } });
    await manager.run({ bookletId: booklet.id, stage: "audience_profile", operation: "guided_intake", intent: "Start guided intake.", knownFacts: [], recentMessages: [], approvedArtifactVersionIds: [], traceId: randomUUID() }, { cardId: randomUUID() }, prepared);

    const call = (await createRepositories(database).evidence.listModelCalls(booklet.id)).find((item) => item.operation === "skill");
    expect(call?.agentConfigSnapshot).toEqual(expect.objectContaining({ id: intake.version.id, instructions: intake.snapshot.instructions }));
  });

  it("records the resolved snapshot for a failed specialist call and prevents preflight mutations", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "A robin shares rainwater." });
    const failingManager = new ManagerService({ database, runtimeMode: "fake", specialistRuntime: { run: async () => { throw new Error("fixture specialist failure"); } } });
    await expect(failingManager.run({ bookletId: booklet.id, stage: "audience_profile", operation: "guided_intake", intent: "Start guided intake.", knownFacts: [], recentMessages: [], approvedArtifactVersionIds: [], traceId: randomUUID() }, { cardId: randomUUID() })).rejects.toThrow("fixture specialist failure");
    await expect(createRepositories(database).evidence.listModelCalls(booklet.id)).resolves.toContainEqual(expect.objectContaining({ operation: "skill", skillId: "intake_readiness@1", status: "failed", agentDefinitionId: expect.any(String), agentVersionId: expect.any(String), agentConfigSnapshot: expect.objectContaining({ role: "specialist", skillId: "intake_readiness@1" }) }));

    const before = await createRepositories(database).conversation.listMessages(booklet.id);
    await database.collections.agent_versions.updateMany({ skillId: "quality_review_targeted_repair@1" }, { $set: { modelId: "unsupported-model" } });
    await expect(new ChatService({ database }).createFakeTurn(booklet.id, { id: randomUUID(), role: "user", parts: [{ type: "text", text: "Start guided intake." }] })).rejects.toBeInstanceOf(AgentConfigurationUnavailableError);
    await expect(createRepositories(database).conversation.listMessages(booklet.id)).resolves.toEqual(before);
  });

  it("keeps a ready Agent run unchanged when its target becomes malformed", async () => {
    const database = await createTestDatabase();
    databases.push(database);
    const booklet = await new BookletService({ database }).create({ idea: "A robin shares rainwater." });
    const turn = await new ChatService({ database }).createFakeTurn(booklet.id, { id: randomUUID(), role: "user", parts: [{ type: "text", text: "Please help me begin." }] });
    const part = turn.assistantMessage.parts.find((item) => item.type === "data-card");
    if (!part || part.type !== "data-card" || part.data.family !== "agent_run") throw new Error("Expected Agent run card.");
    await database.collections.agent_versions.updateMany({ skillId: "intake_readiness@1" }, { $set: { modelId: "unsupported-model" } });

    await expect(new CardService({ database }).submit(booklet.id, { cardId: part.data.cardId, responseId: randomUUID(), action: "run_agents", value: part.data.payload.selectedAgentIds })).rejects.toBeInstanceOf(AgentConfigurationUnavailableError);
    await expect(createRepositories(database).conversation.getCard(booklet.id, part.data.cardId)).resolves.toMatchObject({ payload: { state: "ready", batchId: null } });
  });

});
