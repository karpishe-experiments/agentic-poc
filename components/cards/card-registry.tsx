"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import type { CardAction, GenUICard } from "@/lib/contracts/cards";

type SubmitCard = (input: { action: CardAction; value?: unknown; revisionInstruction?: string }) => Promise<void>;
type ReopenCard = () => Promise<void>;
type CardProps = { card: GenUICard; busy?: boolean; submitResponse?: SubmitCard; reopenCard?: ReopenCard };
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
  const disabled = card.status !== "active" || !submitResponse || busy;
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

function ArtifactReviewCard({ card, busy, submitResponse }: CardProps) {
  const [revisionInstruction, setRevisionInstruction] = useState("");
  if (card.family !== "artifact_review") return null;
  const disabled = card.status !== "active" || !submitResponse || busy;
  const action = card.allowedActions.includes("approve_and_continue") ? "approve_and_continue" : card.allowedActions[0];
  return <CardFrame card={card}>
    {card.variant === "summary" ? <><dl className="grid gap-1 text-sm">{card.payload.summary.map((item) => <div className="flex gap-2" key={item.label}><dt className="font-medium">{item.label}:</dt><dd>{item.value}</dd></div>)}</dl>{card.payload.downloadAssetId ? <a className="mt-3 inline-block rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white" href={`/api/assets/${card.payload.downloadAssetId}`}>Download PDF</a> : null}</> : null}
    {card.variant === "editable_form" ? <dl className="grid gap-1 text-sm">{card.payload.fields.map((field) => <div key={field.key}><dt className="font-medium">{field.label}</dt><dd>{field.value}</dd></div>)}</dl> : null}
    {card.variant === "visual_gallery" ? <section aria-label="Review every item before approving" className="grid gap-2 sm:grid-cols-2">{card.payload.items.map((item) => <article className="overflow-hidden rounded border border-[var(--border)] p-2 text-sm" key={item.assetId}><Image alt={item.label} className="h-32 w-full rounded object-cover" height={160} src={`/api/assets/${item.assetId}`} unoptimized width={200} /><p className="mt-2 font-medium">{item.label}</p>{item.description ? <p className="text-[var(--muted-ink)]">{item.description}</p> : null}</article>)}</section> : null}
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

type JobProgressItem = { id: string; itemKey: string; position: number; status: string; error?: { message?: string } | null };
type JobProgressData = { status?: string; items?: JobProgressItem[] };
type JobProgressStatus = { data?: JobProgressData; error?: { message?: string } };
type ProgressGenUICard = Extract<GenUICard, { family: "progress" }>;
const liveJobStatuses = new Set(["pending", "running", "partial"]);

function ProgressCard({ card }: CardProps) {
  if (card.family !== "progress") return null;
  return <LiveProgressCard card={card} key={`${card.cardId}:${card.payload.jobId ?? "snapshot"}:${card.payload.completed}:${card.payload.total}`} />;
}

function LiveProgressCard({ card }: Readonly<{ card: ProgressGenUICard }>) {
  const [progress, setProgress] = useState({ completed: card.payload.completed, total: card.payload.total, isLive: false });
  const [job, setJob] = useState<JobProgressData | null>(null);
  const [pollVersion, setPollVersion] = useState(0);
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
    let cancelled = false;
    let timer: number | undefined;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/jobs/${card.payload.jobId}`, { cache: "no-store" });
        const body = await response.json() as JobProgressStatus;
        const items = body.data?.items;
        if (cancelled || !response.ok || !items?.length) return;
        applyJob(body.data!);
        if (liveJobStatuses.has(body.data?.status ?? "")) timer = window.setTimeout(() => void refresh(), 2_000);
      } catch {
        // Retain the persisted card snapshot if the local status endpoint is unavailable.
      }
    };
    void refresh();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [card.payload.completed, card.payload.jobId, card.payload.total, card.status, pollVersion]);

  const runAction = async (url: string, itemId: string) => {
    setWorkingItemId(itemId);
    setActionError(null);
    try {
      const response = await fetch(url, { method: "POST" });
      const body = await response.json() as JobProgressStatus;
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Generation could not be continued.");
      applyJob(body.data);
      setPollVersion((version) => version + 1);
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
  const label = failedItems.length ? "Stopped" : progress.isLive ? "Generating" : card.payload.currentLabel ?? "Working";
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

function IssueCard({ card, busy, submitResponse }: CardProps) {
  if (card.family !== "issue") return null;
  const disabled = card.status !== "active" || !submitResponse || busy;
  const labels: Partial<Record<CardAction, string>> = { retry: "Retry review", edit: "Revise", accept_with_issue: "Accept remaining issue", continue: "Continue" };
  const actionLabel = (action: CardAction) => action === "retry" && card.variant === "recovery" && (card.title.startsWith("Retry ") || card.title.startsWith("Start "))
    ? card.title
    : labels[action] ?? action.replaceAll("_", " ");
  return <CardFrame card={card}><p className="text-sm">{card.payload.summary}</p>{card.payload.details.length ? <ul className="mt-2 list-disc pl-5 text-sm">{card.payload.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}<div className="mt-3 flex flex-wrap gap-2">{card.allowedActions.map((action) => <button className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50" disabled={disabled} key={action} onClick={() => submitResponse?.({ action })} type="button">{busy ? "Saving…" : actionLabel(action)}</button>)}</div></CardFrame>;
}

type CardKey = "question:free_text" | "question:single_select" | "question:multi_select" | "artifact_review:summary" | "artifact_review:editable_form" | "artifact_review:visual_gallery" | "progress:artifact_generation" | "progress:page_batch" | "progress:export" | "issue:quality" | "issue:generation_failure" | "issue:validation_failure" | "issue:recovery";

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
