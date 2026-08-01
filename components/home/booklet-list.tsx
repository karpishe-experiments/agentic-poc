import Link from "next/link";
import Image from "next/image";
import type { BookletSummary } from "@/lib/contracts/booklets";

const stageLabels: Record<BookletSummary["currentStage"], string> = {
  audience_profile: "Audience profile",
  story_plan: "Story plan",
  visual_style: "Visual style",
  visual_bible: "Visual bible",
  booklet_specification: "Booklet specification",
  page_plan: "Page plan",
  final_pages: "Final pages",
  pdf_export: "PDF export",
};

function formatDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

export function BookletList({ booklets }: Readonly<{ booklets: BookletSummary[] }>) {
  if (booklets.length === 0) {
    return <p className="rounded-xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted-ink)]">Your booklets will appear here. Create one to begin.</p>;
  }

  return (
    <ul className="grid gap-3" aria-label="Your booklets">
      {booklets.map((booklet) => (
        <li key={booklet.id}>
          <Link className="grid gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 no-underline shadow-sm transition hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]" href={`/booklets/${booklet.id}`}>
            <span className="flex gap-3">
              {booklet.coverAssetId ? <Image alt="" className="h-16 w-16 rounded-lg object-cover" height={64} src={`/api/assets/${booklet.coverAssetId}`} unoptimized width={64} /> : null}
              <span className="grid min-w-0 flex-1 gap-2">
                <span className="flex items-start justify-between gap-3">
                  <span className="font-semibold">{booklet.workingTitle}</span>
                  <span className="rounded-full bg-[#f3e5d8] px-2 py-1 text-xs font-medium capitalize">{booklet.lifecycle.replaceAll("_", " ")}</span>
                </span>
                <span className="text-sm text-[var(--muted-ink)]">Current stage: {stageLabels[booklet.currentStage]}</span>
                <span className="text-sm text-[var(--muted-ink)]">
                  {booklet.generationProgress ? `Generating ${booklet.generationProgress.completed}/${booklet.generationProgress.total} items` : "Ready to continue"}
                </span>
                <span className="text-xs text-[var(--muted-ink)]">Updated {formatDate(booklet.updatedAt)}</span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
