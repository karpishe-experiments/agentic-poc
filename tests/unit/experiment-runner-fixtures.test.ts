import { describe, expect, it } from "vitest";
import { CASES, conceptBriefSchema, finalCharacterListSchema, finalLocationListSchema, manuscriptSchema, storyOutlineSchema } from "@/lib/contracts/experiment-runner";
import { simulateDraftListResult, simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";

type Context = Parameters<typeof simulateNarrativeResult>[0];
const asContext = (value: unknown) => value as Context;
const bookId = "00000000-0000-4000-8000-000000000001";
const versionId = "00000000-0000-4000-8000-000000000002";
const questionId = "00000000-0000-4000-8000-000000000003";

function specialist(persona: keyof typeof CASES, taskId: "J01" | "J02", extra: Record<string, unknown> = {}): Context {
  const concept = taskId === "J02" ? simulateNarrativeResult(specialist(persona, "J01"), "simulated") : null;
  return asContext({ role: "specialist", taskId, persona, brief: CASES[persona].brief, currentTarget: null, approvedUpstream: concept?.kind === "proposal" ? { id: versionId, content: concept.payload.content } : null, matchingRevision: null, questionAnswers: [], ...extra });
}

describe("simulated narrative fixtures", () => {
  for (const persona of Object.keys(CASES) as (keyof typeof CASES)[]) {
    it(`produces complete J01 and J02 content for ${persona}`, () => {
      const concept = simulateNarrativeResult(specialist(persona, "J01"), "simulated");
      const outline = simulateNarrativeResult(specialist(persona, "J02"), "simulated");
      expect(concept.kind).toBe("proposal");
      expect(outline.kind).toBe("proposal");
      if (concept.kind !== "proposal" || outline.kind !== "proposal") return;
      const j1 = conceptBriefSchema.parse(concept.payload.content);
      const j2 = storyOutlineSchema.parse(outline.payload.content);
      expect(j1.sourceInput).toBe(CASES[persona].brief);
      expect(j2.characters).toHaveLength(2);
      expect(j2.locations).toHaveLength(persona === "professional_creator" ? 2 : 1);
      expect(Object.values(j2.storyArc).every(Boolean)).toBe(true);
    });
  }

  it("grants low-interaction cases and reviews creator drafts by saved version", () => {
    const artifact = { taskId: "J01", subjectKind: "book", subjectId: bookId, state: "draft", currentVersionId: versionId, versions: [{ id: versionId, content: {}, dependencyVersionIds: [] }] };
    const base = { role: "tester", bookletId: bookId, brief: CASES.playful_kid.brief, persona: "playful_kid", currentArtifacts: [artifact], pendingDecision: null, activeDelegation: null, creatorMessages: [] };
    expect(simulateNarrativeResult(asContext(base), "simulated")).toMatchObject({ payload: { decision: { action: "delegate", taskIds: ["J01", "J02"], subjectId: bookId } } });
    expect(simulateNarrativeResult(asContext({ ...base, currentArtifacts: [] }), "simulated")).toMatchObject({ payload: { decision: { action: "delegate", subjectId: bookId } } });
    expect(simulateNarrativeResult(asContext({ ...base, persona: "professional_creator" }), "simulated")).toMatchObject({ payload: { decision: { action: "approve", versionIds: [versionId] } } });
  });

  it("approves the fresh J01 draft while deferring stale J02 review", () => {
    const j1 = { taskId: "J01", state: "draft", currentVersionId: versionId, versions: [{ id: versionId, content: {}, dependencyVersionIds: [] }] };
    const staleId = "00000000-0000-4000-8000-000000000004";
    const j2 = { taskId: "J02", state: "needs_review", currentVersionId: staleId, versions: [{ id: staleId, content: {}, dependencyVersionIds: ["00000000-0000-4000-8000-000000000005"] }] };
    const base = { role: "tester", bookletId: bookId, brief: CASES.professional_creator.brief, persona: "professional_creator", currentArtifacts: [j1, j2], pendingDecision: null, activeDelegation: null, creatorMessages: [] };
    expect(simulateNarrativeResult(asContext(base), "simulated")).toMatchObject({ payload: { decision: { action: "approve", versionIds: [versionId] } } });
    expect(() => simulateNarrativeResult(asContext({ ...base, currentArtifacts: [j2] }), "simulated")).toThrow("No current eligible draft");
  });

  it("answers exactly the saved question and leaves revisions to specialists", () => {
    const base = { role: "tester", brief: CASES.playful_kid.brief, persona: "playful_kid", currentArtifacts: [], activeDelegation: null, creatorMessages: [] };
    expect(simulateNarrativeResult(asContext({ ...base, pendingDecision: { kind: "question", questionId } }), "simulated")).toMatchObject({ payload: { decision: { action: "answer", questionId } } });
    expect(() => simulateNarrativeResult(asContext({ ...base, pendingDecision: { kind: "revision", taskId: "J01" } }), "simulated")).toThrow();
  });

  it("rejects mode, role, and route boundaries", () => {
    expect(() => simulateNarrativeResult(specialist("playful_kid", "J01"), "balanced")).toThrow();
    expect(() => simulateNarrativeResult(asContext({ role: "judge" }), "simulated")).toThrow();
    expect(simulateNarrativeResult(asContext({ role: "manager", eligibleRoute: "J03", run: { nextNarrativeTask: "J03", bookletId: bookId } }), "simulated")).toMatchObject({ payload: { taskId: "J03" } });
    expect(simulateNarrativeResult(asContext({ role: "manager", eligibleRoute: "J01", run: { nextNarrativeTask: null, bookletId: bookId } }), "simulated")).toMatchObject({ payload: { taskId: "J01", subjectId: bookId } });
    expect(() => simulateNarrativeResult(asContext({ ...specialist("playful_kid", "J01"), taskId: "J08" }), "simulated")).toThrow();
  });

  it("revises the current target while retaining unrelated fields and saved answers", () => {
    const first = simulateNarrativeResult(specialist("playful_kid", "J01"), "simulated");
    if (first.kind !== "proposal") throw new Error("Expected proposal.");
    const saved = { ...conceptBriefSchema.parse(first.payload.content), title: "Creator's title" };
    const revised = simulateNarrativeResult(specialist("playful_kid", "J01", { currentTarget: { currentVersionId: "version-1", versions: [{ id: "version-1", content: saved }] }, matchingRevision: { instruction: "Make the tone more curious." }, questionAnswers: [{ taskId: "J01", questionId: "question-1", question: "What should the robot say?", answer: "A cheerful beep." }] }), "simulated");
    if (revised.kind !== "proposal") throw new Error("Expected proposal.");
    const content = conceptBriefSchema.parse(revised.payload.content);
    expect(content.title).toBe("Creator's title");
    expect(content.premise).toBe(saved.premise);
    expect(content.tone).toContain("Make the tone more curious.");
    expect(content.knownConstraints).toContain("What should the robot say?: A cheerful beep.");
  });

  it("refreshes source-derived J02 fields without losing its cast, places, or arc", () => {
    const original = simulateNarrativeResult(specialist("professional_creator", "J02"), "simulated");
    const concept = simulateNarrativeResult(specialist("professional_creator", "J01"), "simulated");
    if (original.kind !== "proposal" || concept.kind !== "proposal") throw new Error("Expected proposals.");
    const saved = storyOutlineSchema.parse(original.payload.content);
    const upstream = { ...conceptBriefSchema.parse(concept.payload.content), title: "New Observatory", premise: "The friends repair a lantern before a star party.", theme: "Patient listening restores trust.", emotionalPromise: "Both friends feel heard.", tone: "Quiet and hopeful", knownConstraints: ["Keep the repair grounded."] };
    const stale = { ...saved, characters: [{ ...saved.characters[0], narrativeRole: "Custom first role" }, ...saved.characters.slice(1)], deferredDecisions: [...saved.deferredDecisions, "Keep a creator choice open."] };
    const refreshed = simulateNarrativeResult(specialist("professional_creator", "J02", { approvedUpstream: { id: versionId, content: upstream }, currentTarget: { state: "needs_review", currentVersionId: versionId, versions: [{ id: versionId, content: stale }] } }), "simulated");
    if (refreshed.kind !== "proposal") throw new Error("Expected proposal.");
    const content = storyOutlineSchema.parse(refreshed.payload.content);
    expect(content).toMatchObject({ title: upstream.title, theme: upstream.theme, emotionalArc: upstream.emotionalPromise, characters: stale.characters, locations: stale.locations, storyArc: stale.storyArc });
    expect(content.summary).toContain(upstream.premise);
    expect(content.summary).toContain(upstream.tone);
    expect(content.deferredDecisions).toContain("Approved concept constraint: Keep the repair grounded.");
    expect(content.deferredDecisions).toContain("Keep a creator choice open.");
    expect(content.deferredDecisions).not.toContain("Approved concept constraint: Keep the named cast and locations consistent.");
  });
});

describe("local draft-list fixtures", () => {
  function sources(persona: keyof typeof CASES) {
    const concept = simulateNarrativeResult(specialist(persona, "J01"), "simulated");
    const outline = simulateNarrativeResult(specialist(persona, "J02"), "simulated");
    if (concept.kind !== "proposal" || outline.kind !== "proposal") throw new Error("Expected source proposals.");
    return { mode: "simulated" as const, persona, brief: CASES[persona].brief, approvedConcept: concept.payload.content, approvedOutline: outline.payload.content };
  }

  for (const persona of Object.keys(CASES) as (keyof typeof CASES)[]) {
    it(`derives fixed J03/J04 rows from approved ${persona} outline`, () => {
      const input = sources(persona);
      const outline = storyOutlineSchema.parse(input.approvedOutline);
      const cast = simulateDraftListResult("J03", input);
      const places = simulateDraftListResult("J04", input);
      expect(cast.kind).toBe("proposal");
      expect(places.kind).toBe("proposal");
      if (cast.kind !== "proposal" || places.kind !== "proposal") return;
      expect(cast.content.characters.map((item) => item.entryKey)).toEqual(["character_1", "character_2"]);
      expect(cast.content.characters.map((item) => item.nameOrRole)).toEqual(outline.characters.map((item) => item.nameOrRole));
      expect(cast.content.characters.map((item) => item.narrativeFunction)).toEqual(outline.characters.map((item) => item.narrativeRole));
      expect(places.content.locations.map((item) => item.title)).toEqual(outline.locations.map((item) => item.name));
      expect(places.content.locations).toHaveLength(persona === "professional_creator" ? 2 : 1);
      expect(JSON.stringify([cast.content, places.content])).not.toMatch(/clothing|camera|physicalFeatures/);
    });
  }

  it("clarifies one unanswered material question and does not repeat its saved answer", () => {
    const input = sources("playful_kid");
    const question = "Should the robot speak?";
    expect(simulateDraftListResult("J03", { ...input, materialQuestion: question })).toEqual({ kind: "clarification", question });
    const answered = simulateDraftListResult("J03", { ...input, materialQuestion: question, answers: [{ question, answer: "Only a beep." }] });
    expect(answered.kind).toBe("proposal");
    if (answered.kind === "proposal") expect(answered.content.castNotes).toContain(`${question}: Only a beep.`);
  });

  it("preserves renamed entries and symbolic keys while applying scoped revision notes", () => {
    const input = sources("professional_creator");
    const cast = simulateDraftListResult("J03", input);
    const places = simulateDraftListResult("J04", input);
    if (cast.kind !== "proposal" || places.kind !== "proposal") throw new Error("Expected proposals.");
    const currentCast = { ...cast.content, characters: [{ ...cast.content.characters[0], nameOrRole: "Mira", narrativeFunction: "Invites the friend to listen", knownRelationship: "Longtime astronomy club friends", knownFacts: ["Repairs equipment together"], openQuestions: ["What helps them reconcile?"] }, cast.content.characters[1]] };
    const currentPlaces = { ...places.content, locations: [{ ...places.content.locations[0], title: "Hill observatory", storyPurpose: "Hosts the neighbors' first star party", knownFacts: ["A shared community meeting place"], likelyScenes: ["Welcoming the neighbors"], openQuestions: ["Who opens the star party?"] }, places.content.locations[1]] };
    const revisedCast = simulateDraftListResult("J03", { ...input, currentContent: currentCast, revision: "Keep the reconciliation central." });
    const revisedPlaces = simulateDraftListResult("J04", { ...input, currentContent: currentPlaces, revision: "Keep the workshop secondary." });
    if (revisedCast.kind !== "proposal" || revisedPlaces.kind !== "proposal") throw new Error("Expected revised proposals.");
    expect(revisedCast.content.characters[0]).toMatchObject({ entryKey: "character_1", nameOrRole: "Mira" });
    expect(revisedPlaces.content.locations[0]).toMatchObject({ entryKey: "location_1", title: "Hill observatory" });
    expect(revisedCast.content.characters).toEqual(currentCast.characters);
    expect(revisedPlaces.content.locations).toEqual(currentPlaces.locations);
    expect(revisedCast.content.castNotes).toContain("Revision request: Keep the reconciliation central.");
    expect(revisedPlaces.content.worldAndSafetyNotes).toContain("Revision request: Keep the workshop secondary.");
  });

  it("rejects unsupported mode, mismatched brief, and invalid source counts", () => {
    const input = sources("playful_kid");
    expect(() => simulateDraftListResult("J03", { ...input, mode: "balanced" })).toThrow();
    expect(() => simulateDraftListResult("J03", { ...input, brief: "Different story" })).toThrow();
    const outline = storyOutlineSchema.parse(input.approvedOutline);
    expect(() => simulateDraftListResult("J03", { ...input, approvedOutline: { ...outline, characters: outline.characters.slice(0, 1) } })).toThrow();
    expect(() => simulateDraftListResult("J04", { ...input, approvedOutline: { ...outline, locations: [...outline.locations, outline.locations[0]] } })).toThrow();
  });

  it("retains a valid single location key and current entry order on notes-only revision", () => {
    const input = sources("playful_kid");
    const places = simulateDraftListResult("J04", input);
    const cast = simulateDraftListResult("J03", input);
    if (places.kind !== "proposal" || cast.kind !== "proposal") throw new Error("Expected proposals.");
    const currentPlaces = { ...places.content, locations: [{ ...places.content.locations[0], entryKey: "location_2", title: "Renamed park", storyPurpose: "Retained purpose", knownFacts: ["Existing narrative fact"], openQuestions: ["Existing question"] }] };
    const revised = simulateDraftListResult("J04", { ...input, currentContent: currentPlaces, revision: "Keep the safety note concise." });
    if (revised.kind !== "proposal") throw new Error("Expected proposal.");
    expect(revised.content.locations).toEqual(currentPlaces.locations);
    const currentCast = { ...cast.content, characters: [...cast.content.characters].reverse() };
    const revisedCast = simulateDraftListResult("J03", { ...input, currentContent: currentCast, revision: "Keep the safety note concise." });
    if (revisedCast.kind !== "proposal") throw new Error("Expected proposal.");
    expect(revisedCast.content.characters).toEqual(currentCast.characters);
  });
});

describe("simulated J03-J07 narrative path", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  function proposal(context: Context) {
    const result = simulateNarrativeResult(context, "simulated");
    if (result.kind !== "proposal") throw new Error("Expected proposal.");
    return result.payload.content;
  }
  function chain(persona: keyof typeof CASES) {
    const concept = proposal(specialist(persona, "J01"));
    const outline = proposal(specialist(persona, "J02"));
    const sources: { taskId: string; id: string; content: unknown }[] = [
      { taskId: "J01", id: id(1), content: concept }, { taskId: "J02", id: id(2), content: outline },
    ];
    const run = (taskId: string, extra: Record<string, unknown> = {}) => proposal(asContext({
      role: "specialist", taskId, persona, brief: CASES[persona].brief,
      currentTarget: null, approvedSources: sources, matchingRevision: null, questionAnswers: [], ...extra,
    }));
    const cast = run("J03") as { characters: { entryKey: string }[] };
    const places = run("J04") as { locations: { entryKey: string }[] };
    sources.push({ taskId: "J03", id: id(3), content: { ...cast, characters: cast.characters.map((row, index) => ({ ...row, characterId: id(10 + index) })) } });
    sources.push({ taskId: "J04", id: id(4), content: { ...places, locations: places.locations.map((row, index) => ({ ...row, locationId: id(20 + index) })) } });
    const manuscript = manuscriptSchema.parse(run("J05"));
    sources.push({ taskId: "J05", id: id(5), content: { ...manuscript, units: manuscript.units.map((unit, index) => ({ ...unit, unitId: id(30 + index) })) } });
    return { run, sources, cast, places, manuscript };
  }

  for (const persona of Object.keys(CASES) as (keyof typeof CASES)[]) {
    it(`produces source-linked complete story and final lists for ${persona}`, () => {
      const { run, manuscript, sources } = chain(persona);
      expect(manuscript.units.map((unit) => unit.unitKey)).toEqual(["beat_1", "beat_2", "beat_3", "beat_4", "beat_5"]);
      expect(manuscript.units.every((unit) => unit.prose.length > 30 && unit.charactersPresent.length === 2 && unit.dialogue.length > 0)).toBe(true);
      const finalCast = finalCharacterListSchema.parse(run("J06"));
      const finalPlaces = finalLocationListSchema.parse(run("J07"));
      expect(finalCast.characters.map((row) => row.characterId)).toEqual([id(10), id(11)]);
      expect(finalCast.characters.every((row) => row.unitIds.length === 5 && row.recurrence === "recurring" && row.sheetRequired)).toBe(true);
      expect(finalPlaces.locations.map((row) => row.locationId)).toEqual((sources[3].content as { locations: { locationId: string }[] }).locations.map((row) => row.locationId));
      expect(finalPlaces.locations.every((row) => row.unitIds.length > 0 && row.sheetRequired)).toBe(true);
      if (persona === "professional_creator") {
        expect(manuscript.units.map((unit) => unit.locationId)).toEqual([id(20), id(20), id(20), id(21), id(20)]);
        expect(finalPlaces.locations.find((row) => row.locationId === id(20))!.unitIds).toContain(id(34));
        expect(finalPlaces.locations.find((row) => row.locationId === id(21))!.unitIds).not.toContain(id(34));
      }
    });
  }

  it("routes professional scenes by stable location keys after draft-list reordering", () => {
    const { run, sources } = chain("professional_creator");
    const places = sources[3].content as { locations: unknown[] };
    sources[3].content = { ...places, locations: [...places.locations].reverse() };
    const regenerated = manuscriptSchema.parse(run("J05"));
    expect(regenerated.units.map((unit) => unit.locationId)).toEqual([id(20), id(20), id(20), id(21), id(20)]);
  });

  it("retains current units and profile facts on notes-only revisions", () => {
    const { run, manuscript } = chain("professional_creator");
    const custom = { ...manuscript, units: manuscript.units.map((unit, index) => ({ ...unit, unitId: id(30 + index), ...(index === 0 ? { prose: "A creator's complete opening scene." } : {}) })) };
    const revised = manuscriptSchema.parse(run("J05", { currentTarget: { currentVersionId: id(50), versions: [{ id: id(50), content: custom }] }, matchingRevision: { instruction: "Keep the opening intimate." } }));
    expect(revised.units.map((unit) => unit.unitKey)).toEqual(custom.units.map((unit) => unit.unitKey));
    expect(revised.units[0].prose).toBe(custom.units[0].prose);
    expect(revised.continuityNotes).toContain("Revision request: Keep the opening intimate.");
    const final = finalCharacterListSchema.parse(run("J06"));
    const changed = { ...final, characters: [{ ...final.characters[0], nameOrRole: "Mira", physicalDescription: "Short curly hair and a steady smile." }, final.characters[1]] };
    const again = finalCharacterListSchema.parse(run("J06", { currentTarget: { currentVersionId: id(51), versions: [{ id: id(51), content: changed }] }, matchingRevision: { instruction: "Keep Mira's smile." } }));
    expect(again.characters).toEqual(changed.characters);
    expect(again.profileGuidance).toContain("Revision request: Keep Mira's smile.");
  });

  it("refreshes source-derived manuscript facts after upstream review", () => {
    const { run, manuscript } = chain("playful_kid");
    const stale = { ...manuscript, units: manuscript.units.map((unit) => ({ ...unit, prose: "Old story." })) };
    const refreshed = manuscriptSchema.parse(run("J05", { currentTarget: { state: "needs_review", currentVersionId: id(60), versions: [{ id: id(60), content: stale }] } }));
    expect(refreshed.units.map((unit) => unit.unitKey)).toEqual(stale.units.map((unit) => unit.unitKey));
    expect(refreshed.units[0].prose).not.toBe("Old story.");
  });

  it("uses the tester's exact eligible grant scope and refuses absent sources", () => {
    const result = simulateNarrativeResult(asContext({ role: "tester", bookletId: bookId, persona: "playful_kid", currentArtifacts: [], pendingDecision: null, activeDelegation: null, creatorMessages: [], eligibleTaskIds: ["J03", "J04"] }), "simulated");
    expect(result).toMatchObject({ payload: { decision: { action: "delegate", taskIds: ["J03", "J04"] } } });
    expect(() => proposal(asContext({ role: "specialist", taskId: "J05", persona: "playful_kid", brief: CASES.playful_kid.brief, approvedSources: [], currentTarget: null, matchingRevision: null, questionAnswers: [] }))).toThrow("approved J02");
  });
});
