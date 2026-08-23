"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActiveJobSummary } from "@/lib/contracts/booklets";
import { publishJobStatus, subscribeToJobStatus, type PolledJobStatus } from "@/components/workspace/job-status-poller";

type JobStatus = PolledJobStatus & {
  id: string;
  jobType: "references" | "pages" | "export";
  status: string;
  items: NonNullable<PolledJobStatus["items"]>;
};

export function JobProgressPanel({ jobs }: Readonly<{ jobs: ActiveJobSummary[] }>) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<JobStatus[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const refreshedTerminalState = useRef(false);
  const jobKey = jobs.map((job) => job.id).join(",");

  useEffect(() => {
    refreshedTerminalState.current = false;
  }, [jobKey]);

  useEffect(() => {
    let cancelled = false;
    const nextById = new Map<string, JobStatus>();
    const subscriptions = jobs.map((job) => subscribeToJobStatus(job.id, (status) => {
      if (!status.id || !status.jobType || !status.status || !status.items) return;
      nextById.set(job.id, status as JobStatus);
      const nextStatuses = jobs.flatMap((candidate) => {
        const next = nextById.get(candidate.id);
        return next ? [next] : [];
      });
      if (!cancelled) {
        setStatuses(nextStatuses);
        if (!refreshedTerminalState.current && nextStatuses.length === jobs.length && nextStatuses.every((job) => ["succeeded", "failed", "partial", "paused", "cancelled"].includes(job.status))) {
          refreshedTerminalState.current = true;
          router.refresh();
        }
      }
    }));
    return () => { cancelled = true; subscriptions.forEach((unsubscribe) => unsubscribe()); };
  }, [jobs, router]);

  if (!jobs.length) return null;
  return <section aria-label="Generation progress" className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
    <h2 className="font-semibold">Generation progress</h2>
    <div className="mt-2 grid gap-2">
      {(statuses.length ? statuses : jobs).map((job) => {
        const details = "items" in job ? job.items : [];
        const completed = details.filter((item) => item.status === "succeeded").length;
        const total = details.length || ("progress" in job ? job.progress.total : 0);
        const canContinue = details.some((item) => item.status === "pending") && !details.some((item) => item.status === "failed" || item.status === "running");
        const continueKey = `continue:${job.id}`;
        const waitingMessage = job.status === "waiting_for_agents" ? "Waiting for you to choose agents for the current item." : job.status === "waiting_for_selection" ? "Waiting for you to choose one successful candidate result." : null;
        return <article className="rounded-lg border border-[var(--border)] bg-white p-2" key={job.id}>
          <p className="font-medium capitalize">{job.jobType} — {job.status}</p>
          <p aria-live="polite" className="text-[var(--muted-ink)]">{completed} of {total} items completed</p>
          {waitingMessage ? <p className="mt-1 text-[var(--muted-ink)]">{waitingMessage}</p> : null}
          {job.status === "failed" ? <p className="mt-1 text-[var(--muted-ink)]">Generation stopped on this failure. Retry only the failed item; remaining pending items will wait for an explicit Continue action.</p> : null}
          {job.status === "paused" && canContinue ? <p className="mt-1 text-[var(--muted-ink)]">The failed item was retried. Continue when you are ready to generate the remaining pending items.</p> : null}
          {details.filter((item) => item.status === "failed").map((item) => <div className="mt-2 flex flex-wrap items-center gap-2" key={item.id}>
            <span className="text-red-700">{item.itemKey}: {item.error?.message ?? "Generation failed."}</span>
            <button className="rounded border border-[var(--accent)] px-2 py-1 font-semibold text-[var(--accent)] disabled:opacity-50" disabled={retrying === item.id} onClick={async () => {
              setRetrying(item.id);
              setRetryError(null);
              try {
                const response = await fetch(`/api/jobs/${job.id}/items/${item.id}/retry`, { method: "POST" });
                if (!response.ok) throw new Error("The item could not be queued for retry.");
                const body = await response.json() as { data?: PolledJobStatus };
                if (body.data) publishJobStatus(job.id, body.data);
                router.refresh();
              } catch (error) {
                setRetryError(error instanceof Error ? error.message : "The item could not be queued for retry.");
              } finally { setRetrying(null); }
            }} type="button">{retrying === item.id ? "Retrying…" : `Retry failed ${job.jobType === "pages" ? "page" : "reference"}`}</button>
          </div>)}
          {canContinue ? <button className="mt-2 rounded border border-[var(--accent)] px-2 py-1 font-semibold text-[var(--accent)] disabled:opacity-50" disabled={retrying !== null} onClick={async () => {
            setRetrying(continueKey);
            setRetryError(null);
            try {
              const response = await fetch(`/api/jobs/${job.id}/continue`, { method: "POST" });
              if (!response.ok) throw new Error("The pending generation could not be continued.");
              const body = await response.json() as { data?: PolledJobStatus };
              if (body.data) publishJobStatus(job.id, body.data);
              router.refresh();
            } catch (error) {
              setRetryError(error instanceof Error ? error.message : "The pending generation could not be continued.");
            } finally { setRetrying(null); }
          }} type="button">{retrying === continueKey ? "Continuing…" : "Continue generating images"}</button> : null}
          {retryError ? <p className="mt-2 text-red-700" role="alert">{retryError}</p> : null}
        </article>;
      })}
    </div>
  </section>;
}
