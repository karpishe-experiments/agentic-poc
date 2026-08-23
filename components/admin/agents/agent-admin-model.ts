import type { AgentDefinition, AgentVersion } from "@/lib/contracts/agents";
import type { SkillId } from "@/lib/contracts/skills";

export type SlotKey = "manager" | SkillId | "image:reference" | "image:page";

export type AgentCoverageView = {
  key: SlotKey;
  role: "manager" | "specialist" | "image";
  skillId: SkillId | null;
  imageTarget?: "reference" | "page" | null;
  activeVersionId: string | null;
  violation: string | null;
};

export type AgentAdminViewModel = {
  coverage: AgentCoverageView[];
  definitions: AgentDefinition[];
  versions: AgentVersion[];
  skillChoices: SkillId[];
};

export type LogicalAgentView = {
  definition: AgentDefinition;
  versions: AgentVersion[];
  activeVersion: AgentVersion | null;
  latestUpdatedAt: string;
};

export type ResolvedAdminSelection = {
  slot: AgentCoverageView;
  agents: LogicalAgentView[];
  agent: LogicalAgentView | null;
  version: AgentVersion | null;
};

export type VersionActionEligibility = {
  fork: boolean;
  confirm: boolean;
  activate: boolean;
  deactivate: boolean;
  retire: boolean;
  deleteDraft: boolean;
};

export const SLOT_LABELS: Record<SlotKey, string> = {
  manager: "Manager",
  "intake_readiness@1": "Intake Readiness",
  "story_planning_revision@1": "Story Planning",
  "quality_review_targeted_repair@1": "Story Quality",
  "visual_direction_reference_planning@1": "Visual Direction",
  "booklet_specification@1": "Booklet Specification",
  "page_planning_writing@1": "Page Planning",
  "image_prompt_compilation@1": "Image Prompts",
  "image:reference": "Reference Image Agents",
  "image:page": "Page Image Agents",
};

export function slotKeyForVersion(version: Pick<AgentVersion, "role" | "skillId" | "imageTarget">): SlotKey {
  if (version.role === "manager") return "manager";
  if (version.role === "image") return `image:${version.imageTarget!}` as SlotKey;
  return version.skillId!;
}

export function versionBelongsToSlot(version: AgentVersion, slotKey: SlotKey): boolean {
  return slotKeyForVersion(version) === slotKey;
}

export function getVersionActionEligibility(version: AgentVersion): VersionActionEligibility {
  const inactive = !version.isActive;
  const nonRetired = version.status !== "retired";
  return {
    fork: true,
    confirm: version.status === "draft",
    activate: inactive && nonRetired,
    deactivate: version.isActive && version.role !== "manager" && nonRetired,
    retire: inactive && nonRetired,
    deleteDraft: inactive && version.status === "draft",
  };
}

export function agentsForSlot(snapshot: AgentAdminViewModel, slotKey: SlotKey): LogicalAgentView[] {
  const definitions = new Map(snapshot.definitions.map((definition) => [definition.id, definition]));
  const versionsByAgent = new Map<string, AgentVersion[]>();

  for (const version of snapshot.versions) {
    const versions = versionsByAgent.get(version.agentId) ?? [];
    versions.push(version);
    versionsByAgent.set(version.agentId, versions);
  }

  const activeVersionId = snapshot.coverage.find((slot) => slot.key === slotKey)?.activeVersionId ?? null;
  const groups: LogicalAgentView[] = [];

  for (const [agentId, versions] of versionsByAgent) {
    if (!versions.some((version) => versionBelongsToSlot(version, slotKey))) continue;
    const definition = definitions.get(agentId);
    if (!definition) continue;
    const ordered = versions.toSorted((left, right) => right.versionNumber - left.versionNumber);
    groups.push({
      definition,
      versions: ordered,
      activeVersion: ordered.find((version) => version.isActive) ?? null,
      latestUpdatedAt: ordered.reduce((latest, version) => version.updatedAt > latest ? version.updatedAt : latest, ordered[0]!.updatedAt),
    });
  }

  return groups.toSorted((left, right) => {
    const leftOwnsSlot = left.versions.some((version) => version.id === activeVersionId);
    const rightOwnsSlot = right.versions.some((version) => version.id === activeVersionId);
    if (leftOwnsSlot !== rightOwnsSlot) return leftOwnsSlot ? -1 : 1;
    const updatedComparison = right.latestUpdatedAt.localeCompare(left.latestUpdatedAt);
    return updatedComparison || left.definition.id.localeCompare(right.definition.id);
  });
}

export function resolveAdminSelection(
  snapshot: AgentAdminViewModel,
  requested: { slotKey?: SlotKey | null; agentId?: string | null; versionId?: string | null },
): ResolvedAdminSelection {
  const slot = snapshot.coverage.find((candidate) => candidate.key === requested.slotKey)
    ?? snapshot.coverage.find((candidate) => candidate.key === "manager")
    ?? snapshot.coverage[0];
  if (!slot) throw new Error("Agent administration requires at least the manager coverage slot.");

  const agents = agentsForSlot(snapshot, slot.key);
  const activeOwner = agents.find((candidate) => candidate.versions.some((version) => version.id === slot.activeVersionId));
  const agent = agents.find((candidate) => candidate.definition.id === requested.agentId) ?? activeOwner ?? agents[0] ?? null;
  const version = agent
    ? agent.versions.find((candidate) => candidate.id === requested.versionId) ?? agent.activeVersion ?? agent.versions[0] ?? null
    : null;
  return { slot, agents, agent, version };
}

export function newlyAddedVersions(beforeIds: ReadonlySet<string>, versions: AgentVersion[]): AgentVersion[] {
  return versions.filter((version) => !beforeIds.has(version.id));
}
