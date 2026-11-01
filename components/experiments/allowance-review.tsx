"use client";

import { useState } from "react";

export type AllowanceTotals = { maxMicrodollars: number; textCalls: number; imageCalls: number; steps: number;
  textRevisions: number; imageRevisions: number; noProgress: number };
export type AllowanceView = { campaignId: string; revision: number; totals: AllowanceTotals;
  reservedMicrodollars: number; settledMicrodollars: number; textRequests: number; imageRequests: number;
  latestApprovalReference: string | null };
export type PendingAllowance = { kind: "allowance_v1"; reason: string; requestDigest: string;
  requestedAtMs: number; targetTaskId?: string; targetVersionId?: string; instruction?: string;
  requiredTotal?: number; nextAction?: { role: string; providerKind: string; taskId: string | null };
  declinedAtMs?: number; declineReference?: string };

export const allowanceFields: Array<{ key: Exclude<keyof AllowanceTotals, "maxMicrodollars">; label: string }> = [
  { key: "textCalls", label: "Text calls" },
  { key: "imageCalls", label: "Image calls" }, { key: "steps", label: "Steps" },
  { key: "textRevisions", label: "Text revisions" }, { key: "imageRevisions", label: "Image revisions" },
  { key: "noProgress", label: "No-progress window" },
];
const fields = allowanceFields;
const usd = (microdollars: number) => `$${(microdollars / 1_000_000).toFixed(6)}`;
function parseUsd(value: string): number | null {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}
const reasonField: Record<string, keyof AllowanceTotals> = { monetary: "maxMicrodollars", text_calls: "textCalls",
  image_calls: "imageCalls", steps: "steps", text_revisions: "textRevisions",
  image_revisions: "imageRevisions", no_progress: "noProgress" };

