import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentReportSchema } from "@/lib/contracts/experiment-reports";

const inputSchema = z.strictObject({
  role: z.enum(["tester", "judge"]), mode: z.literal("simulated"), runId: opaqueIdSchema,
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
  versionIds: z.array(opaqueIdSchema).min(1).max(100).refine((ids) => new Set(ids).size === ids.length),
  warningCount: z.number().int().nonnegative(),
});

// A deterministic report fixture, not a visual evaluator. The application must
// supply verified generation evidence and validate the saved report again.
export function simulatedExperimentReport(raw: unknown) {
  const input = inputSchema.parse(raw);
  const unassessed = { status: "not_assessed" as const,
    explanation: "Deterministic simulation does not assess creative quality or human usability." };
  return experimentReportSchema.parse({
    schemaVersion: "2", role: input.role, mode: input.mode, runId: input.runId, configurationHash: input.configurationHash,
    summary: `Deterministic ${input.role} report retains ${input.versionIds.length} artifact versions and ${input.warningCount} recorded warnings. No quality gate or regeneration is requested.`,
    intent: unassessed, consistency: unassessed, interaction: unassessed,
    costEvidence: { status: "unavailable", actualUsd: null, estimatedUsd: null,
      explanation: "This model-free report has no provider billing evidence; application usage counters are retained separately." },
    findings: input.warningCount ? [{ category: "consistency", target: { kind: "run", runId: input.runId },
      explanation: `${input.warningCount} warnings remain in the saved artifact evidence. They do not request regeneration or prevent completion.` }] : [],
    evidence: { versionIds: input.versionIds, inspectedAssetIds: [] },
  });
}
