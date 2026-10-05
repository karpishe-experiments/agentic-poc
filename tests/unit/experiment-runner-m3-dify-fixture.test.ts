import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CASES, type Persona } from "@/lib/contracts/experiment-runner";
import { parsePageProposal } from "@/lib/contracts/experiment-pages";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";
import { paginationSources, id } from "@/tests/helpers/pagination-fixtures";

const dir = "docs/accepted/2026-09-27_dify-booklet-runner/dify/";
const source = readFileSync(resolve(dir, "m2-simulation.py"), "utf8") + "\n" + readFileSync(resolve(dir, "m3-pagination.py"), "utf8");
const program = "import json,sys; data=json.load(sys.stdin); scope={}; exec(data['source'],scope); print(json.dumps(scope['main'](**data['args'])))";
function python(context: unknown) {
  const args = { authorization_body: JSON.stringify({ data: { started: true, mode: "simulated", inputFingerprint: "a".repeat(64), context } }),
    run_id: id(1), operation_id: id(2), workflow_run_id: id(3), parent_workflow_run_id: "" };
  const result = spawnSync("python", ["-c", program], { input: JSON.stringify({ source, args }), encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" } });
  if (result.status !== 0) throw new Error(result.stderr || `Python exited ${result.status}`);
  return JSON.parse(JSON.parse(result.stdout).booklet_result).result as ReturnType<typeof simulateNarrativeResult>;
}
function compare(context: unknown) {
  const expected = simulateNarrativeResult(context as Parameters<typeof simulateNarrativeResult>[0], "simulated");
  expect(python(context)).toEqual(expected);
  return expected;
}
function specialist(persona: Persona, extras: Record<string, unknown> = {}) {
  return { role: "specialist", taskId: "J11", persona, brief: CASES[persona].brief, approvedSources: paginationSources(persona),
    currentTarget: null, matchingRevision: null, questionAnswers: [], ...extras };
}

describe("M3 J11 Python simulation parity", () => {
  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("matches %s layout and all routed sheets", (persona) => {
    const result = compare(specialist(persona));
    if (result.kind !== "proposal") throw new Error("Expected J11 proposal");
    const pages = parsePageProposal("J11", persona, result.payload.content).content.pages;
    expect(pages).toHaveLength(CASES[persona].storyPages + 1);
    expect(pages[0].panels[0].sheetReferences).toEqual([]);
    if (persona === "professional_creator") expect(pages.flatMap((page) => page.panels)
      .some((panel) => panel.sheetReferences.some((ref) => ref.subjectId === id(21)))).toBe(true);
  });
  it("matches manager book delegation and tester J11 review", () => {
    compare({ role: "manager", eligibleRoute: "J11", run: { bookletId: id(5) } });
    compare({ role: "manager", eligibleRoute: "J01", run: { bookletId: id(5) } });
    compare({ role: "tester", pendingDecision: { kind: "question", taskId: "J11", questionId: id(44) } });
    compare({ role: "tester", pendingDecision: { kind: "question", taskId: "J09", questionId: id(45) } });
    const version = { id: id(99), dependencyVersionIds: [id(1)], content: {}, sourceVersionId: null };
    compare({ role: "tester", persona: "professional_creator", bookletId: id(5), currentArtifacts: [
      { taskId: "J01", state: "approved", currentVersionId: id(1), versions: [] },
      { taskId: "J11", state: "draft", currentVersionId: version.id, versions: [version] },
    ], creatorMessages: [{ id: id(6) }], pendingDecision: null, activeDelegation: null });
    compare({ role: "tester", persona: "playful_kid", bookletId: id(5), currentArtifacts: [], creatorMessages: [],
      pendingDecision: null, activeDelegation: null, eligibleTaskIds: ["J01", "J11"] });
  });
  it("preserves revision canvas and refreshes stale references", () => {
    const original = compare(specialist("playful_kid"));
    if (original.kind !== "proposal") throw new Error("Expected proposal");
    const content = { ...(original.payload.content as Record<string, unknown>), canvas: { ...(original.payload.content as { canvas: object }).canvas,
      workingPixels: { width: 1024, height: 1024 } } };
    const currentTarget = { state: "needs_review", currentVersionId: id(99), versions: [{ id: id(99), content, dependencyVersionIds: [] }] };
    const updated = paginationSources("playful_kid");
    (updated.find((row) => row.taskId === "J09")!.content as { build: { assetId: string } }).build.assetId = id(999);
    compare(specialist("playful_kid", { approvedSources: updated, currentTarget, matchingRevision: { instruction: "Keep the opening quiet." },
      questionAnswers: [{ question: "Who is shown?", answer: "The robot.", taskId: "J11" }] }));
  });
  it("rejects missing sheet and malformed manager target", () => {
    expect(() => python(specialist("playful_kid", { approvedSources: paginationSources("playful_kid").filter((row) => row.taskId !== "J10") }))).toThrow();
    expect(() => python({ role: "manager", eligibleRoute: "J09", eligibleTarget: { taskId: "J09", subjectKind: "location", subjectId: id(1) } })).toThrow();
  });
});
