import { describe, expect, it } from "vitest";
import {
  CASES, MAX_NARRATIVE_CONTENT_BYTES, conceptBriefSchema, createRunInputSchema, experimentTaskSchema, lineageSchema,
  parseNarrativeProposal, resultEnvelopeSchema, storyOutlineSchema, validateRoleResult,
} from "@/lib/contracts/experiment-runner";

const id = "00000000-0000-4000-8000-000000000001";
const concept = {
  schemaVersion: "2", title: "Kite Rescue", sourceInput: "A child and robot rescue a kite.",
  audience: { ageBand: "6-8", readingNeeds: "Short and clear text." },
  premise: "A kite flies away.", theme: "Friendship", emotionalPromise: "Hopeful rescue.",
  tone: "Playful", storyScope: "Three story pages.", contentRequirements: ["Reassuring"],
  knownConstraints: ["Two characters"], deferredDecisions: [], approvalQuestions: [],
};
const outline = {
  schemaVersion: "2", title: "Kite Rescue", summary: "The kite flies away and two friends retrieve it.",
  characters: [{ nameOrRole: "Inventor", narrativeRole: "Protagonist", relationship: "Robot's friend", openDetails: [] }],
  locations: [{ name: "Park", storyPurpose: "Kite rescue", openDetails: [] }],
  storyArc: { opening: "They fly a kite.", incitingAction: "Wind takes it.", escalation: "They search.", decisiveChoice: "They work together.", resolution: "They retrieve it." },
  theme: "Friendship", emotionalArc: "Worry to relief", deferredDecisions: [], approvalQuestions: [],
};

describe("experiment runner contracts", () => {
  it("fixes task IDs and synthetic case limits", () => {
    expect(experimentTaskSchema.options).toHaveLength(13);
    expect(experimentTaskSchema.safeParse("J14").success).toBe(false);
    expect(Object.values(CASES).map(({ storyPages, llmLimit, imageLimit, textRevisionLimit, imageRevisionLimit }) =>
      [storyPages, llmLimit, imageLimit, textRevisionLimit, imageRevisionLimit])).toEqual([
      [3, 120, 12, 1, 1], [5, 160, 14, 1, 1], [8, 220, 20, 3, 2],
    ]);
    expect(Object.values(CASES).every((entry) => entry.brief.length > 30)).toBe(true);
  });

  it("requires canonical content and strips harmless extra content fields", () => {
    expect(conceptBriefSchema.safeParse({ ...concept, premise: " " }).success).toBe(false);
    expect(storyOutlineSchema.safeParse({ ...outline, characters: [] }).success).toBe(false);
    expect(parseNarrativeProposal("J01", { ...concept, extra: "ignored", audience: { ...concept.audience, extra: true } }).content)
      .toEqual(concept);
    expect(parseNarrativeProposal("J02", { ...outline, storyArc: { ...outline.storyArc, extra: "ignored" } }).content)
      .toEqual(outline);
  });

  it("warns for preferred lengths while enforcing generous hard bounds", () => {
    const result = parseNarrativeProposal("J01", { ...concept, title: "T".repeat(241), premise: "long ".repeat(301) });
    expect(result.warnings.map((warning) => warning.field)).toContain("title");
    expect(result.warnings.map((warning) => warning.field)).toContain("premise");
    expect(conceptBriefSchema.safeParse({ ...concept, premise: "x".repeat(16_001) }).success).toBe(false);
    expect(conceptBriefSchema.safeParse({ ...concept, knownConstraints: Array(101).fill("a") }).success).toBe(false);
    expect(parseNarrativeProposal("J01", { ...concept, premise: "🌟" }).content.premise).toBe("🌟");
    expect(MAX_NARRATIVE_CONTENT_BYTES).toBe(2_097_152);
    expect(() => parseNarrativeProposal("J01", { ...concept, knownConstraints: Array(100).fill("🌟".repeat(6_000)) }))
      .toThrow(/2 MiB storage limit/);
  });

  it("rejects unknown mutation envelope fields and invalid identity", () => {
    expect(createRunInputSchema.safeParse({ persona: "playful_kid", mode: "simulated", extra: true }).success).toBe(false);
    expect(createRunInputSchema.safeParse({ persona: "playful_kid", mode: "simulated", predecessorRunId: "bad" }).success).toBe(false);
    expect(lineageSchema.safeParse({ correlationId: id, parentWorkflowRunId: null, workflowRunId: id, role: "manager", operationId: id, extra: true }).success).toBe(false);
    const envelope = { runId: id, operationId: id, workflowRunId: id, inputFingerprint: "a".repeat(64), result: { kind: "ask", payload: { question: "What tone?" } } };
    expect(resultEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(resultEnvelopeSchema.safeParse({ ...envelope, inputFingerprint: "short" }).success).toBe(false);
    expect(resultEnvelopeSchema.safeParse({ ...envelope, extra: true }).success).toBe(false);
    expect(resultEnvelopeSchema.safeParse({ ...envelope, result: { ...envelope.result, extra: true } }).success).toBe(false);
  });

  it("separates role results without granting decision authority", () => {
    expect(validateRoleResult("manager", { kind: "delegate", payload: { taskId: "J01", subjectKind: "book", subjectId: id } }).kind).toBe("delegate");
    expect(validateRoleResult("specialist", { kind: "proposal", payload: { taskId: "J01", content: concept } }).kind).toBe("proposal");
    expect(validateRoleResult("tester", { kind: "decision", payload: { decision: { action: "approve", versionIds: [id] } } }).kind).toBe("decision");
    expect(validateRoleResult("judge", { kind: "assessment", payload: {} }).kind).toBe("assessment");
    expect(validateRoleResult("image", { kind: "clarification", payload: { question: "Which expression fits the approved scene?" } }).kind).toBe("clarification");
    expect(() => validateRoleResult("manager", { kind: "decision", payload: { decision: { action: "approve", versionIds: [id] } } })).toThrow();
    expect(() => validateRoleResult("specialist", { kind: "assessment", payload: {} })).toThrow();
    expect(() => validateRoleResult("image", { kind: "decision", payload: { decision: { action: "approve", versionIds: [id] } } })).toThrow();
    expect(() => validateRoleResult("tester", { kind: "approval", payload: {} })).toThrow();
  });

  it("routes J13 manager delegation to pages without making it a text specialist", () => {
    expect(validateRoleResult("manager", { kind: "delegate", payload: { taskId: "J13", subjectKind: "page", subjectId: id } }).kind).toBe("delegate");
    for (const subjectKind of ["book", "character", "location"]) {
      expect(() => validateRoleResult("manager", { kind: "delegate", payload: { taskId: "J13", subjectKind, subjectId: id } })).toThrow();
    }
    expect(() => validateRoleResult("specialist", { kind: "proposal", payload: { taskId: "J13", content: {} } })).toThrow();
  });
});
