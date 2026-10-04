import { describe, expect, it } from "vitest";
import {
  currentApprovedSourceIds,
  configuredNarrativeTasks,
  NARRATIVE_DEPENDENCIES,
  NARRATIVE_TASKS,
  type NarrativeTask,
} from "@/lib/experiment-runner/narrative-tasks";

const approved = (taskId: NarrativeTask) => ({
  taskId,
  state: "approved",
  currentVersionId: `${taskId}-version`,
});

describe("narrative task sources", () => {
  it("admits the additional tasks only for a complete distinct saved binding set", () => {
    const bindings = NARRATIVE_TASKS.map((taskId, index) => ({ role: "specialist", taskId,
      appId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      publishedWorkflowId: "00000000-0000-4000-8000-000000000101" }));
    expect(configuredNarrativeTasks(JSON.stringify(bindings))).toEqual(NARRATIVE_TASKS);
    for (const input of [[], bindings.slice(0, 2), bindings.slice(1), [...bindings, bindings[2]],
      bindings.map((item) => ({ ...item, appId: bindings[0].appId })),
      bindings.map((item) => item.taskId === "J05" ? { ...item, publishedWorkflowId: "bad" } : item)]) {
      expect(configuredNarrativeTasks(JSON.stringify(input))).toEqual(["J01", "J02"]);
    }
    expect(configuredNarrativeTasks("bad JSON")).toEqual(["J01", "J02"]);
  });
  it("defines every ordered direct dependency", () => {
    expect(NARRATIVE_TASKS).toEqual(["J01", "J02", "J03", "J04", "J05", "J06", "J07"]);
    expect(NARRATIVE_DEPENDENCIES).toEqual({
      J01: [], J02: ["J01"], J03: ["J01", "J02"], J04: ["J01", "J02"],
      J05: ["J01", "J02", "J03", "J04"], J06: ["J02", "J03", "J05"], J07: ["J02", "J04", "J05"],
    });
  });

  it.each(NARRATIVE_TASKS)("resolves %s in canonical order", (task) => {
    const sources = NARRATIVE_DEPENDENCIES[task].map(approved);
    expect(currentApprovedSourceIds(task, sources)).toEqual(sources.map((source) => source.currentVersionId));
    expect(currentApprovedSourceIds(task, [...sources].reverse())).toEqual(sources.map((source) => source.currentVersionId));
  });

  it("requires both siblings for the manuscript in either arrival order", () => {
    const base = [approved("J01"), approved("J02")];
    expect(currentApprovedSourceIds("J05", [...base, approved("J03")])).toBeNull();
    expect(currentApprovedSourceIds("J05", [...base, approved("J04")])).toBeNull();
    for (const siblings of [[approved("J03"), approved("J04")], [approved("J04"), approved("J03")]]) {
      expect(currentApprovedSourceIds("J05", [...base, ...siblings])).toEqual([
        "J01-version", "J02-version", "J03-version", "J04-version",
      ]);
    }
  });

  it.each(["J06", "J07"] as const)("requires the outline, draft list and manuscript for %s", (task) => {
    const dependencies = NARRATIVE_DEPENDENCIES[task];
    for (const missing of dependencies) {
      expect(currentApprovedSourceIds(task, dependencies.filter((item) => item !== missing).map(approved))).toBeNull();
    }
    expect(currentApprovedSourceIds(task, [...dependencies].reverse().map(approved))).toEqual(
      dependencies.map((item) => `${item}-version`),
    );
  });

  it("rejects missing, unapproved, versionless, and duplicate required artifacts", () => {
    expect(currentApprovedSourceIds("J02", [])).toBeNull();
    for (const state of ["draft", "needs_review", "stale_review"]) {
      expect(currentApprovedSourceIds("J02", [{ ...approved("J01"), state }])).toBeNull();
    }
    for (const currentVersionId of [null, "", " "]) {
      expect(currentApprovedSourceIds("J02", [{ ...approved("J01"), currentVersionId }])).toBeNull();
    }
    expect(currentApprovedSourceIds("J02", [approved("J01"), approved("J01")])).toBeNull();
    expect(currentApprovedSourceIds("J02", [approved("J01"), { ...approved("J01"), state: "draft" }])).toBeNull();
  });

  it("does not alter the input and has no sources for the root task", () => {
    const source = Object.freeze(approved("J01"));
    const artifacts = Object.freeze([source, Object.freeze(approved("J02"))]);
    expect(currentApprovedSourceIds("J03", artifacts)).toEqual(["J01-version", "J02-version"]);
    expect(artifacts).toEqual([source, approved("J02")]);
    expect(currentApprovedSourceIds("J01", [])).toEqual([]);
    expect(currentApprovedSourceIds("J01", artifacts)).toEqual([]);
  });
});
