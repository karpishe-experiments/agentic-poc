import { createHash } from "node:crypto";
import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";

const page = z.strictObject({
  pageId: opaqueIdSchema,
  pageBibleVersionId: opaqueIdSchema,
  previousPageVersionId: opaqueIdSchema.nullable(),
});
export const experimentPageBatchSchema = z.strictObject({
  schemaVersion: z.literal("2"),
  runId: opaqueIdSchema,
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
  layoutVersionId: opaqueIdSchema,
  selection: z.enum(["single", "selected_batch"]),
  pages: z.array(page).min(1).max(9),
}).refine((value) => new Set(value.pages.map((item) => item.pageId)).size === value.pages.length,
  "Selected pages must be unique")
  .refine((value) => new Set(value.pages.map((item) => item.pageBibleVersionId)).size === value.pages.length,
    "Selected Page Bible versions must be unique")
  .refine((value) => {
    const previous = value.pages.flatMap((item) => item.previousPageVersionId ? [item.previousPageVersionId] : []);
    return new Set(previous).size === previous.length;
  }, "Selected prior page versions must be unique")
  .refine((value) => value.selection !== "single" || value.pages.length === 1,
    "Page-by-page selection contains exactly one page");
export type ExperimentPageBatch = z.infer<typeof experimentPageBatchSchema>;

// A pure job-input contract, not authorization to dispatch. The repository must
// verify current sources and retain this selection in generation_jobs/items.
export function pageBatchFingerprint(raw: unknown): string {
  const batch = experimentPageBatchSchema.parse(raw);
  return createHash("sha256").update(JSON.stringify({ schemaVersion: batch.schemaVersion,
    runId: batch.runId, configurationHash: batch.configurationHash, layoutVersionId: batch.layoutVersionId,
    selection: batch.selection, pages: batch.pages.map((item) => ({ pageId: item.pageId,
      pageBibleVersionId: item.pageBibleVersionId, previousPageVersionId: item.previousPageVersionId })) })).digest("hex");
}

const itemState = z.strictObject({
  pageId: opaqueIdSchema,
  position: z.number().int().nonnegative(),
  status: z.enum(["pending", "running", "succeeded", "failed", "unknown"]),
  operationId: opaqueIdSchema.nullable(),
  assetId: opaqueIdSchema.nullable(),
  pageVersionId: opaqueIdSchema.nullable(),
});
export type PageBatchItemState = z.infer<typeof itemState>;

export function nextPageBatchItem(rawBatch: unknown, rawItems: unknown, paused: boolean):
  { kind: "paused" | "complete" } | { kind: "ready" | "waiting" | "blocked"; pageId: string; position: number; operationId: string | null } {
  const batch = experimentPageBatchSchema.parse(rawBatch);
  const items = z.array(itemState).parse(rawItems);
  if (items.length !== batch.pages.length || new Set(items.map((item) => item.position)).size !== items.length ||
      items.some((item) => batch.pages[item.position]?.pageId !== item.pageId)) {
    throw new Error("Batch items differ from the retained ordered selection.");
  }
  const ordered = [...items].sort((a, b) => a.position - b.position);
  for (const field of ["operationId", "assetId", "pageVersionId"] as const) {
    const identities = ordered.flatMap((item) => item[field] ? [item[field]] : []);
    if (new Set(identities).size !== identities.length) throw new Error("Different batch pages cannot share execution or result identities.");
  }
  const firstIncomplete = ordered.findIndex((item) => item.status !== "succeeded");
  if (firstIncomplete >= 0 && ordered.slice(firstIncomplete + 1).some((item) => item.status !== "pending" ||
      item.operationId || item.assetId || item.pageVersionId)) {
    throw new Error("Later batch execution requires reconciliation before ordered dispatch.");
  }
  for (const item of ordered) {
    if (item.status === "succeeded") {
      if (!item.operationId || !item.assetId || !item.pageVersionId) throw new Error("Saved batch page is missing operation, asset or version evidence.");
      continue;
    }
    const identity = { pageId: item.pageId, position: item.position, operationId: item.operationId };
    if (item.status === "unknown" || item.status === "failed") return { kind: "blocked", ...identity };
    if (item.status === "running") {
      if (!item.operationId) throw new Error("Running batch page has no retained operation identity.");
      return { kind: "waiting", ...identity };
    }
    if (item.operationId || item.assetId || item.pageVersionId) throw new Error("Pending batch page contains unreconciled execution evidence.");
    return paused ? { kind: "paused" } : { kind: "ready", ...identity };
  }
  // Generated is not approved. Each returned page version still needs its own
  // explicit or delegated approval before the booklet completion verifier.
  return { kind: "complete" };
}
