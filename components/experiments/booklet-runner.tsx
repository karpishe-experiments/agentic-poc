"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SavedArtifactImages } from "./saved-artifact-images";
import type { ExperimentReport } from "@/lib/contracts/experiment-reports";
import type { ExperimentPageBatch } from "@/lib/contracts/experiment-page-batches";
import { PageBatchSelector, type PageSelection } from "./page-batch-selector";

const personas = [
  { id: "playful_kid", label: "Playful kid" },
  { id: "enthusiast_parent", label: "Enthusiast parent" },
  { id: "professional_creator", label: "Professional creator" },
] as const;
type Persona = (typeof personas)[number]["id"];
type Version = { id: string; number: number; content: unknown; warnings: { field: string; message: string }[]; approval: { origin: string } | null; dependencyVersionIds: string[] };
type Artifact = { id: string; taskId: string; state: string; currentVersionId: string | null; versions: Version[] };
type Operation = { id: string; role: string; taskId: string | null; state: string; workflowRunId: string | null; parentWorkflowRunId: string | null; reservationCount: number; safeFailure: string | null; createdAtMs: number; updatedAtMs: number;
  elapsedMs?: number; remoteStatus?: string | null; deadlineAtMs?: number | null; lifecycle?: { phase: string; startedAtMs: number; lastProgressAtMs: number; attemptOutcome?: string; unresolved?: boolean; stop?: { delivery: string } } | null };
type Run = {
  runId: string; predecessorRunId?: string | null; persona: Persona; mode: string; brief?: string; status: string; revision: number; pauseRequested: boolean;
  counters: { logicalText: number; logicalImage: number; payableText: number; payableImage: number; steps: number };
  limits: { text: number; image: number; steps: number }; currentArtifacts?: Artifact[];
  pendingDecision?: unknown; nextNarrativeTask?: string | null; safeFailure?: string | null; activeOperationId?: string | null;
  creatorMessages?: { id: string; sequence: number; content: unknown; createdAtMs: number }[];
  activeDelegation?: { id: string; taskIds: string[]; subjectKind: string; subjectId: string; testerDecisionId: string } | null;
  operationHistory?: Operation[];
  bookletId?: string;
  generationStatus?: "in_progress" | "complete";
  evaluationStatus?: "pending" | "running" | "complete" | "failed";
  reports?: { operationId: string; workflowRunId: string | null; verifiedWorkflowId: string | null;
    matchesCurrentVersions: boolean; report: ExperimentReport }[];
  pageSelection?: PageSelection | null;
  pageBatch?: ExperimentPageBatch;
  preparation?: { identity: string; startedAtMs: number; deadlineAtMs: number; unresolved: boolean } | null;
};
type Envelope<T> = { data?: T; error?: { code: string; message: string } };
type PendingCreate = { persona: Persona; key: string; predecessorRunId?: string };
class RunnerRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}
function safeMessage(error: unknown, fallback: string) { return error instanceof RunnerRequestError ? error.message : fallback; }

async function read<T>(response: Response): Promise<T> {
  const envelope = await response.json() as Envelope<T>;
  if (!response.ok || envelope.data === undefined) throw new RunnerRequestError(envelope.error?.message ?? "The runner request could not be completed.", response.status, envelope.error?.code);
  return envelope.data;
}
const format = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value, null, 2);

