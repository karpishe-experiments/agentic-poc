import { describe, expect, it } from "vitest";
import { agentsForSlot, getVersionActionEligibility, newlyAddedVersions, resolveAdminSelection, SLOT_LABELS, type AgentAdminViewModel } from "@/components/admin/agents/agent-admin-model";
import type { AgentDefinition, AgentVersion } from "@/lib/contracts/agents";

const managerAgentId = "00000000-0000-4000-8000-00000000a001";
const intakeAgentId = "00000000-0000-4000-8000-00000000a101";
const alternateAgentId = "00000000-0000-4000-8000-00000000a201";

function definition(id: string): AgentDefinition {
  return { id, createdAt: "2026-08-15T00:00:00.000Z", createdBy: "local-admin" };
}

function version(overrides: Partial<AgentVersion> & Pick<AgentVersion, "id" | "agentId">): AgentVersion {
  return {
    versionNumber: 1,
    parentVersionId: null,
    displayName: "Test Agent",
    purpose: "Test deterministic administration behavior.",
    role: "specialist",
    skillId: "intake_readiness@1",
    instructions: "Return the required structured result.",
    provider: "openai",
    modelId: "gpt-5.6-terra",
    reasoningEffort: "medium",
    maxTurns: 1,
    status: "draft",
    isActive: false,
    revision: 1,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    createdBy: "local-admin",
    updatedBy: "local-admin",
    ...overrides,
  };
}

function snapshot(versions: AgentVersion[]): AgentAdminViewModel {
  return {
    coverage: [
      { key: "manager", role: "manager", skillId: null, activeVersionId: versions.find((item) => item.role === "manager" && item.isActive)?.id ?? null, violation: null },
      { key: "intake_readiness@1", role: "specialist", skillId: "intake_readiness@1", activeVersionId: versions.find((item) => item.skillId === "intake_readiness@1" && item.isActive)?.id ?? null, violation: null },
    ],
    definitions: [definition(managerAgentId), definition(intakeAgentId), definition(alternateAgentId)],
    versions,
    skillChoices: ["intake_readiness@1"],
  };
}

describe("agent admin model", () => {
  it("defines friendly labels for every runtime slot", () => {
    expect(SLOT_LABELS).toEqual({
      manager: "Manager",
      "intake_readiness@1": "Intake Readiness",
      "story_planning_revision@1": "Story Planning",
      "quality_review_targeted_repair@1": "Story Quality",
      "visual_direction_reference_planning@1": "Visual Direction",
      "booklet_specification@1": "Booklet Specification",
      "page_planning_writing@1": "Page Planning",
      "image_prompt_compilation@1": "Image Prompts",
    });
  });

  it("groups multiple logical agents, keeps versions newest-first, and sorts the active owner first", () => {
    const active = version({ id: "00000000-0000-4000-8000-00000000b101", agentId: intakeAgentId, displayName: "Active intake", status: "confirmed", isActive: true });
    const older = version({ id: "00000000-0000-4000-8000-00000000b102", agentId: intakeAgentId, versionNumber: 2, updatedAt: "2026-08-16T00:00:00.000Z" });
    const alternate = version({ id: "00000000-0000-4000-8000-00000000b201", agentId: alternateAgentId, displayName: "Alternate intake", updatedAt: "2026-08-17T00:00:00.000Z" });
    const groups = agentsForSlot(snapshot([active, older, alternate]), "intake_readiness@1");
    expect(groups.map((group) => group.definition.id)).toEqual([intakeAgentId, alternateAgentId]);
    expect(groups[0]!.versions.map((item) => item.versionNumber)).toEqual([2, 1]);
  });

  it("sorts inactive candidates by latest update and then stable agent ID", () => {
    const first = version({ id: "00000000-0000-4000-8000-00000000b101", agentId: intakeAgentId, updatedAt: "2026-08-16T00:00:00.000Z" });
    const latest = version({ id: "00000000-0000-4000-8000-00000000b201", agentId: alternateAgentId, updatedAt: "2026-08-17T00:00:00.000Z" });
    expect(agentsForSlot(snapshot([first, latest]), "intake_readiness@1").map((group) => group.definition.id)).toEqual([alternateAgentId, intakeAgentId]);
    first.updatedAt = latest.updatedAt;
    expect(agentsForSlot(snapshot([first, latest]), "intake_readiness@1").map((group) => group.definition.id)).toEqual([intakeAgentId, alternateAgentId]);
  });

  it("falls back from unknown IDs to the active agent and version", () => {
    const manager = version({ id: "00000000-0000-4000-8000-00000000b001", agentId: managerAgentId, role: "manager", skillId: null, maxTurns: 2, modelId: "gpt-5.6-luna", reasoningEffort: "low", status: "confirmed", isActive: true });
    const active = version({ id: "00000000-0000-4000-8000-00000000b101", agentId: intakeAgentId, status: "confirmed", isActive: true });
    const resolved = resolveAdminSelection(snapshot([manager, active]), { slotKey: "intake_readiness@1", agentId: "missing", versionId: "missing" });
    expect(resolved.agent?.definition.id).toBe(intakeAgentId);
    expect(resolved.version?.id).toBe(active.id);
  });

  it("falls back to the highest version when coverage is missing", () => {
    const first = version({ id: "00000000-0000-4000-8000-00000000b101", agentId: intakeAgentId });
    const second = version({ id: "00000000-0000-4000-8000-00000000b102", agentId: intakeAgentId, versionNumber: 2 });
    const value = snapshot([first, second]);
    value.coverage[1] = { ...value.coverage[1]!, activeVersionId: null, violation: "Missing active specialist" };
    expect(resolveAdminSelection(value, { slotKey: "intake_readiness@1" }).version?.id).toBe(second.id);
  });

  it("returns an explicit empty selection when a slot has no candidates", () => {
    const value = snapshot([]);
    value.coverage[1] = { ...value.coverage[1]!, violation: "Missing active specialist" };
    expect(resolveAdminSelection(value, { slotKey: "intake_readiness@1" })).toMatchObject({ agents: [], agent: null, version: null });
  });

  it("exposes exactly the state-valid lifecycle actions", () => {
    const inactiveDraft = version({ id: "00000000-0000-4000-8000-00000000b101", agentId: intakeAgentId });
    expect(getVersionActionEligibility(inactiveDraft)).toEqual({ fork: true, confirm: true, activate: true, retire: true, deleteDraft: true });
    expect(getVersionActionEligibility({ ...inactiveDraft, status: "confirmed", isActive: true })).toEqual({ fork: true, confirm: false, activate: false, retire: false, deleteDraft: false });
    expect(getVersionActionEligibility({ ...inactiveDraft, status: "retired" })).toEqual({ fork: true, confirm: false, activate: false, retire: false, deleteDraft: false });
  });

  it("identifies only versions added since mutation submission", () => {
    const oldVersion = version({ id: "00000000-0000-4000-8000-00000000b101", agentId: intakeAgentId });
    const newVersion = version({ id: "00000000-0000-4000-8000-00000000b102", agentId: intakeAgentId, versionNumber: 2 });
    expect(newlyAddedVersions(new Set([oldVersion.id, "removed"]), [oldVersion, newVersion])).toEqual([newVersion]);
  });
});
