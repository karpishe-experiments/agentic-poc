"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ArtifactDetail } from "@/lib/contracts/artifacts";
import type { ArtifactType } from "@/lib/contracts/domain";

type ApiResponse = { data?: ArtifactDetail; error?: { message?: string } };

function stateLabel(state: ArtifactDetail["state"]): string {
  return state.replaceAll("_", " ");
}

export function ArtifactViewer({ bookletId, artifactType, detail, label }: Readonly<{
  bookletId: string;
  artifactType: ArtifactType;
  detail: ArtifactDetail;
  label: string;
}>) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => detail.currentVersion ? JSON.stringify(detail.currentVersion.content, null, 2) : "{\n  \"schemaVersion\": \"1\"\n}");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "approve" | null>(null);
  const finalPages = artifactType === "final_pages" && detail.currentVersion?.content && typeof detail.currentVersion.content === "object" && "pages" in detail.currentVersion.content
    ? (detail.currentVersion.content as { pages: Array<{ pageId: string; pageIndex: number; readerText: string }> }).pages
    : [];
  const pagePackages = artifactType === "page_plan" && detail.currentVersion?.content && typeof detail.currentVersion.content === "object" && "pages" in detail.currentVersion.content
    ? (detail.currentVersion.content as { pages: Array<{ pageId: string; pageIndex: number; kind: "cover" | "story"; readerText: string; sceneAction: string; compositionIntent: string }> }).pages
    : [];
  const specification = artifactType === "booklet_specification" && detail.currentVersion?.content && typeof detail.currentVersion.content === "object" && "storyPageCount" in detail.currentVersion.content
    ? detail.currentVersion.content as { storyPageCount: number }
    : null;
  const [storyPageCount, setStoryPageCount] = useState(() => specification?.storyPageCount ?? 3);
  const [pageText, setPageText] = useState<Record<string, string>>(() => Object.fromEntries(finalPages.map((page) => [page.pageId, page.readerText])));

  async function request(path: string, options: RequestInit) {
    const response = await fetch(path, options);
    const body = await response.json() as ApiResponse;
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? "The artifact could not be updated.");
    router.refresh();
  }

  async function save() {
    setError(null);
    setBusy("save");
    try {
      await request(`/api/booklets/${bookletId}/artifacts/${artifactType}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.parse(draft) }),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The artifact could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!detail.currentVersion) return;
    setError(null);
    setBusy("approve");
    try {
      await request(`/api/booklets/${bookletId}/artifacts/${artifactType}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactVersionId: detail.currentVersion.id }),
      });
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "The artifact could not be approved.");
    } finally {
      setBusy(null);
    }
  }

  async function recomposeText(pageId: string) {
    setError(null);
    setBusy("save");
    try {
      await request(`/api/booklets/${bookletId}/pages/${pageId}/text`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readerText: pageText[pageId] }),
      });
    } catch (revisionError) {
      setError(revisionError instanceof Error ? revisionError.message : "The page text could not be recomposed.");
    } finally {
      setBusy(null);
    }
  }

  async function regenerateVisual(pageId: string) {
    setError(null);
    setBusy("save");
    try {
      await request(`/api/booklets/${bookletId}/pages/${pageId}/text`, { method: "POST" });
    } catch (revisionError) {
      setError(revisionError instanceof Error ? revisionError.message : "The page visual could not be regenerated.");
    } finally {
      setBusy(null);
    }
  }

  function applyStoryPageCount() {
    try {
      const content = JSON.parse(draft) as Record<string, unknown>;
      setDraft(JSON.stringify({ ...content, storyPageCount, geometryConfirmed: false }, null, 2));
      setError(null);
    } catch {
      setError("The structured document must be valid JSON before applying a page-count change.");
    }
  }

  return (
    <section aria-label="Selected artifact" className="min-h-80 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-[var(--accent)]">Selected artifact</p>
          <h2 className="mt-1 text-2xl font-semibold">{label}</h2>
        </div>
        <p className="rounded-full border border-[var(--border)] px-3 py-1 text-sm capitalize">{stateLabel(detail.state)}</p>
      </div>
      <p className="mt-3 text-sm text-[var(--muted-ink)]">{detail.currentVersion ? `Version ${detail.currentVersion.versionNumber} is the current structured document.` : "No version has been created yet. Paste a valid structured document to begin."}</p>
      {specification ? <section className="mt-4 rounded-lg bg-[#fffaf2] p-3" aria-label="Story page count"><h3 className="text-sm font-semibold">Story page count</h3><p className="mt-1 text-sm text-[var(--muted-ink)]">Choose 3–8 story pages, apply the change to the draft below, save it as a new version, then confirm geometry.</p><div className="mt-2 flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="story-page-count">Story page count</label><input className="w-20 rounded border border-[var(--border)] px-2 py-1 text-sm" id="story-page-count" max={8} min={3} onChange={(event) => setStoryPageCount(Math.max(3, Math.min(8, Number(event.target.value) || 3)))} type="number" value={storyPageCount} /><button className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)]" onClick={applyStoryPageCount} type="button">Apply page count</button></div></section> : null}
      {pagePackages.length ? <section className="mt-4 grid gap-2" aria-label="Page packages"><h3 className="text-sm font-semibold">Page packages</h3>{pagePackages.map((page) => <article className="rounded-lg bg-[#fffaf2] p-3 text-sm" id={`page-${page.pageId}`} key={page.pageId}><h4 className="font-medium">{page.pageIndex === 0 ? "Cover" : `Story page ${page.pageIndex}`}</h4><p className="mt-1">{page.readerText}</p><p className="mt-1 text-[var(--muted-ink)]">Scene: {page.sceneAction}</p><p className="mt-1 text-[var(--muted-ink)]">Composition: {page.compositionIntent}</p></article>)}</section> : null}
      <label className="mt-4 block text-sm font-semibold" htmlFor={`artifact-${artifactType}`}>Structured document</label>
      <textarea autoComplete="off" className="mt-2 min-h-72 w-full rounded-xl border border-[var(--border)] bg-white p-3 font-mono text-xs leading-5" id={`artifact-${artifactType}`} name={`artifact-${artifactType}`} onChange={(event) => setDraft(event.target.value)} spellCheck={false} value={draft} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy !== null} onClick={() => void save()} type="button">{busy === "save" ? "Saving…" : detail.currentVersion ? "Save new version" : "Create version"}</button>
        {detail.currentVersion && detail.state !== "approved" ? <button className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50" disabled={busy !== null} onClick={() => void approve()} type="button">{busy === "approve" ? "Approving…" : "Approve this version"}</button> : null}
      </div>
      {finalPages.length ? <section className="mt-6 border-t border-[var(--border)] pt-4" aria-label="Page revisions"><h3 className="text-sm font-semibold">Page revisions</h3><p className="mt-1 text-sm text-[var(--muted-ink)]">Text recomposition reuses the source illustration. Visual regeneration creates a new candidate for only the selected page.</p><div className="mt-3 grid gap-3">{finalPages.map((page) => <div className="rounded-lg bg-[#fffaf2] p-3" key={page.pageId}><label className="text-sm font-medium" htmlFor={`page-text-${page.pageId}`}>{page.pageIndex === 0 ? "Cover" : `Story page ${page.pageIndex}`}</label><textarea autoComplete="off" className="mt-2 min-h-20 w-full rounded border border-[var(--border)] bg-white p-2 text-sm" id={`page-text-${page.pageId}`} maxLength={5000} name={`page-text-${page.pageId}`} onChange={(event) => setPageText((current) => ({ ...current, [page.pageId]: event.target.value }))} value={pageText[page.pageId] ?? ""} /><div className="mt-2 flex flex-wrap gap-2"><button className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50" disabled={busy !== null || !(pageText[page.pageId] ?? "").trim()} onClick={() => void recomposeText(page.pageId)} type="button">{busy === "save" ? "Recomposing…" : "Recompose text"}</button><button className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50" disabled={busy !== null} onClick={() => void regenerateVisual(page.pageId)} type="button">Regenerate visual</button></div></div>)}</div></section> : null}
      {error ? <p className="mt-3 rounded-lg border border-red-300 p-2 text-sm text-red-700" role="alert">{error}</p> : null}
      {detail.history.length ? <section className="mt-6 border-t border-[var(--border)] pt-4" aria-label="Artifact history"><h3 className="text-sm font-semibold">Version history</h3><ol className="mt-2 grid gap-2 text-sm">{detail.history.map((version) => <li className="rounded-lg bg-[#fffaf2] p-2" key={version.id}>Version {version.versionNumber} · {version.createdBy}{version.id === detail.currentVersion?.id ? " · current" : ""}</li>)}</ol></section> : null}
    </section>
  );
}
