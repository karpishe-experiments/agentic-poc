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

export function ArtifactRail({ bookletId, artifacts, selectedArtifact }: Readonly<{
  bookletId: string;
  artifacts: ArtifactSummary[];
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
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