export function BookletRunner({ focusedRunId }: { focusedRunId?: string } = {}) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [persona, setPersona] = useState<Persona>("playful_kid");
  const [pending, setPending] = useState<PendingCreate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollBusy = useRef(false);
  const alive = useRef(true);
  const activeRows = useRef(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const hasActiveRows = runs.some(row => row.status === "queued" || row.status === "running" || !!row.activeOperationId || row.preparation?.unresolved);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (pollBusy.current) return;
    pollBusy.current = true;
    try {
      const response = await fetch(focusedRunId ? `/api/experiments/booklet-runs/${encodeURIComponent(focusedRunId)}` : `/api/experiments/booklet-runs/summaries?page=${page}`, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) });
      const result = focusedRunId ? { runs: [await read<Run>(response)], hasMore: false } : await read<{ runs: Run[]; hasMore: boolean }>(response);
      const next = result.runs;
      activeRows.current = next.some(row => row.status === "queued" || row.status === "running" || !!row.activeOperationId || row.preparation?.unresolved);
      if (alive.current) setHasMore(result.hasMore);
      if (alive.current) { setRuns(next); setLoadError(null); setLoading(false); }
    } catch (caught) {
      if (alive.current && !(caught instanceof DOMException && caught.name === "AbortError")) { setLoadError(safeMessage(caught, "The runner request could not be completed.")); setLoading(false); }
    } finally { pollBusy.current = false; }
  }, [focusedRunId, page]);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => { await refresh(controller.signal); if (!controller.signal.aborted && activeRows.current) timer = setTimeout(poll, 5000); };
    void poll();
    return () => { alive.current = false; controller.abort(); if (timer) clearTimeout(timer); };
  }, [refresh, hasActiveRows]);

  async function create(queue: PendingCreate[]) {
    setBusy(true); setActionError(null); setPending(queue);
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      try {
        await read<Run>(await fetch("/api/experiments/booklet-runs", {
          method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": item.key },
          signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({ persona: item.persona, mode: "simulated", ...(item.predecessorRunId ? { predecessorRunId: item.predecessorRunId } : {}) }),
        }));
        setPending(queue.slice(index + 1));
      } catch (caught) {
        setActionError(`${safeMessage(caught, "The run could not be created.")} Retry will use the same request key.`);
        setBusy(false);
        return;
      }
    }
    setPending(null); setBusy(false); await refresh();
  }

  async function inspectOperation(run: Run, operationId: string, action: "inspect" | "stop", preparation = false) {
    setBusy(true); setActionError(null);
    try {
      await read<Run>(await fetch(`/api/experiments/booklet-runs/${run.runId}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(35_000),
        body: JSON.stringify({ expectedRevision: run.revision, ...(preparation ? { preparationId: operationId } : { operationId }) }),
      }));
      await refresh();
    } catch (caught) { setActionError(safeMessage(caught, "Outcome unresolved. Inspect the same operation; no request was repeated.")); }
    finally { setBusy(false); }
  }

  async function control(run: Run, action: "pause" | "resume") {
    setBusy(true); setActionError(null);
    try {
      const send = async (current: Run) => read<Run>(await fetch(`/api/experiments/booklet-runs/${current.runId}/${action}`, { method: "POST", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: current.revision }) }));
      try { await send(run); }
      catch (caught) {
        // Only a definite CAS rejection permits a retry; uncertain writes are never replayed.
        if (!(caught instanceof RunnerRequestError) || caught.status !== 409 || caught.code !== "conflict") throw caught;
        const current = await read<Run>(await fetch(`/api/experiments/booklet-runs/${run.runId}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) }));
        if (alive.current) setRuns((saved) => saved.map((item) => item.runId === current.runId ? current : item));
        if (current.status === "failed" || current.status === "completed" || (action === "resume" && current.status === "blocked")) throw new RunnerRequestError("The run changed state. Inspect its saved status before trying again.", 409);
        const alreadyApplied = action === "pause" ? current.pauseRequested || current.status === "paused" : !current.pauseRequested && current.status !== "paused";
        if (!alreadyApplied) await send(current);
      }
      await refresh();
    } catch (caught) { setActionError(safeMessage(caught, "The run could not be updated.")); }
    finally { setBusy(false); }
  }

  async function savePages(run: Run, batch: ExperimentPageBatch) {
    setBusy(true); setActionError(null);
    try {
      await read(await fetch(`/api/experiments/booklet-runs/${run.runId}/pages`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ expectedRevision: run.revision, batch }),
      }));
    } catch (caught) {
      setActionError(safeMessage(caught, "Selection response was lost. Inspect the saved page batch before trying again. No automatic retry was sent."));
    } finally { await refresh(); setBusy(false); }
  }

  return <section className="max-w-4xl space-y-8">
    <header className="space-y-2"><p className="text-sm font-medium uppercase tracking-[0.16em] text-[var(--accent)]">Dify booklet experiment</p><h1 className="text-3xl font-semibold">Booklet runs</h1><p className="text-[var(--muted-ink)]">Inspect saved artifacts, images, approvals and advisory reports. Shorter suites stop at their slice boundary; full suites record generation and evaluation separately.</p></header>
    {focusedRunId ? <Link className="underline" href="/experiments/booklet-runs">Back to all runs</Link> : <section aria-labelledby="new-run-heading" className="space-y-3 rounded-lg border border-[var(--border)] p-5">
      <h2 id="new-run-heading" className="text-xl font-semibold">Start simulated runs</h2>
      <label className="block space-y-1"><span>Persona</span><select aria-label="Persona" className="rounded border border-[var(--border)] p-2" value={persona} onChange={(event) => setPersona(event.target.value as Persona)}>{personas.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <p className="text-sm text-[var(--muted-ink)]">Balanced and Real modes are unavailable.</p>
      <div className="flex flex-wrap gap-2"><button disabled={busy || pending !== null} onClick={() => void create([{ persona, key: crypto.randomUUID() }])}>Start selected</button><button disabled={busy || pending !== null} onClick={() => void create(personas.map((item) => ({ persona: item.id, key: crypto.randomUUID() })))}>Start all three</button>{pending?.length ? <button disabled={busy} onClick={() => void create(pending)}>Retry pending creation</button> : null}</div>
    </section>}
    <button onClick={() => void refresh()}>Refresh</button>
    {actionError ? <p role="alert" className="rounded border border-red-500 p-3">{actionError}</p> : null}
    {loadError ? <p role="alert" className="rounded border border-red-500 p-3">{loadError}</p> : null}
    <section aria-labelledby="saved-runs-heading" className="space-y-4"><h2 id="saved-runs-heading" className="text-xl font-semibold">Saved runs</h2>{loading ? <p role="status">Loading runs…</p> : runs.length === 0 ? <p>No runs yet.</p> : runs.map((run) => <article key={run.runId} className="space-y-4 rounded-lg border border-[var(--border)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{personas.find((item) => item.id === run.persona)?.label ?? run.persona}</h3><p className="text-sm">{run.mode} · {run.status} · revision {run.revision}</p><p className="break-all text-xs text-[var(--muted-ink)]">Run {run.runId}</p></div><div>{run.pauseRequested || run.status === "paused" ? <button disabled={busy || run.status === "blocked" || run.status === "failed" || run.status === "completed"} onClick={() => void control(run, "resume")}>Resume</button> : <button disabled={busy || run.status === "failed" || run.status === "completed"} onClick={() => void control(run, "pause")}>Pause</button>}</div></div>
      <p>{run.brief}</p><p className="text-sm">Next: {run.nextNarrativeTask ?? "Awaiting state change"}{run.safeFailure ? ` · ${run.safeFailure}` : ""}</p>
      <p className="text-sm">Generation: {run.generationStatus ?? "in_progress"} · Evaluation: {run.evaluationStatus ?? "pending"}</p>
      {run.bookletId ? <><p className="break-all text-xs">Booklet {run.bookletId}</p>{!focusedRunId ? <Link className="underline" href={`/experiments/booklet-runs/${encodeURIComponent(run.runId)}`}>Open saved booklet</Link> : null}</> : null}
      {run.pageSelection ? <PageBatchSelector key={`${run.runId}:${run.pageSelection.layoutVersionId}:${run.pageSelection.pages.map((page) => `${page.pageBibleVersionId}:${page.previousPageVersionId}`).join(",")}`}
        selection={run.pageSelection} busy={busy} onSave={(batch) => void savePages(run, batch)} /> : null}
      {run.pageBatch ? <details><summary>Saved page batch ({run.pageBatch.pages.length} pages)</summary>
        <p className="text-sm">Retained dispatch order; individual approvals still apply.</p>
        <ol className="list-decimal pl-5">{run.pageBatch.pages.map((page) => <li className="break-all text-xs" key={page.pageId}>{page.pageId}</li>)}</ol>
      </details> : null}
      {run.reports?.length ? <section aria-label="Advisory reports" className="space-y-2"><h4 className="font-semibold">Advisory reports</h4>
        {run.reports.map((entry) => <details key={entry.operationId}><summary>{entry.report.role === "tester" ? "Tester feedback" : "Independent judge assessment"} · {entry.report.mode}</summary>
          <p>{entry.report.summary}</p><p className="text-sm">Current artifact versions: {entry.matchesCurrentVersions ? "match" : "do not match; report is historical"}</p>
          <p className="break-all text-xs">Operation {entry.operationId} · Workflow {entry.workflowRunId ?? "unavailable"} · Published {entry.verifiedWorkflowId ?? "unverified"}</p>
          <pre className="overflow-auto whitespace-pre-wrap text-sm">{format(entry.report)}</pre>
        </details>)}</section> : null}
      {run.predecessorRunId ? <p className="break-all text-xs">Predecessor run: {run.predecessorRunId}</p> : null}
      {!focusedRunId && run.mode === "simulated" && (run.status === "blocked" || run.status === "failed") ? <button disabled={busy || pending !== null} onClick={() => void create([{ persona: run.persona, key: crypto.randomUUID(), predecessorRunId: run.runId }])}>Start linked successor</button> : null}
      <p className="text-sm">Text calls {run.counters.logicalText}/{run.limits.text} · Image calls {run.counters.logicalImage}/{run.limits.image} · Steps {run.counters.steps}/{run.limits.steps} · Payable text {run.counters.payableText} · Payable image {run.counters.payableImage}</p>
      {run.activeOperationId ? <p className="break-all text-sm">Active operation: {run.operationHistory?.find((operation) => operation.id === run.activeOperationId)?.role ?? "unknown"} {run.operationHistory?.find((operation) => operation.id === run.activeOperationId)?.taskId ?? ""} ({run.activeOperationId})</p> : null}
      {run.preparation ? <section aria-label="Active preparation"><p>Preparation {run.preparation.identity} · Deadline {new Date(run.preparation.deadlineAtMs).toISOString()}{run.preparation.unresolved ? " · Outcome unresolved" : ""}</p><button disabled={busy} onClick={() => void inspectOperation(run, run.preparation!.identity, "inspect", true)}>Inspect preparation</button><button disabled={busy} onClick={() => void inspectOperation(run, run.preparation!.identity, "stop", true)}>Stop preparation</button></section> : null}
      {run.activeDelegation ? <p className="text-sm">Active tester grant: {run.activeDelegation.taskIds.join(", ")} for {run.activeDelegation.subjectKind} {run.activeDelegation.subjectId}</p> : null}
      {run.pendingDecision ? <details><summary>Pending decision</summary><pre className="overflow-auto whitespace-pre-wrap text-sm">{format(run.pendingDecision)}</pre></details> : null}
      {run.creatorMessages?.length ? <details><summary>Saved tester decisions ({run.creatorMessages.length})</summary><ol className="space-y-2 pl-5">{run.creatorMessages.map((message) => <li key={message.id}><p>Decision {message.sequence}</p><pre className="overflow-auto whitespace-pre-wrap text-sm">{format(message.content)}</pre></li>)}</ol></details> : null}
      {run.operationHistory?.length ? <details><summary>Operation trace ({run.operationHistory.length})</summary><ol className="space-y-2 pl-5">{run.operationHistory.map((operation) => <li key={operation.id} className="break-all text-sm"><p>{operation.role}{operation.taskId ? ` ${operation.taskId}` : ""} · {operation.state}{operation.safeFailure ? ` · ${operation.safeFailure}` : ""}</p><p>Operation {operation.id}</p><p>Workflow {operation.workflowRunId ?? "pending"} · Parent {operation.parentWorkflowRunId ?? "none"}</p><p>Reservations {operation.reservationCount}</p>
        {operation.lifecycle ? <p>Phase: {operation.lifecycle.phase} · Last progress: {new Date(operation.lifecycle.lastProgressAtMs).toISOString()} · Attempt: {operation.lifecycle.attemptOutcome ?? "active"}{operation.lifecycle.unresolved ? ", outcome unresolved" : ""} · Stop: {operation.lifecycle.stop?.delivery ?? "not requested"}</p> : null}
        {operation.deadlineAtMs ? <p>Deadline: {new Date(operation.deadlineAtMs).toISOString()}</p> : null}
        <p>Elapsed: {Math.floor((operation.elapsedMs ?? 0) / 1000)}s · Remote status: {operation.remoteStatus ?? "not verified"}</p>
        <button disabled={busy} onClick={() => void inspectOperation(run, operation.id, "inspect")}>Inspect/reconcile</button>{run.activeOperationId === operation.id ? <button disabled={busy} onClick={() => void inspectOperation(run, operation.id, "stop")}>Stop operation</button> : null}
      </li>)}</ol></details> : null}
      <div className="space-y-3">{run.currentArtifacts?.map((artifact) => <section key={artifact.id} className="rounded border border-[var(--border)] p-3"><h4 className="font-semibold">{artifact.taskId} · {artifact.state}</h4>{artifact.versions.map((version) => <details key={version.id} open={version.id === artifact.currentVersionId}><summary>Version {version.number} · {version.approval ? `Approved (${version.approval.origin})` : "Needs review"}</summary><p className="break-all text-xs">Version ID: {version.id}</p>{version.dependencyVersionIds.length ? <p className="break-all text-xs">Sources: {version.dependencyVersionIds.join(", ")}</p> : null}<SavedArtifactImages taskId={artifact.taskId} content={version.content} simulated={run.mode === "simulated"} /><pre className="overflow-auto whitespace-pre-wrap text-sm">{format(version.content)}</pre>{version.warnings.length ? <ul className="list-disc pl-5">{version.warnings.map((warning, index) => <li key={`${warning.field}-${index}`}>{warning.field}: {warning.message}</li>)}</ul> : null}</details>)}</section>)}</div>
    </article>)}</section>
    {!focusedRunId ? <nav aria-label="Run pages"><button disabled={page === 0 || busy} onClick={() => setPage(value => value - 1)}>Previous page</button><span> Page {page + 1} </span><button disabled={!hasMore || busy} onClick={() => setPage(value => value + 1)}>Next page</button></nav> : null}
  </section>;
}
