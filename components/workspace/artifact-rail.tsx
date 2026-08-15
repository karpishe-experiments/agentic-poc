import Link from "next/link";
import type { ArtifactSummary } from "@/lib/contracts/booklets";
import type { ArtifactType } from "@/lib/contracts/domain";

const artifactLabels: Record<ArtifactType, string> = {
  audience_profile: "Audience",
  story_plan: "Story",
  visual_style: "Style",
  visual_bible: "Visual bible",
  booklet_specification: "Booklet spec",
  page_plan: "Page plan",
  final_pages: "Final pages",
  pdf_export: "PDF export",
};

export function artifactLabel(type: ArtifactType): string {
  return artifactLabels[type];
}

export function ArtifactRail({ bookletId, artifacts, pageItems, selectedArtifact }: Readonly<{
  bookletId: string;
  artifacts: ArtifactSummary[];
  pageItems: Array<{ pageId: string; pageIndex: number; kind: "cover" | "story" }>;
  selectedArtifact: ArtifactType;
}>) {
  return (
    <nav aria-label="Booklet stages" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <ol className="grid gap-1">
        {artifacts.map((artifact, index) => {
          const isSelected = artifact.artifactType === selectedArtifact;
          return (
            <li key={artifact.id}>
              <Link
                aria-current={isSelected ? "step" : undefined}
                className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm no-underline ${isSelected ? "bg-[#f3e5d8] font-semibold" : "hover:bg-[#fff7ee]"}`}
                href={`/booklets/${bookletId}?artifact=${artifact.artifactType}`}
              >
                <span>{index + 1}. {artifactLabel(artifact.artifactType)}</span>
                <span className="text-xs capitalize text-[var(--muted-ink)]">{artifact.state.replaceAll("_", " ")}</span>
              </Link>
              {artifact.artifactType === "page_plan" && pageItems.length ? <ol className="ml-4 mt-1 grid gap-1 border-l border-[var(--border)] pl-2">{pageItems.map((page) => <li key={page.pageId}><Link className="block rounded px-2 py-1 text-xs text-[var(--muted-ink)] no-underline hover:bg-[#fff7ee] focus-visible:outline-2 focus-visible:outline-[var(--accent)]" href={`/booklets/${bookletId}?artifact=page_plan#page-${page.pageId}`}>{page.pageIndex === 0 ? "Cover" : `Page ${page.pageIndex}`} · {page.kind}</Link></li>)}</ol> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
