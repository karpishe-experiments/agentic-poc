import { z } from "zod";
import { skillIdSchema } from "@/lib/contracts/skills";

const id = z.string().uuid();
export const imageTargetSchema = z.enum(["reference", "page"]);
export const executionTargetKeySchema = z.union([z.literal("manager"), skillIdSchema.transform((skillId) => `skill:${skillId}` as const), z.enum(["image:reference", "image:page"])]);
export type ExecutionTargetKey = "manager" | `skill:${z.infer<typeof skillIdSchema>}` | "image:reference" | "image:page";
export const executionTargetKeyForSkill = (skillId: z.infer<typeof skillIdSchema>): ExecutionTargetKey => `skill:${skillId}`;
export const executionTargetKeyForImage = (target: z.infer<typeof imageTargetSchema>): ExecutionTargetKey => `image:${target}`;

export const executionPreferenceSchema = z.object({ id, bookletId: id, targetKey: z.string().min(1), selectedAgentIds: z.array(id), revision: z.number().int().positive(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
export const executionBatchStatusSchema = z.enum(["queued", "running", "results", "materializing", "completed"]);
export const executionItemStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);
export const resultChoicePolicySchema = z.enum(["implicit_sole", "explicit"]);
export const executionAttemptSchema = z.object({ attempt: z.number().int().positive(), status: executionItemStatusSchema, startedAt: z.string().datetime(), finishedAt: z.string().datetime().nullable(), latencyMs: z.number().int().nonnegative().nullable(), safeError: z.object({ kind: z.string().min(1), message: z.string().min(1).max(500) }).nullable(), canonicalInputReference: z.unknown().nullable(), nativeInputReference: z.unknown().nullable(), nativeOutputReference: z.unknown().nullable(), resultReference: z.unknown().nullable(), providerTask: z.object({ requestId: z.string().min(1).nullable(), pollUrl: z.string().url().nullable() }).nullable().optional() });
export const executionItemSchema = z.object({ id, batchId: id, agentId: id, agentVersionId: id, profileId: z.string().min(1), profileVersion: z.number().int().positive(), status: executionItemStatusSchema, attemptCount: z.number().int().nonnegative(), attempts: z.array(executionAttemptSchema), resultSummary: z.unknown().nullable(), canonicalResult: z.unknown().nullable(), candidateAssetId: id.nullable(), safeError: z.object({ kind: z.string().min(1), message: z.string().min(1).max(500) }).nullable(), startedAt: z.string().datetime().nullable(), finishedAt: z.string().datetime().nullable(), updatedAt: z.string().datetime() });
export const executionBatchSchema = z.object({ id, bookletId: id, cardId: id, targetKey: z.string().min(1), subjectKind: z.string().min(1), subjectId: z.string().min(1), previousBatchId: id.nullable(), poolFingerprint: z.string().min(1), status: executionBatchStatusSchema, materializationStatus: z.enum(["idle", "running", "failed", "completed"]), materializationUnresolvedReason: z.string().min(1).nullable().default(null), materializationContinuationPending: z.boolean().default(false), resultChoicePolicy: resultChoicePolicySchema, canonicalInput: z.unknown(), workflowFingerprint: z.unknown(), schemaVersion: z.string().min(1), selectedItemId: id.nullable(), selectionMode: z.enum(["implicit_sole", "explicit"]).nullable(), selectionResponseId: id.nullable(), producedArtifactVersionId: id.nullable(), producedQualityReviewId: id.nullable(), producedAssetId: id.nullable(), queuedAt: z.string().datetime(), startedAt: z.string().datetime().nullable(), terminalAt: z.string().datetime().nullable(), completedAt: z.string().datetime().nullable(), updatedAt: z.string().datetime() });
export const executionAgentRunStateSchema = z.enum(["ready", "running", "results", "completed"]);
export type ExecutionPreference = z.infer<typeof executionPreferenceSchema>;
export type ExecutionBatch = z.infer<typeof executionBatchSchema>;
export type ExecutionItem = z.infer<typeof executionItemSchema>;
