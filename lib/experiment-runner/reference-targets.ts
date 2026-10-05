import { opaqueIdSchema } from "@/lib/contracts/common";
import { finalCharacterListSchema, finalLocationListSchema } from "@/lib/contracts/experiment-runner";
import { parseReferenceProposal } from "@/lib/contracts/experiment-references";
import { BOOK_TASKS, configuredNarrativeTasks } from "@/lib/experiment-runner/narrative-tasks";

export const SHEET_TASKS = ["J09", "J10"] as const;

// Saved M1/narrative/style configurations keep their original boundary. Both
// sheet owners and an image executor must be present before routing any sheet.
export function configuredReferenceSheetTasks(configurationJson: string): readonly (typeof SHEET_TASKS)[number][] {
  if (configuredNarrativeTasks(configurationJson).length !== BOOK_TASKS.length) return [];
  let entries: unknown;
  try { entries = JSON.parse(configurationJson); } catch { return []; }
  if (!Array.isArray(entries)) return [];
  const rows = entries.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  if (rows.length !== entries.length) return [];
  const appIds: string[] = [];
  for (const task of [...BOOK_TASKS, ...SHEET_TASKS]) {
    const matches = rows.filter((item) => item.role === "specialist" && item.taskId === task);
    if (matches.length !== 1 || !opaqueIdSchema.safeParse(matches[0].appId).success ||
        !opaqueIdSchema.safeParse(matches[0].publishedWorkflowId).success) return [];
    appIds.push(matches[0].appId as string);
  }
  const images = rows.filter((item) => item.role === "image");
  if (images.length !== 1 || images[0].taskId !== null ||
      !opaqueIdSchema.safeParse(images[0].appId).success || !opaqueIdSchema.safeParse(images[0].publishedWorkflowId).success) return [];
  appIds.push(images[0].appId as string);
  return new Set(appIds).size === appIds.length ? SHEET_TASKS : [];
}

export type SheetTarget = {
  taskId: "J09" | "J10";
  subjectKind: "character" | "location";
  subjectId: string;
  sourceVersionIds: [string, string];
};
type Source = { versionId: string; content: unknown };

// The caller establishes current approval. This helper derives targets from
// those saved contents, not model-supplied names or array positions.
export function referenceSheetTargets(sources: { characters: Source; locations: Source; style: Source }): SheetTarget[] {
  const characterVersionId = opaqueIdSchema.parse(sources.characters.versionId);
  const locationVersionId = opaqueIdSchema.parse(sources.locations.versionId);
  const styleVersionId = opaqueIdSchema.parse(sources.style.versionId);
  if (new Set([characterVersionId, locationVersionId, styleVersionId]).size !== 3) throw new Error("Reference source versions must be distinct.");
  const characters = finalCharacterListSchema.parse(sources.characters.content).characters;
  const locations = finalLocationListSchema.parse(sources.locations.content).locations;
  parseReferenceProposal("J08", "assembled", sources.style.content);
  if (characters.some((item) => item.recurrence === "recurring" && !item.sheetRequired)) throw new Error("Recurring characters require reference sheets.");
  return [
    ...characters.filter((item) => item.recurrence === "recurring").map((item): SheetTarget => ({
      taskId: "J09", subjectKind: "character", subjectId: item.characterId,
      sourceVersionIds: [characterVersionId, styleVersionId],
    })),
    ...locations.map((item): SheetTarget => ({
      taskId: "J10", subjectKind: "location", subjectId: item.locationId,
      sourceVersionIds: [locationVersionId, styleVersionId],
    })),
  ].sort((a, b) => a.taskId.localeCompare(b.taskId) || a.subjectId.localeCompare(b.subjectId));
}

export type SheetProjection = { taskId: "J09" | "J10"; subjectKind: "character" | "location"; subjectId: string;
  state: string; currentVersionId: string | null; content: unknown };
export type SheetWork = { kind: "proposal" | "image" | "review"; target: SheetTarget; currentVersionId: string | null };

// This chooses pending work only. Stored bytes, exact approvals, reservations
// and enabled bindings are repository/dispatcher checks, not projection claims.
export function nextReferenceSheetWork(targets: readonly SheetTarget[], saved: readonly SheetProjection[]): SheetWork | null {
  for (const target of targets) {
    const matches = saved.filter((item) => item.taskId === target.taskId && item.subjectKind === target.subjectKind && item.subjectId === target.subjectId);
    if (matches.length > 1) throw new Error("Sheet target has duplicate current artifacts.");
    const current = matches[0];
    if (!current || current.state === "needs_review") return { kind: "proposal", target, currentVersionId: current?.currentVersionId ?? null };
    if (!current.currentVersionId) throw new Error("Current sheet version is missing.");
    opaqueIdSchema.parse(current.currentVersionId);
    const proposal = parseReferenceProposal(target.taskId, "proposal", current.content).content;
    if (!("finalListVersionId" in proposal)) throw new Error("Sheet content is invalid.");
    const subjectId = "characterId" in proposal ? proposal.characterId : proposal.locationId;
    if (subjectId !== target.subjectId || proposal.finalListVersionId !== target.sourceVersionIds[0] || proposal.styleVersionId !== target.sourceVersionIds[1]) {
      throw new Error("Current sheet identity or sources differ from its target.");
    }
    // A malformed build is broken evidence, not permission to generate again.
    if (!Object.prototype.hasOwnProperty.call(current.content, "build")) {
      if (current.state !== "draft") throw new Error("An unassembled sheet cannot be accepted.");
      return { kind: "image", target, currentVersionId: current.currentVersionId };
    }
    parseReferenceProposal(target.taskId, "assembled", current.content);
    if (current.state === "draft") return { kind: "review", target, currentVersionId: current.currentVersionId };
    if (current.state !== "approved") throw new Error("Sheet state requires explicit recovery.");
  }
  return null;
}
