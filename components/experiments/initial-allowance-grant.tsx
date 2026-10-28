"use client";

import { useState } from "react";
import type { AllowanceTotals } from "./allowance-review";
import { opaqueIdSchema } from "@/lib/contracts/common";

const defaults: Record<string, Omit<AllowanceTotals, "maxMicrodollars">> = {
  playful_kid: { textCalls: 120, imageCalls: 12, steps: 300, textRevisions: 1, imageRevisions: 1, noProgress: 3 },
  enthusiast_parent: { textCalls: 160, imageCalls: 14, steps: 300, textRevisions: 1, imageRevisions: 1, noProgress: 3 },
  professional_creator: { textCalls: 220, imageCalls: 20, steps: 300, textRevisions: 3, imageRevisions: 2, noProgress: 3 },
};
function parseUsd(value: string): number | null {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function InitialAllowanceGrant({ persona, mode = "balanced", onGrant, onLocked }: { persona: string;
  mode?: "balanced" | "real"; onGrant: (campaignId: string, predecessorRunId?: string) => void;
  onLocked: (locked: boolean) => void }) {
  const [money, setMoney] = useState(mode === "real" ? "" : "5");
  const [predecessor, setPredecessor] = useState("");
  const [reference, setReference] = useState("");
  const [totals, setTotals] = useState(defaults[persona]!);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retained, setRetained] = useState<{ key: string; body: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const fields: Array<{ key: keyof Omit<AllowanceTotals, "maxMicrodollars">; label: string }> = [
    { key: "textCalls", label: "Text calls" }, { key: "imageCalls", label: "Image calls" },
    { key: "steps", label: "Steps" }, { key: "textRevisions", label: "Text revisions" },
    { key: "imageRevisions", label: "Image revisions" }, { key: "noProgress", label: "No-progress window" },
  ];
  const deliver = async (request: { key: string; body: string }) => {
    setBusy(true); setError(null); onLocked(true);
    try {
      const response = await fetch("/api/experiments/booklet-runs/campaigns", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": request.key },
        signal: AbortSignal.timeout(30_000), body: request.body,
      });
      const envelope = await response.json() as { data?: { campaignId: string }; error?: { message?: string } };
      if (!response.ok || !envelope.data) {
        if (response.status >= 500) throw new Error(envelope.error?.message ?? "Grant acknowledgement is uncertain.");
        setRetained(null); setUncertain(false); onLocked(false);
        setError(envelope.error?.message ?? "The initial grant was rejected."); return;
      }
      const saved = JSON.parse(request.body) as { predecessorRunId?: string };
      setRetained(null); setUncertain(false); onLocked(false); onGrant(envelope.data.campaignId, saved.predecessorRunId);
    } catch (cause) {
      setUncertain(true);
      setError(cause instanceof Error ? cause.message : "Grant outcome is uncertain. Retry the exact saved request.");
    } finally { setBusy(false); }
  };
  const grant = async () => {
    if (busy || uncertain) return;
    const maxMicrodollars = parseUsd(money);
    const predecessorRunId = predecessor.trim();
    if (predecessorRunId !== "" && !opaqueIdSchema.safeParse(predecessorRunId).success) {
      setError("Enter a valid predecessor run ID or leave the experiment link empty."); return;
    }
    if (maxMicrodollars === null || !reference.trim() ||
        fields.some(({ key: field }) => !Number.isSafeInteger(totals[field]) || totals[field] < 0)) {
      setError("Enter a positive finite USD total with up to six decimal places, finite totals and an operator reference."); return;
    }
    const request = { key: crypto.randomUUID(), body: JSON.stringify({ mode, persona,
      maxMicrodollars, totals, reference: reference.trim(), ...(predecessorRunId ? { predecessorRunId } : {}) }) };
    setRetained(request);
    await deliver(request);
  };
  const modeLabel = mode === "real" ? "Real" : "Balanced";
  return <section aria-label={`Initial ${modeLabel} allowance`} className="space-y-3 rounded-lg border border-[var(--border)] p-4 text-sm">
    <h3 className="font-semibold">Record an initial finite {modeLabel} allowance</h3>
    <p>This creates one campaign for one run. The grant is recorded separately from its technical execution profile.</p>
    <label className="block space-y-1"><span>Maximum dollars</span><input className="w-full rounded border border-[var(--border)] p-2" inputMode="decimal" disabled={busy || uncertain} value={money} onChange={event => setMoney(event.target.value)} /></label>
    {mode === "real" ? <><p>Real mode uses paid text and image requests. The allowance is a planning limit; provider charges can differ from estimates. No previous campaign grants this run.</p>
      <details><summary>Link the preceding experiment</summary><label className="block space-y-1"><span>Predecessor run ID (optional)</span><input className="w-full rounded border border-[var(--border)] p-2" disabled={busy || uncertain} value={predecessor} onChange={event => setPredecessor(event.target.value)} /></label></details></> : null}
    <div className="grid gap-2 sm:grid-cols-2">{fields.map(({ key: field, label }) => <label className="space-y-1" key={field}><span className="block">{label}</span>
      <input className="w-full rounded border border-[var(--border)] p-2" type="number" min={field === "textCalls" || field === "steps" || field === "noProgress" ? 1 : 0} step="1" disabled={busy || uncertain}
        value={totals[field]} onChange={event => setTotals(current => ({ ...current, [field]: Number(event.target.value) }))} /></label>)}</div>
    <label className="block space-y-1"><span>Operator reference</span><input className="w-full rounded border border-[var(--border)] p-2" maxLength={500} disabled={busy || uncertain} value={reference} onChange={event => setReference(event.target.value)} /></label>
    <button className="rounded border border-[var(--border)] px-4 py-2 font-semibold disabled:opacity-50" disabled={busy || uncertain} onClick={() => void grant()}>Record grant</button>
    {uncertain ? <button className="rounded border border-[var(--border)] px-4 py-2 disabled:opacity-50" disabled={busy || !retained} onClick={() => { if (retained) void deliver(retained); }}>Retry exact grant</button> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
