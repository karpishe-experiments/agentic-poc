import { mkdtemp } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDatabase } from "@/db/client";
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

const databases: Array<ReturnType<typeof createDatabase>> = [];
afterEach(() => databases.splice(0).forEach((database) => database.$client.close()));

describe("persisted agent evidence", () => {
  it("attributes fake manager and specialist calls to immutable resolved snapshots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "kids-agent-evidence-"));
    const database = createDatabase(`file:${path.join(root, "booklets.db")}`);
    databases.push(database);
    await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
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
    const root = await mkdtemp(path.join(os.tmpdir(), "kids-quality-evidence-"));
    const database = createDatabase(`file:${path.join(root, "booklets.db")}`);
    databases.push(database);
    await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
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
    await database.$client.execute({ sql: "update agent_versions set model_id = ? where id = ?", args: ["unsupported-model", quality.version.id] });
    await new QualityService({ database, runtimeMode: "fake" }).runStoryReadiness(booklet.id, quality);

    await expect(createRepositories(database).evidence.listModelCalls(booklet.id)).resolves.toContainEqual(expect.objectContaining({
      operation: "quality_review", skillId: "quality_review_targeted_repair@1", provider: "fake", model: "fake-review-v1",
      agentDefinitionId: expect.any(String), agentVersionId: expect.any(String),
      agentConfigSnapshot: expect.objectContaining({ runtimeMode: "fake", role: "specialist", skillId: "quality_review_targeted_repair@1", modelId: "gpt-5.6-sol" }),
    }));
  });

  it("normalizes malformed active configuration into a repairable specialist error", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "kids-agent-config-"));
    const database = createDatabase(`file:${path.join(root, "booklets.db")}`);
    databases.push(database);
    await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
    await database.$client.execute({
      sql: "update agent_versions set model_id = ? where skill_id = ?",
      args: ["unsupported-model", "quality_review_targeted_repair@1"],
    });

    const error = await new AgentResolver({ database }).resolveSpecialist("quality_review_targeted_repair@1", "fake").catch((caught) => caught);

    expect(error).toBeInstanceOf(AgentConfigurationUnavailableError);
    expect(toErrorEnvelope(error)).toEqual(expect.objectContaining({ status: 503, body: { error: expect.objectContaining({ code: "agent_configuration_unavailable", details: { adminPath: "/admin/agents", target: "quality_review_targeted_repair@1" } }) } }));
  });

  it("uses an active draft edit only for later calls and preserves earlier snapshots", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "kids-agent-freshness-"));
    const database = createDatabase(`file:${path.join(root, "booklets.db")}`);
    databases.push(database);
    await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
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
      expect.objectContaining({ agentId: activeDraft.agentId, instructions: "FIRST INSTRUCTION" }),
      expect.objectContaining({ agentId: activeDraft.agentId, instructions: "SECOND INSTRUCTION" }),
    ]);
  });

  it("keeps a preflighted active set frozen for the current manager turn", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "kids-agent-frozen-set-"));
    const database = createDatabase(`file:${path.join(root, "booklets.db")}`);
    databases.push(database);
    await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
    const booklet = await new BookletService({ database }).create({ idea: "A robin shares rainwater." });
    const manager = new ManagerService({ database, runtimeMode: "fake" });
    const prepared = await manager.preflight();
    const intake = prepared.specialists.get("intake_readiness@1")!;

    await database.$client.execute({
      sql: "update agent_versions set instructions = ? where id = ?",
      args: ["A later database edit must not affect this turn.", intake.version.id],
    });
    await manager.run({ bookletId: booklet.id, stage: "audience_profile", operation: "guided_intake", intent: "Start guided intake.", knownFacts: [], recentMessages: [], approvedArtifactVersionIds: [], traceId: randomUUID() }, { cardId: randomUUID() }, prepared);

    const call = (await createRepositories(database).evidence.listModelCalls(booklet.id)).find((item) => item.operation === "skill");
    expect(call?.agentConfigSnapshot).toEqual(expect.objectContaining({ id: intake.version.id, instructions: intake.snapshot.instructions }));
  });

  it("records the resolved snapshot for a failed specialist call and prevents preflight mutations", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "kids-agent-failure-"));
    const database = createDatabase(`file:${path.join(root, "booklets.db")}`);
    databases.push(database);
    await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
    const booklet = await new BookletService({ database }).create({ idea: "A robin shares rainwater." });
    const failingManager = new ManagerService({ database, runtimeMode: "fake", specialistRuntime: { run: async () => { throw new Error("fixture specialist failure"); } } });
    await expect(failingManager.run({ bookletId: booklet.id, stage: "audience_profile", operation: "guided_intake", intent: "Start guided intake.", knownFacts: [], recentMessages: [], approvedArtifactVersionIds: [], traceId: randomUUID() }, { cardId: randomUUID() })).rejects.toThrow("fixture specialist failure");
    await expect(createRepositories(database).evidence.listModelCalls(booklet.id)).resolves.toContainEqual(expect.objectContaining({ operation: "skill", skillId: "intake_readiness@1", status: "failed", agentDefinitionId: expect.any(String), agentVersionId: expect.any(String), agentConfigSnapshot: expect.objectContaining({ role: "specialist", skillId: "intake_readiness@1" }) }));

    const before = await createRepositories(database).conversation.listMessages(booklet.id);
    await database.$client.execute({ sql: "update agent_versions set model_id = ? where skill_id = ?", args: ["unsupported-model", "quality_review_targeted_repair@1"] });
    await expect(new ChatService({ database }).createFakeTurn(booklet.id, { id: randomUUID(), role: "user", parts: [{ type: "text", text: "Start guided intake." }] })).rejects.toBeInstanceOf(AgentConfigurationUnavailableError);
    await expect(createRepositories(database).conversation.listMessages(booklet.id)).resolves.toEqual(before);
  });

  it("keeps an accepted card response pending when configuration preflight fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "kids-agent-pending-recovery-"));
    const database = createDatabase(`file:${path.join(root, "booklets.db")}`);
    databases.push(database);
    await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
    const bookletService = new BookletService({ database });
    const chat = new ChatService({ database });
    const booklet = await bookletService.create({ idea: "A robin shares rainwater." });
    const turn = await chat.createFakeTurn(booklet.id, { id: randomUUID(), role: "user", parts: [{ type: "text", text: "Please help me begin." }] });
    const card = turn.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!card || card.type !== "data-card") throw new Error("Expected an intake card.");
    const responseId = randomUUID();
    await new CardService({ database }).submit(booklet.id, { cardId: card.data.cardId, responseId, action: "submit", value: "6-8" });
    await database.$client.execute({ sql: "update agent_versions set model_id = ? where skill_id = ?", args: ["unsupported-model", "quality_review_targeted_repair@1"] });

    await expect(chat.createFakeTurn(booklet.id, { id: randomUUID(), role: "user", metadata: { schemaVersion: "1", bookletId: booklet.id, responseId }, parts: [{ type: "text", text: "Resume the saved decision." }] })).rejects.toBeInstanceOf(AgentConfigurationUnavailableError);
    await expect(bookletService.getWorkspaceSnapshot(booklet.id)).resolves.toMatchObject({ pendingCardFollowup: { responseId, summary: expect.any(String) } });
  });

});
