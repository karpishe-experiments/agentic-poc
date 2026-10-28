"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { runTiming, type RunTiming } from "@/lib/experiment-runner/run-summary";

const utcFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: "UTC" });

const subscribeTimezone = () => () => {};
const viewerTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function RunTimestamp({ value }: { value?: number | null }) {
  const zone = useSyncExternalStore(subscribeTimezone, viewerTimezone, () => "UTC");
  if (value == null || !Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) return <>Unavailable</>;
  const display = zone ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: zone }).format(value) : utcFormat.format(value);
  return <time dateTime={new Date(value).toISOString()} title={`${utcFormat.format(value)} UTC`}>{display} {zone ?? "UTC"}</time>;
}

export function RunMetrics({ run }: { run: { status: string; createdAtMs?: number; updatedAtMs?: number;
  terminalAtMs?: number | null; timing?: RunTiming } }) {
  const [now, setNow] = useState<number | undefined>();
  useEffect(() => {
    if (["completed", "failed"].includes(run.status)) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [run.status]);
  const timing = runTiming(run, now ?? run.updatedAtMs ?? run.createdAtMs);
  const seconds = timing.elapsedMs == null ? null : Math.floor(timing.elapsedMs / 1000);
  return <dl className="grid gap-4 border-y border-[var(--border)] py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
    <div><dt className="text-[var(--muted-ink)]">Started</dt><dd className="mt-1 font-medium tabular-nums"><RunTimestamp value={timing.startedAtMs} /></dd></div>
    <div><dt className="text-[var(--muted-ink)]">Finished</dt><dd className="mt-1 font-medium tabular-nums">{["completed", "failed"].includes(run.status) ? <RunTimestamp value={timing.terminalAtMs} /> : "In progress"}</dd></div>
    <div><dt className="text-[var(--muted-ink)]">Elapsed, including pauses</dt><dd className="mt-1 font-medium tabular-nums">{seconds == null ? "Duration unavailable" : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`}</dd></div>
    <div><dt className="text-[var(--muted-ink)]">Latest update</dt><dd className="mt-1 font-medium tabular-nums"><RunTimestamp value={run.updatedAtMs} /></dd></div>
  </dl>;
}
