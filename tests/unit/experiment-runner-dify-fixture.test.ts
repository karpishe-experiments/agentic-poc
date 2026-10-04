import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CASES, conceptBriefSchema, resultEnvelopeSchema, storyOutlineSchema } from "@/lib/contracts/experiment-runner";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";

type Context = Parameters<typeof simulateNarrativeResult>[0];
const context = (value: unknown) => value as Context;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const path = resolve("docs/accepted/2026-09-27_dify-booklet-runner/dify/m1-simulation.py");
const program = "import importlib.util,json,sys; s=importlib.util.spec_from_file_location('fixture',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); a=json.load(sys.stdin); print(json.dumps(m.main(**a)))";
function python(authorization: Record<string, unknown>) {
  const args = { authorization_body: JSON.stringify({ data: authorization }), run_id: id(1), operation_id: id(2), workflow_run_id: id(3), parent_workflow_run_id: "" };
  const result = spawnSync("python", ["-c", program, path], { input: JSON.stringify(args), encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" } });
  if (result.status !== 0) throw new Error(result.stderr || `Python exited ${result.status}`);
  return JSON.parse(result.stdout) as { booklet_result: string; authorization_reason: string };
}
function compare(saved: Context) {
  const output = python({ started: true, mode: "simulated", inputFingerprint: "a".repeat(64), context: saved });
  const envelope = JSON.parse(output.booklet_result) as Record<string, unknown>;
  expect(resultEnvelopeSchema.extend({ parentWorkflowRunId: resultEnvelopeSchema.shape.runId.nullable() }).parse(envelope).result).toEqual(simulateNarrativeResult(saved, "simulated"));
  expect(envelope).toMatchObject({ runId: id(1), operationId: id(2), workflowRunId: id(3), parentWorkflowRunId: null, inputFingerprint: "a".repeat(64) });
}
function specialist(persona: keyof typeof CASES, taskId: "J01" | "J02", extra: Record<string, unknown> = {}): Context {
  const concept = taskId === "J02" ? simulateNarrativeResult(specialist(persona, "J01"), "simulated") : null;
  return context({ role: "specialist", taskId, persona, brief: CASES[persona].brief, currentTarget: null, approvedUpstream: concept?.kind === "proposal" ? { id: id(4), content: concept.payload.content } : null, matchingRevision: null, questionAnswers: [], ...extra });
}

describe("Dify M1 Python simulation parity", () => {
  for (const persona of Object.keys(CASES) as (keyof typeof CASES)[]) {
    it(`matches J01, J02, manager, and tester for ${persona}`, () => {
      compare(specialist(persona, "J01"));
      compare(specialist(persona, "J02"));
      compare(context({ role: "manager", eligibleRoute: "J01", run: { bookletId: id(5) } }));
      const draft = { taskId: "J01", subjectKind: "book", subjectId: id(5), state: "draft", currentVersionId: id(6), versions: [{ id: id(6), content: {}, dependencyVersionIds: [] }] };
      compare(context({ role: "tester", persona, bookletId: id(5), pendingDecision: null, activeDelegation: null, creatorMessages: [], currentArtifacts: persona === "professional_creator" ? [draft] : [] }));
    });
  }

  it("approves only a current draft and answers its saved question", () => {
    const current = { id: id(6), taskId: "J01", subjectKind: "book", subjectId: id(5), state: "draft", currentVersionId: id(7), versions: [{ id: id(7), content: {}, dependencyVersionIds: [] }] };
    const stale = { id: id(8), taskId: "J02", subjectKind: "book", subjectId: id(5), state: "needs_review", currentVersionId: id(9), versions: [{ id: id(9), content: {}, dependencyVersionIds: [id(10)] }] };
    const base = { role: "tester", persona: "professional_creator", bookletId: id(5), pendingDecision: null, activeDelegation: null, creatorMessages: [], currentArtifacts: [current, stale] };
    compare(context(base));
    compare(context({ ...base, pendingDecision: { kind: "question", questionId: id(11) } }));
  });

  it("retains revisions, answers, and changed upstream J02 fields", () => {
    const first = simulateNarrativeResult(specialist("professional_creator", "J01"), "simulated");
    const outline = simulateNarrativeResult(specialist("professional_creator", "J02"), "simulated");
    if (first.kind !== "proposal" || outline.kind !== "proposal") throw new Error("Expected proposals");
    const concept = conceptBriefSchema.parse(first.payload.content);
    const savedOutline = storyOutlineSchema.parse(outline.payload.content);
    compare(specialist("professional_creator", "J01", { currentTarget: { currentVersionId: id(4), versions: [{ id: id(4), content: { ...concept, title: "Creator title" } }] }, matchingRevision: { instruction: "Make it curious." }, questionAnswers: [{ taskId: "J01", question: "Robot voice?", answer: "Cheerful." }] }));
    compare(specialist("professional_creator", "J02", { approvedUpstream: { id: id(4), content: { ...concept, title: "New Observatory", premise: "The friends repair a lantern.", knownConstraints: ["Ground the repair."] } }, currentTarget: { state: "needs_review", currentVersionId: id(12), versions: [{ id: id(12), content: savedOutline }] }, matchingRevision: { instruction: "Emphasize trust." }, questionAnswers: [{ taskId: "J02", question: "Ending?", answer: "Warm." }] }));
  });

  it("rejects missing authorization and nonsimulated mode; paused has no result", () => {
    expect(python({ started: false, reason: "paused" })).toEqual({ booklet_result: "", authorization_reason: "paused" });
    expect(() => python({ started: false, reason: "already_started" })).toThrow();
    expect(() => python({ started: true, mode: "real", inputFingerprint: "a".repeat(64), context: specialist("playful_kid", "J01") })).toThrow();
  });
});
