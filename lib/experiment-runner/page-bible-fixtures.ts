import { storedManuscriptSchema, type Persona } from "@/lib/contracts/experiment-runner";
import { parseStoredPageLayout, type PageSubjectProposal } from "@/lib/contracts/experiment-pages";
import { parsePageBibleForLayout } from "@/lib/experiment-runner/page-bible-tasks";

type Source = { taskId: string; id: string; content: unknown };
type Input = { persona: Persona; pageId: string; sources: Source[]; currentContent?: unknown;
  sourceChanged?: boolean; revision?: string; answers?: string[]; materialQuestion?: string };

// Deterministic J12 preparation. The repository still proves approvals and bytes.
// Each manuscript unit's lettering goes to its first routed story panel; later
// panels can carry the same action without duplicating the approved words.
export function simulatePageBibleProposal(input: Input):
  | { kind: "clarification"; question: string }
  | { kind: "proposal"; content: PageSubjectProposal } {
  if (input.materialQuestion && !input.answers?.some((answer) => answer.startsWith(`${input.materialQuestion}: `))) {
    return { kind: "clarification", question: input.materialQuestion };
  }
  const source = (taskId: string) => {
    const matches = input.sources.filter((item) => item.taskId === taskId);
    if (matches.length !== 1) throw new Error(`J12 requires one ${taskId} source.`);
    return matches[0];
  };
  const layoutSource = source("J11"), manuscriptSource = source("J05"), styleSource = source("J08");
  const layout = parseStoredPageLayout(input.persona, layoutSource.content);
  const manuscript = storedManuscriptSchema.parse(manuscriptSource.content);
  // The narrative schema trims text during validation. Approved lettering must
  // use its saved original strings, not that normalized projection.
  const original = manuscriptSource.content as { units: { narration: string; dialogue: { text: string }[] }[] };
  manuscript.units = manuscript.units.map((unit, index) => ({ ...unit, narration: original.units[index].narration,
    dialogue: unit.dialogue.map((line, lineIndex) => ({ ...line, text: original.units[index].dialogue[lineIndex].text })) }));
  const page = layout.pages.find((item) => item.pageId === input.pageId);
  if (!page) throw new Error("J12 selected page is missing from J11.");
  const firstPanel = new Map<string, string>();
  for (const item of layout.pages.slice(1)) for (const panel of item.panels) for (const unitId of panel.manuscriptUnitIds) {
    if (!firstPanel.has(unitId)) firstPanel.set(unitId, `${item.pageId}:${panel.panelKey}`);
  }
  const expected = { persona: input.persona, pageId: input.pageId, layout, layoutVersionId: layoutSource.id,
    manuscriptVersionId: manuscriptSource.id, styleVersionId: styleSource.id };
  const previous = input.currentContent !== undefined && !input.sourceChanged
    ? parsePageBibleForLayout({ ...expected, proposal: input.currentContent }).content : null;
  const treatment = (kind: "title" | "narration" | "speech") => layout.typography.find((item) => item.kind === kind)!;
  const panels = page.panels.map((panel, panelIndex) => {
    const units = panel.manuscriptUnitIds.map((id) => {
      const unit = manuscript.units.find((item) => item.unitId === id);
      if (!unit) throw new Error("J12 routes an unknown manuscript unit.");
      return unit;
    });
    const line = (kind: "title" | "narration" | "speech", text: string, speakerEntityId: string | null): PageSubjectProposal["panels"][number]["lettering"][number] => ({
      kind, text, form: kind === "title" ? "display" : kind === "speech" ? "bubble" : "caption", speakerEntityId,
      panelKey: panel.panelKey, placement: "Inside the approved live text safe region, clear of faces and action.",
      typographyTreatment: `${treatment(kind).fontDirection} ${treatment(kind).sizeHierarchy}`,
      bubbleTreatment: treatment(kind).containerTreatment,
    });
    const lettering = previous?.panels[panelIndex].lettering ?? (page.pageIndex === 0 && panelIndex === 0
      ? [line("title", layout.title, null)] : units.filter((unit) => firstPanel.get(unit.unitId) === `${page.pageId}:${panel.panelKey}`)
        .flatMap((unit) => [line("narration", unit.narration, null), ...unit.dialogue.map((dialogue) => line("speech", dialogue.text, dialogue.speakerId))]));
    const prior = previous?.panels[panelIndex];
    return { panelKey: panel.panelKey, manuscriptUnitIds: panel.manuscriptUnitIds, sheetReferences: panel.sheetReferences,
      actionBeat: prior?.actionBeat ?? (units.map((unit) => unit.action).join(" ") || "Present the approved cover title."),
      emotionalBeat: prior?.emotionalBeat ?? "Keep the fixed brief's emotional promise clear.",
      composition: `${prior?.composition ?? "Use the approved sheet references, panel allocation and clear focal action."}${input.revision ? ` Revision request: ${input.revision}` : ""}`,
      characterIds: panel.sheetReferences.filter((item) => item.subjectKind === "character").map((item) => item.subjectId),
      locationIds: panel.sheetReferences.filter((item) => item.subjectKind === "location").map((item) => item.subjectId),
      lettering, noText: lettering.length === 0 };
  });
  return { kind: "proposal", content: parsePageBibleForLayout({ ...expected, proposal: {
    schemaVersion: "2", pageId: page.pageId, pageIndex: page.pageIndex, layoutVersionId: layoutSource.id,
    manuscriptVersionId: manuscriptSource.id, styleVersionId: styleSource.id, panels,
    reviewQuestions: [...(previous?.reviewQuestions ?? ["Does this page preserve the approved story and lettering?"]), ...(input.answers ?? [])],
  } }).content };
}
