import { z } from "zod";
import { agentModelIdSchema, agentProviderSchema, agentReasoningEffortSchema, isCompatibleAgentModel } from "@/lib/config/agent-models";
import { skillIdSchema } from "@/lib/contracts/skills";

export { agentProviderSchema, agentReasoningEffortSchema, agentModelIdSchema };

export const agentRoleSchema = z.enum(["manager", "specialist"]);
export const agentVersionStatusSchema = z.enum(["draft", "confirmed", "retired"]);
export const agentEventActionSchema = z.enum(["create", "edit", "fork", "confirm", "activate", "deactivate", "retire", "delete"]);

const id = z.string().uuid();
const maxTurnsSchema = z.number().int().positive();

export const agentVersionConfigurationSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  purpose: z.string().trim().min(1).max(1_000),
  role: agentRoleSchema,
  skillId: skillIdSchema.nullable(),
  instructions: z.string().min(1).max(20_000),
  provider: agentProviderSchema,
  modelId: agentModelIdSchema,
  reasoningEffort: agentReasoningEffortSchema,
  maxTurns: maxTurnsSchema,
}).superRefine((value, context) => {
  if (value.role === "manager" && value.skillId !== null) context.addIssue({ code: "custom", path: ["skillId"], message: "Managers cannot be bound to a skill." });
  if (value.role === "specialist" && value.skillId === null) context.addIssue({ code: "custom", path: ["skillId"], message: "Specialists must be bound to a registered skill." });
  if (value.role === "manager" && value.maxTurns > 2) context.addIssue({ code: "custom", path: ["maxTurns"], message: "Managers may use one or two turns." });
  if (value.role === "specialist" && value.maxTurns !== 1) context.addIssue({ code: "custom", path: ["maxTurns"], message: "Specialists must use exactly one turn." });
  if (!isCompatibleAgentModel({ modelId: value.modelId, role: value.role, reasoning: value.reasoningEffort })) context.addIssue({ code: "custom", path: ["modelId"], message: "This model configuration is not supported." });
});

export const agentDefinitionSchema = z.object({ id, createdAt: z.string().datetime(), createdBy: z.string().min(1) });
export const agentVersionSchema = agentVersionConfigurationSchema.extend({
  id, agentId: id, versionNumber: z.number().int().positive(), parentVersionId: id.nullable(), status: agentVersionStatusSchema,
  isActive: z.boolean(), revision: z.number().int().positive(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(), createdBy: z.string().min(1), updatedBy: z.string().min(1),
});
export const agentVersionEventSchema = z.object({ id, agentId: id, agentVersionId: id, action: agentEventActionSchema, actor: z.string().min(1), metadata: z.record(z.string(), z.unknown()).nullable(), createdAt: z.string().datetime() });

export const effectiveAgentConfigurationSnapshotSchema = z.object({
  id, agentId: id, versionNumber: z.number().int().positive(), displayName: z.string().min(1), role: agentRoleSchema, skillId: skillIdSchema.nullable(),
  instructions: z.string().min(1), provider: agentProviderSchema, modelId: agentModelIdSchema, reasoningEffort: agentReasoningEffortSchema, maxTurns: maxTurnsSchema,
  schemaVersion: z.literal("1"), runtimeMode: z.enum(["fake", "real"]), execution: z.object({ toolChoiceRequired: z.boolean(), parallelToolCalls: z.boolean(), outputSchemaOwnedByCode: z.literal(true) }),
});

export const agentCoverageSlotSchema = z.object({ key: z.string().min(1), role: agentRoleSchema, skillId: skillIdSchema.nullable(), activeVersionId: id.nullable(), violation: z.string().nullable() });
export const agentCoverageFingerprintSchema = z.object({ managerVersionId: id.nullable(), specialistVersionIds: z.record(skillIdSchema, id.nullable()) });
export const agentAdminSnapshotSchema = z.object({ coverage: z.array(agentCoverageSlotSchema), definitions: z.array(agentDefinitionSchema), versions: z.array(agentVersionSchema), events: z.array(agentVersionEventSchema) });

export const createAgentInputSchema = agentVersionConfigurationSchema;
export const updateAgentDraftInputSchema = agentVersionConfigurationSchema.extend({ id, expectedRevision: z.number().int().positive() });
export const versionMutationInputSchema = z.object({ id, expectedRevision: z.number().int().positive() });
export const forkAgentVersionInputSchema = versionMutationInputSchema;
export const activateAgentVersionInputSchema = versionMutationInputSchema.extend({ observedSlotVersionId: id.nullable(), observedLogicalActiveVersionId: id.nullable() });

export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;
export type AgentVersion = z.infer<typeof agentVersionSchema>;
export type AgentVersionEvent = z.infer<typeof agentVersionEventSchema>;
export type EffectiveAgentConfigurationSnapshot = z.infer<typeof effectiveAgentConfigurationSnapshotSchema>;
