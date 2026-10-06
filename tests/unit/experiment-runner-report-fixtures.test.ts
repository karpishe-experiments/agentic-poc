import { describe, expect, it } from "vitest";
import { simulatedExperimentReport } from "@/lib/experiment-runner/report-fixtures";
import { validateExperimentReport } from "@/lib/contracts/experiment-reports";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
describe("bounded model-free report fixtures", () => {
  it.each(["tester", "judge"] as const)("retains %s evidence without invented visual or monetary assessment", (role) => {
    const input = { role, mode: "simulated", runId: id(1), configurationHash: "a".repeat(64), versionIds: [id(2)], warningCount: 1000 };
    const report = simulatedExperimentReport(input);
    expect(simulatedExperimentReport(input)).toEqual(report);
    expect(validateExperimentReport(report, { role, mode: "simulated", runId: id(1), configurationHash: input.configurationHash,
      artifacts: [{ artifactId: id(3), versionId: id(2), pageId: null }], availableAssetIds: [id(4)], requiredFinalAssetIds: [id(4)] })).toEqual(report);
    expect(report.consistency.status).toBe("not_assessed");
    expect(report.evidence.inspectedAssetIds).toEqual([]);
    expect(report.costEvidence.actualUsd).toBeNull();
    expect(report.findings).toHaveLength(1);
    expect(JSON.stringify(report)).not.toContain('"regenerate"');
  });
  it("rejects paid mode and ambiguous evidence", () => {
    const input = { role: "judge", mode: "simulated", runId: id(1), configurationHash: "a".repeat(64), versionIds: [id(2)], warningCount: 0 };
    for (const change of [{ mode: "balanced" }, { mode: "real" }, { versionIds: [id(2), id(2)] }, { versionIds: [] }, { warningCount: -1 }]) {
      expect(() => simulatedExperimentReport({ ...input, ...change })).toThrow();
    }
    expect(simulatedExperimentReport(input).findings).toEqual([]);
  });
});
