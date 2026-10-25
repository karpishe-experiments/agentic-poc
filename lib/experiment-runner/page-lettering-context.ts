import { storedManuscriptSchema, type Persona } from "@/lib/contracts/experiment-runner";
import { parseStoredPageLayout } from "@/lib/contracts/experiment-pages";

/** Current routing only: never infer required words from older page drafts. */
export function pageLetteringContext(persona: Persona, pageId: string, rawLayout: unknown, rawManuscript: unknown) {
  const layout = parseStoredPageLayout(persona, rawLayout);
  const manuscript = storedManuscriptSchema.parse(rawManuscript);
  const originals = rawManuscript as { units: { narration: string; dialogue: { text: string }[] }[] };
  const selected = layout.pages.find(page => page.pageId === pageId);
  if (!selected) throw new Error("Selected page is absent from current layout.");
  const first = new Map<string, string>();
  for (const page of layout.pages.slice(1)) for (const panel of page.panels) for (const unitId of panel.manuscriptUnitIds) {
    if (!first.has(unitId)) first.set(unitId, `${page.pageId}:${panel.panelKey}`);
  }
  return selected.panels.map((panel, index) => ({ panelKey: panel.panelKey,
    lettering: selected.pageIndex === 0 && index === 0 ? [{ kind: "title", text: layout.title, speakerId: null }] :
      panel.manuscriptUnitIds.filter(unitId => first.get(unitId) === `${selected.pageId}:${panel.panelKey}`).flatMap(unitId => {
        const unitIndex = manuscript.units.findIndex(unit => unit.unitId === unitId);
        if (unitIndex < 0) throw new Error("Selected page routes an unknown manuscript unit.");
        const unit = manuscript.units[unitIndex], original = originals.units[unitIndex];
        return [{ kind: "narration", text: original.narration, speakerId: null as string | null },
          ...unit.dialogue.map((line, lineIndex) => ({ kind: "speech", text: original.dialogue[lineIndex].text, speakerId: line.speakerId }))];
      }) }));
}
