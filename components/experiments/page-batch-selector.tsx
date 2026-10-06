"use client";

import { useState } from "react";
import type { ExperimentPageBatch } from "@/lib/contracts/experiment-page-batches";

export type PageSelection = Omit<ExperimentPageBatch, "selection" | "pages"> & {
  pages: (ExperimentPageBatch["pages"][number] & { pageIndex: number })[];
};

export function PageBatchSelector({ selection, busy, onSave }: {
  selection: PageSelection; busy: boolean; onSave: (batch: ExperimentPageBatch) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = selectedIds.flatMap((id) => selection.pages.filter((page) => page.pageId === id));
  const label = (page: PageSelection["pages"][number]) => page.pageIndex === 0 ? "Cover" : `Page ${page.pageIndex}`;
  return <section aria-label="Page generation order" className="space-y-2 rounded border border-[var(--border)] p-3">
    <h4 className="font-semibold">Page generation order</h4>
    <p className="text-sm">Select one page or a batch in the order to generate. Saving keeps the run paused.
      Resume starts the saved order, then the remaining required pages. Each page keeps its own approval.</p>
    <div className="flex flex-wrap gap-3">{selection.pages.map((page) => <label key={page.pageId}>
      <input type="checkbox" disabled={busy} checked={selectedIds.includes(page.pageId)}
        onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, page.pageId] : ids.filter((id) => id !== page.pageId))} /> {label(page)}
    </label>)}</div>
    <p>Selected order: {selected.length ? selected.map(label).join(" → ") : "None"}</p>
    <button disabled={busy || !selected.length} onClick={() => onSave({
      schemaVersion: selection.schemaVersion, runId: selection.runId, configurationHash: selection.configurationHash,
      layoutVersionId: selection.layoutVersionId, selection: selected.length === 1 ? "single" : "selected_batch",
      pages: selected.map(({ pageId, pageBibleVersionId, previousPageVersionId }) => ({ pageId, pageBibleVersionId, previousPageVersionId })),
    })}>Save page order</button>
  </section>;
}
