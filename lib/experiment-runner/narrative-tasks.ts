import { opaqueIdSchema } from "@/lib/contracts/common";

export const NARRATIVE_TASKS = ["J01", "J02", "J03", "J04", "J05", "J06", "J07"] as const;

export type NarrativeTask = (typeof NARRATIVE_TASKS)[number];

export function isNarrativeTask(value: unknown): value is NarrativeTask {
  return typeof value === "string" && (NARRATIVE_TASKS as readonly string[]).includes(value);
}

// Old snapshots retain their two-task boundary. A partial M2 binding set is not
// permission to dispatch the additional tasks.
export function configuredNarrativeTasks(configurationJson: string): readonly NarrativeTask[] {
  const legacy = NARRATIVE_TASKS.slice(0, 2);
  let entries: unknown;
  try { entries = JSON.parse(configurationJson); } catch { return legacy; }
  if (!Array.isArray(entries)) return legacy;
  const specialists = entries.filter((item): item is Record<string, unknown> =>
    !!item && typeof item === "object" && item.role === "specialist");
  const appIds: string[] = [];
  for (const task of NARRATIVE_TASKS) {
    const matches = specialists.filter((item) => item.taskId === task);
    if (matches.length !== 1) return legacy;
    const binding = matches[0];
    const appId = opaqueIdSchema.safeParse(binding.appId);
    if (!appId.success || !opaqueIdSchema.safeParse(binding.publishedWorkflowId).success) return legacy;
    appIds.push(appId.data);
  }
  return new Set(appIds).size === NARRATIVE_TASKS.length ? NARRATIVE_TASKS : legacy;
}

export const NARRATIVE_DEPENDENCIES: Readonly<Record<NarrativeTask, readonly NarrativeTask[]>> = {
  J01: [],
  J02: ["J01"],
  J03: ["J01", "J02"],
  J04: ["J01", "J02"],
  J05: ["J01", "J02", "J03", "J04"],
  J06: ["J02", "J03", "J05"],
  J07: ["J02", "J04", "J05"],
};

export function currentApprovedSourceIds(
  task: NarrativeTask,
  artifacts: readonly { taskId?: string | null; state: string; currentVersionId: string | null }[],
): string[] | null {
  const sourceIds: string[] = [];
  for (const dependency of NARRATIVE_DEPENDENCIES[task]) {
    const matches = artifacts.filter((artifact) => artifact.taskId === dependency);
    if (matches.length !== 1 || matches[0].state !== "approved" || !matches[0].currentVersionId?.trim()) {
      return null;
    }
    sourceIds.push(matches[0].currentVersionId);
  }
  return sourceIds;
}
