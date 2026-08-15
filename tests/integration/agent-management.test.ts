import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { AgentManagementService } from "@/lib/application/agent-management-service";
import { BookletService } from "@/lib/application/booklet-service";

async function services() {
  const database = createDatabase(`file:${path.join(os.tmpdir(), "kids-agent-management-tests", `${randomUUID()}.db`).replaceAll("\\", "/")}`);
  await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
  return { database, agents: new AgentManagementService({ database, now: () => 1_786_800_000_000 }) };
}

async function service() {
  return (await services()).agents;
}

const draft = { displayName: "Testing intake", purpose: "Exercise intake routing.", role: "specialist" as const, skillId: "intake_readiness@1" as const, instructions: "Return the requested structured result.", provider: "openai" as const, modelId: "gpt-5.6-terra" as const, reasoningEffort: "medium" as const, maxTurns: 1 };

describe("AgentManagementService", () => {
  it("creates, edits, forks, confirms, activates, retires, and safely deletes drafts", async () => {
    const agents = await service();
    const created = await agents.create(draft);
    const edited = await agents.updateDraft({ ...draft, id: created.id, expectedRevision: created.revision, displayName: "Edited intake" });
    const fork = await agents.fork({ id: edited.id, expectedRevision: edited.revision });
    const confirmed = await agents.confirm({ id: fork.id, expectedRevision: fork.revision });
    const before = await agents.getAdminSnapshot();
    const active = before.versions.find((version) => version.isActive && version.skillId === draft.skillId)!;
    const activated = await agents.activate({ id: confirmed.id, expectedRevision: confirmed.revision, observedSlotVersionId: active.id, observedLogicalActiveVersionId: null });
    expect(activated.isActive).toBe(true);
    await expect(agents.deleteDraft({ id: edited.id, expectedRevision: edited.revision })).rejects.toMatchObject({ code: "agent_delete_blocked" });
    const disposable = await agents.create({ ...draft, displayName: "Disposable intake" });
    await expect(agents.deleteDraft({ id: disposable.id, expectedRevision: disposable.revision })).resolves.toBeUndefined();
    await expect(agents.retire({ id: active.id, expectedRevision: active.revision + 1 })).resolves.toMatchObject({ status: "retired" });
  });

  it("rejects invalid role/skill configuration and stale mutations", async () => {
    const agents = await service();
    await expect(agents.create({ ...draft, role: "manager", skillId: draft.skillId, maxTurns: 2 })).rejects.toMatchObject({ code: "agent_invalid_configuration" });
    const created = await agents.create(draft);
    await expect(agents.updateDraft({ ...draft, id: created.id, expectedRevision: 99 })).rejects.toMatchObject({ code: "agent_conflict" });
  });

  it("allows only one simultaneous draft edit and writes one edit event", async () => {
    const agents = await service();
    const created = await agents.create(draft);
    const results = await Promise.allSettled([
      agents.updateDraft({ ...draft, id: created.id, expectedRevision: created.revision, displayName: "First editor" }),
      agents.updateDraft({ ...draft, id: created.id, expectedRevision: created.revision, displayName: "Second editor" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected").map((result) => (result as PromiseRejectedResult).reason)).toEqual([expect.objectContaining({ code: "agent_conflict" })]);
    const snapshot = await agents.getAdminSnapshot();
    expect(snapshot.versions.find((version) => version.id === created.id)).toMatchObject({ revision: 2, displayName: expect.stringMatching(/editor/) });
    expect(snapshot.events.filter((event) => event.agentVersionId === created.id && event.action === "edit")).toHaveLength(1);
  });

  it("keeps exact coverage when competing replacements use the same stale observation", async () => {
    const agents = await service();
    const initial = await agents.getAdminSnapshot();
    const active = initial.versions.find((version) => version.isActive && version.skillId === draft.skillId)!;
    const firstDraft = await agents.fork({ id: active.id, expectedRevision: active.revision });
    const secondDraft = await agents.fork({ id: active.id, expectedRevision: active.revision });
    const first = await agents.confirm({ id: firstDraft.id, expectedRevision: firstDraft.revision });
    const second = await agents.confirm({ id: secondDraft.id, expectedRevision: secondDraft.revision });
    const results = await Promise.allSettled([
      agents.activate({ id: first.id, expectedRevision: first.revision, observedSlotVersionId: active.id, observedLogicalActiveVersionId: active.id }),
      agents.activate({ id: second.id, expectedRevision: second.revision, observedSlotVersionId: active.id, observedLogicalActiveVersionId: active.id }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected").map((result) => (result as PromiseRejectedResult).reason)).toEqual([expect.objectContaining({ code: "agent_conflict" })]);
    const snapshot = await agents.getAdminSnapshot();
    const activeInSlot = snapshot.versions.filter((version) => version.isActive && version.skillId === draft.skillId);
    expect(activeInSlot).toHaveLength(1);
    expect(activeInSlot[0]?.id).toBe((results.find((result) => result.status === "fulfilled") as PromiseFulfilledResult<{ id: string }>).value.id);
    expect(snapshot.events.filter((event) => event.action === "activate" && [first.id, second.id].includes(event.agentVersionId))).toHaveLength(1);
  });

  it("keeps branch lineage and rejects immutable, active, and parent-draft deletion", async () => {
    const agents = await service();
    const initial = await agents.getAdminSnapshot();
    const active = initial.versions.find((version) => version.isActive && version.skillId === draft.skillId)!;
    await expect(agents.retire({ id: active.id, expectedRevision: active.revision })).rejects.toMatchObject({ code: "agent_immutable" });
    await expect(agents.deleteDraft({ id: active.id, expectedRevision: active.revision })).rejects.toMatchObject({ code: "agent_delete_blocked" });
    const created = await agents.create(draft);
    const firstBranch = await agents.fork({ id: created.id, expectedRevision: created.revision });
    const secondBranch = await agents.fork({ id: created.id, expectedRevision: created.revision });
    expect([firstBranch.versionNumber, secondBranch.versionNumber]).toEqual([2, 3]);
    expect([firstBranch.parentVersionId, secondBranch.parentVersionId]).toEqual([created.id, created.id]);
    await expect(agents.deleteDraft({ id: created.id, expectedRevision: created.revision })).rejects.toMatchObject({ code: "agent_delete_blocked" });
    const confirmed = await agents.confirm({ id: firstBranch.id, expectedRevision: firstBranch.revision });
    await expect(agents.updateDraft({ ...draft, id: confirmed.id, expectedRevision: confirmed.revision })).rejects.toMatchObject({ code: "agent_immutable" });
  });

  it("does not delete an otherwise eligible draft once model-call evidence references it", async () => {
    const { agents, database } = await services();
    const created = await agents.create(draft);
    const booklet = await new BookletService({ database }).create({ idea: "A robin shares rainwater." });
    await createRepositories(database).evidence.recordModelCall({
      id: randomUUID(), bookletId: booklet.id, operation: "skill", skillId: "intake_readiness@1", provider: "fake", model: "fake-skill-v1", traceId: null,
      status: "succeeded", attempt: 1, startedAtMs: 1, latencyMs: 1, inputReference: {}, outputReference: {}, usage: { inputTokens: 0, outputTokens: 0 }, actualCostUsd: "0", estimatedCostUsd: "0", pricingVersion: "fake-runtime-v1",
      agentDefinitionId: created.agentId, agentVersionId: created.id, agentConfigSnapshot: { schemaVersion: "1", role: "specialist" },
    });

    await expect(agents.deleteDraft({ id: created.id, expectedRevision: created.revision })).rejects.toMatchObject({ code: "agent_delete_blocked" });
  });

  it("allocates monotonic unique branch numbers under concurrent fork requests", async () => {
    const agents = await service();
    const initial = await agents.getAdminSnapshot();
    const source = initial.versions.find((version) => version.isActive && version.skillId === draft.skillId)!;
    const results = await Promise.allSettled([
      agents.fork({ id: source.id, expectedRevision: source.revision }),
      agents.fork({ id: source.id, expectedRevision: source.revision }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).not.toHaveLength(0);
    for (const result of results.filter((result): result is PromiseRejectedResult => result.status === "rejected")) expect(result.reason).toMatchObject({ code: "agent_conflict" });
    const snapshot = await agents.getAdminSnapshot();
    const branches = snapshot.versions.filter((version) => version.agentId === source.agentId).map((version) => version.versionNumber);
    expect(new Set(branches).size).toBe(branches.length);
    expect(branches.sort((left, right) => left - right)).toEqual(branches.map((_, index) => index + 1));
  });

  it("allows activation only when it strictly repairs incomplete active coverage", async () => {
    const { agents, database } = await services();
    await database.$client.execute({ sql: "update agent_versions set is_active = 0 where skill_id in (?, ?)", args: ["intake_readiness@1", "story_planning_revision@1"] });
    const incomplete = await agents.getAdminSnapshot();
    expect(incomplete.coverage.filter((slot) => slot.violation)).toHaveLength(2);
    const healthyQuality = incomplete.versions.find((version) => version.isActive && version.skillId === "quality_review_targeted_repair@1")!;
    const qualityDraft = await agents.create({ displayName: "Quality replacement", purpose: "Must not reshuffle corrupt coverage.", role: "specialist", skillId: "quality_review_targeted_repair@1", instructions: "Return the quality result.", provider: "openai", modelId: "gpt-5.6-sol", reasoningEffort: "medium", maxTurns: 1 });
    await expect(agents.activate({ id: qualityDraft.id, expectedRevision: qualityDraft.revision, observedSlotVersionId: healthyQuality.id, observedLogicalActiveVersionId: null })).rejects.toMatchObject({ code: "agent_coverage_conflict" });
    const intakeDraft = await agents.create(draft);
    await expect(agents.activate({ id: intakeDraft.id, expectedRevision: intakeDraft.revision, observedSlotVersionId: null, observedLogicalActiveVersionId: null })).resolves.toMatchObject({ isActive: true });
    const storyDraft = await agents.create({ ...draft, displayName: "Story repair", skillId: "story_planning_revision@1", purpose: "Repair missing story coverage.", instructions: "Return the story result." });
    await expect(agents.activate({ id: storyDraft.id, expectedRevision: storyDraft.revision, observedSlotVersionId: null, observedLogicalActiveVersionId: null })).resolves.toMatchObject({ isActive: true });
    expect((await agents.getAdminSnapshot()).coverage.every((slot) => slot.violation === null)).toBe(true);
  });

  it("keeps malformed active configuration inspectable and repairable with a replacement", async () => {
    const { agents, database } = await services();
    await database.$client.execute({ sql: "update agent_versions set model_id = ? where skill_id = ?", args: ["unsupported-model", "quality_review_targeted_repair@1"] });
    const malformed = await agents.getAdminSnapshot();
    const qualitySlot = malformed.coverage.find((slot) => slot.skillId === "quality_review_targeted_repair@1")!;
    expect(qualitySlot).toMatchObject({ violation: "Malformed active specialist configuration" });
    const replacement = await agents.create({ displayName: "Quality configuration repair", purpose: "Replace corrupt quality settings.", role: "specialist", skillId: "quality_review_targeted_repair@1", instructions: "Return the required quality result.", provider: "openai", modelId: "gpt-5.6-sol", reasoningEffort: "medium", maxTurns: 1 });
    await expect(agents.activate({ id: replacement.id, expectedRevision: replacement.revision, observedSlotVersionId: qualitySlot.activeVersionId, observedLogicalActiveVersionId: null })).resolves.toMatchObject({ isActive: true });
    expect((await agents.getAdminSnapshot()).coverage.every((slot) => slot.violation === null)).toBe(true);
  });
});
