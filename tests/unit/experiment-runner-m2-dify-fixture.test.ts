import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CASES, resultEnvelopeSchema } from "@/lib/contracts/experiment-runner";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";

type Context = Parameters<typeof simulateNarrativeResult>[0];
const context = (value: unknown) => value as Context;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const path = resolve("docs/accepted/2026-09-27_dify-booklet-runner/dify/m2-simulation.py");
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
  return (envelope.result as { payload: { content: Record<string, unknown> } }).payload.content;
}
type Persona = keyof typeof CASES;
type Task = "J01" | "J02" | "J03" | "J04" | "J05" | "J06" | "J07";
function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortedKeys(item)]));
  return value;
}
function chain(persona: Persona) {
  const sources: { taskId: Task; id: string; content: unknown }[] = [];
  const make = (taskId: Task, extra: Record<string, unknown> = {}) => context({
    role: "specialist", taskId, persona, brief: CASES[persona].brief, currentTarget: null,
    approvedUpstream: taskId === "J02" ? sources[0] : null, approvedSources: sources,
    matchingRevision: null, questionAnswers: [], ...extra,
  });
  const run = (taskId: Task, extra: Record<string, unknown> = {}) => compare(make(taskId, extra));
  for (const task of ["J01", "J02", "J03", "J04", "J05", "J06", "J07"] as const) {
    const content = run(task);
    if (task === "J03") expect((content.characters as Record<string, unknown>[]).every((row) => !("characterId" in row))).toBe(true);
    if (task === "J04") expect((content.locations as Record<string, unknown>[]).every((row) => !("locationId" in row))).toBe(true);
    if (task === "J05") expect((content.units as Record<string, unknown>[]).every((row) => !("unitId" in row))).toBe(true);
    const stored = task === "J03" ? { ...content, characters: (content.characters as Record<string, unknown>[]).map((row, index) => ({ ...row, characterId: id(20 + index) })) }
      : task === "J04" ? { ...content, locations: (content.locations as Record<string, unknown>[]).map((row, index) => ({ ...row, locationId: id(30 + index) })) }
        : task === "J05" ? { ...content, units: (content.units as Record<string, unknown>[]).map((row, index) => ({ ...row, unitId: id(40 + index) })) } : content;
    sources.push({ taskId: task, id: id(10 + sources.length), content: stored });
  }
  return { make, run, sources };
}

