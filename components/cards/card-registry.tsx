"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { CardAction, GenUICard } from "@/lib/contracts/cards";
import { publishJobStatus, subscribeToJobStatus, type PolledJobItem, type PolledJobStatus } from "@/components/workspace/job-status-poller";
import type { RegenerationRequest } from "@/lib/contracts/regeneration";
import { readOperationResponse } from "@/lib/http/read-operation-response";

type SubmitCard = (input: { action: CardAction; value?: unknown; revisionInstruction?: string }) => Promise<void>;
type ReopenCard = () => Promise<void>;
type CardProps = { card: GenUICard; bookletId?: string; busy?: boolean; submitResponse?: SubmitCard; reopenCard?: ReopenCard; refreshWorkspace?: () => void };
type CardComponent = (properties: CardProps) => React.ReactNode;

function CardFrame({ card, children }: Readonly<{ card: GenUICard; children: React.ReactNode }>) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-white p-3 shadow-sm">
      <h3 className="font-semibold">{card.title}</h3>
      {card.explanation ? <p className="mt-1 text-sm text-[var(--muted-ink)]">{card.explanation}</p> : null}
      <div className="mt-3">{children}</div>
    </article>
  );
}

function QuestionCard({ card, busy, submitResponse }: CardProps) {
  const [value, setValue] = useState<string | string[]>("");
  if (card.family !== "question") return null;
  const disabled = card.status !== "active" || !submitResponse || Boolean(busy);
  const isMulti = card.variant === "multi_select";
  const action = card.allowedActions.includes("submit") ? "submit" : card.allowedActions.includes("select") ? "select" : card.allowedActions[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action) await submitResponse?.({ action, value });
  }

  if (card.variant === "free_text") {
    return <CardFrame card={card}>
      <form className="grid gap-2" onSubmit={submit}>
        <label className="text-sm font-medium" htmlFor={`card-${card.cardId}`}>{card.payload.prompt}</label>
        <textarea autoComplete="off" id={`card-${card.cardId}`} name={`card-${card.cardId}`} className="min-h-20 rounded-lg border border-[var(--border)] p-2" disabled={disabled} maxLength={card.payload.maximumLength} minLength={card.payload.minimumLength} onChange={(event) => setValue(event.target.value)} placeholder={card.payload.placeholder} required value={typeof value === "string" ? value : ""} />
        <button className="w-fit rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={disabled} type="submit">{busy ? "Saving…" : card.status === "active" ? "Continue" : "Submitted"}</button>
      </form>
    </CardFrame>;
  }

  return <CardFrame card={card}>
    <form className="grid gap-2" onSubmit={submit}>
      <fieldset disabled={disabled}>
        <legend className="mb-2 text-sm font-medium">{card.payload.prompt}</legend>
        <div className="grid gap-2">
          {card.payload.choices.map((choice) => {
            const selected = Array.isArray(value) ? value.includes(choice.id) : value === choice.id;
            return <label className="flex cursor-pointer gap-2 rounded-lg border border-[var(--border)] p-2 text-sm" key={choice.id}>
              <input checked={selected} name={`card-${card.cardId}`} onChange={() => setValue(isMulti
                ? (Array.isArray(value) ? (selected ? value.filter((item) => item !== choice.id) : [...value, choice.id]) : [choice.id])
                : choice.id)} type={isMulti ? "checkbox" : "radio"} value={choice.id} />
              <span><span className="font-medium">{choice.label}</span>{choice.description ? <span className="block text-[var(--muted-ink)]">{choice.description}</span> : null}</span>
            </label>;
          })}
        </div>
      </fieldset>
      <button className="w-fit rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={disabled || (Array.isArray(value) ? value.length === 0 : !value)} type="submit">{busy ? "Saving…" : card.status === "active" ? "Continue" : "Submitted"}</button>
    </form>
  </CardFrame>;
}

type GalleryCard = Extract<GenUICard, { family: "artifact_review"; variant: "visual_gallery" }>;
type GalleryItem = GalleryCard["payload"]["items"][number];

