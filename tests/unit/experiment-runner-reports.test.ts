import { describe, expect, it } from "vitest";
import { experimentReportSchema, validateExperimentReport } from "@/lib/contracts/experiment-reports";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const expected = {
  role: "judge" as const, mode: "simulated" as const, runId: id(1), configurationHash: "a".repeat(64),
  artifacts: [{ artifactId: id(2), versionId: id(3), pageId: id(4) }],
  availableAssetIds: [id(5), id(6)], requiredFinalAssetIds: [id(5), id(6)],
};
const assessment = { status: "observed" as const, explanation: "Advisory simulated observation." };
const report = {
  schemaVersion: "2", role: "judge", mode: "simulated", runId: expected.runId, configurationHash: expected.configurationHash,
  summary: "Simulated assessment; no real model judgement.", intent: assessment, consistency: assessment, interaction: assessment,
  costEvidence: { status: "unavailable", actualUsd: null, estimatedUsd: null, explanation: "Provider cost evidence is absent." },
  findings: [{ category: "consistency", target: { kind: "artifact", ...expected.artifacts[0] }, explanation: "Keep the expression warning; do not regenerate." }],
  evidence: { versionIds: [id(3)], inspectedAssetIds: [id(5), id(6)] },
};

describe("advisory experiment reports", () => {
  it("retains warning-bearing simulated reports without a passing score or mutation", () => {
    expect(validateExperimentReport(report, expected)).toEqual(report);
    expect(experimentReportSchema.safeParse({ ...report, regenerate: true }).success).toBe(false);
  });
  it("rejects wrong run, mode, role and configuration evidence", () => {
    for (const changed of [{ runId: id(9) }, { mode: "real" }, { role: "tester" }, { configurationHash: "b".repeat(64) }]) {
      expect(() => validateExperimentReport({ ...report, ...changed }, expected)).toThrow();
    }
  });
  it("rejects missing, duplicated and foreign artifact versions and mismatched finding targets", () => {
    for (const versionIds of [[], [id(3), id(3)], [id(9)]]) {
      expect(() => validateExperimentReport({ ...report, evidence: { ...report.evidence, versionIds } }, expected)).toThrow();
    }
    expect(() => validateExperimentReport({ ...report, findings: [{ ...report.findings[0], target: { ...report.findings[0].target, pageId: id(9) } }] }, expected)).toThrow();
  });
  it("does not claim visual assessment when final image evidence is incomplete", () => {
    const incomplete = { ...report, evidence: { ...report.evidence, inspectedAssetIds: [id(5)] } };
    expect(() => validateExperimentReport(incomplete, expected)).toThrow("every final page");
    expect(validateExperimentReport({ ...incomplete, consistency: { status: "not_assessed", explanation: "The cover was not inspected." } }, expected).consistency.status).toBe("not_assessed");
    expect(() => validateExperimentReport({ ...report, evidence: { ...report.evidence, inspectedAssetIds: [id(9)] } }, expected)).toThrow();
  });
  it("keeps actual, estimated and unavailable cost separate", () => {
    expect(experimentReportSchema.safeParse({ ...report, costEvidence: { ...report.costEvidence, actualUsd: 0.01 } }).success).toBe(false);
    for (const costEvidence of [
      { status: "available", actualUsd: null, estimatedUsd: null, explanation: "Missing." },
      { status: "available", actualUsd: null, estimatedUsd: 0.01, explanation: "Estimate only." },
      { status: "partial", actualUsd: null, estimatedUsd: null, explanation: "Missing." },
    ]) expect(experimentReportSchema.safeParse({ ...report, costEvidence }).success).toBe(false);
    expect(validateExperimentReport({ ...report, costEvidence: { status: "available", actualUsd: 0, estimatedUsd: null, explanation: "Verified zero provider usage." } }, expected).costEvidence.actualUsd).toBe(0);
    expect(validateExperimentReport({ ...report, costEvidence: { status: "partial", actualUsd: null, estimatedUsd: 0.01, explanation: "Estimate only." } }, expected).costEvidence.actualUsd).toBeNull();
  });
});
