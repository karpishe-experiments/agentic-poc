"use client";

import { useState } from "react";
import type { AllowanceTotals } from "./allowance-review";
import { allowanceFields } from "./allowance-review";

type Preview = { runId: string; operationId: string; expectedRevision: number; expectedCampaignRevision: number;
  previewDigest: string; expiresAtMs: number; terminalStatus: string; target: { taskId: string | null; subjectId: string };
  retainedLiabilityMicrodollars: number; totals: AllowanceTotals; settledMicrodollars: number; reservedMicrodollars: number;
  executionAmendment?: { id: string; baseProfileHash: string; profileHash: string; publications: unknown } | null };
const dollars = (n: number) => `$${(n / 1_000_000).toFixed(6)}`;

export function ImageReplacementReview({ runId, operationId, onSaved }: {
  runId: string; operationId: string; onSaved: () => Promise<unknown>;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [money, setMoney] = useState("");
  const [totals, setTotals] = useState<AllowanceTotals | null>(null);
  const [reference, setReference] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [savedRequest, setSavedRequest] = useState<{ key: string; body: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const load = async () => {
    if (busy || uncertain) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/experiments/booklet-runs/${encodeURIComponent(runId)}/image-replacement?operationId=${encodeURIComponent(operationId)}`,
        { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error?.message ?? "Replacement cannot be reviewed.");
      setPreview(result.data); setTotals(result.data.totals); setMoney((result.data.totals.maxMicrodollars / 1_000_000).toFixed(6)); setAcknowledged(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Preview unavailable."); }
    finally { setBusy(false); }
  };
  const send = async (request: { key: string; body: string }) => {
    if (busy) return;
    setBusy(true); setError(null);
    let saved = false;
    try {
      const response = await fetch(`/api/experiments/booklet-runs/${encodeURIComponent(runId)}/approval`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": request.key },
        body: request.body, signal: AbortSignal.timeout(30_000) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status >= 500) throw Error(result.error?.message ?? "Acknowledgement uncertain.");
        setUncertain(false); setSavedRequest(null); setError(result.error?.message ?? "Approval rejected. Refresh preview."); return;
      }
      saved = true; setUncertain(false); setSavedRequest(null);
      setReceipt(`Saved approval ${result.data.approvalId}; replacement ${result.data.replacementOperationId}.`);
      await onSaved();
    } catch (cause) {
      if (!saved) setUncertain(true);
      setError(saved ? "Approval saved. Refresh run details." : cause instanceof Error ? cause.message : "Acknowledgement uncertain; inspect saved state.");
    } finally { setBusy(false); }
  };
  const approve = async () => {
    if (!preview || !totals || !acknowledged || !reference.trim() || busy || uncertain || receipt) return;
    if (!/^\d+(?:\.\d{1,6})?$/.test(money)) { setError("Enter an exact finite USD total with at most six decimal places."); return; }
    const [whole, fraction = ""] = money.split(".");
    const total = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
    if (!Number.isSafeInteger(total) || total < preview.totals.maxMicrodollars || total <= preview.settledMicrodollars + preview.reservedMicrodollars ||
        allowanceFields.some(({ key }) => !Number.isSafeInteger(totals[key]) || totals[key] < preview.totals[key])) {
      setError("Approve a total above the retained exposure before another image request."); return;
    }
    const request = { key: crypto.randomUUID(), body: JSON.stringify({ action: "image_replacement", operationId,
      expectedRevision: preview.expectedRevision, expectedCampaignRevision: preview.expectedCampaignRevision,
      previewDigest: preview.previewDigest, expiresAtMs: preview.expiresAtMs, reference: reference.trim(),
      acknowledgeUnknownCharge: true, totals: { ...totals, maxMicrodollars: total } }) };
    setSavedRequest(request); await send(request);
  };
  return <section className="space-y-3 rounded border border-amber-500 p-4" aria-label="Image replacement review">
    <h4 className="font-semibold">Review replacement</h4>
    {!uncertain && !receipt ? <button disabled={busy} onClick={() => void load()}>Inspect original and prepare review</button> : null}
    {preview ? <><p>Original {preview.operationId}; Dify {preview.terminalStatus}. Target {preview.target.taskId} · {preview.target.subjectId}.</p>
      <p>Estimated settled {dollars(preview.settledMicrodollars)} · Reserved {dollars(preview.reservedMicrodollars)}.
        Original unknown liability {dollars(preview.retainedLiabilityMicrodollars)} remains reserved.</p>
      <p>One replacement image, then normal completion work. Automatic provider retries remain disabled.</p>
      {preview.executionAmendment ? <details><summary>Reviewed execution update</summary>
        <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(preview.executionAmendment, null, 2)}</pre></details> : null}
      <label className="block">New total USD allowance<input className="ml-2 rounded border p-1" value={money} disabled={busy || uncertain || !!receipt} onChange={e => setMoney(e.target.value)} /></label>
      <p>Current total {dollars(preview.totals.maxMicrodollars)}. Any increase requires your explicit approval.</p>
      <div className="grid gap-2 sm:grid-cols-2">{totals && allowanceFields.map(({ key, label }) => <label className="block" key={key}>
        {label} (previous {preview.totals[key]}, increase {totals[key] - preview.totals[key]})
        <input type="number" min={preview.totals[key]} max={Number.MAX_SAFE_INTEGER} step="1" value={totals[key]}
          disabled={busy || uncertain || !!receipt} onChange={event => setTotals({ ...totals, [key]: Number(event.target.value) })} />
      </label>)}</div>
      <label className="block">Operator approval reference<input className="ml-2 rounded border p-1" maxLength={500} value={reference} disabled={busy || uncertain || !!receipt} onChange={e => setReference(e.target.value)} /></label>
      <label className="block"><input type="checkbox" checked={acknowledged} disabled={busy || uncertain || !!receipt} onChange={e => setAcknowledged(e.target.checked)} /> I approve one additional image attempt and acknowledge that the original call may still be charged.</label>
      {!receipt ? <button disabled={busy || uncertain || !acknowledged || !reference.trim()} onClick={() => void approve()}>Approve exact allowance and one replacement</button> : null}</> : null}
    {uncertain ? <><p>Approval acknowledgement is uncertain. Inspect the saved run before resending the same decision.</p>
      <button disabled={busy} onClick={() => void onSaved()}>Check saved run</button>
      <button disabled={busy || !savedRequest} onClick={() => { if (savedRequest) void send(savedRequest); }}>Reconcile exact approval</button></> : null}
    {receipt ? <p role="status">{receipt}</p> : null}{error ? <p role="alert">{error}</p> : null}
  </section>;
}
