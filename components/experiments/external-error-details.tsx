"use client";

import { useState } from "react";

export function ExternalErrorDetails({ runId }: { runId: string }) {
  const [details, setDetails] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const load = async (nextPage = page) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/experiments/booklet-runs/${encodeURIComponent(runId)}/diagnostics?page=${nextPage}`, {
        cache: "no-store", signal: AbortSignal.timeout(30_000) });
      const body = await response.json();
      if (!response.ok) throw Error(body.error?.message ?? "Diagnostics could not be read.");
      setDetails(JSON.stringify(body.data, null, 2));
      setPage(nextPage); setHasMore(body.data.hasMore);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Diagnostics unavailable."); }
    finally { setBusy(false); }
  };
  return <details onToggle={event => { if (event.currentTarget.open && details === null) void load(); }}>
    <summary>Technical details and external call errors</summary>
    <p className="text-sm">Historical exception details that were not captured are not recorded. Unknown charges remain reserved.</p>
    <p className="text-sm">Null fields mean not recorded. Truncated records contain a bounded sanitized preview; the download contains the retained sanitized evidence on this page.</p>
    <button disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Refresh diagnostics"}</button>
    <button disabled={busy || page === 0} onClick={() => void load(page - 1)}>Previous diagnostics</button>
    <button disabled={busy || !hasMore} onClick={() => void load(page + 1)}>Next diagnostics</button>
    {error ? <p role="alert">{error}</p> : null}
    {details ? <><div className="flex gap-3"><button onClick={() => void navigator.clipboard.writeText(details).catch(() => setError("Copy unavailable; use Download."))}>Copy diagnostics</button>
      <button onClick={() => { const url = URL.createObjectURL(new Blob([details], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = `${runId}-diagnostics.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Download diagnostics</button></div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">{details}</pre></> : null}
  </details>;
}
