import type { BookletSnapshot } from "@/lib/contracts/booklets";
import type { ArtifactType } from "@/lib/contracts/domain";
import { ArtifactRail, artifactLabel } from "@/components/workspace/artifact-rail";
import { WorkspaceConversation } from "@/components/workspace/workspace-conversation";
import type { BookletUIMessage } from "@/lib/contracts/messages";
import Image from "next/image";

function progressText(snapshot: BookletSnapshot): string {
  if (snapshot.activeJobs.length === 0) return "No generation is running.";
  const completed = snapshot.activeJobs.reduce((sum, job) => sum + job.progress.completed, 0);
  const total = snapshot.activeJobs.reduce((sum, job) => sum + job.progress.total, 0);
  return `Generating ${completed} of ${total} items.`;
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

        <WorkspaceConversation bookletId={snapshot.booklet.id} initialMessages={snapshot.messages.map((message) => message.message as BookletUIMessage)} />

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
