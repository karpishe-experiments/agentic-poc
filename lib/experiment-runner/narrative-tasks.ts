export const NARRATIVE_TASKS = ["J01", "J02", "J03", "J04", "J05", "J06", "J07"] as const;

export type NarrativeTask = (typeof NARRATIVE_TASKS)[number];

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
