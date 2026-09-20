"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { DifyExperimentContext, DifyExperimentRun, DifyExperimentRevision } from "@/lib/contracts/dify-experiment";

type ProjectView = { context: DifyExperimentContext; revisions: DifyExperimentRevision[]; runs: Array<Pick<DifyExperimentRun, "id" | "action" | "status" | "startedAtMs" | "finishedAtMs" | "message" | "error" | "toolCalls">> };
type ApiResponse<T> = { data?: T; error?: { message?: string } };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { ...(typeof init?.body === "string" ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const body = await response.json() as ApiResponse<T>;
  if (!response.ok || !body.data) throw new Error(body.error?.message ?? "The experiment request failed.");
  return body.data;
}

export function DifyExperimentClient({ mode, maxImageAttempts }: { mode: "fake" | "real"; maxImageAttempts: number }) {
  const [project, setProject] = useState<ProjectView | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    try { const value = await request<ProjectView>("/api/experiments/dify/project"); setProject(value); setMissing(false); setError(null); }
    catch (caught) { const message = caught instanceof Error ? caught.message : "The project could not be loaded."; if (message.includes("Initialize")) { setMissing(true); setProject(null); } else setError(message); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!project?.context.active_run_id && project?.context.image?.status !== "generating") return;
    const timer = window.setInterval(() => void load(), 2_000); return () => window.clearInterval(timer);
  }, [project?.context.active_run_id, project?.context.image?.status, load]);

  async function execute(operation: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await operation(); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : "The experiment request failed."); }
    finally { setBusy(false); }
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!project || !feedback.trim()) return;
    await execute(async () => { await request("/api/experiments/dify/turn", { method: "POST", body: JSON.stringify({ action: "revise", expected_revision: project.context.current_revision, feedback }) }); setFeedback(""); });
  }

  async function recoverImage(file: File | undefined) {
    if (!project || !file || !project.context.image) return;
    await execute(() => request(`/api/experiments/dify/image/recover?expected_revision=${project.context.current_revision}&attempt_id=${encodeURIComponent(project.context.image!.attempt_id)}`, { method: "POST", headers: { "Content-Type": "image/png" }, body: file }));
  }

  const context = project?.context; const working = busy || Boolean(context?.active_run_id) || context?.image?.status === "generating";
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-[var(--accent)]">Dify experiment · {mode} mode</p>
        <h1 className="text-3xl font-semibold tracking-tight">Dify booklet lifecycle</h1>
        <p className="max-w-2xl text-[var(--muted-ink)]">A synthetic, isolated proof of context loading, revisions, approval, and one panel image.</p>
      </header>
      {error ? <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
      {missing ? <section className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Initialize the synthetic project</h2><p className="mt-2 text-sm text-[var(--muted-ink)]">This creates one isolated Pip-and-the-sunflower sample. It never changes an existing booklet.</p><button className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => void execute(() => request("/api/experiments/dify/initialize", { method: "POST", body: "{}" }))}>Initialize experiment</button></section> : null}
      {context && project ? <>
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm"><h2 className="text-xl font-semibold">Idea and state</h2><p className="mt-2 text-sm text-[var(--muted-ink)]">{context.idea}</p><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="font-medium">Revision</dt><dd>{context.current_revision || "Not created"}</dd></div><div><dt className="font-medium">State</dt><dd>{context.state.replaceAll("_", " ")}</dd></div><div><dt className="font-medium">Image attempts</dt><dd>{context.image_attempt_count}/{maxImageAttempts}</dd></div></dl></section>
        {context.current_revision === 0 ? <button className="rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-white disabled:opacity-60" disabled={working} onClick={() => void execute(() => request("/api/experiments/dify/turn", { method: "POST", body: JSON.stringify({ action: "create" }) }))}>Create story</button> : null}
        {context.story ? <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm"><h2 className="text-xl font-semibold">{context.story.title}</h2><p className="mt-2 leading-7 text-[var(--muted-ink)]">{context.story.storyline}</p><ol className="mt-5 grid gap-3">{context.story.panels.map((panel) => <li className="rounded-xl border border-[var(--border)] p-4" key={panel.number}><p className="font-medium">Panel {panel.number}</p><p className="mt-1 text-sm">{panel.text}</p><p className="mt-2 text-sm text-[var(--muted-ink)]">{panel.scene}</p></li>)}</ol><p className="mt-4 text-xs text-[var(--muted-ink)]">Image prompt: {context.story.first_panel_image_prompt}</p></section> : null}
        {context.state === "awaiting_review" && !context.approved_revision ? <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><h2 className="text-lg font-semibold">Review revision {context.current_revision}</h2><form className="mt-3 space-y-3" onSubmit={submitFeedback}><label className="block text-sm font-medium" htmlFor="dify-feedback">Request a change</label><textarea className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-white p-3 text-sm" disabled={working} id="dify-feedback" maxLength={2_000} onChange={(event) => setFeedback(event.target.value)} value={feedback}/><button className="rounded-xl border border-[var(--accent)] px-4 py-2 font-semibold text-[var(--accent)] disabled:opacity-60" disabled={working || !feedback.trim()} type="submit">Save feedback and revise</button></form><button className="mt-3 rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-white disabled:opacity-60" disabled={working || context.pending_feedback.length > 0} onClick={() => void execute(async () => { await request("/api/experiments/dify/approve", { method: "POST", body: JSON.stringify({ expected_revision: context.current_revision }) }); await request("/api/experiments/dify/turn", { method: "POST", body: JSON.stringify({ action: "resume" }) }); })}>Approve and illustrate</button></section> : null}
        {context.image?.status === "ready" ? <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><h2 className="text-lg font-semibold">First panel image</h2><Image alt="Illustration of Pip beside the thirsty sunflower" className="mt-3 h-auto w-full max-w-md rounded-xl border border-[var(--border)]" height={768} src="/api/experiments/dify/assets/panel-1" unoptimized width={768}/><p className="mt-2 text-sm text-[var(--muted-ink)]">{context.image.prompt}</p></section> : null}
        {context.state === "image_failed" ? <div className="space-y-2">
          <p className="text-sm text-red-700" role="status">{context.image?.error ?? "The image attempt failed."}</p>
          {context.image ? <label className="inline-flex cursor-pointer rounded-xl border border-[var(--border)] px-4 py-2 font-semibold text-[var(--ink)]">Save existing image<input accept="image/png" className="sr-only" disabled={working || context.image.completion_in_progress} onChange={(event) => void recoverImage(event.target.files?.[0])} type="file"/></label> : null}
          {context.image_attempt_count < maxImageAttempts
            ? <button className="rounded-xl border border-[var(--accent)] px-4 py-2 font-semibold text-[var(--accent)] disabled:opacity-60" disabled={working || Boolean(context.image?.completion_in_progress)} onClick={() => void execute(async () => { await request("/api/experiments/dify/image/retry", { method: "POST", body: JSON.stringify({ expected_revision: context.current_revision }) }); await request("/api/experiments/dify/turn", { method: "POST", body: JSON.stringify({ action: "resume" }) }); })}>Retry image</button>
            : <p className="text-sm text-[var(--muted-ink)]">The image-attempt limit is reached. No further retry is available for this experiment.</p>}
        </div> : null}
        {context.current_revision > 0 && !working && !(context.state === "image_failed" && context.image_attempt_count >= maxImageAttempts) ? <button className="rounded-xl border border-[var(--border)] px-4 py-2 font-semibold disabled:opacity-60" disabled={busy} onClick={() => void execute(() => request("/api/experiments/dify/turn", { method: "POST", body: JSON.stringify({ action: "resume" }) }))}>Resume</button> : null}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><h2 className="text-lg font-semibold">Run details</h2>{context.image ? <div className="mt-2 text-xs text-[var(--muted-ink)]"><p>Image attempt: {context.image.attempt_id}</p>{context.image.workflow_run_id ? <p>Dify workflow run: {context.image.workflow_run_id}</p> : null}</div> : null}<ul className="mt-3 space-y-2 text-sm">{project.runs.slice().reverse().map((run) => <li className="rounded-lg bg-[#fffaf2] p-3" key={run.id}><span className="font-medium">{run.action}</span> — {run.status}{run.toolCalls.length ? ` (${run.toolCalls.join(", ")})` : ""}{run.message ? <p className="mt-1 text-[var(--muted-ink)]">{run.message}</p> : null}{run.error ? <p className="mt-1 text-red-700">{run.error}</p> : null}</li>)}</ul></section>
      </> : null}
    </section>
  );
}
