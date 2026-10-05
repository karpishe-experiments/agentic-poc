import { opaqueIdSchema } from "@/lib/contracts/common";
import { BOOK_TASKS } from "@/lib/experiment-runner/narrative-tasks";
import { configuredReferenceSheetTasks, type SheetTarget } from "@/lib/experiment-runner/reference-targets";

const SOURCE_TASKS = ["J01", "J02", "J05", "J06", "J07", "J08"] as const;
const PERSONAS = ["playful_kid", "enthusiast_parent", "professional_creator"] as const;

// Accept either the complete public profile or one complete, persona-filtered
// saved snapshot. This is only configuration eligibility, not dispatch admission.
export function configuredPaginationTask(configurationJson: string): boolean {
  if (configuredReferenceSheetTasks(configurationJson).length !== 2) return false;
  let entries: unknown;
  try { entries = JSON.parse(configurationJson); } catch { return false; }
  if (!Array.isArray(entries) || ![14, 16].includes(entries.length) ||
      entries.some((item) => !item || typeof item !== "object" || Array.isArray(item))) return false;
  const rows = entries as Record<string, unknown>[];
  const expected = [
    { role: "manager", taskId: null, persona: null },
    ...[...BOOK_TASKS, "J09", "J10", "J11"].map((taskId) => ({ role: "specialist", taskId, persona: null })),
    { role: "image", taskId: null, persona: null },
  ];
  const testers = rows.filter((row) => row.role === "tester");
  if (testers.length !== (entries.length === 16 ? 3 : 1) ||
      testers.some((row) => row.taskId !== null || (entries.length === 16 && !PERSONAS.includes(row.persona as typeof PERSONAS[number])) ||
        (entries.length === 14 && row.persona !== undefined && !PERSONAS.includes(row.persona as typeof PERSONAS[number]))) ||
      new Set(testers.map((row) => row.persona)).size !== testers.length) return false;
  if (entries.length === 16 && PERSONAS.some((persona) => !testers.some((row) => row.persona === persona))) return false;
  if (rows.length !== expected.length + testers.length) return false;
  for (const slot of expected) {
    if (rows.filter((row) => row.role === slot.role && row.taskId === slot.taskId &&
        (row.persona ?? null) === slot.persona).length !== 1) return false;
  }
  return rows.every((row) => opaqueIdSchema.safeParse(row.appId).success &&
    opaqueIdSchema.safeParse(row.publishedWorkflowId).success) &&
    new Set(rows.map((row) => row.appId)).size === rows.length;
}

export type PaginationSource = {
  bookletId: string; runId: string; taskId: string;
  subjectKind: "book" | "character" | "location"; subjectId: string;
  state: string; currentVersionId: string | null;
  sourceVersionIds?: readonly string[];
};

// The caller supplies targets derived from current approved J06/J07/J08 content.
// Repository code must still verify exact approval records, assembled sheet
// lineage, and stored asset bytes before admitting J11.
export function currentPaginationSourceIds(
  bookletId: string, runId: string, targets: readonly SheetTarget[], artifacts: readonly PaginationSource[],
): string[] | null {
  if (!opaqueIdSchema.safeParse(bookletId).success || !opaqueIdSchema.safeParse(runId).success) return null;
  const orderedTargets = [...targets].sort((a, b) => a.taskId.localeCompare(b.taskId) || a.subjectId.localeCompare(b.subjectId));
  if (new Set(orderedTargets.map((target) => `${target.taskId}:${target.subjectKind}:${target.subjectId}`)).size !== orderedTargets.length) return null;
  const result: string[] = [];
  for (const taskId of SOURCE_TASKS) {
    const matches = artifacts.filter((item) => item.bookletId === bookletId && item.runId === runId &&
      item.taskId === taskId && item.subjectKind === "book" && item.subjectId === bookletId);
    if (matches.length !== 1 || matches[0].state !== "approved" ||
        !opaqueIdSchema.safeParse(matches[0].currentVersionId).success) return null;
    result.push(matches[0].currentVersionId as string);
  }
  for (const target of orderedTargets) {
    const listVersion = target.taskId === "J09" && target.subjectKind === "character" ? result[3] :
      target.taskId === "J10" && target.subjectKind === "location" ? result[4] : null;
    if (!listVersion || !opaqueIdSchema.safeParse(target.subjectId).success || target.sourceVersionIds.length !== 2 ||
        target.sourceVersionIds[0] !== listVersion || target.sourceVersionIds[1] !== result[5]) return null;
    const matches = artifacts.filter((item) => item.bookletId === bookletId && item.runId === runId &&
      item.taskId === target.taskId && item.subjectKind === target.subjectKind && item.subjectId === target.subjectId);
    if (matches.length !== 1 || matches[0].state !== "approved" ||
        !opaqueIdSchema.safeParse(matches[0].currentVersionId).success ||
        matches[0].sourceVersionIds?.length !== 2 ||
        matches[0].sourceVersionIds?.some((id, index) => id !== target.sourceVersionIds[index])) return null;
    result.push(matches[0].currentVersionId as string);
  }
  return new Set(result).size === result.length ? result : null;
}
