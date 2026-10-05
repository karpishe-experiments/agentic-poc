import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CASES, type Persona } from "@/lib/contracts/experiment-runner";
import { materializePageLayout } from "@/db/experiment-pages";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";
import { simulatePaginationProposal } from "@/lib/experiment-runner/pagination-fixtures";
import { simulatePageBibleProposal } from "@/lib/experiment-runner/page-bible-fixtures";
import { paginationSources, id } from "@/tests/helpers/pagination-fixtures";

const dir = "docs/accepted/2026-09-27_dify-booklet-runner/dify/";
const source = ["m2-simulation.py", "m3-pagination.py", "m3-page-bible.py"].map((name) => readFileSync(resolve(dir, name), "utf8")).join("\n");
const program = "import json,sys; data=json.load(sys.stdin); scope={}; exec(data['source'],scope); print(json.dumps(scope['main'](**data['args'])))";
function python(context: unknown) {
  const args = { authorization_body: JSON.stringify({ data: { started: true, mode: "simulated", inputFingerprint: "a".repeat(64), context } }),
    run_id: id(1), operation_id: id(2), workflow_run_id: id(3), parent_workflow_run_id: "" };
  const result = spawnSync("python", ["-c", program], { input: JSON.stringify({ source, args }), encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" } });
  if (result.status !== 0) throw new Error(result.stderr || `Python exited ${result.status}`);
  return JSON.parse(JSON.parse(result.stdout).booklet_result).result;
}
function compare(context: unknown) {
  // Parity fixtures project only the fields consumed by the deterministic code.
  // Repository integration tests separately verify full saved context records.
  const expected = simulateNarrativeResult(context as Parameters<typeof simulateNarrativeResult>[0], "simulated");
  expect(python(context)).toEqual(expected);
  return expected;
}
function specialist(persona: Persona, pageIndex: number, extras: Record<string, unknown> = {}) {
  const sources = paginationSources(persona);
  const pagination = simulatePaginationProposal({ persona, sources });
  if (pagination.kind !== "proposal") throw new Error("Expected layout");
  let next = 100;
  const layout = materializePageLayout(persona, pagination.content, null, () => id(next++));
  const page = layout.pages[pageIndex];
  return { role: "specialist" as const, taskId: "J12" as const, subjectKind: "page" as const, subjectId: page.pageId,
    persona, brief: CASES[persona].brief, approvedSources: [
      { taskId: "J11", id: id(90), subjectKind: "book", subjectId: id(1), content: layout },
      sources.find((row) => row.taskId === "J05")!, sources.find((row) => row.taskId === "J08")!,
      ...sources.filter((row) => row.taskId === "J09" || row.taskId === "J10"),
    ], approvedUpstream: null, currentTarget: null, matchingRevision: null, questionAnswers: [], ...extras };
}

describe("M3 J12 Python simulation parity", () => {
  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("matches all %s pages and saved routes", (persona) => {
    for (let index = 0; index <= CASES[persona].storyPages; index++) {
      const result = compare(specialist(persona, index));
      expect(result.kind).toBe("proposal");
    }
  });
  it("delegates only the eligible page and retains pagination fallback", () => {
    compare({ role: "manager", eligibleRoute: "J12", eligibleTarget: { taskId: "J12", subjectKind: "page", subjectId: id(100), pageIndex: 0, sourceVersionIds: [] }, run: { bookletId: id(1) } } as never);
    compare({ role: "manager", eligibleRoute: "J11", run: { bookletId: id(1) } } as never);
    expect(() => python({ role: "manager", eligibleRoute: "J12", eligibleTarget: { taskId: "J12", subjectKind: "book", subjectId: id(100) } })).toThrow();
  });
  it("preserves exact raw lettering and revision context", () => {
    const input = specialist("enthusiast_parent", 1);
    const manuscript = input.approvedSources.find((row) => row.taskId === "J05")!;
    (manuscript.content as { units: { narration: string }[] }).units[0].narration = "  Exact  text\n";
    const first = compare(input);
    if (first.kind !== "proposal") throw new Error("Expected proposal");
    const content = first.payload.content as { panels: { lettering: { text: string }[] }[] };
    expect(content.panels[0].lettering[0].text).toBe("  Exact  text\n");
    compare({ ...input, currentTarget: { state: "draft", currentVersionId: id(99), versions: [{ id: id(99), content: first.payload.content }] },
      matchingRevision: { instruction: "Keep the beat quiet." }, questionAnswers: [{ taskId: "J12", question: "Tone?", answer: "Gentle." }] } as never);
  });
  it("asks a material clarification until the page question is answered", () => {
    const input = specialist("playful_kid", 1, { materialQuestion: "Which beat?" });
    const expected = simulatePageBibleProposal({ persona: input.persona, pageId: input.subjectId, sources: input.approvedSources,
      materialQuestion: "Which beat?" });
    expect(python(input)).toEqual({ kind: "clarification", payload: { question: expected.kind === "clarification" ? expected.question : "" } });
    const answered = { ...input, questionAnswers: [{ taskId: "J12", question: "Which beat?", answer: "The rescue." }] };
    expect(python(answered).kind).toBe("proposal");
  });
  it("rejects invalid page and source identities", () => {
    const input = specialist("playful_kid", 1);
    for (const bad of [{ ...input, subjectId: id(999) }, { ...input, subjectId: "invalid" },
      { ...input, approvedSources: input.approvedSources.filter((row) => row.taskId !== "J11") },
      { ...input, approvedSources: input.approvedSources.map((row) => row.taskId === "J08" ? { ...row, id: "invalid" } : row) }]) {
      expect(() => python(bad)).toThrow();
    }
  });
});
