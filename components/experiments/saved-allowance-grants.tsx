"use client";

import { useCallback, useEffect, useState } from "react";
import { InitialAllowanceGrant } from "./initial-allowance-grant";
import type { AllowanceTotals } from "./allowance-review";
import { RunTimestamp } from "./run-metrics";

type SavedGrant = { campaignId: string; predecessorRunId: string | null; totals: AllowanceTotals; createdAtMs: number };

/** Recover persisted grants after a tab closes. Reads never grant or start work. */
export function SavedAllowanceGrants({ mode, persona, onGrant, onLocked }: {
  mode: "balanced" | "real"; persona: string;
  onGrant: (campaignId: string, predecessorRunId?: string) => void;
  onLocked: (locked: boolean) => void;
}) {
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [saved, setSaved] = useState<{ campaigns: SavedGrant[]; hasMore: boolean } | null>(null);
  const [error, setError] = useState(false);
  const [newGrant, setNewGrant] = useState(false);
  const [grantBusy, setGrantBusy] = useState(false);
  const lockGrant = useCallback((locked: boolean) => { setGrantBusy(locked); onLocked(locked); }, [onLocked]);
  const reload = (nextPage = page) => {
    setSaved(null); setError(false); setPage(nextPage); setRefresh(value => value + 1);
  };
  useEffect(() => {
    const controller = new AbortController();
    onLocked(true);
    void (async () => {
      try {
        const response = await fetch(`/api/experiments/booklet-runs/campaigns?mode=${mode}&persona=${encodeURIComponent(persona)}&page=${page}`,
          { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
        const body = await response.json() as { data?: { campaigns: SavedGrant[]; hasMore: boolean } };
        if (!response.ok || !body.data || !Array.isArray(body.data.campaigns)) throw Error("Saved grants unavailable");
        if (!controller.signal.aborted) setSaved(body.data);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally { if (!controller.signal.aborted) onLocked(false); }
    })();
    return () => { controller.abort(); onLocked(false); };
  }, [mode, persona, page, refresh, onLocked]);
  const button = "rounded border border-[var(--border)] px-4 py-2 font-semibold disabled:opacity-50";
  if (error) return <section aria-label="Saved allowance grants" className="space-y-3 rounded-lg border border-[var(--border)] p-4 text-sm">
    <p role="alert">Saved grants could not be checked. Refresh before recording another grant.</p>
    <button className={button} onClick={() => reload()}>Refresh saved grants</button>
  </section>;
  if (!saved) return <p role="status">Checking saved allowance grants…</p>;
  return <>
    {saved.campaigns.length || page > 0 ? <section aria-label="Saved allowance grants" className="space-y-3 rounded-lg border border-[var(--border)] p-4 text-sm">
      <h3 className="font-semibold">Saved grants awaiting a run</h3>
      <p>Select an existing grant after a refresh or closed tab. This does not add allowance or start a run.</p>
      {saved.campaigns.map(grant => <div key={grant.campaignId} className="space-y-2 border-t border-[var(--border)] pt-3">
        <p><RunTimestamp value={grant.createdAtMs} /> · ${(grant.totals.maxMicrodollars / 1_000_000).toFixed(6)} planning allowance</p>
        <p>{grant.totals.textCalls} text calls · {grant.totals.imageCalls} image calls · {grant.totals.steps} steps</p>
        <p>Text revisions {grant.totals.textRevisions} · Image revisions {grant.totals.imageRevisions} · No-progress window {grant.totals.noProgress}</p>
        <details><summary>Grant identifiers</summary><p className="break-all">Campaign {grant.campaignId}{grant.predecessorRunId ? ` · Predecessor ${grant.predecessorRunId}` : ""}</p></details>
        <button className={button} disabled={grantBusy} onClick={() => onGrant(grant.campaignId, grant.predecessorRunId ?? undefined)}>Use saved grant</button>
      </div>)}
      <div className="flex gap-2"><button className={button} disabled={grantBusy || page === 0} onClick={() => reload(page - 1)}>Previous grants</button>
        <button className={button} disabled={grantBusy || !saved.hasMore} onClick={() => reload(page + 1)}>Next grants</button>
        <button className={button} disabled={grantBusy} onClick={() => reload()}>Refresh saved grants</button></div>
      {!newGrant ? <button className={button} onClick={() => setNewGrant(true)}>Record a different grant</button> : null}
    </section> : null}
    {newGrant || saved.campaigns.length === 0 && page === 0 ? <InitialAllowanceGrant mode={mode} persona={persona} onGrant={onGrant} onLocked={lockGrant} /> : null}
  </>;
}
