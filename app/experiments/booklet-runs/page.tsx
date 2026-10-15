import { notFound } from "next/navigation";
import { readM4RunnerConfig } from "@/lib/experiment-runner/m4-config";
import { BookletRunner } from "@/components/experiments/booklet-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function BookletRunsPage() {
  const state = readM4RunnerConfig();
  if (!state.enabled && state.reason !== "invalid") notFound();
  if (!state.enabled) return <section role="alert" className="max-w-2xl space-y-3"><h1 className="text-3xl font-semibold">Booklet runner unavailable</h1><p>The runner setup needs attention before runs can start.</p></section>;
  const m4State = state.config.m4?.state ?? "disabled";
  return <BookletRunner balancedEnabled={m4State === "granted"} m4State={m4State} />;
}
