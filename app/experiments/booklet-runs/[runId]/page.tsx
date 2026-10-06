import { notFound } from "next/navigation";
import { BookletRunner } from "@/components/experiments/booklet-runner";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { readBookletRunnerConfig } from "@/lib/experiment-runner/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SavedBookletRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const state = readBookletRunnerConfig();
  if (!state.enabled && state.reason !== "invalid") notFound();
  if (!state.enabled) return <section role="alert"><h1>Booklet runner unavailable</h1><p>The runner setup needs attention before runs can start.</p></section>;
  const parsed = opaqueIdSchema.safeParse((await params).runId);
  if (!parsed.success) notFound();
  // The existing authenticated detail API owns the saved view. Do not admit this
  // execution profile to the legacy workspace or its mutation services.
  return <BookletRunner focusedRunId={parsed.data} />;
}