describe("Dify M2 Python simulation parity", () => {
  for (const persona of Object.keys(CASES) as Persona[]) {
    it(`matches J01-J07 and manager routes for ${persona}`, () => {
      const { sources } = chain(persona);
      expect(sources).toHaveLength(7);
      for (const taskId of sources.map((source) => source.taskId)) compare(context({ role: "manager", eligibleRoute: taskId, run: { bookletId: id(5) } }));
      const manuscript = sources[4].content as { units: { unitKey: string; unitId: string; locationId: string; charactersPresent: string[] }[] };
      const finalCast = (sources[5].content as { characters: { unitIds: string[]; recurrence: string; sheetRequired: boolean }[] }).characters;
      const finalPlaces = (sources[6].content as { locations: { unitIds: string[]; sheetRequired: boolean }[] }).locations;
      expect(manuscript.units.map((unit) => unit.unitKey)).toEqual(["beat_1", "beat_2", "beat_3", "beat_4", "beat_5"]);
      expect(finalCast.every((row) => row.unitIds.length === 5 && row.recurrence === "recurring" && row.sheetRequired)).toBe(true);
      expect(finalPlaces.every((row) => row.unitIds.length > 0 && row.sheetRequired)).toBe(true);
      if (persona === "professional_creator") {
        const places = (sources[3].content as { locations: { entryKey: string; locationId: string }[] }).locations;
        expect(manuscript.units[3].locationId).toBe(places.find((place) => place.entryKey === "location_2")!.locationId);
        expect(manuscript.units[4].locationId).toBe(places.find((place) => place.entryKey === "location_1")!.locationId);
      }
    });
  }

  it("keeps renamed and reordered draft rows, saved answers, and scoped revisions", () => {
    const { make, run, sources } = chain("professional_creator");
    const cast = sources[2].content as { characters: Record<string, unknown>[] };
    const places = sources[3].content as { locations: Record<string, unknown>[] };
    const renamedCast = { ...cast, characters: [...cast.characters].reverse().map((row, index) => index === 0 ? { ...row, nameOrRole: "Mira" } : row) };
    const renamedPlaces = { ...places, locations: [...places.locations].reverse().map((row, index) => index === 0 ? { ...row, title: "Workshop East" } : row) };
    compare(make("J03", { currentTarget: { currentVersionId: id(80), versions: [{ id: id(80), content: renamedCast }] }, matchingRevision: { instruction: "Keep the friendship central." }, questionAnswers: [{ taskId: "J03", question: "Name?", answer: "Mira" }] }));
    compare(make("J04", { currentTarget: { currentVersionId: id(81), versions: [{ id: id(81), content: renamedPlaces }] }, matchingRevision: { instruction: "Keep the workshop modest." } }));
    const manuscript = sources[4].content;
    compare(make("J05", { currentTarget: { currentVersionId: id(82), versions: [{ id: id(82), content: manuscript }] }, matchingRevision: { instruction: "Keep the ending warm." }, questionAnswers: [{ taskId: "J05", question: "Ending?", answer: "Warm" }] }));
    const finalCast = run("J06");
    const finalPlaces = run("J07");
    compare(make("J06", { currentTarget: { currentVersionId: id(83), versions: [{ id: id(83), content: finalCast }] }, matchingRevision: { instruction: "Keep expressions readable." } }));
    compare(make("J07", { currentTarget: { currentVersionId: id(84), versions: [{ id: id(84), content: finalPlaces }] }, matchingRevision: { instruction: "Keep the entry clear." } }));
  });

  it("refreshes stale source facts and derives final occurrences from saved units", () => {
    const { make, sources } = chain("professional_creator");
    const stale = sources[4].content as { units: Record<string, unknown>[] };
    compare(make("J05", { currentTarget: { state: "needs_review", currentVersionId: id(90), versions: [{ id: id(90), content: stale }] } }));
    const updated = { ...(sources[1].content as Record<string, unknown>), storyArc: { ...((sources[1].content as { storyArc: Record<string, string> }).storyArc), opening: "The friends prepare a new lantern." } };
    sources[1].content = updated;
    const refreshed = compare(make("J05", { currentTarget: { state: "needs_review", currentVersionId: id(90), versions: [{ id: id(90), content: stale }] } }));
    expect((refreshed.units as { prose: string }[])[0].prose).toContain("new lantern");
    compare(make("J06", { currentTarget: { state: "needs_review", currentVersionId: id(91), versions: [{ id: id(91), content: sources[5].content }] } }));
    compare(make("J07", { currentTarget: { state: "needs_review", currentVersionId: id(92), versions: [{ id: id(92), content: sources[6].content }] } }));
  });

  it("uses semantic arc order after canonical JSON sorting and stable location keys after row reversal", () => {
    const { make, sources } = chain("professional_creator");
    sources[1].content = sortedKeys(sources[1].content);
    const places = sources[3].content as { locations: { entryKey: string; locationId: string }[] };
    sources[3].content = { ...places, locations: [...places.locations].reverse() };
    const manuscript = compare(make("J05")) as { units: { action: string; locationId: string }[] };
    const arc = (sources[1].content as { storyArc: Record<string, string> }).storyArc;
    expect(manuscript.units.map((unit) => unit.action)).toEqual([arc.opening, arc.incitingAction, arc.escalation, arc.decisiveChoice, arc.resolution]);
    expect(manuscript.units.map((unit) => unit.locationId)).toEqual([places.locations[0].locationId, places.locations[0].locationId, places.locations[0].locationId, places.locations[1].locationId, places.locations[0].locationId]);
  });

  it("matches grouped reviews, enabled-task delegation, and a saved question reply", () => {
    const drafts = ["J03", "J04"].map((taskId, index) => ({ taskId, subjectKind: "book", subjectId: id(5), state: "draft", currentVersionId: id(60 + index), versions: [{ id: id(60 + index), content: {}, dependencyVersionIds: [id(11), id(12)] }] }));
    const approved = ["J01", "J02"].map((taskId, index) => ({ taskId, subjectKind: "book", subjectId: id(5), state: "approved", currentVersionId: id(11 + index), versions: [{ id: id(11 + index), content: {}, dependencyVersionIds: [] }] }));
    const base = { role: "tester", persona: "professional_creator", bookletId: id(5), pendingDecision: null, activeDelegation: null, creatorMessages: [], currentArtifacts: [...approved, ...drafts] };
    compare(context(base));
    compare(context({ ...base, pendingDecision: { kind: "question", questionId: id(70) } }));
    compare(context({ ...base, persona: "playful_kid", currentArtifacts: [], eligibleTaskIds: ["J01", "J02", "J03", "J04", "J05", "J06", "J07"] }));
  });

  it("rejects unauthorized and nonsimulated calls; Pause returns no envelope", () => {
    expect(python({ started: false, reason: "paused" })).toEqual({ booklet_result: "", authorization_reason: "paused" });
    expect(() => python({ started: false, reason: "already_started" })).toThrow();
    expect(() => python({ started: true, mode: "real", inputFingerprint: "a".repeat(64), context: { role: "manager", eligibleRoute: "J01", run: { bookletId: id(5) } } })).toThrow();
  });
});
