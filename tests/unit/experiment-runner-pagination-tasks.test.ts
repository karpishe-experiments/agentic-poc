import { describe, expect, it } from "vitest";
import { configuredPaginationTask, currentPaginationSourceIds, type PaginationSource } from "@/lib/experiment-runner/pagination-tasks";
import type { SheetTarget } from "@/lib/experiment-runner/reference-targets";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const bookletId = id(1), runId = id(2);
const tasks = Array.from({ length: 11 }, (_, n) => `J${String(n + 1).padStart(2, "0")}`);
const personas = ["playful_kid", "enthusiast_parent", "professional_creator"];
const profile = [
  { role: "manager", taskId: null, persona: null },
  ...tasks.map((taskId) => ({ role: "specialist", taskId, persona: null })),
  ...personas.map((persona) => ({ role: "tester", taskId: null, persona })),
  { role: "image", taskId: null, persona: null },
].map((row, n) => ({ ...row, appId: id(n + 10), publishedWorkflowId: id(n + 40) }));
const fixed = ["J01", "J02", "J05", "J06", "J07", "J08"].map((taskId, n): PaginationSource => ({
  bookletId, runId, taskId, subjectKind: "book", subjectId: bookletId, state: "approved", currentVersionId: id(n + 100),
}));
const targets: SheetTarget[] = [
  { taskId: "J09", subjectKind: "character", subjectId: id(201), sourceVersionIds: [id(103), id(105)] },
  { taskId: "J09", subjectKind: "character", subjectId: id(200), sourceVersionIds: [id(103), id(105)] },
  { taskId: "J10", subjectKind: "location", subjectId: id(203), sourceVersionIds: [id(104), id(105)] },
  { taskId: "J10", subjectKind: "location", subjectId: id(202), sourceVersionIds: [id(104), id(105)] },
];
const sheets = targets.map((target, n): PaginationSource => ({ bookletId, runId, taskId: target.taskId,
  subjectKind: target.subjectKind, subjectId: target.subjectId, state: "approved", currentVersionId: id(n + 110),
  sourceVersionIds: target.sourceVersionIds }));

describe("J11 local source projection", () => {
  it("enables only complete public and saved persona profiles", () => {
    expect(configuredPaginationTask(JSON.stringify(profile))).toBe(true);
    const saved = profile.filter((row) => row.role !== "tester" || row.persona === personas[0]).map((row) => {
      const snapshot = { ...row };
      Reflect.deleteProperty(snapshot, "persona");
      return snapshot;
    });
    expect(configuredPaginationTask(JSON.stringify(saved))).toBe(true);
    for (const rows of [profile.filter((row) => row.taskId !== "J11"), profile.filter((row) => row.taskId !== "J10"),
      [...profile.slice(0, -1), profile[0]], profile.map((row, n) => n === 15 ? { ...row, appId: profile[0].appId } : row),
      profile.map((row, n) => n === 11 ? { ...row, publishedWorkflowId: "" } : row),
      profile.map((row, n) => n === 0 ? { ...row, taskId: "J01" } : row),
      profile.filter((row) => row.role !== "tester" || row.persona === personas[0]).map((row) => row.taskId === "J11" ? { ...row, role: "image" } : row)]) {
      expect(configuredPaginationTask(JSON.stringify(rows))).toBe(false);
    }
    expect(configuredPaginationTask("invalid")).toBe(false);
  });

  it("projects fixed book sources then every sheet by task and subject ID", () => {
    const expected = [...fixed.map((item) => item.currentVersionId), id(111), id(110), id(113), id(112)];
    expect(currentPaginationSourceIds(bookletId, runId, targets, [...sheets, ...fixed].reverse())).toEqual(expected);
    expect(currentPaginationSourceIds(bookletId, runId, targets.slice(0, 3), [...sheets, ...fixed])).toHaveLength(9);
  });

  it("rejects missing, ambiguous, unapproved and stale required sheets", () => {
    const all = [...fixed, ...sheets];
    for (const bad of [all.slice(0, -1), [...all, sheets[3]], all.map((row) => row === sheets[3] ? { ...row, state: "draft" } : row),
      all.map((row) => row === sheets[3] ? { ...row, sourceVersionIds: [id(999), id(105)] } : row),
      all.map((row) => row === sheets[3] ? { ...row, runId: id(999) } : row),
      all.map((row) => row === sheets[3] ? { ...row, currentVersionId: " " } : row),
      all.map((row) => row === sheets[3] ? { ...row, currentVersionId: "not-a-uuid" } : row)]) {
      expect(currentPaginationSourceIds(bookletId, runId, targets, bad)).toBeNull();
    }
    expect(currentPaginationSourceIds(bookletId, runId, targets, [...all, fixed[0]])).toBeNull();
    expect(currentPaginationSourceIds(bookletId, runId, [...targets, targets[0]], all)).toBeNull();
    expect(currentPaginationSourceIds(bookletId, runId, targets.map((target, n) => n === 3 ? { ...target, sourceVersionIds: [id(999), id(105)] } : target), all)).toBeNull();
  });
});
