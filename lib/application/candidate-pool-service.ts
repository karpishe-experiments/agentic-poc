import { createHash } from "node:crypto";
import type { Repositories } from "@/db/repositories";
import { executionTargetKeyForSkill, type ExecutionTargetKey } from "@/lib/contracts/execution";
import type { SkillId } from "@/lib/contracts/skills";
import { agentVersionConfigurationSchema, type AgentVersion } from "@/lib/contracts/agents";
import { executionProfileRegistry } from "@/lib/execution-profiles/registry";
import { AgentConfigurationUnavailableError } from "@/lib/application/agent-resolver";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function hasCompatibleProfile(version: AgentVersion) {
  try {
    if (!agentVersionConfigurationSchema.safeParse(version).success) return false;
    const settings = version.role === "specialist"
      ? { profileId: version.profileId, profileVersion: version.profileVersion, provider: version.provider, modelId: version.modelId, reasoningEffort: version.reasoningEffort, maxTurns: version.maxTurns }
      : version.profileId === "openai-image"
        ? { profileId: version.profileId, profileVersion: version.profileVersion, provider: version.provider, modelId: version.modelId, imageQuality: version.imageQuality }
        : version.profileId === "gemini-image"
          ? { profileId: version.profileId, profileVersion: version.profileVersion, provider: version.provider, modelId: version.modelId, imageResolution: version.imageResolution }
          : { profileId: version.profileId, profileVersion: version.profileVersion, provider: version.provider, modelId: version.modelId };
    executionProfileRegistry.parseSettings(settings);
    return true;
  } catch { return false; }
}
export type CandidatePool = { targetKey: ExecutionTargetKey; candidates: Awaited<ReturnType<Repositories["agents"]["resolveActiveCandidates"]>>; notices: string[]; fingerprint: string };
export class CandidatePoolService {
  public constructor(private readonly repositories: Repositories, private readonly runtimeMode: "fake" | "real") {}
  public async resolve(targetKey: ExecutionTargetKey, options: { hasImageInput?: boolean } = {}): Promise<CandidatePool> {
    const candidates = await this.repositories.agents.resolveActiveCandidates(targetKey);
    if (candidates.some((candidate) => !hasCompatibleProfile(candidate))) {
      throw new AgentConfigurationUnavailableError(targetKey);
    }
    const notices: string[] = [];
    const eligible = candidates.filter((candidate) => {
      if (candidate.role !== "image" || this.runtimeMode !== "real") return true;
      if (candidate.provider !== "openai" && !(candidate.provider === "google" ? process.env.GEMINI_API_KEY : process.env.BFL_API_KEY)) {
        notices.push(`${candidate.displayName} is unavailable because its provider credential is not configured.`);
        return false;
      }
      if (candidate.profileId === "flux-image" && options.hasImageInput) {
        notices.push(`${candidate.displayName} is unavailable because local assets cannot be supplied to real FLUX image-input requests.`);
        return false;
      }
      return true;
    });
    return { targetKey, candidates: eligible, notices, fingerprint: hash({ targetKey, runtimeMode: this.runtimeMode, hasImageInput: Boolean(options.hasImageInput), candidates: eligible.map((candidate) => ({ id: candidate.agentId, versionId: candidate.id, revision: candidate.revision, profileId: candidate.profileId, profileVersion: candidate.profileVersion, provider: candidate.provider, modelId: candidate.modelId })) }) };
  }
  public async forSkill(skillId: SkillId) { return this.resolve(executionTargetKeyForSkill(skillId)); }
}
