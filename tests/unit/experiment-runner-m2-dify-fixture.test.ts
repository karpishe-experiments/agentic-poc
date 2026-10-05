import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CASES, resultEnvelopeSchema } from "@/lib/contracts/experiment-runner";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";
import { parseReferenceProposal, styleModuleHash, type VisualStyleProposal } from "@/lib/contracts/experiment-references";
import { simulateReferenceProposal } from "@/lib/experiment-runner/reference-fixtures";
import { assembleReferenceSheet } from "@/lib/experiment-runner/reference-assembly";
import { referenceSheetRequest } from "@/lib/experiment-runner/reference-requests";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";

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
type Task = "J01" | "J02" | "J03" | "J04" | "J05" | "J06" | "J07" | "J08";
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
  for (const task of ["J01", "J02", "J03", "J04", "J05", "J06", "J07", "J08"] as const) {
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

// Shape fixtures only: no claim of generated or stored image files.
function styleReview(persona: Persona) {
  const { sources } = chain(persona);
  const style = sources[7].content as VisualStyleProposal;
  const { samplePlan, ...definition } = style;
  const draftId = sources[7].id, versionId = id(70);
  const dependencies = sources.filter((item) => ["J01", "J02", "J05", "J06", "J07"].includes(item.taskId)).map((item) => item.id);
  const content = { ...definition, draftStyleVersionId: draftId, samples: samplePlan.map((sample, index) => ({ ...sample,
    build: { prompt: `${style.stylePromptModule}\n${sample.purpose}`, stylePromptModuleHash: style.stylePromptModuleHash,
      operationId: id(80 + index), assetId: id(80 + index), sourceVersionIds: [draftId, ...dependencies] },
  })) };
  const version = { id: versionId, sourceVersionId: draftId, dependencyVersionIds: [draftId, ...dependencies], content };
  const artifact = { taskId: "J08", subjectKind: "book", subjectId: id(5), state: "draft", currentVersionId: versionId, versions: [version] };
  const approved = sources.slice(0, 7).map((item) => ({ taskId: item.taskId, state: "approved", currentVersionId: item.id, versions: [] }));
  const tester = { role: "tester", persona, bookletId: id(5), currentArtifacts: [...approved, artifact],
    creatorMessages: [{ id: id(6) }], pendingDecision: null, activeDelegation: { taskIds: sources.map((item) => item.taskId) } };
  return { content, version, artifact, approved, tester, sources };
}

function sheetCase(persona: Persona, task: "J09" | "J10", index = 0) {
  const { sources, content, version } = styleReview(persona);
  const list = sources[task === "J09" ? 5 : 6];
  const subjects = (list.content as Record<string, Record<string, unknown>[]>)[task === "J09" ? "characters" : "locations"];
  const subjectId = subjects[index][task === "J09" ? "characterId" : "locationId"] as string;
  const saved: Record<string, unknown> = { role: "specialist", taskId: task, persona, brief: CASES[persona].brief,
    subjectId, currentTarget: null, matchingRevision: null, questionAnswers: [],
    approvedSources: [list, { taskId: "J08", id: version.id, content }] };
  return { saved, list, content, version, subjectId };
}

function compareSheet(saved: Record<string, unknown>) {
  const task = saved.taskId as "J09" | "J10";
  const rows = saved.approvedSources as { taskId: string; id: string; content: unknown }[];
  const final = rows.find((item) => item.taskId === (task === "J09" ? "J06" : "J07"))!;
  const style = rows.find((item) => item.taskId === "J08")!;
  const current = saved.currentTarget as { state: string; currentVersionId: string; versions: { id: string; content: unknown }[] } | null;
  const revision = saved.matchingRevision as { instruction: string } | null;
  const common = { mode: "simulated" as const, persona: saved.persona as Persona, brief: saved.brief as string,
    finalList: { versionId: final.id, content: final.content }, style: { versionId: style.id, content: style.content },
    styleVersionId: style.id, targetId: saved.subjectId as string,
    currentContent: current?.versions.find((item) => item.id === current.currentVersionId)?.content,
    sourceChanged: current?.state === "needs_review", revision: revision?.instruction,
    answers: saved.questionAnswers as { question: string; answer: string }[] };
  const expected = task === "J09" ? simulateReferenceProposal("J09", common) : simulateReferenceProposal("J10", common);
  const output = python({ started: true, mode: "simulated", inputFingerprint: "a".repeat(64), context: saved });
  const result = JSON.parse(output.booklet_result).result as { kind: string; payload: { content?: unknown; question?: string; taskId?: string } };
  if (expected.kind === "clarification") expect(result).toEqual({ kind: "clarification", payload: { question: expected.question } });
  else {
    expect(result).toEqual({ kind: "proposal", payload: { taskId: task, content: expected.content } });
    parseReferenceProposal(task, "proposal", result.payload.content);
  }
  return result;
}

describe("Dify M2 Python simulation parity", () => {
  it.each(["J09", "J10"] as const)("routes a saved %s subject and answers its pending question", (taskId) => {
    compare(context({ role: "manager", eligibleRoute: taskId, eligibleTarget: { taskId, subjectKind: taskId === "J09" ? "character" : "location", subjectId: id(25) }, run: { bookletId: id(5) } }));
    compare(context({ role: "tester", pendingDecision: { kind: "question", taskId, questionId: id(50) } }));
  });
  it.each(Object.keys(CASES) as Persona[])("reviews only assembled sheet versions for %s", (persona) => {
    for (const task of ["J09", "J10"] as const) {
      const input = sheetCase(persona, task);
      const proposal = compareSheet(input.saved).payload.content;
      const request = referenceSheetRequest(task, proposal);
      const content = assembleReferenceSheet(task, proposal, { operationId: id(88), assetId: id(89), request, inputFingerprint: imageRequestFingerprint(request) }).content;
      const version = { id: id(95), sourceVersionId: id(94), dependencyVersionIds: [id(94), input.list.id, input.version.id], content };
      const artifact = { taskId: task, subjectKind: task === "J09" ? "character" : "location", subjectId: input.subjectId,
        state: "draft", currentVersionId: version.id, versions: [version] };
      const saved = context({ role: "tester", persona, bookletId: id(5), pendingDecision: null, creatorMessages: [{}],
        activeDelegation: { taskIds: ["J08", "J09", "J10"] }, currentArtifacts: [
          { taskId: input.list.taskId, state: "approved", currentVersionId: input.list.id, versions: [] },
          { taskId: "J08", state: "approved", currentVersionId: input.version.id, versions: [] }, artifact,
        ] });
      compare(saved);
      if (saved.role !== "tester") throw new Error("Expected tester context");
      const textual = context({ ...saved, currentArtifacts: [...saved.currentArtifacts.slice(0, 2), { ...artifact,
        versions: [{ ...version, sourceVersionId: null, dependencyVersionIds: [input.list.id, input.version.id], content: proposal }] }] });
      expect(() => simulateNarrativeResult(textual, "simulated")).toThrow("No current eligible");
      expect(() => python({ started: true, mode: "simulated", inputFingerprint: "a".repeat(64), context: textual })).toThrow("No current eligible");
    }
  });
  it.each(Object.keys(CASES) as Persona[])("matches each character/location sheet proposal for %s", (persona) => {
    for (const task of ["J09", "J10"] as const) {
      const count = task === "J09" || persona === "professional_creator" ? 2 : 1;
      for (let index = 0; index < count; index++) {
        const result = compareSheet(sheetCase(persona, task, index).saved);
        if (task === "J10") {
          expect(result.payload.content).toMatchObject({ requiredFeatures: [] });
          expect((result.payload.content as { sheetPromptModule: string }).sheetPromptModule).toContain("Include required features: none specified.");
        }
      }
    }
  });

  it.each(["J09", "J10"] as const)("preserves %s revisions and refreshes stale sources", (task) => {
    const { saved, content } = sheetCase("professional_creator", task);
    const initial = compareSheet(saved).payload.content as Record<string, unknown>;
    const retained = { ...initial, title: "Retained sheet", sheetPromptModule: "Retained subject direction", reviewQuestions: ["Existing review"] };
    const currentTarget = { state: "draft", currentVersionId: id(90), versions: [{ id: id(90), content: retained }] };
    compareSheet({ ...saved, currentTarget, matchingRevision: { instruction: "Keep the stable anchors" }, questionAnswers: [{ question: "Detail?", answer: "Minimal texture" }] });
    const styleText = content.stylePromptModule + "\n\tExact café style 雨  ";
    const changed = { ...content, stylePromptModule: styleText, stylePromptModuleHash: styleModuleHash(styleText),
      samples: content.samples.map((item) => ({ ...item, build: { ...item.build, prompt: styleText + "\n" + item.purpose, stylePromptModuleHash: styleModuleHash(styleText) } })) };
    const sources = (saved.approvedSources as Record<string, unknown>[]).map((item) => item.taskId === "J08" ? { ...item, id: id(91), content: changed } : item);
    const refreshed = compareSheet({ ...saved, currentTarget: { ...currentTarget, state: "needs_review" }, approvedSources: sources });
    expect(refreshed.payload.content).toMatchObject({ styleVersionId: id(91), stylePromptModule: styleText });
  });

  it("asks for distinct expressions and consumes the saved answer", () => {
    const { saved } = sheetCase("enthusiast_parent", "J09");
    const rows = saved.approvedSources as { taskId: string; id: string; content: { characters?: Record<string, unknown>[] } }[];
    const sources = rows.map((item) => item.taskId === "J06" ? { ...item, content: { ...item.content,
      characters: item.content.characters!.map((character) => ({ ...character, expressions: ["Joy", " Joy "] })) } } : item);
    const first = compareSheet({ ...saved, approvedSources: sources });
    expect(first.kind).toBe("clarification");
    compareSheet({ ...saved, approvedSources: sources, questionAnswers: [{ question: first.payload.question, answer: "Concern, Concern; Relief" }] });
  });

  it("rejects missing, foreign and inconsistent sheet evidence without execution", () => {
    const { saved, content } = sheetCase("playful_kid", "J09");
    const run = (context: Record<string, unknown>) => python({ started: true, mode: "simulated", inputFingerprint: "a".repeat(64), context });
    expect(() => run({ ...saved, subjectId: id(999) })).toThrow();
    expect(() => run({ ...saved, brief: "Changed fixed brief" })).toThrow();
    const sources = saved.approvedSources as Record<string, unknown>[];
    expect(() => run({ ...saved, approvedSources: sources.slice(0, 1) })).toThrow();
    expect(() => run({ ...saved, approvedSources: [...sources, sources[0]] })).toThrow();
    for (const invalidStyle of [{ ...content, samples: undefined }, { ...content, stylePromptModuleHash: "0".repeat(64) },
      { ...content, samples: content.samples.map((item) => ({ ...item, build: { ...item.build, prompt: "Missing exact style" } })) }]) {
      expect(() => run({ ...saved, approvedSources: [sources[0], { ...sources[1], content: invalidStyle }] })).toThrow();
    }
    const initial = compareSheet(saved).payload.content as Record<string, unknown>;
    expect(() => run({ ...saved, currentTarget: { state: "draft", currentVersionId: id(90), versions: [{ id: id(90), content: { ...initial, characterId: id(999) } }] } })).toThrow();
  });

  for (const persona of Object.keys(CASES) as Persona[]) {
    it(`matches J01-J08 and manager routes for ${persona}`, () => {
      const { sources } = chain(persona);
      expect(sources).toHaveLength(8);
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

  it.each(Object.keys(CASES) as Persona[])("matches assembled style review and delegation for %s", (persona) => {
    const { tester } = styleReview(persona);
    compare(context(tester));
    const saved = python({ started: true, mode: "simulated", inputFingerprint: "a".repeat(64), context: tester });
    expect(JSON.parse(saved.booklet_result).result.payload.decision.action).toBe(persona === "professional_creator" ? "approve" : "delegate");
    compare(context({ ...tester, activeDelegation: { taskIds: ["J01", "J02"] } }));
  });

  it("retains exact style bytes through proposal/assembled revisions and refreshes changed sources", () => {
    const { make, sources } = chain("professional_creator");
    const style = sources[7].content as VisualStyleProposal;
    const styleModuleText = `  ${style.stylePromptModule}\nUnicode: café ✓\n\n`;
    const current = { ...style, stylePromptModule: styleModuleText, stylePromptModuleHash: styleModuleHash(styleModuleText) };
    const extra = { currentTarget: { currentVersionId: id(90), versions: [{ id: id(90), content: current }] }, matchingRevision: { instruction: "Keep the readable texture." },
      questionAnswers: [{ taskId: "J08", question: "Contrast?", answer: "Gentle" }, { taskId: null, question: "Palette?", answer: "Warm" }] };
    const revised = compare(make("J08", extra));
    expect(revised.stylePromptModule).toBe(styleModuleText);
    expect(revised.approvalQuestions).toEqual([...style.approvalQuestions, "Revision request: Keep the readable texture.", "Contrast?: Gentle", "Palette?: Warm"]);
    const { content } = styleReview("professional_creator");
    const revisedAssembled = compare(make("J08", { ...extra, currentTarget: { currentVersionId: id(91), versions: [{ id: id(91), content }] } }));
    expect(revisedAssembled).not.toHaveProperty("samples");
    expect(revisedAssembled.samplePlan).toEqual(style.samplePlan);
    sources[0].content = { ...(sources[0].content as object), tone: "Soft dusk" };
    const refreshed = compare(make("J08", { currentTarget: { ...extra.currentTarget, state: "needs_review" } }));
    expect(refreshed.stylePromptModule).toContain("Soft dusk");
    expect(refreshed.stylePromptModule).not.toContain("observatory");
  });

  it("does not review textual, malformed, parent-mismatched or stale style packages", () => {
    const { tester, artifact, version, content, approved } = styleReview("professional_creator");
    for (const bad of [
      { ...version, content: { ...content, samples: undefined } },
      { ...version, content: { ...content, samples: [content.samples[0], content.samples[0]] } },
      { ...version, content: { ...content, styleDefinition: {} } },
      { ...version, content: { ...content, draftStyleVersionId: "00000000-0000-4000-0000-000000000017" } },
      { ...version, sourceVersionId: id(99) },
      { ...version, dependencyVersionIds: [content.draftStyleVersionId, id(99)] },
    ]) {
      const saved = context({ ...tester, currentArtifacts: [...approved, { ...artifact, versions: [bad] }] });
      expect(() => simulateNarrativeResult(saved, "simulated")).toThrow();
      expect(() => python({ started: true, mode: "simulated", inputFingerprint: "a".repeat(64), context: saved })).toThrow();
    }
  });

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
