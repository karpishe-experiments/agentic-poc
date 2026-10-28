import { z } from "zod";
import { CASES, experimentTaskSchema, personaSchema, type Persona } from "@/lib/contracts/experiment-runner";
import { opaqueIdSchema } from "@/lib/contracts/common";

// A decoded simulated image can differ from the working canvas. This does not
// waive original-byte, lineage, reference, approval or content validation.
export const M4_SIMULATED_IMAGE_REVIEW_POLICY = Object.freeze({
  version: "simulated_image_review_v1",
  imageProvider: "simulated",
  geometryMismatch: "advisory",
  instruction: "A saved, decoded simulated image may differ from the approved working canvas. Geometry mismatch alone is an accepted simulation limitation: record a warning, do not request regeneration for that reason alone. Missing or corrupt bytes, wrong identities, invalid references and missing required content remain defects. Visual assessment is not_assessed.",
});

const contextSchema = z.object({
  revisionCounts: z.object({ text: z.number().int().nonnegative(), image: z.number().int().nonnegative() }),
  eligibleTaskIds: z.array(experimentTaskSchema),
  currentArtifacts: z.array(z.object({ taskId: experimentTaskSchema, currentVersionId: opaqueIdSchema.nullable(), state: z.string() })),
  pendingDecision: z.unknown().optional(),
});

// Uses the exact saved counts, not model-reported allowance. Owning services
// independently validate current sources and enforce these same hard caps.
export function m4TesterRevisionEligibility(persona: Persona, contextRaw: unknown) {
  const limits = CASES[personaSchema.parse(persona)];
  const context = contextSchema.parse(contextRaw);
  const textRemaining = Math.max(0, limits.textRevisionLimit - context.revisionCounts.text);
  const imageRemaining = Math.max(0, limits.imageRevisionLimit - context.revisionCounts.image);
  const eligibleTaskIds = [...new Set(context.eligibleTaskIds)].sort();
  const revisionTargets = context.pendingDecision != null ? [] : context.currentArtifacts.flatMap(artifact => {
    if (!artifact.currentVersionId || !["draft", "approved"].includes(artifact.state) || !eligibleTaskIds.includes(artifact.taskId) ||
        (artifact.taskId === "J13" ? imageRemaining : textRemaining) === 0) return [];
    return [{ taskId: artifact.taskId, versionId: artifact.currentVersionId }];
  }).sort((a, b) => a.taskId.localeCompare(b.taskId) || a.versionId.localeCompare(b.versionId));
  return { textRemaining, imageRemaining, revisionTargets, eligibleTaskIds };
}

export function executionTesterRevisionEligibility(contextRaw: unknown, limits: { text: number; image: number }) {
  const context = contextSchema.parse(contextRaw);
  const textRemaining = Math.max(0, limits.text - context.revisionCounts.text);
  const imageRemaining = Math.max(0, limits.image - context.revisionCounts.image);
  const eligibleTaskIds = [...new Set(context.eligibleTaskIds)].sort();
  const current = context.pendingDecision != null ? [] : context.currentArtifacts.flatMap(artifact =>
    artifact.currentVersionId && ["draft", "approved"].includes(artifact.state) && eligibleTaskIds.includes(artifact.taskId)
      ? [{ taskId: artifact.taskId, versionId: artifact.currentVersionId }] : []);
  const revisionTargets = current.filter(target => (target.taskId === "J13" ? imageRemaining : textRemaining) > 0);
  const allowanceTargets = current.filter(target => (target.taskId === "J13" ? imageRemaining : textRemaining) === 0);
  return { textRemaining, imageRemaining, revisionTargets, allowanceTargets, eligibleTaskIds };
}
