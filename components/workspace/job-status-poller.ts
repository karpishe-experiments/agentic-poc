"use client";

export type PolledJobItem = {
  id: string;
  itemKey: string;
  position: number;
  status: string;
  attemptCount?: number;
  error?: { message?: string } | null;
};

export type PolledJobStatus = {
  id?: string;
  jobType?: "references" | "pages" | "export";
  status?: string;
  items?: PolledJobItem[];
};

type Listener = (status: PolledJobStatus) => void;
type PollEntry = {
  listeners: Set<Listener>;
  status: PolledJobStatus | null;
  timer: number | null;
  request: Promise<void> | null;
};

export const RUNNING_JOB_POLL_INTERVAL_MS = 5_000;
export const IDLE_JOB_POLL_INTERVAL_MS = 15_000;

const entries = new Map<string, PollEntry>();

function getEntry(jobId: string): PollEntry {
  const existing = entries.get(jobId);
  if (existing) return existing;
  const created: PollEntry = { listeners: new Set(), status: null, timer: null, request: null };
  entries.set(jobId, created);
  return created;
}

function schedule(jobId: string, entry: PollEntry) {
  if (entry.timer !== null) window.clearTimeout(entry.timer);
  if (!entry.listeners.size) return;
  const interval = entry.status?.status === "running" ? RUNNING_JOB_POLL_INTERVAL_MS : IDLE_JOB_POLL_INTERVAL_MS;
  entry.timer = window.setTimeout(() => {
    entry.timer = null;
    void refreshJobStatus(jobId, entry);
  }, interval);
}

function publish(jobId: string, entry: PollEntry, status: PolledJobStatus) {
  entry.status = status;
  entry.listeners.forEach((listener) => listener(status));
  schedule(jobId, entry);
}

async function refreshJobStatus(jobId: string, entry: PollEntry) {
  if (entry.request) return entry.request;
  entry.request = (async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      const body = await response.json() as { data?: PolledJobStatus };
      if (response.ok && body.data) publish(jobId, entry, body.data);
      else schedule(jobId, entry);
    } catch {
      schedule(jobId, entry);
    } finally {
      entry.request = null;
    }
  })();
  return entry.request;
}

export function subscribeToJobStatus(jobId: string, listener: Listener): () => void {
  const entry = getEntry(jobId);
  entry.listeners.add(listener);
  if (entry.status) listener(entry.status);
  if (!entry.request && entry.timer === null) void refreshJobStatus(jobId, entry);

  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size) return;
    if (entry.timer !== null) window.clearTimeout(entry.timer);
    entries.delete(jobId);
  };
}

export function publishJobStatus(jobId: string, status: PolledJobStatus) {
  publish(jobId, getEntry(jobId), status);
}
