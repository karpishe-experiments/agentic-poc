import type { BookletSnapshot } from "@/lib/contracts/booklets";
import type { ArtifactType } from "@/lib/contracts/domain";
import { ArtifactRail, artifactLabel } from "@/components/workspace/artifact-rail";

function progressText(snapshot: BookletSnapshot): string {
  if (snapshot.activeJobs.length === 0) return "No generation is running.";
  const completed = snapshot.activeJobs.reduce((sum, job) => sum + job.progress.completed, 0);
  const total = snapshot.activeJobs.reduce((sum, job) => sum + job.progress.total, 0);
  return `Generating ${completed} of ${total} items.`;
}

function messageText(message: unknown): string {
  if (!message || typeof message !== "object" || !("parts" in message) || !Array.isArray(message.parts)) {
    return "Saved message";
  }
  const text = message.parts
    .filter((part): part is { type: "text"; text: string } => Boolean(part) && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string")
    .map((part) => part.text)
    .join(" ");
  return text || "Saved message";
}

export function WorkspaceShell({ snapshot, selectedArtifact }: Readonly<{ snapshot: BookletSnapshot; selectedArtifact: ArtifactType }>) {
  const selected = snapshot.artifacts.find((artifact) => artifact.artifactType === selectedArtifact);

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-[var(--accent)]">{snapshot.booklet.lifecycle.replaceAll("_", " ")}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{snapshot.booklet.workingTitle}</h1>
          <p className="mt-1 text-sm text-[var(--muted-ink)]">Active stage: {artifactLabel(snapshot.booklet.currentStage)}</p>
        </div>
        <p className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted-ink)]">{progressText(snapshot)}</p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[13rem_minmax(20rem,25rem)_minmax(0,1fr)]">
        <ArtifactRail bookletId={snapshot.booklet.id} artifacts={snapshot.artifacts} selectedArtifact={selectedArtifact} />

        <section aria-label="Conversation" className="min-h-80 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-lg font-semibold">Creative partner</h2>
          <div className="mt-4 max-h-[32rem] overflow-y-auto pr-1">
            {snapshot.messages.map((message) => (
              <article className="mb-3 rounded-xl bg-[#fff7ee] p-3 text-sm" key={message.id}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-ink)]">{message.role}</p>
                <p>{messageText(message.message)}</p>
              </article>
            ))}
            {snapshot.activeCard ? <p className="rounded-xl border border-[var(--border)] p-3 text-sm">A decision card is ready to review.</p> : <p className="text-sm text-[var(--muted-ink)]">Your intake question will appear here in the next workflow slice.</p>}
          </div>
        </section>

        <section aria-label="Selected artifact" className="min-h-80 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-[var(--accent)]">Selected artifact</p>
          <h2 className="mt-1 text-2xl font-semibold">{artifactLabel(selectedArtifact)}</h2>
          <p className="mt-3 text-sm text-[var(--muted-ink)]">
            {selected?.state === "empty"
              ? "This stage is ready for guided work. Its saved history and review controls appear as the workflow is implemented."
              : `Status: ${selected?.state.replaceAll("_", " ")}.`}
          </p>
          <div className="relative mt-6 flex aspect-[5/4] items-center justify-center overflow-hidden rounded-xl border border-dashed border-[var(--border)] bg-[#fffaf2] text-center text-sm text-[var(--muted-ink)]">
            {snapshot.booklet.coverAssetId ? <Image alt="Booklet cover" className="object-cover" fill sizes="(max-width: 1280px) 100vw, 50vw" src={`/api/assets/${snapshot.booklet.coverAssetId}`} unoptimized /> : "Illustrations and the cover will appear here once generated."}
          </div>
        </section>
      </div>
    </section>
  );
}
import Image from "next/image";