function VisualGallery({ card, bookletId, disabled, refreshWorkspace }: Readonly<{ card: GalleryCard; bookletId?: string; disabled: boolean; refreshWorkspace?: () => void }>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<GalleryItem | null>(null);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openPreview(item: GalleryItem) {
    setPreview(item);
    dialogRef.current?.showModal();
  }

  function closePreview() {
    dialogRef.current?.close();
    setPreview(null);
  }

  async function regenerate(item: GalleryItem, target: RegenerationRequest["target"]) {
    if (!bookletId) return;
    setRegenerating(item.assetId);
    setStatus(null);
    setError(null);
    try {
      const instruction = instructions[item.assetId]?.trim();
      const response = await fetch(`/api/booklets/${bookletId}/images/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, ...(instruction ? { instruction } : {}) }),
      });
      const terminal = await readOperationResponse<{ data?: PolledJobStatus; error?: { message?: string } }>(response);
      const body = terminal.body;
      if (!terminal.ok || !body.data) throw new Error(body.error?.message ?? "The selected image could not be regenerated.");
      if (body.data.id) publishJobStatus(body.data.id, body.data);
      setStatus(`${item.label} regeneration started. The current image remains available until its replacement succeeds.`);
      refreshWorkspace?.();
    } catch (regenerationError) {
      setError(regenerationError instanceof Error ? regenerationError.message : "The selected image could not be regenerated.");
    } finally {
      setRegenerating(null);
    }
  }

  return <>
    <section aria-label="Review every item before approving" className="grid gap-3 sm:grid-cols-2">
      {card.payload.items.map((item) => {
        const instructionId = `regeneration-instruction-${card.cardId}-${item.assetId}`;
        const regenerationTarget = item.regenerationTarget ?? null;
        return <article className="min-w-0 overflow-hidden rounded border border-[var(--border)] p-2 text-sm" key={item.assetId}>
          <button aria-label={`Preview ${item.label}`} className="block w-full rounded focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2" onClick={() => openPreview(item)} type="button">
            <Image alt={item.label} className="h-40 w-full rounded object-cover hover:brightness-95" height={320} loading="lazy" src={`/api/assets/${item.assetId}`} unoptimized width={400} />
          </button>
          <p className="mt-2 break-words font-medium">{item.label}</p>
          {item.description && item.description !== "Check composition and reader-facing text." ? <p className="break-words text-[var(--muted-ink)]">{item.description}</p> : null}
          {regenerationTarget && bookletId ? <div className="mt-3 border-t border-[var(--border)] pt-3">
            <label className="block font-medium" htmlFor={instructionId}>Optional Regeneration Instruction</label>
            <textarea autoComplete="off" className="mt-1 min-h-20 w-full rounded border border-[var(--border)] bg-white p-2 focus-visible:ring-2 focus-visible:ring-[var(--accent)]" disabled={disabled || regenerating !== null} id={instructionId} maxLength={1000} name={instructionId} onChange={(event) => setInstructions((current) => ({ ...current, [item.assetId]: event.target.value }))} placeholder="Example: Make the speech balloon larger…" value={instructions[item.assetId] ?? ""} />
            <button className="mt-2 rounded-lg border border-[var(--accent)] px-3 py-2 font-semibold text-[var(--accent)] hover:bg-[#fff2e4] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-50" disabled={disabled || regenerating !== null} onClick={() => void regenerate(item, regenerationTarget)} type="button">{regenerating === item.assetId ? "Regenerating…" : `Regenerate This ${card.payload.artifactType === "final_pages" ? "Page" : "Reference"}`}</button>
          </div> : null}
        </article>;
      })}
    </section>
    <dialog aria-label={preview ? `${preview.label} preview` : "Image preview"} className="m-auto max-h-[90vh] w-[min(94vw,72rem)] overscroll-contain rounded-2xl border border-[var(--border)] bg-white p-4 shadow-2xl backdrop:bg-black/70" onClick={(event) => { if (event.target === event.currentTarget) closePreview(); }} onClose={() => setPreview(null)} ref={dialogRef}>
      {preview ? <div className="grid max-h-[85vh] gap-3 overflow-auto">
        <div className="flex items-center justify-between gap-3"><h4 className="text-lg font-semibold text-pretty">{preview.label}</h4><button className="rounded-lg border border-[var(--accent)] px-3 py-2 font-semibold text-[var(--accent)] hover:bg-[#fff2e4] focus-visible:ring-2 focus-visible:ring-[var(--accent)]" onClick={closePreview} type="button">Close Preview</button></div>
        <Image alt={preview.label} className="max-h-[76vh] h-auto w-full rounded-lg object-contain" height={1600} src={`/api/assets/${preview.assetId}`} unoptimized width={1600} />
      </div> : null}
    </dialog>
    {status ? <p aria-live="polite" className="mt-3 rounded-lg border border-green-300 p-2 text-sm text-green-800">{status}</p> : null}
    {error ? <p className="mt-3 rounded-lg border border-red-300 p-2 text-sm text-red-700" role="alert">{error}</p> : null}
  </>;
}

function ArtifactReviewCard({ card, bookletId, busy, submitResponse, refreshWorkspace }: CardProps) {
  const [revisionInstruction, setRevisionInstruction] = useState("");
  if (card.family !== "artifact_review") return null;
  const disabled = card.status !== "active" || !submitResponse || Boolean(busy);
  const action = card.allowedActions.includes("approve_and_continue") ? "approve_and_continue" : card.allowedActions[0];
  return <CardFrame card={card}>
    {card.variant === "summary" ? <><dl className="grid gap-1 text-sm">{card.payload.summary.map((item) => <div className="flex gap-2" key={item.label}><dt className="font-medium">{item.label}:</dt><dd>{item.value}</dd></div>)}</dl>{card.payload.downloadAssetId ? <a className="mt-3 inline-block rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white" download href={`/api/assets/${card.payload.downloadAssetId}`}>Download PDF</a> : null}</> : null}
    {card.variant === "editable_form" ? <dl className="grid gap-1 text-sm">{card.payload.fields.map((field) => <div key={field.key}><dt className="font-medium">{field.label}</dt><dd>{field.value}</dd></div>)}</dl> : null}
    {card.variant === "visual_gallery" ? <VisualGallery bookletId={bookletId} card={card} disabled={disabled} refreshWorkspace={refreshWorkspace} /> : null}
    <div className="mt-3 flex flex-wrap gap-2">
      {action ? <button className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={disabled} onClick={() => submitResponse?.({ action })} type="button">{busy ? "Saving…" : card.status === "active" ? card.variant === "visual_gallery" ? `Approve all reviewed ${card.payload.artifactType === "visual_bible" ? "references" : "pages"}` : "Approve and continue" : "Submitted"}</button> : null}
      {card.allowedActions.includes("request_revision") ? <>
        <label className="sr-only" htmlFor={`revision-${card.cardId}`}>Describe the revision</label>
        <input autoComplete="off" className="min-w-44 flex-1 rounded-lg border border-[var(--border)] px-2 py-1 text-sm" disabled={disabled} id={`revision-${card.cardId}`} name={`revision-${card.cardId}`} onChange={(event) => setRevisionInstruction(event.target.value)} placeholder="Describe a revision…" value={revisionInstruction} />
        <button className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50" disabled={disabled || !revisionInstruction.trim()} onClick={() => submitResponse?.({ action: "request_revision", revisionInstruction })} type="button">Request revision</button>
      </> : null}
    </div>
  </CardFrame>;
}

type JobProgressItem = PolledJobItem;
type JobProgressData = PolledJobStatus;
type JobProgressStatus = { data?: JobProgressData; error?: { message?: string } };
type ProgressGenUICard = Extract<GenUICard, { family: "progress" }>;

function ProgressCard({ card }: CardProps) {
  if (card.family !== "progress") return null;
  return <LiveProgressCard card={card} key={`${card.cardId}:${card.payload.jobId ?? "snapshot"}:${card.payload.completed}:${card.payload.total}`} />;
}

function LiveProgressCard({ card }: Readonly<{ card: ProgressGenUICard }>) {
  const [progress, setProgress] = useState({ completed: card.payload.completed, total: card.payload.total, isLive: false });
  const [job, setJob] = useState<JobProgressData | null>(null);
  const [workingItemId, setWorkingItemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const applyJob = (nextJob: JobProgressData) => {
    const items = nextJob.items;
    if (!items?.length) return;
    setJob(nextJob);
    setProgress({ completed: items.filter((item) => item.status === "succeeded").length, total: items.length, isLive: true });
  };

  useEffect(() => {
    if (!card.payload.jobId || card.status !== "active") return;
    return subscribeToJobStatus(card.payload.jobId, (status) => {
      if (status.items?.length) applyJob(status);
    });
  }, [card.payload.completed, card.payload.jobId, card.payload.total, card.status]);

  const runAction = async (url: string, itemId: string) => {
    setWorkingItemId(itemId);
    setActionError(null);
    try {
      const response = await fetch(url, { method: "POST" });
      const body = await response.json() as JobProgressStatus;
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Generation could not be continued.");
      applyJob(body.data);
      if (card.payload.jobId) publishJobStatus(card.payload.jobId, body.data);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Generation could not be continued.");
    } finally {
      setWorkingItemId(null);
    }
  };

  const percent = Math.round((progress.completed / progress.total) * 100);
  const items = job?.items ?? [];
  const failedItems = items.filter((item) => item.status === "failed");
  const hasRunning = items.some((item) => item.status === "running");
  const hasPending = items.some((item) => item.status === "pending");
  const canContinue = Boolean(card.payload.jobId && items.length && !failedItems.length && !hasRunning && hasPending);
  const label = failedItems.length ? "Stopped" : job?.status === "paused" ? "Paused" : progress.isLive ? "Generating" : card.payload.currentLabel ?? "Working";
  const itemLabel = (item: JobProgressItem) => card.variant === "page_batch"
    ? item.position === 0 ? "Cover" : `Page ${item.position}`
    : "Reference";

  return <CardFrame card={card}>
    <p aria-live="polite" className="text-sm">{label}: {progress.completed} of {progress.total}</p>
    <div aria-label={`${percent}% complete`} className="mt-2 h-2 overflow-hidden rounded bg-[#f3e5d8]"><div className="h-full bg-[var(--accent)]" style={{ width: `${percent}%` }} /></div>
    {failedItems.map((item) => <div className="mt-3" key={item.id}>
      <p className="text-sm text-red-700">Stopped on {itemLabel(item)}: {item.error?.message ?? "Generation failed."}</p>
      <button className="mt-2 rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50" disabled={workingItemId !== null} onClick={() => void runAction(`/api/jobs/${card.payload.jobId}/items/${item.id}/retry`, item.id)} type="button">{workingItemId === item.id ? "Retrying…" : `Retry failed ${card.variant === "page_batch" ? "page" : "reference"}`}</button>
    </div>)}
    {canContinue ? <button className="mt-3 rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50" disabled={workingItemId !== null} onClick={() => void runAction(`/api/jobs/${card.payload.jobId}/continue`, "continue")} type="button">{workingItemId === "continue" ? "Continuing…" : "Continue generating images"}</button> : null}
    {actionError ? <p className="mt-2 text-sm text-red-700" role="alert">{actionError}</p> : null}
  </CardFrame>;
}

function AgentRunCard({ card, bookletId, busy, submitResponse, refreshWorkspace }: CardProps) {
  const readySelection = card.family === "agent_run" && card.payload.state === "ready" ? card.payload.selectedAgentIds : null;
  const readyPoolFingerprint = card.family === "agent_run" && card.payload.state === "ready" ? card.payload.poolFingerprint : null;
  const readyHasStaleSelection = card.family === "agent_run" && card.payload.state === "ready" && card.payload.staleSelectionNotices.length > 0;
  const selectionKey = readyPoolFingerprint ?? `${card.cardId}:${card.family === "agent_run" ? card.payload.state : "unknown"}`;
  const defaultSelected = readySelection ?? [];
  const defaultIsChangingAgents = defaultSelected.length === 0 || readyHasStaleSelection;
  const [selectionState, setSelectionState] = useState({ key: selectionKey, selected: defaultSelected });
  const [teamState, setTeamState] = useState({ key: selectionKey, isChangingAgents: defaultIsChangingAgents });
  const [candidateQuery, setCandidateQuery] = useState("");
  const [detail, setDetail] = useState<{ itemId: string; text: string } | null>(null);
  const [previewCandidate, setPreviewCandidate] = useState<{ assetId: string; label: string } | null>(null);
  const previewDialogRef = useRef<HTMLDialogElement>(null);
  const selected = selectionState.key === selectionKey ? selectionState.selected : defaultSelected;
  const isChangingAgents = teamState.key === selectionKey ? teamState.isChangingAgents : defaultIsChangingAgents;
  const setSelected = (updater: (current: string[]) => string[]) => setSelectionState((current) => ({ key: selectionKey, selected: updater(current.key === selectionKey ? current.selected : defaultSelected) }));
  const setIsChangingAgents = (value: boolean) => setTeamState({ key: selectionKey, isChangingAgents: value });
  const isRunning = card.family === "agent_run" && card.payload.state === "running";
  const soleReadyAgentId = card.family === "agent_run" && card.status === "active" && card.payload.state === "ready" && card.payload.candidates.length === 1 ? card.payload.candidates[0]!.agentId : null;
  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => refreshWorkspace?.(), 3_000);
    return () => window.clearInterval(timer);
  }, [isRunning, refreshWorkspace]);

  if (card.family !== "agent_run") return null;
  const disabled = card.status !== "active" || Boolean(busy) || !submitResponse;
  const normalizedQuery = candidateQuery.trim().toLowerCase();
  const visibleCandidates = card.payload.candidates.filter((candidate) => !normalizedQuery || `${candidate.displayName} ${candidate.purpose} ${candidate.profileSummary}`.toLowerCase().includes(normalizedQuery));
  const selectedCandidates = card.payload.candidates.filter((candidate) => selected.includes(candidate.agentId));
  const canRetryFailed = card.payload.state === "results" && card.payload.items.some((item) => item.status === "failed");
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const runSelected = () => submitResponse?.({ action: "run_agents", value: selected });
  const showDetails = async (itemId: string) => {
    if (!bookletId || !card.payload.batchId) return;
    try {
      const response = await fetch(`/api/booklets/${bookletId}/agent-runs/${card.payload.batchId}`, { cache: "no-store" });
      const body = await response.json() as { data?: { items?: Array<{ id: string; canonicalResult: unknown }> }; error?: { message?: string } };
      const item = body.data?.items?.find((candidate) => candidate.id === itemId);
      if (!response.ok || !item) throw new Error(body.error?.message ?? "The saved result details are unavailable.");
      setDetail({ itemId, text: JSON.stringify(item.canonicalResult, null, 2) });
    } catch (error) {
      setDetail({ itemId, text: error instanceof Error ? error.message : "The saved result details are unavailable." });
    }
  };
  const showCandidatePreview = (assetId: string, label: string) => { setPreviewCandidate({ assetId, label }); previewDialogRef.current?.showModal(); };
  const closeCandidatePreview = () => { previewDialogRef.current?.close(); setPreviewCandidate(null); };

  return <CardFrame card={card}>
    <p aria-live="polite" className="text-sm">{card.payload.state === "running" ? "Agents are working in parallel." : `Agent run: ${card.payload.state}.`}</p>
    {card.payload.staleSelectionNotices.length ? <ul aria-live="polite" className="mt-3 grid gap-1 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{card.payload.staleSelectionNotices.map((notice) => <li key={notice}>{notice}</li>)}</ul> : null}
    {card.payload.state === "ready" ? soleReadyAgentId ? <>
      <p aria-live="polite" className="mt-3 rounded border border-[var(--border)] p-3 text-sm">{card.payload.candidates[0]!.displayName} is the only compatible agent and is preselected.</p>
      <button className="mt-3 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={disabled} onClick={() => submitResponse?.({ action: "run_agents", value: [soleReadyAgentId] })} type="button">{busy ? "Starting…" : "Run this step"}</button>
    </> : !isChangingAgents && selectedCandidates.length > 0 ? <>
      <p className="mt-3 rounded border border-[var(--border)] p-3 text-sm">Saved team: {selectedCandidates.map((candidate) => candidate.displayName).join(", ")}.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="rounded border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50" disabled={disabled} onClick={() => setIsChangingAgents(true)} type="button">Change agents</button>
        <button className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={disabled} onClick={runSelected} type="button">{busy ? "Starting…" : "Run this step"}</button>
      </div>
    </> : <>
      <label className="mt-3 block text-sm font-medium">Search agents
        <input aria-label="Search agents" className="mt-1 w-full rounded border border-[var(--border)] px-2 py-1" disabled={disabled} onChange={(event) => setCandidateQuery(event.target.value)} placeholder="Name, purpose, or profile" type="search" value={candidateQuery} />
      </label>
      <div className="mt-3 grid gap-2">{visibleCandidates.map((candidate) => <label className="flex gap-2 rounded border border-[var(--border)] p-2 text-sm" key={candidate.agentId}>
        <input checked={selected.includes(candidate.agentId)} disabled={disabled || !candidate.eligible} onChange={() => toggle(candidate.agentId)} type="checkbox" />
        <span><span className="font-medium">{candidate.displayName}</span><span className="block text-[var(--muted-ink)]">{candidate.purpose} · {candidate.profileSummary}</span>{candidate.notice ? <span className="block text-amber-800">{candidate.notice}</span> : null}</span>
      </label>)}</div>
      {visibleCandidates.length === 0 ? <p className="mt-2 text-sm text-[var(--muted-ink)]">No compatible agents match this search.</p> : null}
      <p className="mt-2 text-sm text-[var(--muted-ink)]">{selected.length} {selected.length === 1 ? "agent" : "agents"} selected. Selected agents run concurrently. Choose at least one valid candidate. Fake-mode runs are free; real-provider cost estimates are recorded in the selected result evidence.</p>
      <button className="mt-3 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={disabled || selected.length === 0} onClick={runSelected} type="button">{busy ? "Starting…" : "Run this step"}</button>
    </> : null}
    {card.payload.items.length ? <ul className="mt-3 grid gap-2">{card.payload.items.map((item) => <li className="rounded border border-[var(--border)] p-2 text-sm" key={item.itemId}><span className="font-medium">{item.displayName}</span> — {item.status}{item.summary ? <p>{item.summary}</p> : null}{item.summary && card.payload.batchId && bookletId ? <button className="mt-2 block rounded border border-[var(--accent)] px-2 py-1 text-sm font-semibold text-[var(--accent)]" onClick={() => void showDetails(item.itemId)} type="button">{detail?.itemId === item.itemId ? "Refresh details" : "View details"}</button> : null}{item.candidateAssetId ? <button className="mt-2 block rounded border border-[var(--accent)] px-2 py-1 text-sm font-semibold text-[var(--accent)]" onClick={() => showCandidatePreview(item.candidateAssetId!, item.displayName)} type="button">Preview image</button> : null}{detail?.itemId === item.itemId ? <pre className="mt-2 max-h-56 overflow-auto rounded bg-[#fffaf2] p-2 text-xs whitespace-pre-wrap">{detail.text}</pre> : null}{item.safeError ? <p role="alert" className="text-red-700">{item.safeError}</p> : null}{card.payload.state === "results" && item.status === "succeeded" ? <button className="mt-2 rounded border border-[var(--accent)] px-2 py-1 font-semibold text-[var(--accent)]" disabled={disabled} onClick={() => submitResponse?.({ action: "select_agent_result", value: item.itemId })} type="button">Use this result</button> : null}</li>)}</ul> : null}
    <dialog aria-label={previewCandidate ? `${previewCandidate.label} preview` : "Image preview"} className="m-auto max-h-[90vh] w-[min(94vw,72rem)] overscroll-contain rounded-2xl border border-[var(--border)] bg-white p-4 shadow-2xl backdrop:bg-black/70" onClick={(event) => { if (event.target === event.currentTarget) closeCandidatePreview(); }} onClose={() => setPreviewCandidate(null)} ref={previewDialogRef}>
      {previewCandidate ? <div className="grid max-h-[85vh] gap-3 overflow-auto"><div className="flex items-center justify-between gap-3"><h4 className="text-lg font-semibold">{previewCandidate.label}</h4><button className="rounded-lg border border-[var(--accent)] px-3 py-2 font-semibold text-[var(--accent)]" onClick={closeCandidatePreview} type="button">Close Preview</button></div><Image alt={previewCandidate.label} className="max-h-[76vh] h-auto w-full rounded-lg object-contain" height={1600} src={`/api/assets/${previewCandidate.assetId}`} unoptimized width={1600} /></div> : null}
    </dialog>
    {card.payload.state === "results" ? <div className="mt-3 flex gap-2">{canRetryFailed ? <button className="rounded border border-[var(--accent)] px-2 py-1 text-sm font-semibold text-[var(--accent)]" disabled={disabled} onClick={() => submitResponse?.({ action: "retry_failed_agents" })} type="button">Retry failed</button> : null}<button className="rounded border border-[var(--accent)] px-2 py-1 text-sm font-semibold text-[var(--accent)]" disabled={disabled} onClick={() => submitResponse?.({ action: "change_agents" })} type="button">Change agents</button></div> : null}
    {card.payload.state === "completed" ? <button className="mt-3 rounded border border-[var(--accent)] px-2 py-1 text-sm font-semibold text-[var(--accent)]" disabled={disabled} onClick={() => submitResponse?.({ action: "restart_with_agents" })} type="button">Restart with agents</button> : null}
  </CardFrame>;
}
function IssueCard({ card, busy, submitResponse }: CardProps) {
  if (card.family !== "issue") return null;
  const disabled = card.status !== "active" || !submitResponse || busy;
  const labels: Partial<Record<CardAction, string>> = { retry: "Retry review", edit: "Revise", accept_with_issue: "Accept remaining issue", continue: "Continue" };
  const actionLabel = (action: CardAction) => action === "retry" && card.variant === "recovery" && (card.title.startsWith("Retry ") || card.title.startsWith("Start "))
    ? card.title
    : labels[action] ?? action.replaceAll("_", " ");
  return <CardFrame card={card}><p className="text-sm">{card.payload.summary}</p>{card.payload.details.length ? <ul className="mt-2 list-disc pl-5 text-sm">{card.payload.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}<div className="mt-3 flex flex-wrap gap-2">{card.allowedActions.map((action) => <button className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50" disabled={disabled} key={action} onClick={() => submitResponse?.({ action })} type="button">{busy ? "Saving…" : actionLabel(action)}</button>)}</div></CardFrame>;
}

type CardKey = "agent_run:parallel_execution" | "question:free_text" | "question:single_select" | "question:multi_select" | "artifact_review:summary" | "artifact_review:editable_form" | "artifact_review:visual_gallery" | "progress:artifact_generation" | "progress:page_batch" | "progress:export" | "issue:quality" | "issue:generation_failure" | "issue:validation_failure" | "issue:recovery";

const registry: Record<CardKey, CardComponent> = {
  "question:free_text": QuestionCard,
  "question:single_select": QuestionCard,
  "question:multi_select": QuestionCard,
  "artifact_review:summary": ArtifactReviewCard,
  "artifact_review:editable_form": ArtifactReviewCard,
  "artifact_review:visual_gallery": ArtifactReviewCard,
  "progress:artifact_generation": ProgressCard,
  "progress:page_batch": ProgressCard,
  "progress:export": ProgressCard,
  "agent_run:parallel_execution": AgentRunCard,
  "issue:quality": IssueCard,
  "issue:generation_failure": IssueCard,
  "issue:validation_failure": IssueCard,
  "issue:recovery": IssueCard,
};

export function CardRegistry(properties: CardProps) {
  if (properties.card.status !== "active") {
    return <article className="rounded-xl border border-[var(--border)] bg-[#fffaf2] p-3 text-sm"><p className="font-semibold">{properties.card.title}</p><p className="mt-1 text-[var(--muted-ink)]">{properties.card.status === "submitted" ? "Submitted" : properties.card.status.replaceAll("_", " ")}</p>{properties.reopenCard ? <button className="mt-2 rounded-lg border border-[var(--accent)] px-2 py-1 text-sm font-semibold text-[var(--accent)] disabled:opacity-50" disabled={properties.busy} onClick={() => void properties.reopenCard?.()} type="button">Reopen</button> : null}</article>;
  }
  const component = registry[`${properties.card.family}:${properties.card.variant}` as CardKey];
  return component ? component(properties) : <IssueCard card={{ schemaVersion: "1", cardId: properties.card.cardId, family: "issue", variant: "validation_failure", status: "failed", title: "Unsupported card", allowedActions: ["continue"], payload: { code: "unsupported_card", summary: "This saved card cannot be displayed safely.", details: [] } }} />;
}
