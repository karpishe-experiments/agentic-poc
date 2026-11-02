import { describe, expect, it } from "vitest";
import type { ExperimentOperationDocument } from "@/db/documents";
import { externalError } from "@/lib/experiment-runner/external-errors";
import { diagnosticAppendBaselines } from "@/lib/operations/settled-report-recovery";

const diagnostic = (id: string) => ({ ...externalError({ service: "booklet", stage: "result_transaction",
  error: new Error("save failed") }), id, timestamp: new Date(2000).toISOString(), attemptNumber: 1 });
const operation = (extra: object = {}) => ({ _id: "report", attempt: 1, updatedAtMs: 1000,
  resultJson: null, ...extra }) as ExperimentOperationDocument;

describe("diagnostic-only unapplied reconstruction", () => {
  it("reconstructs both an absent field and an existing prefix without altering current diagnostics", () => {
    const first = diagnostic("first"), second = diagnostic("second");
    const current = operation({ externalErrors: [first, second] });
    const before = structuredClone(current);
    const candidates = diagnosticAppendBaselines(current, 3000);
    expect(candidates).toContainEqual(operation());
    expect(candidates).toContainEqual(operation({ externalErrors: [] }));
    expect(candidates).toContainEqual(operation({ externalErrors: [first] }));
    expect(candidates).not.toContainEqual(current);
    expect(current).toEqual(before);
    expect(candidates.every(row => row.resultJson === null && row.updatedAtMs === 1000)).toBe(true);
  });

  it.each([
    { stage: "provider" }, { service: "dify" }, { attemptNumber: 2 },
    { timestamp: "invalid" }, { timestamp: new Date(999).toISOString() },
    { timestamp: new Date(3001).toISOString() }, { schemaVersion: "other" },
  ])("rejects an unrelated diagnostic suffix %j", change => {
    expect(diagnosticAppendBaselines(operation({ externalErrors: [{ ...diagnostic("one"), ...change }] }), 3000)).toEqual([]);
  });

  it("cannot reconstruct an evicted entry, altered prefix, or reordered history", () => {
    const old = diagnostic("old"), next = diagnostic("next"), last = diagnostic("last");
    const original = operation({ externalErrors: [old, next] });
    for (const errors of [[next, last], [{ ...old, details: "edited" }, next, last], [next, old, last]]) {
      expect(diagnosticAppendBaselines(operation({ externalErrors: errors }), 3000)).not.toContainEqual(original);
    }
    expect(diagnosticAppendBaselines(operation({ externalErrors: [old, old] }), 3000)).toEqual([]);
    expect(diagnosticAppendBaselines(operation(), 3000)).toEqual([]);
  });
});
