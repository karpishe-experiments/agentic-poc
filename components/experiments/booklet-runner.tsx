"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { controlStateSchema, type ControlState } from "@/lib/experiment-runner/control-state";
import { SavedArtifactImages } from "./saved-artifact-images";
import type { ExperimentReport } from "@/lib/contracts/experiment-reports";
import type { ExperimentPageBatch } from "@/lib/contracts/experiment-page-batches";
import { PageBatchSelector, type PageSelection } from "./page-batch-selector";
import type { ContextDiagnostics } from "@/lib/experiment-runner/context-diagnostics";

const personas = [
  { id: "playful_kid", label: "Playful kid" },
  { id: "enthusiast_parent", label: "Enthusiast parent" },
  { id: "professional_creator", label: "Professional creator" },
] as const;
type Persona = (typeof personas)[number]["id"];
type Version = { id: string; number: number; content: unknown; warnings: { field: string; message: string }[]; approval: { origin: string } | null; dependencyVersionIds: string[] };
type Artifact = { id: string; taskId: string; state: string; currentVersionId: string | null; versions: Version[] };
type Operation = { id: string; role: string; taskId: string | null; state: string; workflowRunId: string | null; parentWorkflowRunId: string | null; reservationCount: number; safeFailure: string | null; createdAtMs: number; updatedAtMs: number;
  countFailure?: { code: string; countedInputTokens: number | null; limit: number; generationStarted: false } | null;
  localReportFailure?: { code: string; scope: "context" | "request"; requestBytes: number; byteLimit: number } | null;
  contextDiagnostics?: ContextDiagnostics | null;
  elapsedMs?: number; remoteStatus?: string | null; deadlineAtMs?: number | null; lifecycle?: { phase: string; startedAtMs: number; lastProgressAtMs: number; attemptOutcome?: string; unresolved?: boolean; stop?: { delivery: string } } | null };
type Run = {
  runId: string; predecessorRunId?: string | null; persona: Persona; mode: string; title?: string | null; brief?: string; status: string; revision: number; pauseRequested: boolean;
  createdAtMs?: number; updatedAtMs?: number;
  counters: { logicalText: number; logicalImage: number; payableText: number; payableImage: number; steps: number };
  m4Accounting?: { campaignId: string; state: "active" | "stopped" | "completed"; requests: number; maxRequests: number;
    runRequests: number; runMaxRequests: number; reservedMicrodollars: number; settledMicrodollars: number;
    remainingMicrodollars: number; maxMicrodollars: number; countChargeStatus: "verified" | "assumed"; invoiceCostAvailable: false };
  limits: { text: number; image: number; steps: number }; currentArtifacts?: Artifact[];
  pendingDecision?: unknown; nextNarrativeTask?: string | null; safeFailure?: string | null; activeOperationId?: string | null;
  retainedDecisionContinuation?: boolean;
  creatorMessages?: { id: string; sequence: number; content: unknown; createdAtMs: number }[];
  activeDelegation?: { id: string; taskIds: string[]; subjectKind: string; subjectId: string; testerDecisionId: string } | null;
  operationHistory?: Operation[];
  contextWarningSummary?: { measuredOperations: number; warningCount: number } | null;
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
type Mode = "simulated" | "balanced";
const retainedDecisionControl = (state: Pick<Run, "status" | "safeFailure" | "generationStatus" | "activeOperationId" | "preparation" | "retainedDecisionContinuation">) =>
  state.retainedDecisionContinuation === true && state.status === "blocked" && state.safeFailure === "definite_failure" &&
  state.generationStatus === "in_progress" && !!state.activeOperationId && !state.preparation;
type PendingCreate = { persona: Persona; mode: Mode; key: string; predecessorRunId?: string };
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
const dollars = (microdollars: number) => `$${(microdollars / 1_000_000).toFixed(6)}`;
const timestampFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  hourCycle: "h23", timeZone: "UTC",
});
function RunTimestamp({ value }: { value?: number }) {
  if (value == null || !Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) return <>Unavailable</>;
  return <time dateTime={new Date(value).toISOString()}>{timestampFormat.format(value)} UTC</time>;
}
const label = (value: string) => value.replaceAll("_", " ").replace(/^./, char => char.toUpperCase());
const secondaryAction = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--canvas)] disabled:cursor-not-allowed disabled:opacity-50";

