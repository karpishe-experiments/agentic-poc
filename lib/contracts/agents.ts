import { z } from "zod";
import { skillIdSchema } from "@/lib/contracts/skills";
import { executionProfileIdSchema } from "@/lib/contracts/execution-profiles";
import { imageTargetSchema } from "@/lib/contracts/execution";

export const agentProviderSchema = z.enum(["openai", "google", "bfl"]);
export const agentReasoningEffortSchema = z.enum(["low", "medium", "high"]);
export const agentModelIdSchema = z.string().trim().min(1).max(160);
export const agentRoleSchema = z.enum(["manager", "specialist", "image"]);
export const agentVersionStatusSchema = z.enum(["draft", "confirmed", "retired"]);
export const agentEventActionSchema = z.enum(["create", "edit", "fork", "confirm", "activate", "deactivate", "retire", "delete"]);
const id = z.string().uuid();
const maxTurnsSchema = z.number().int().positive();
const agentVersionConfigurationBaseSchema = z.object({
  displayName: z.string().trim().min(1).max(120), purpose: z.string().trim().min(1).max(1_000), role: agentRoleSchema,
  skillId: skillIdSchema.nullable().default(null), imageTarget: imageTargetSchema.nullable().default(null), instructions: z.string().min(1).max(20_000).nullable().default(null),
  provider: agentProviderSchema, modelId: agentModelIdSchema, reasoningEffort: agentReasoningEffortSchema.nullable().default(null), maxTurns: maxTurnsSchema.nullable().default(null),
  profileId: executionProfileIdSchema.nullable().default(null), profileVersion: z.number().int().positive().nullable().default(null),
  imageQuality: z.enum(["auto", "low", "medium", "high"]).nullable().default(null), imageResolution: z.enum(["1K", "2K", "4K"]).nullable().default(null),
});
type AgentConfiguration = z.infer<typeof agentVersionConfigurationBaseSchema>;
const refineAgentConfiguration = (value: AgentConfiguration, context: z.RefinementCtx) => {
  const issue = (path: string, message: string) => context.addIssue({ code: "custom", path: [path], message });
  if (value.role === "manager") {
    if (value.skillId !== null || value.imageTarget !== null || value.profileId !== null) issue("role", "Managers cannot be execution-profile candidates.");
    if (!value.instructions || !value.reasoningEffort || !value.maxTurns) issue("instructions", "Managers require instructions and execution bounds.");
    if (value.maxTurns && value.maxTurns > 2) issue("maxTurns", "Managers may use one or two turns.");
  }
  if (value.role === "specialist") {
    if (value.skillId === null || value.imageTarget !== null) issue("skillId", "Specialists must bind exactly one registered skill.");
    if (value.profileId !== "openai-specialist" || value.profileVersion !== 1) issue("profileId", "Specialists require openai-specialist v1.");
    if (!value.instructions || !value.reasoningEffort || value.maxTurns !== 1) issue("maxTurns", "Specialists require instructions and exactly one turn.");
  }
  if (value.role === "image") {
    if (value.skillId !== null || value.imageTarget === null) issue("imageTarget", "Image agents must bind exactly one image target.");
    if (!value.profileId || value.profileId === "openai-specialist" || value.profileVersion !== 1) issue("profileId", "Image agents require a registered image profile.");
    if (value.instructions !== null || value.reasoningEffort !== null || value.maxTurns !== null) issue("instructions", "Image prompt wording and turns are application-owned.");
    if (value.profileId === "openai-image" && value.imageQuality === null) issue("imageQuality", "OpenAI image agents require quality.");
    if (value.profileId === "gemini-image" && value.imageResolution === null) issue("imageResolution", "Gemini image agents require resolution.");
  }
};
export const agentVersionConfigurationSchema = agentVersionConfigurationBaseSchema.superRefine(refineAgentConfiguration);
export const agentDefinitionSchema = z.object({ id, createdAt: z.string().datetime(), createdBy: z.string().min(1) });
export const agentVersionSchema = agentVersionConfigurationBaseSchema.extend({ id, agentId: id, versionNumber: z.number().int().positive(), parentVersionId: id.nullable(), status: agentVersionStatusSchema, isActive: z.boolean(), revision: z.number().int().positive(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(), createdBy: z.string().min(1), updatedBy: z.string().min(1) }).superRefine(refineAgentConfiguration);
export const agentVersionEventSchema = z.object({ id, agentId: id, agentVersionId: id, action: agentEventActionSchema, actor: z.string().min(1), metadata: z.record(z.string(), z.unknown()).nullable(), createdAt: z.string().datetime() });
export const effectiveAgentConfigurationSnapshotSchema = agentVersionConfigurationBaseSchema.pick({ displayName: true, role: true, skillId: true, imageTarget: true, instructions: true, provider: true, modelId: true, reasoningEffort: true, maxTurns: true, profileId: true, profileVersion: true, imageQuality: true, imageResolution: true }).extend({ id, agentId: id, versionNumber: z.number().int().positive(), schemaVersion: z.literal("1"), runtimeMode: z.enum(["fake", "real"]), execution: z.object({ toolChoiceRequired: z.boolean(), parallelToolCalls: z.boolean(), outputSchemaOwnedByCode: z.literal(true) }) });
export const agentCoverageSlotSchema = z.object({ key: z.string().min(1), role: agentRoleSchema, skillId: skillIdSchema.nullable(), imageTarget: imageTargetSchema.nullable().default(null), activeVersionId: id.nullable(), violation: z.string().nullable() });
export const agentCoverageFingerprintSchema = z.object({ managerVersionId: id.nullable(), specialistVersionIds: z.record(skillIdSchema, id.nullable()) });
export const agentAdminSnapshotSchema = z.object({ coverage: z.array(agentCoverageSlotSchema), definitions: z.array(agentDefinitionSchema), versions: z.array(agentVersionSchema), events: z.array(agentVersionEventSchema) });
export const createAgentInputSchema = agentVersionConfigurationSchema;
export const updateAgentDraftInputSchema = agentVersionConfigurationBaseSchema.extend({ id, expectedRevision: z.number().int().positive() }).superRefine(refineAgentConfiguration);
export const versionMutationInputSchema = z.object({ id, expectedRevision: z.number().int().positive() });
export const forkAgentVersionInputSchema = versionMutationInputSchema;
export const activateAgentVersionInputSchema = versionMutationInputSchema.extend({ observedSlotVersionId: id.nullable(), observedLogicalActiveVersionId: id.nullable() });
export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;
export type AgentVersion = z.infer<typeof agentVersionSchema>;
export type AgentVersionEvent = z.infer<typeof agentVersionEventSchema>;
export type EffectiveAgentConfigurationSnapshot = z.infer<typeof effectiveAgentConfigurationSnapshotSchema>;
