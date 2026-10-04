import { notFound } from "next/navigation";
import { readBookletRunnerConfig } from "@/lib/experiment-runner/config";
import { BookletRunner } from "@/components/experiments/booklet-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function BookletRunsPage() {
  const state = readBookletRunnerConfig();
  if (!state.enabled && state.reason !== "invalid") notFound();
  if (!state.enabled) return <section role="alert" className="max-w-2xl space-y-3"><h1 className="text-3xl font-semibold">Booklet runner unavailable</h1><p>The runner setup needs attention before runs can start.</p></section>;
  return <BookletRunner />;
}