function ContextMeasurements({ value, operation }: { value?: ContextDiagnostics | null; operation: Operation }) {
  if (!value) return <p>Context measurement unavailable.</p>;
  const largest = Object.entries(value.sectionBytes).sort(([left, leftBytes], [right, rightBytes]) =>
    rightBytes - leftBytes || left.localeCompare(right)).slice(0, 3);
  return <section aria-label="Saved context measurements" className="space-y-1">
    {value.warnings.length ? <p>{operation.state === "succeeded" && operation.workflowRunId
      ? "Large context — execution continued." : "Large context — preparation continued."}</p> : null}
    <p>Size warnings did not block preparation. A later count or provider failure may still stop the operation.</p>
    <p>Context {value.contextBytes} bytes · System prompt {value.systemPromptBytes} bytes · Schema {value.schemaBytes} bytes · Request {value.requestBytes} bytes</p>
    <p>Heuristic input estimate {value.estimatedInputTokens} tokens ({value.estimator}); authoritative input count {value.authoritativeInputTokens ?? "unavailable"}.</p>
    <p>Largest context sections: {largest.map(([name, bytes]) => `${name} ${bytes} bytes`).join(" · ") || "unavailable"}.</p>
    <p>Read JSON {value.read.returnedJsonBytes ?? "unavailable"} bytes · Read time {value.read.elapsedMs ?? "unavailable"} ms.</p>
    {value.warnings.length ? <p>Warning codes: {value.warnings.map(warning => warning.code).join(", ")}.</p> : <p>No size warnings recorded.</p>}
  </section>;
}

