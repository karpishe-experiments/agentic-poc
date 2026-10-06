import { describe, expect, it } from "vitest";
import { experimentPageBatchSchema, nextPageBatchItem, pageBatchFingerprint, type PageBatchItemState } from "@/lib/contracts/experiment-page-batches";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const batch = { schemaVersion: "2", runId: id(1), configurationHash: "a".repeat(64), layoutVersionId: id(2), selection: "selected_batch",
  pages: [{ pageId: id(3), pageBibleVersionId: id(4), previousPageVersionId: null }, { pageId: id(5), pageBibleVersionId: id(6), previousPageVersionId: null }] };
const pending: PageBatchItemState[] = batch.pages.map((page, position) => ({ pageId: page.pageId, position, status: "pending", operationId: null, assetId: null, pageVersionId: null }));
const saved = { ...pending[0], status: "succeeded" as const, operationId: id(7), assetId: id(8), pageVersionId: id(9) };

describe("ordered experiment page batches", () => {
  it("preserves explicit subset order and distinguishes single-page selection", () => {
    expect(nextPageBatchItem(batch, [...pending].reverse(), false)).toMatchObject({ kind: "ready", pageId: id(3), position: 0 });
    expect(experimentPageBatchSchema.safeParse({ ...batch, selection: "single" }).success).toBe(false);
    expect(experimentPageBatchSchema.parse({ ...batch, selection: "single", pages: [batch.pages[1]] }).pages[0].pageId).toBe(id(5));
  });
  it("fingerprints order, source versions and previous page versions", () => {
    expect(pageBatchFingerprint(batch)).not.toBe(pageBatchFingerprint({ ...batch, pages: [...batch.pages].reverse() }));
    expect(pageBatchFingerprint(batch)).not.toBe(pageBatchFingerprint({ ...batch, pages: [{ ...batch.pages[0], previousPageVersionId: id(10) }, batch.pages[1]] }));
    expect(pageBatchFingerprint(batch)).not.toBe(pageBatchFingerprint({ ...batch, layoutVersionId: id(11) }));
  });
  it("rejects duplicated pages, foreign items and inconsistent positions", () => {
    expect(experimentPageBatchSchema.safeParse({ ...batch, pages: [batch.pages[0], batch.pages[0]] }).success).toBe(false);
    expect(experimentPageBatchSchema.safeParse({ ...batch, pages: batch.pages.map((page) => ({ ...page, previousPageVersionId: id(20) })) }).success).toBe(false);
    expect(experimentPageBatchSchema.safeParse(batch).success).toBe(true);
    expect(() => nextPageBatchItem(batch, [pending[0]], false)).toThrow();
    expect(() => nextPageBatchItem(batch, [pending[0], { ...pending[1], pageId: id(12) }], false)).toThrow();
    expect(() => nextPageBatchItem(batch, [pending[0], { ...pending[1], position: 0 }], false)).toThrow();
    expect(() => nextPageBatchItem(batch, [pending[0], { ...pending[1], status: "running", operationId: id(13) }], false)).toThrow("reconciliation");
    expect(() => nextPageBatchItem(batch, [saved, { ...pending[1], status: "succeeded", operationId: id(7), assetId: id(14), pageVersionId: id(15) }], false)).toThrow("cannot share");
  });
  it("retains saved pages and never retries a later unknown or failed result", () => {
    for (const status of ["unknown", "failed"] as const) {
      expect(nextPageBatchItem(batch, [saved, { ...pending[1], status, operationId: id(13) }], false)).toMatchObject({ kind: "blocked", pageId: id(5) });
      expect(saved.assetId).toBe(id(8));
    }
  });
  it("Pause stops new work but retains an in-flight operation for reconciliation", () => {
    expect(nextPageBatchItem(batch, [saved, pending[1]], true)).toEqual({ kind: "paused" });
    expect(nextPageBatchItem(batch, [saved, { ...pending[1], status: "running", operationId: id(13) }], true)).toMatchObject({ kind: "waiting", operationId: id(13) });
    expect(nextPageBatchItem(batch, [saved, pending[1]], false)).toMatchObject({ kind: "ready", pageId: id(5) });
  });
  it("requires operation, asset and version evidence without inventing page approval", () => {
    expect(() => nextPageBatchItem(batch, [{ ...saved, assetId: null }, pending[1]], false)).toThrow();
    expect(nextPageBatchItem(batch, [saved, { ...pending[1], status: "succeeded", operationId: id(13), assetId: id(14), pageVersionId: id(15) }], false)).toEqual({ kind: "complete" });
    expect(() => nextPageBatchItem(batch, [saved, { ...pending[1], operationId: id(13) }], false)).toThrow();
  });
});
