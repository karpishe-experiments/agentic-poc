import type { BookletSnapshot } from "@/lib/contracts/booklets";
import type { ArtifactType } from "@/lib/contracts/domain";
import { ArtifactRail, artifactLabel } from "@/components/workspace/artifact-rail";
import { WorkspaceConversation } from "@/components/workspace/workspace-conversation";
import { ArtifactViewer } from "@/components/workspace/artifact-viewer";
import type { BookletUIMessage } from "@/lib/contracts/messages";
import type { ArtifactDetail } from "@/lib/contracts/artifacts";
import Link from "next/link";
import { JobProgressPanel } from "@/components/workspace/job-progress-panel";

function progressText(snapshot: BookletSnapshot): string {
  if (snapshot.activeJobs.length === 0) return "No generation is running.";
  const completed = snapshot.activeJobs.reduce((sum, job) => sum + job.progress.completed, 0);
  const total = snapshot.activeJobs.reduce((sum, job) => sum + job.progress.total, 0);
  if (snapshot.activeJobs.some((job) => job.status === "failed" || job.status === "paused")) return `Generation paused: ${completed} of ${total} items completed.`;
  return `Generating ${completed} of ${total} items.`;
}

export function WorkspaceShell({ snapshot, selectedArtifact, selectedArtifactDetail, pageItems }: Readonly<{ snapshot: BookletSnapshot; selectedArtifact: ArtifactType; selectedArtifactDetail: ArtifactDetail; pageItems: Array<{ pageId: string; pageIndex: number; kind: "cover" | "story" }> }>) {

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-[var(--accent)]">{snapshot.booklet.lifecycle.replaceAll("_", " ")}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{snapshot.booklet.workingTitle}</h1>
          <p className="mt-1 text-sm text-[var(--muted-ink)]">Active stage: {artifactLabel(snapshot.booklet.currentStage)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2"><p className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted-ink)]">{progressText(snapshot)}</p><Link className="text-sm font-semibold text-[var(--accent)]" href={`/api/booklets/${snapshot.booklet.id}/evidence`}>Evidence JSON</Link></div>
      </header>

      <JobProgressPanel jobs={snapshot.activeJobs} />

      <div className="grid gap-5 xl:grid-cols-[13rem_minmax(20rem,25rem)_minmax(0,1fr)]">
        <ArtifactRail bookletId={snapshot.booklet.id} artifacts={snapshot.artifacts} pageItems={pageItems} selectedArtifact={selectedArtifact} />

        <WorkspaceConversation bookletId={snapshot.booklet.id} initialMessages={snapshot.messages.map((message) => message.message as BookletUIMessage)} />

        <ArtifactViewer artifactType={selectedArtifact} bookletId={snapshot.booklet.id} detail={selectedArtifactDetail} key={`${selectedArtifact}:${selectedArtifactDetail.currentVersion?.id ?? "empty"}`} label={artifactLabel(selectedArtifact)} />
      </div>
    </section>
  );
}