export function BookletRunner({ focusedRunId, balancedEnabled = false, m4State = "disabled" }: {
  focusedRunId?: string; balancedEnabled?: boolean; m4State?: "disabled" | "invalid" | "ready" | "granted";
} = {}) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [persona, setPersona] = useState<Persona>("playful_kid");
  const [mode, setMode] = useState<Mode>("simulated");
  const canCreateBalanced = balancedEnabled && m4State === "granted";
  const [pending, setPending] = useState<PendingCreate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [controlNotice, setControlNotice] = useState<string | null>(null);
  const [uncertainRuns, setUncertainRuns] = useState<string[]>([]);
  const [pendingDetails, setPendingDetails] = useState<string[]>([]);
  const detailRefreshPending = useRef(new Set<string>());
  const unresolvedControls = useRef(new Set<string>());
  const latestRuns = useRef(new Map<string, Run>());
  const controlEpoch = useRef(0);
  const controlInFlight = useRef(false);
  const mutationDisabled = busy || uncertainRuns.length > 0;
  const [loading, setLoading] = useState(true);
  const pollBusy = useRef(false);
  const alive = useRef(true);
  const activeRows = useRef(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const hasActiveRows = runs.some(row => row.status === "queued" || row.status === "running" || !!row.activeOperationId || row.preparation?.unresolved);

  const refresh = useCallback(async (signal?: AbortSignal, force = false) => {
    if (pollBusy.current && !force) return false;
    const epoch = controlEpoch.current;
    pollBusy.current = true;
    try {
      const response = await fetch(focusedRunId ? `/api/experiments/booklet-runs/${encodeURIComponent(focusedRunId)}` : `/api/experiments/booklet-runs?view=summary&page=${page}`, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) });
      const result = focusedRunId ? { runs: [await read<Run>(response)], hasMore: false } : await read<{ runs: Run[]; hasMore: boolean }>(response);
      if (epoch !== controlEpoch.current || controlInFlight.current) return false;
      // A stale read must not replace a control acknowledgement or its retained details.
      const next = result.runs;
      const freshIds = next.filter(row => row.revision >= (latestRuns.current.get(row.runId)?.revision ?? -1)).map(row => row.runId);
      for (const row of next) if (freshIds.includes(row.runId)) latestRuns.current.set(row.runId, row);
      const accepted = next.map(row => latestRuns.current.get(row.runId) ?? row);
      activeRows.current = accepted.some(row => row.status === "queued" || row.status === "running" || !!row.activeOperationId || row.preparation?.unresolved);
      if (alive.current) setHasMore(result.hasMore);
      if (alive.current) {
        setRuns(accepted);
        const hadPendingDetails = detailRefreshPending.current.size > 0;
        for (const id of freshIds) detailRefreshPending.current.delete(id);
        setPendingDetails([...detailRefreshPending.current]);
        if (hadPendingDetails && detailRefreshPending.current.size === 0) setControlNotice(null);
        const hadUnresolved = unresolvedControls.current.size > 0;
        for (const id of freshIds) unresolvedControls.current.delete(id);
        setUncertainRuns([...unresolvedControls.current]);
        if (hadUnresolved && unresolvedControls.current.size === 0) setActionError(null);
        setLoadError(null); setLoading(false);
      }
      return next.every(row => freshIds.includes(row.runId));
    } catch (caught) {
      if (alive.current && epoch === controlEpoch.current && !controlInFlight.current && !(caught instanceof DOMException && caught.name === "AbortError")) { setLoadError(safeMessage(caught, "The runner request could not be completed.")); setLoading(false); }
    } finally { pollBusy.current = false; }
    return false;
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
    if (queue.some((item) => item.mode === "balanced") && !canCreateBalanced) {
      setActionError("Balanced creation requires the campaign execution grant."); return;
    }
    setBusy(true); setActionError(null); setPending(queue);
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      try {
        await read<Run>(await fetch("/api/experiments/booklet-runs", {
          method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": item.key },
          signal: AbortSignal.timeout(60_000),
          body: JSON.stringify({ persona: item.persona, mode: item.mode, ...(item.predecessorRunId ? { predecessorRunId: item.predecessorRunId } : {}) }),
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
    if (controlInFlight.current || uncertainRuns.length) return;
    controlInFlight.current = true; controlEpoch.current += 1;
    setBusy(true); setActionError(null); setControlNotice(null);
    let acknowledged = false;
    let observed = false;
    let checkedSinceSend = false;
    const applyState = (state: ControlState) => {
      const previous = latestRuns.current.get(state.runId);
      if (!previous || state.revision < previous.revision) throw new Error("Stale control state");
      const patch = { ...state, retainedDecisionContinuation: state.retainedDecisionContinuation ?? false };
      latestRuns.current.set(state.runId, { ...previous, ...patch });
      if (alive.current) {
        setRuns(rows => rows.map(row => row.runId === state.runId && row.revision <= state.revision ? { ...row, ...patch } : row));
        detailRefreshPending.current.add(state.runId);
        setPendingDetails([...detailRefreshPending.current]);
      }
    };
    const parseState = (value: unknown) => {
      const state = controlStateSchema.parse(value);
      if (state.runId !== run.runId || state.revision < run.revision) throw new Error("Invalid control state");
      return state;
    };
    const readState = async () => { checkedSinceSend = true; return parseState(await read<unknown>(await fetch(`/api/experiments/booklet-runs/${run.runId}?view=control`, { cache: "no-store", signal: AbortSignal.timeout(30_000) }))); };
    const send = async (revision: number) => { checkedSinceSend = false; return parseState(await read<unknown>(await fetch(`/api/experiments/booklet-runs/${run.runId}/${action}`, {
      method: "POST", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision: revision, responseMode: "receipt" }),
    }))); };
    const requestedState = (state: ControlState) => action === "pause"
      ? state.pauseRequested || state.status === "paused"
      : run.generationStatus === "complete" && run.status === "blocked"
        ? state.status === "completed"
        : !state.pauseRequested && (state.status === "queued" || state.status === "running" || state.status === "completed");
    try {
      try { applyState(await send(run.revision)); acknowledged = true; }
      catch (caught) {
        if (caught instanceof RunnerRequestError && caught.status === 409 && caught.code === "stale_revision") {
          const current = await readState(); applyState(current);
          if (requestedState(current)) { observed = true; }
          else if (current.status === "failed" || current.status === "completed" ||
              current.status === "blocked" && !(action === "resume" && retainedDecisionControl(current)) || current.preparation?.unresolved) {
            throw new RunnerRequestError("The run changed state. Inspect its saved status before trying again.", 409);
          } else {
            // Only a definite revision rejection permits this single retry.
            applyState(await send(current.revision)); acknowledged = true;
          }
        } else { throw caught; }
      }
    } catch (caught) {
      const uncertain = !(caught instanceof RunnerRequestError) || caught.status >= 500 || caught.status < 400;
      if (uncertain) {
        try {
          if (!checkedSinceSend) {
            const current = await readState(); applyState(current);
            observed = requestedState(current);
          }
        } catch { /* No mutation retry after an uncertain response. */ }
        if (!observed) {
          if (alive.current) {
            unresolvedControls.current.add(run.runId);
            setUncertainRuns([...unresolvedControls.current]);
            setActionError("The update could not be confirmed. Check saved status before trying again.");
          }
        } else if (alive.current) {
          setControlNotice("Saved state refreshed. The request outcome could not be confirmed.");
        }
      } else if (alive.current) { setActionError(safeMessage(caught, "The run could not be updated.")); }
    } finally {
      controlInFlight.current = false; controlEpoch.current += 1;
      if (acknowledged || observed) {
        const refreshed = await refresh(undefined, true);
        if (alive.current && acknowledged) setControlNotice(refreshed ? "Change saved." : "Change saved. Run details could not be refreshed.");
      }
      if (alive.current) setBusy(false);
    }
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
    <header className="space-y-2"><p className="text-sm font-medium uppercase tracking-[0.16em] text-[var(--accent)]">Dify booklet experiment</p><h1 className="text-3xl font-semibold">Booklet runs</h1><p className="text-[var(--muted-ink)]">Start an automated persona run, follow its progress, then open its saved artifacts, images and reports. Shorter suites stop at their slice boundary; full suites record generation and evaluation separately.</p></header>
    {focusedRunId ? <Link className="underline" href="/experiments/booklet-runs">Back to all runs</Link> : <section aria-labelledby="new-run-heading" className="space-y-3 rounded-lg border border-[var(--border)] p-5">
      <h2 id="new-run-heading" className="text-xl font-semibold">Start runs</h2>
      <p className="text-sm text-[var(--muted-ink)]">Choose a mode and persona. The tester makes creator decisions automatically; this is not a manual authoring session.</p>
      <label className="block space-y-1"><span>Mode</span><select aria-label="Mode" className="rounded border border-[var(--border)] p-2" value={mode} onChange={(event) => {
        if (event.target.value === "simulated" || event.target.value === "balanced" && canCreateBalanced) setMode(event.target.value);
      }}><option value="simulated">Simulated</option><option value="balanced" disabled={!canCreateBalanced}>Balanced</option><option value="real" disabled>Real (unavailable)</option></select></label>
      <label className="block space-y-1"><span>Persona</span><select aria-label="Persona" className="rounded border border-[var(--border)] p-2" value={persona} onChange={(event) => setPersona(event.target.value as Persona)}>{personas.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <p className="text-sm text-[var(--muted-ink)]">{canCreateBalanced ? "Balanced uses real text models and simulated images. Start one persona at a time: Kid, Parent, then Creator. Real mode is unavailable." :
        m4State === "ready" ? "Balanced is ready but awaits the campaign execution grant. Real mode is unavailable." :
          m4State === "invalid" ? "Balanced setup needs attention before creation. Real mode is unavailable." : "Balanced and Real modes are unavailable."}</p>
      <div className="flex flex-wrap gap-2"><button className={secondaryAction} disabled={mutationDisabled || pending !== null || mode === "balanced" && !canCreateBalanced} onClick={() => void create([{ persona, mode, key: crypto.randomUUID() }])}>Start selected</button>{mode === "simulated" ? <button disabled={mutationDisabled || pending !== null} onClick={() => void create(personas.map((item) => ({ persona: item.id, mode: "simulated", key: crypto.randomUUID() })))}>Start all three</button> : null}{pending?.length ? <button disabled={mutationDisabled || pending.some((item) => item.mode === "balanced") && !canCreateBalanced} onClick={() => void create(pending)}>Retry pending creation</button> : null}</div>
    </section>}
    <button className={secondaryAction} onClick={() => void refresh()}>Refresh</button>
    {controlNotice ? <p role="status">{controlNotice}</p> : null}
    {actionError ? <p role="alert" className="rounded border border-red-500 p-3">{actionError}</p> : null}
    {loadError ? <p role="alert" className="rounded border border-red-500 p-3">{loadError}</p> : null}
    <section aria-labelledby="saved-runs-heading" className="space-y-4"><h2 id="saved-runs-heading" className="text-xl font-semibold">Saved runs</h2>{loading ? <p role="status">Loading runs…</p> : runs.length === 0 ? <p>No runs yet.</p> : runs.map((run) => <article key={run.runId} className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">{personas.find((item) => item.id === run.persona)?.label ?? run.persona}</h3>
          {!focusedRunId && run.title ? <p>{run.title}</p> : null}
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full border border-[var(--border)] px-3 py-1">{label(run.mode)}</span>
            <span className={`rounded-full px-3 py-1 font-semibold ${run.status === "blocked" || run.status === "failed" ? "bg-amber-100 text-amber-950" : run.status === "completed" ? "bg-emerald-100 text-emerald-950" : "bg-stone-100 text-stone-800"}`}>{run.status === "completed" && run.evaluationStatus === "failed" ? "Completed — evaluation incomplete" : label(run.status)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!focusedRunId ? <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-5 py-2 font-semibold hover:opacity-90" style={{ color: "var(--surface)" }} href={`/experiments/booklet-runs/${encodeURIComponent(run.runId)}`} aria-label={`Open run: ${personas.find(item => item.id === run.persona)?.label ?? run.persona} (${run.runId})`}>Open run <span aria-hidden="true">&rarr;</span></Link> : null}
          {(run.mode === "balanced" || run.generationStatus === "complete") && run.status === "blocked" && run.safeFailure === "definite_failure" && (!run.activeOperationId || retainedDecisionControl(run)) ? <button className={secondaryAction} disabled={mutationDisabled} onClick={() => void control(run, "resume")}>{run.generationStatus === "complete" ? "Finalize completed booklet" : "Continue inspected run"}</button> : run.pauseRequested || run.status === "paused" ? <button className={secondaryAction} disabled={mutationDisabled || run.status === "blocked" || run.status === "failed" || run.status === "completed"} onClick={() => void control(run, "resume")}>Resume</button> : <button className={secondaryAction} disabled={mutationDisabled || run.status === "failed" || run.status === "completed"} onClick={() => void control(run, "pause")}>Pause</button>}
        </div>
      </header>
      <dl className="grid gap-4 border-y border-[var(--border)] py-4 text-sm sm:grid-cols-2">
        <div><dt className="text-[var(--muted-ink)]">Started</dt><dd className="mt-1 font-medium tabular-nums"><RunTimestamp value={run.createdAtMs} /></dd></div>
        <div><dt className="text-[var(--muted-ink)]">Latest update</dt><dd className="mt-1 font-medium tabular-nums"><RunTimestamp value={run.updatedAtMs} /></dd></div>
      </dl>
      {run.brief ? <p className="max-w-prose leading-relaxed">{run.brief}</p> : null}
      <section aria-label="Run progress" className="space-y-2 rounded-lg bg-[var(--canvas)] p-4 text-sm">
        <h4 className="font-semibold">Progress</h4>
        <p>{run.status === "blocked" ? "Run blocked. Inspect the saved details before continuing; unresolved work may still finish." : run.status === "failed" ? "Run failed. Inspect the saved details before taking another action." : run.status === "completed" ? (run.evaluationStatus === "failed" ? "Booklet generation is complete. Advisory evaluation failed; its saved failure remains available in the operation trace." : "Run complete. Open the saved artifacts and reports to review the result.") : run.status === "paused" ? "Run paused. Resume when you are ready to continue." : run.pauseRequested ? "Pause requested. Current work may still be finishing." : run.nextNarrativeTask ? `Next responsibility: ${run.nextNarrativeTask}` : "Waiting for the next execution update."}</p>
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          <div><dt className="text-[var(--muted-ink)]">Booklet generation</dt><dd className="font-medium">{label(run.generationStatus ?? "in_progress")}</dd></div>
          <div><dt className="text-[var(--muted-ink)]">Reports and evaluation</dt><dd className="font-medium">{label(run.evaluationStatus ?? "pending")}</dd></div>
        </dl>
        {run.status === "completed" && run.evaluationStatus === "failed" ? <p>{run.reports === undefined ? "Open the run for the retained evaluation failure." : run.reports.some(item => item.report.role === "tester") ? "The independent judge assessment is incomplete." : "The judge was not run because tester evaluation failed."} No evaluation retry is scheduled.</p> : null}
        {run.safeFailure ? <p>Failure classification: {label(run.safeFailure)}</p> : null}
      </section>
      <details className="text-sm text-[var(--muted-ink)]"><summary className="cursor-pointer">Run identifiers</summary><div className="mt-2 space-y-1 break-all"><p>Run {run.runId}</p>{run.bookletId ? <p>Booklet {run.bookletId}</p> : null}<p>Revision {run.revision}</p></div></details>
      {run.pageSelection ? <PageBatchSelector key={`${run.runId}:${run.pageSelection.layoutVersionId}:${run.pageSelection.pages.map((page) => `${page.pageBibleVersionId}:${page.previousPageVersionId}`).join(",")}`}
        selection={run.pageSelection} busy={mutationDisabled} onSave={(batch) => void savePages(run, batch)} /> : null}
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
      {!focusedRunId && run.mode === "simulated" && (run.status === "blocked" || run.status === "failed") ? <button disabled={mutationDisabled || pending !== null} onClick={() => void create([{ persona: run.persona, mode: "simulated", key: crypto.randomUUID(), predecessorRunId: run.runId }])}>Start linked successor</button> : null}
      {pendingDetails.includes(run.runId) ? <p role="status">Saved details are awaiting refresh.</p> : null}
      <p className="text-sm">Text calls {run.counters.logicalText}/{run.limits.text} · Image calls {run.counters.logicalImage}/{run.limits.image} · Steps {run.counters.steps}/{run.limits.steps} · Payable text {run.counters.payableText} · Payable image {run.counters.payableImage}</p>
      {run.contextWarningSummary ? <p className="text-sm">Context measurements: {run.contextWarningSummary.measuredOperations} operations · {run.contextWarningSummary.warningCount} warnings</p> : null}
      {run.m4Accounting ? <section aria-label="Balanced campaign accounting" className="space-y-1 text-sm">
        <p className="break-all">Campaign {run.m4Accounting.campaignId} · {run.m4Accounting.state}</p>
        <p>Campaign requests {run.m4Accounting.requests}/{run.m4Accounting.maxRequests} · Run requests {run.m4Accounting.runRequests}/{run.m4Accounting.runMaxRequests}</p>
        <p>Reserved {dollars(run.m4Accounting.reservedMicrodollars)} · Settled upper bound {dollars(run.m4Accounting.settledMicrodollars)} · Remaining {dollars(run.m4Accounting.remainingMicrodollars)} of {dollars(run.m4Accounting.maxMicrodollars)}</p>
        <p>Count charge: {run.m4Accounting.countChargeStatus === "assumed" ? "assumed; allowance retained" : "verified ceiling"}. Invoice cost unavailable.</p>
      </section> : null}
      {run.activeOperationId ? <p className="break-all text-sm">Active operation: {run.operationHistory?.find((operation) => operation.id === run.activeOperationId)?.role ?? "unknown"} {run.operationHistory?.find((operation) => operation.id === run.activeOperationId)?.taskId ?? ""} ({run.activeOperationId})</p> : null}
      {run.preparation ? <section aria-label="Active preparation"><p>Preparation {run.preparation.identity} · Deadline {new Date(run.preparation.deadlineAtMs).toISOString()}{run.preparation.unresolved ? " · Outcome unresolved" : ""}</p><button disabled={mutationDisabled} onClick={() => void inspectOperation(run, run.preparation!.identity, "inspect", true)}>Inspect preparation</button><button disabled={mutationDisabled} onClick={() => void inspectOperation(run, run.preparation!.identity, "stop", true)}>Stop preparation</button></section> : null}
      {run.activeDelegation ? <p className="text-sm">Active tester grant: {run.activeDelegation.taskIds.join(", ")} for {run.activeDelegation.subjectKind} {run.activeDelegation.subjectId}</p> : null}
      {run.pendingDecision ? <details><summary>Pending decision</summary><pre className="overflow-auto whitespace-pre-wrap text-sm">{format(run.pendingDecision)}</pre></details> : null}
      {run.creatorMessages?.length ? <details><summary>Saved tester decisions ({run.creatorMessages.length})</summary><ol className="space-y-2 pl-5">{run.creatorMessages.map((message) => <li key={message.id}><p>Decision {message.sequence}</p><pre className="overflow-auto whitespace-pre-wrap text-sm">{format(message.content)}</pre></li>)}</ol></details> : null}
      {run.operationHistory?.length ? <details><summary>Operation trace ({run.operationHistory.length})</summary><ol className="space-y-2 pl-5">{run.operationHistory.map((operation) => <li key={operation.id} className="break-all text-sm"><p>{operation.role}{operation.taskId ? ` ${operation.taskId}` : ""} · {operation.state}{operation.safeFailure ? ` · ${operation.safeFailure}` : ""}</p><p>Operation {operation.id}</p><p>Workflow {operation.workflowRunId ?? "pending"} · Parent {operation.parentWorkflowRunId ?? "none"}</p><p>Reservations {operation.reservationCount}</p>
        {operation.lifecycle ? <p>Phase: {operation.lifecycle.phase} · Last progress: {new Date(operation.lifecycle.lastProgressAtMs).toISOString()} · Attempt: {operation.lifecycle.attemptOutcome ?? "active"}{operation.lifecycle.unresolved ? ", outcome unresolved" : ""} · Stop: {operation.lifecycle.stop?.delivery ?? "not requested"}</p> : null}
        {operation.deadlineAtMs ? <p>Deadline: {new Date(operation.deadlineAtMs).toISOString()}</p> : null}
        <p>Elapsed: {operation.elapsedMs == null ? "unavailable" : `${Math.floor(operation.elapsedMs / 1000)}s`} · Remote status: {operation.remoteStatus ?? "not verified"}</p>
        {operation.countFailure ? <p>Input count: {operation.countFailure.code} · {operation.countFailure.countedInputTokens ?? "unavailable"}/{operation.countFailure.limit} · Generation did not start; reservation retained.</p> : null}
        {operation.localReportFailure ? <p>Report {operation.localReportFailure.scope} exceeded the preparation size limit: {operation.localReportFailure.requestBytes}/{operation.localReportFailure.byteLimit} bytes. No provider request was sent or reserved.</p> : null}
        <ContextMeasurements value={operation.contextDiagnostics} operation={operation} />
        <button disabled={mutationDisabled} onClick={() => void inspectOperation(run, operation.id, "inspect")}>Inspect/reconcile</button>{run.activeOperationId === operation.id ? <button disabled={mutationDisabled} onClick={() => void inspectOperation(run, operation.id, "stop")}>Stop operation</button> : null}
      </li>)}</ol></details> : null}
      <div className="space-y-3">{run.currentArtifacts?.map((artifact) => <section key={artifact.id} className="rounded border border-[var(--border)] p-3"><h4 className="font-semibold">{artifact.taskId} · {artifact.state}</h4>{artifact.versions.map((version) => <details key={version.id} open={version.id === artifact.currentVersionId}><summary>Version {version.number} · {version.approval ? `Approved (${version.approval.origin})` : "Needs review"}</summary><p className="break-all text-xs">Version ID: {version.id}</p>{version.dependencyVersionIds.length ? <p className="break-all text-xs">Sources: {version.dependencyVersionIds.join(", ")}</p> : null}<SavedArtifactImages taskId={artifact.taskId} content={version.content} simulated={run.mode === "simulated" || run.mode === "balanced"} /><pre className="overflow-auto whitespace-pre-wrap text-sm">{format(version.content)}</pre>{version.warnings.length ? <ul className="list-disc pl-5">{version.warnings.map((warning, index) => <li key={`${warning.field}-${index}`}>{warning.field}: {warning.message}</li>)}</ul> : null}</details>)}</section>)}</div>
    </article>)}</section>
    {!focusedRunId ? <nav aria-label="Run pages"><button disabled={page === 0 || busy} onClick={() => setPage(value => value - 1)}>Previous page</button><span> Page {page + 1} </span><button disabled={!hasMore || busy} onClick={() => setPage(value => value + 1)}>Next page</button></nav> : null}
  </section>;
}