export function AllowanceReview({ runId, runRevision, pending, allowance, onSaved }: {
  runId: string; runRevision: number; pending?: PendingAllowance | null; allowance: AllowanceView; onSaved: () => Promise<unknown>;
}) {
  const [totals, setTotals] = useState(allowance.totals);
  const [money, setMoney] = useState((allowance.totals.maxMicrodollars / 1_000_000).toFixed(6));
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [checked, setChecked] = useState(false);
  const [retained, setRetained] = useState<{ key: string; body: string } | null>(null);
  const deliver = async (request: { key: string; body: string }) => {
    setBusy(true); setError(null); setChecked(false);
    let acknowledged = false;
    try {
      const response = await fetch(`/api/experiments/booklet-runs/${encodeURIComponent(runId)}/approval`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": request.key },
        signal: AbortSignal.timeout(30_000), body: request.body,
      });
      const envelope = await response.json() as { data?: { approvalId?: string; declineId?: string; runRevision?: number }; error?: { message?: string } };
      if (!response.ok) {
        if (response.status >= 500) throw new Error(envelope.error?.message ?? "Decision acknowledgement is uncertain.");
        setError(envelope.error?.message ?? "The decision was not saved.");
        setRetained(null); setUncertain(false); return;
      }
      acknowledged = true;
      setUncertain(false);
      setReceipt(`Saved decision ${envelope.data?.approvalId ?? envelope.data?.declineId ?? request.key}; run revision ${envelope.data?.runRevision ?? "pending readback"}.`);
      setRetained(null);
      const refreshed = await onSaved();
      if (refreshed === false) setError("Decision saved. Refresh run details to see the current state.");
    } catch (cause) {
      if (acknowledged) setError("Decision saved. Refresh run details to see the current state.");
      else {
        setUncertain(true);
        setError(cause instanceof Error ? cause.message : "Decision acknowledgement is uncertain. Check saved state before retrying.");
        try { setChecked(await onSaved() !== false); } catch { setChecked(false); }
      }
    } finally { setBusy(false); }
  };
  const submit = async (action: "approve" | "decline") => {
    if (busy || uncertain || receipt) return;
    if (!reference.trim()) { setError("Record an operator reference before deciding."); return; }
    const moneyTotal = parseUsd(money);
    if (action === "approve" && (moneyTotal === null || moneyTotal < allowance.totals.maxMicrodollars)) {
      setError("Enter an exact finite USD total with up to six decimal places."); return;
    }
    const approvedTotals = { ...totals, maxMicrodollars: moneyTotal ?? allowance.totals.maxMicrodollars };
    const exhausted = pending ? reasonField[pending.reason] : null;
    if (action === "approve" && (pending && (!exhausted || approvedTotals[exhausted] <= allowance.totals[exhausted] ||
        pending.requiredTotal != null && approvedTotals[exhausted] < pending.requiredTotal ||
        fields.some(({ key }) => !Number.isSafeInteger(approvedTotals[key]) || approvedTotals[key] < allowance.totals[key])) ||
        !pending && Object.keys(approvedTotals).every(key => approvedTotals[key as keyof AllowanceTotals] === allowance.totals[key as keyof AllowanceTotals]))) {
      setError("Enter finite totals that increase the exhausted allowance and do not reduce earlier totals."); return;
    }
    const request = { key: crypto.randomUUID(), body: JSON.stringify({ action: !pending && action === "approve" ? "adjust" : action, expectedRevision: runRevision,
      expectedCampaignRevision: allowance.revision, ...(pending ? { expectedPendingDigest: pending.requestDigest } : {}),
      reference: reference.trim(), ...(action === "approve" ? { totals: approvedTotals } : {}) }) };
    setRetained(request);
    await deliver(request);
  };
  return <section aria-label="Operator allowance review" className="space-y-3 rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
    <h4 className="font-semibold">{pending ? "Waiting for operator allowance" : "Adjust run allowance"}</h4>
    <p>{pending ? `Reason: ${pending.reason.replaceAll("_", " ")}. Approval queues the saved run.` : "Approve higher totals for this run. Manual pauses and unresolved outcomes remain in place; active work finishes before the adjustment applies."}</p>
    <p>Estimated settled {usd(allowance.settledMicrodollars)} · Reserved {usd(allowance.reservedMicrodollars)} · Allowance used {usd(allowance.settledMicrodollars + allowance.reservedMicrodollars)}.</p>
    <p>Current total {usd(allowance.totals.maxMicrodollars)} · New total {usd(parseUsd(money) ?? allowance.totals.maxMicrodollars)} · Increase {usd((parseUsd(money) ?? allowance.totals.maxMicrodollars) - allowance.totals.maxMicrodollars)}.</p>
    {pending?.nextAction ? <p>Next action: {pending.nextAction.role}{pending.nextAction.taskId ? ` ${pending.nextAction.taskId}` : ""} ({pending.nextAction.providerKind}). Minimum funded total: {pending.reason === "monetary" ? usd(pending.requiredTotal ?? 0) : pending.requiredTotal ?? "unavailable"}.</p> : null}
    {pending?.targetTaskId ? <p>Tester request: {pending.targetTaskId} · version {pending.targetVersionId}. {pending.instruction}</p> : null}
    <p>Used: {allowance.textRequests} text calls, {allowance.imageRequests} image calls. Money settled {usd(allowance.settledMicrodollars)} + held {usd(allowance.reservedMicrodollars)}.</p>
    {pending?.declinedAtMs ? <p>Declined: {pending.declineReference}. The saved request remains paused.</p> : null}
    <label className="block space-y-1"><span>Maximum USD (current {usd(allowance.totals.maxMicrodollars)})</span>
      <input className="w-full rounded border border-amber-700 bg-white p-2" inputMode="decimal" disabled={busy || uncertain || !!receipt} value={money} onChange={event => setMoney(event.target.value)} /></label>
    <div className="grid gap-2 sm:grid-cols-2">{fields.map(({ key, label }) => <label className="space-y-1" key={key}><span className="block">{label} (current {allowance.totals[key]})</span>
      <input className="w-full rounded border border-amber-700 bg-white p-2" type="number" min={allowance.totals[key]} max={Number.MAX_SAFE_INTEGER} step="1" disabled={busy || uncertain || !!receipt}
        value={totals[key]} onChange={event => setTotals(current => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div>
    <label className="block space-y-1"><span>Approval or decline reference</span><input className="w-full rounded border border-amber-700 bg-white p-2" maxLength={500} disabled={busy || uncertain || !!receipt} value={reference} onChange={event => setReference(event.target.value)} /></label>
    {receipt ? <p role="status">{receipt}</p> : <div className="flex gap-2"><button className="rounded border border-amber-800 px-3 py-2 font-semibold disabled:opacity-50" disabled={busy || uncertain} onClick={() => void submit("approve")}>Approve exact totals</button>
      {pending ? <button className="rounded border border-amber-800 px-3 py-2 disabled:opacity-50" disabled={busy || uncertain || !!pending.declinedAtMs} onClick={() => void submit("decline")}>Decline</button> : null}</div>}
    {uncertain ? <div className="flex gap-2"><button disabled={busy} onClick={() => void onSaved().then(result => setChecked(result !== false)).catch(() => setChecked(false))}>Check saved state</button>
      <button disabled={busy || !checked || !retained} onClick={() => { if (retained) void deliver(retained); }}>Retry exact request</button></div> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
