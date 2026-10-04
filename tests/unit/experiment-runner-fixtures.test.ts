import { describe, expect, it } from "vitest";
import { CASES, conceptBriefSchema, storyOutlineSchema } from "@/lib/contracts/experiment-runner";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";

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
    expect(() => simulateNarrativeResult(asContext({ role: "manager", eligibleRoute: "J03", run: { nextNarrativeTask: "J03", bookletId: "book-1" } }), "simulated")).toThrow();
    expect(simulateNarrativeResult(asContext({ role: "manager", eligibleRoute: "J01", run: { nextNarrativeTask: null, bookletId: bookId } }), "simulated")).toMatchObject({ payload: { taskId: "J01", subjectId: bookId } });
    expect(() => simulateNarrativeResult(asContext({ ...specialist("playful_kid", "J01"), taskId: "J03" }), "simulated")).toThrow();
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
