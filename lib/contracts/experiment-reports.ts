import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentModeSchema } from "@/lib/contracts/experiment-runner";

const note = z.string().trim().min(1).max(8_000);
const assessment = z.strictObject({
  status: z.enum(["observed", "not_assessed"]),
  explanation: note,
});
const target = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("run"), runId: opaqueIdSchema }),
  z.strictObject({ kind: z.literal("artifact"), artifactId: opaqueIdSchema, versionId: opaqueIdSchema, pageId: opaqueIdSchema.nullable() }),
]);
const ids = z.array(opaqueIdSchema).max(100)
  .refine((items) => new Set(items).size === items.length, "Evidence identities must be unique");

// Advisory data only: no approval, regeneration, tool call or passing score.
// The repository must establish source ownership, publication and asset bytes.
export const experimentReportSchema = z.strictObject({
  schemaVersion: z.literal("2"),
  role: z.enum(["tester", "judge"]),
  mode: experimentModeSchema,
  runId: opaqueIdSchema,
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
  summary: note,
  intent: assessment,
  consistency: assessment,
  interaction: assessment,
  costEvidence: z.strictObject({
    status: z.enum(["available", "partial", "unavailable"]),
    actualUsd: z.number().finite().nonnegative().nullable(),
    estimatedUsd: z.number().finite().nonnegative().nullable(),
    explanation: note,
  }).refine((value) => value.status === "available" ? value.actualUsd !== null :
    value.status === "partial" ? value.actualUsd !== null || value.estimatedUsd !== null :
      value.actualUsd === null && value.estimatedUsd === null,
    "Cost availability must match actual, estimated or absent monetary evidence"),
  findings: z.array(z.strictObject({
    category: z.enum(["intent", "consistency", "interaction", "cost"]),
    target,
    explanation: note,
  })).max(100),
  evidence: z.strictObject({ versionIds: ids, inspectedAssetIds: ids }),
});
export type ExperimentReport = z.infer<typeof experimentReportSchema>;

export function validateExperimentReport(raw: unknown, expected: {
  role: ExperimentReport["role"]; mode: ExperimentReport["mode"]; runId: string; configurationHash: string;
  artifacts: { artifactId: string; versionId: string; pageId: string | null }[];
  availableAssetIds: string[];
  requiredFinalAssetIds: string[];
}): ExperimentReport {
  const report = experimentReportSchema.parse(raw);
  if (report.role !== expected.role || report.mode !== expected.mode || report.runId !== expected.runId ||
      report.configurationHash !== expected.configurationHash) throw new Error("Report identity differs from the retained run evidence.");
  const versions = new Set(expected.artifacts.map((item) => item.versionId));
  if (report.evidence.versionIds.length !== versions.size || report.evidence.versionIds.some((id) => !versions.has(id))) {
    throw new Error("Report must retain the exact current artifact-version evidence.");
  }
  if (report.evidence.inspectedAssetIds.some((id) => !expected.availableAssetIds.includes(id))) {
    throw new Error("Report refers to unavailable image evidence.");
  }
  if (report.consistency.status === "observed" && expected.requiredFinalAssetIds.some((id) => !report.evidence.inspectedAssetIds.includes(id))) {
    throw new Error("Visual consistency requires inspection of every final page and cover.");
  }
  for (const finding of report.findings) {
    const target = finding.target;
    if (target.kind === "run") {
      if (target.runId !== report.runId) throw new Error("Finding refers to another run.");
    } else if (!expected.artifacts.some((item) => item.artifactId === target.artifactId &&
        item.versionId === target.versionId && item.pageId === target.pageId)) {
      throw new Error("Finding does not match a current artifact, version and page.");
    }
  }
  return report;
}
