"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ArtifactDetail } from "@/lib/contracts/artifacts";
import type { ArtifactType } from "@/lib/contracts/domain";

type ApiResponse = { data?: ArtifactDetail; error?: { message?: string } };
type VisualDefinition = { entityId: string; name: string; visualDetails: string[]; continuityConstraints: string[]; referenceRequired: boolean; currentReferenceAssetId: string | null; revisionNumber: number };
type StoryPlan = {
  premise: string;
  theme: string;
  characters: Array<{ name: string; narrativeRole: string; goal: string; recurringVisualSubject: boolean }>;
  settings: Array<{ name: string; narrativeRole: string; recurringVisualSubject: boolean }>;
  storyArc: string;
  keyEvents: string[];
  ending: string;
  ageFitNotes: string;
  continuityConstraints: string[];
};

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
  const [busy, setBusy] = useState<"save" | "approve" | "upgrade" | null>(null);
  const [advancedDocumentOpen, setAdvancedDocumentOpen] = useState(!detail.currentVersion);
  const finalPages = artifactType === "final_pages" && detail.currentVersion?.content && typeof detail.currentVersion.content === "object" && "pages" in detail.currentVersion.content
    ? (detail.currentVersion.content as { pages: Array<{ pageId: string; pageIndex: number; readerText: string }> }).pages
    : [];
  const pagePackages = artifactType === "page_plan" && detail.currentVersion?.content && typeof detail.currentVersion.content === "object" && "pages" in detail.currentVersion.content
    ? (detail.currentVersion.content as { pages: Array<{ pageId: string; pageIndex: number; kind: "cover" | "story"; readerText: string; sceneAction: string; compositionIntent: string; lettering?: Array<{ kind: string; text: string; speakerEntityId?: string | null; delivery: string; placementHint: string }> }> }).pages
    : [];
  const specification = artifactType === "booklet_specification" && detail.currentVersion?.content && typeof detail.currentVersion.content === "object" && "storyPageCount" in detail.currentVersion.content
    ? detail.currentVersion.content as { storyPageCount: number }
    : null;
  const storyPlan = artifactType === "story_plan" && detail.currentVersion?.content && typeof detail.currentVersion.content === "object" && "characters" in detail.currentVersion.content && "settings" in detail.currentVersion.content
    ? detail.currentVersion.content as StoryPlan
    : null;
  let visualBible: { characters: VisualDefinition[]; locations: VisualDefinition[] } | null = null;
  if (artifactType === "visual_bible") {
    try {
      const candidate = JSON.parse(draft) as { characters?: VisualDefinition[]; locations?: VisualDefinition[] };
      if (Array.isArray(candidate.characters) && Array.isArray(candidate.locations)) visualBible = { characters: candidate.characters, locations: candidate.locations };
    } catch {
      // The raw editor deliberately allows incomplete JSON while the user is typing.
    }
  }
  const [storyPageCount, setStoryPageCount] = useState(() => specification?.storyPageCount ?? 3);
  const needsComicLetteringUpgrade = pagePackages.some((page) => !page.lettering?.length);

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

  async function upgradeComicLettering() {
    setError(null);
    setBusy("upgrade");
    try {
      await request(`/api/booklets/${bookletId}/page-plan/comic-lettering`, { method: "POST" });
    } catch (upgradeError) {
      setError(upgradeError instanceof Error ? upgradeError.message : "The Page Plan could not be upgraded to comic lettering.");
    } finally {
      setBusy(null);
    }
  }

  async function applyStoryPageCount() {
    try {
      const content = JSON.parse(draft) as Record<string, unknown>;
      const updated = { ...content, storyPageCount, geometryConfirmed: false };
      setDraft(JSON.stringify(updated, null, 2));
      setError(null);
      setBusy("save");
      await request(`/api/booklets/${bookletId}/artifacts/${artifactType}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: updated }),
      });
    } catch {
      setError("The page count could not be saved. The structured document must be valid JSON.");
    } finally {
      setBusy(null);
    }
  }

  function updateVisualDefinition(entityId: string, field: "name" | "visualDetails" | "continuityConstraints", value: string) {
    try {
      const content = JSON.parse(draft) as { characters?: VisualDefinition[]; locations?: VisualDefinition[] };
      const update = (definition: VisualDefinition) => definition.entityId !== entityId ? definition : {
        ...definition,
        [field]: field === "name" ? value : value.split("\n").map((item) => item.trim()).filter(Boolean),
      };
      setDraft(JSON.stringify({ ...content, characters: content.characters?.map(update), locations: content.locations?.map(update) }, null, 2));
      setError(null);
    } catch {
      setError("The structured document must be valid JSON before editing an entity card.");
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
      {specification ? <section className="mt-4 rounded-lg bg-[#fffaf2] p-3" aria-label="Story page count"><h3 className="text-sm font-semibold">Story page count</h3><p className="mt-1 text-sm text-[var(--muted-ink)]">Choose 3–8 story pages, save the count, then confirm geometry.</p><div className="mt-2 flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="story-page-count">Story page count</label><input className="w-20 rounded border border-[var(--border)] px-2 py-1 text-sm" disabled={busy !== null} id="story-page-count" max={8} min={3} onChange={(event) => setStoryPageCount(Math.max(3, Math.min(8, Number(event.target.value) || 3)))} type="number" value={storyPageCount} /><button className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50" disabled={busy !== null} onClick={() => void applyStoryPageCount()} type="button">{busy === "save" ? "Saving…" : "Save page count"}</button></div></section> : null}
      {pagePackages.length ? <section className="mt-4 grid gap-2" aria-label="Page packages"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Page packages</h3>{needsComicLetteringUpgrade ? <button className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[#fff2e4] focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50" disabled={busy !== null} onClick={() => void upgradeComicLettering()} type="button">{busy === "upgrade" ? "Upgrading…" : "Upgrade to Comic Lettering"}</button> : null}</div>{needsComicLetteringUpgrade ? <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">This legacy Page Plan remains readable, but page generation is blocked until you upgrade and approve professional comic lettering.</p> : null}{pagePackages.map((page) => <article className="rounded-lg bg-[#fffaf2] p-3 text-sm" id={`page-${page.pageId}`} key={page.pageId}><h4 className="font-medium">{page.pageIndex === 0 ? "Cover" : `Story page ${page.pageIndex}`}</h4><p className="mt-1">{page.readerText}</p>{page.lettering?.length ? <ol className="mt-2 grid gap-2" aria-label={`${page.pageIndex === 0 ? "Cover" : `Story page ${page.pageIndex}`} lettering`}>{page.lettering.map((element, index) => <li className="rounded border border-[var(--border)] bg-white p-2" key={`${element.kind}-${index}`}><span className="font-semibold capitalize">{element.kind.replaceAll("_", " ")}</span>{element.speakerEntityId ? <span className="text-[var(--muted-ink)]"> · speaker {element.speakerEntityId}</span> : null}<span className="block break-words">“{element.text}”</span><span className="block text-[var(--muted-ink)]">{element.delivery} · {element.placementHint}</span></li>)}</ol> : null}<p className="mt-2 text-[var(--muted-ink)]">Scene: {page.sceneAction}</p><p className="mt-1 text-[var(--muted-ink)]">Composition: {page.compositionIntent}</p></article>)}</section> : null}
      {storyPlan ? <section className="mt-4 grid gap-3" aria-label="Story Plan details"><h3 className="text-sm font-semibold">Story at a glance</h3><dl className="grid gap-2 rounded-lg bg-[#fffaf2] p-3 text-sm"><div><dt className="font-medium">Premise</dt><dd>{storyPlan.premise}</dd></div><div><dt className="font-medium">Theme</dt><dd>{storyPlan.theme}</dd></div><div><dt className="font-medium">Story arc</dt><dd>{storyPlan.storyArc}</dd></div><div><dt className="font-medium">Ending</dt><dd>{storyPlan.ending}</dd></div><div><dt className="font-medium">Age fit</dt><dd>{storyPlan.ageFitNotes}</dd></div></dl><div className="grid gap-3 sm:grid-cols-2"><section className="rounded-lg bg-[#fffaf2] p-3"><h4 className="text-sm font-medium">Characters</h4><ul className="mt-2 grid gap-2 text-sm">{storyPlan.characters.map((character) => <li key={character.name}><span className="font-medium">{character.name}</span> · {character.narrativeRole}<span className="block text-[var(--muted-ink)]">Goal: {character.goal}{character.recurringVisualSubject ? " · canonical reference planned" : ""}</span></li>)}</ul></section><section className="rounded-lg bg-[#fffaf2] p-3"><h4 className="text-sm font-medium">Locations</h4><ul className="mt-2 grid gap-2 text-sm">{storyPlan.settings.map((setting) => <li key={setting.name}><span className="font-medium">{setting.name}</span> · {setting.narrativeRole}{setting.recurringVisualSubject ? <span className="block text-[var(--muted-ink)]">Canonical reference planned</span> : null}</li>)}</ul></section></div><section className="rounded-lg bg-[#fffaf2] p-3"><h4 className="text-sm font-medium">Story beats</h4><ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{storyPlan.keyEvents.map((event) => <li key={event}>{event}</li>)}</ol></section><section className="rounded-lg bg-[#fffaf2] p-3"><h4 className="text-sm font-medium">Continuity constraints</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{storyPlan.continuityConstraints.map((constraint) => <li key={constraint}>{constraint}</li>)}</ul></section></section> : null}
      {visualBible ? <section className="mt-4 grid gap-3" aria-label="Visual Bible definitions"><h3 className="text-sm font-semibold">Character & location definitions</h3><p className="text-sm text-[var(--muted-ink)]">These subjects are derived from the approved Story Plan. A canonical reference is generated only when the story needs the subject to recur visually.</p>{([['Character', visualBible.characters], ['Location', visualBible.locations]] as const).flatMap(([kind, definitions]) => definitions.map((definition) => <article className="rounded-lg bg-[#fffaf2] p-3" key={definition.entityId}><p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">{kind}{definition.referenceRequired ? " · canonical reference required" : " · definition only"}</p><p className="mt-1 text-sm text-[var(--muted-ink)]">{definition.referenceRequired ? "This recurring subject will receive one canonical reference image after approval." : "This subject stays consistent in the plan without creating a separate reference image."}</p><label className="mt-2 block text-sm font-medium" htmlFor={`entity-name-${definition.entityId}`}>Name</label><input autoComplete="off" className="mt-1 w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-sm" id={`entity-name-${definition.entityId}`} name={`entity-name-${definition.entityId}`} onChange={(event) => updateVisualDefinition(definition.entityId, "name", event.target.value)} value={definition.name} /><label className="mt-2 block text-sm font-medium" htmlFor={`entity-details-${definition.entityId}`}>Canonical visual details</label><textarea autoComplete="off" className="mt-1 min-h-20 w-full rounded border border-[var(--border)] bg-white p-2 text-sm" id={`entity-details-${definition.entityId}`} name={`entity-details-${definition.entityId}`} onChange={(event) => updateVisualDefinition(definition.entityId, "visualDetails", event.target.value)} value={definition.visualDetails.join("\n")} /><label className="mt-2 block text-sm font-medium" htmlFor={`entity-continuity-${definition.entityId}`}>Continuity constraints</label><textarea autoComplete="off" className="mt-1 min-h-16 w-full rounded border border-[var(--border)] bg-white p-2 text-sm" id={`entity-continuity-${definition.entityId}`} name={`entity-continuity-${definition.entityId}`} onChange={(event) => updateVisualDefinition(definition.entityId, "continuityConstraints", event.target.value)} value={definition.continuityConstraints.join("\n")} /></article>))}</section> : null}
      <details className="mt-5 rounded-xl border border-[var(--border)] bg-[#fffaf2] p-3" onToggle={(event) => setAdvancedDocumentOpen(event.currentTarget.open)} open={advancedDocumentOpen}>
        <summary className="cursor-pointer font-semibold">Advanced structured document</summary>
        <p className="mt-2 text-sm text-[var(--muted-ink)]">Use JSON only for advanced changes. Normal reviews above show the creator-facing details.</p>
        <label className="mt-4 block text-sm font-semibold" htmlFor={`artifact-${artifactType}`}>Structured document</label>
        <textarea autoComplete="off" className="mt-2 min-h-72 w-full rounded-xl border border-[var(--border)] bg-white p-3 font-mono text-xs leading-5" id={`artifact-${artifactType}`} name={`artifact-${artifactType}`} onChange={(event) => setDraft(event.target.value)} spellCheck={false} value={draft} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy !== null} onClick={() => void save()} type="button">{busy === "save" ? "Saving…" : detail.currentVersion ? "Save new version" : "Create version"}</button>
          {detail.currentVersion && detail.state !== "approved" ? <button className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50" disabled={busy !== null} onClick={() => void approve()} type="button">{busy === "approve" ? "Approving…" : "Approve this version"}</button> : null}
        </div>
      </details>
      {finalPages.length ? <section className="mt-6 border-t border-[var(--border)] pt-4" aria-label="Page revisions"><h3 className="text-sm font-semibold">Page revisions</h3><p className="mt-1 text-sm text-[var(--muted-ink)]">Use the final-page review gallery to preview each image and regenerate a selected page with an optional visual instruction. Revise story copy in the Page Plan so the approved lettering remains authoritative.</p><div className="mt-3 flex flex-wrap gap-2">{finalPages.map((page) => <button className="rounded-lg border border-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[#fff2e4] focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50" disabled={busy !== null} key={page.pageId} onClick={() => void regenerateVisual(page.pageId)} type="button">Regenerate {page.pageIndex === 0 ? "Cover" : `Story Page ${page.pageIndex}`}</button>)}</div></section> : null}
      {error ? <p className="mt-3 rounded-lg border border-red-300 p-2 text-sm text-red-700" role="alert">{error}</p> : null}
      {detail.history.length ? <section className="mt-6 border-t border-[var(--border)] pt-4" aria-label="Artifact history"><h3 className="text-sm font-semibold">Version history</h3><ol className="mt-2 grid gap-2 text-sm">{detail.history.map((version) => <li className="rounded-lg bg-[#fffaf2] p-2" key={version.id}>Version {version.versionNumber} · {version.createdBy}{version.id === detail.currentVersion?.id ? " · current" : ""}</li>)}</ol></section> : null}
    </section>
  );
}
