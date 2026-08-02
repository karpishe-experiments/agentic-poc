"use client";

import { FormEvent, useState } from "react";
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
        <textarea id={`card-${card.cardId}`} className="min-h-20 rounded-lg border border-[var(--border)] p-2" disabled={disabled} maxLength={card.payload.maximumLength} minLength={card.payload.minimumLength} onChange={(event) => setValue(event.target.value)} placeholder={card.payload.placeholder} required value={typeof value === "string" ? value : ""} />
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
  if (card.family !== "artifact_review") return null;
  const disabled = card.status !== "active" || !submitResponse || busy;
  const action = card.allowedActions.includes("approve_and_continue") ? "approve_and_continue" : card.allowedActions[0];
  return <CardFrame card={card}>
    {card.variant === "summary" ? <dl className="grid gap-1 text-sm">{card.payload.summary.map((item) => <div className="flex gap-2" key={item.label}><dt className="font-medium">{item.label}:</dt><dd>{item.value}</dd></div>)}</dl> : null}
    {card.variant === "editable_form" ? <dl className="grid gap-1 text-sm">{card.payload.fields.map((field) => <div key={field.key}><dt className="font-medium">{field.label}</dt><dd>{field.value}</dd></div>)}</dl> : null}
    {card.variant === "visual_gallery" ? <ul className="grid gap-1 text-sm">{card.payload.items.map((item) => <li className="rounded border border-[var(--border)] p-2" key={item.assetId}>{item.label}{item.selected ? " (selected)" : ""}</li>)}</ul> : null}
    <button className="mt-3 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={disabled || !action} onClick={() => action && submitResponse?.({ action })} type="button">{busy ? "Saving…" : card.status === "active" ? "Approve and continue" : "Submitted"}</button>
  </CardFrame>;
}

function ProgressCard({ card }: CardProps) {
  if (card.family !== "progress") return null;
  const percent = Math.round((card.payload.completed / card.payload.total) * 100);
  return <CardFrame card={card}><p className="text-sm">{card.payload.currentLabel ?? "Working"}: {card.payload.completed} of {card.payload.total}</p><div aria-label={`${percent}% complete`} className="mt-2 h-2 overflow-hidden rounded bg-[#f3e5d8]"><div className="h-full bg-[var(--accent)]" style={{ width: `${percent}%` }} /></div></CardFrame>;
}

function IssueCard({ card, busy, submitResponse }: CardProps) {
  if (card.family !== "issue") return null;
  const disabled = card.status !== "active" || !submitResponse || busy;
  const action = card.allowedActions.includes("retry") ? "retry" : card.allowedActions[0];
  return <CardFrame card={card}><p className="text-sm">{card.payload.summary}</p>{card.payload.details.length ? <ul className="mt-2 list-disc pl-5 text-sm">{card.payload.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}{action ? <button className="mt-3 rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50" disabled={disabled} onClick={() => submitResponse?.({ action })} type="button">{busy ? "Saving…" : action.replaceAll("_", " ")}</button> : null}</CardFrame>;
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
