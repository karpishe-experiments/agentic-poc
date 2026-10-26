import { describe, expect, it } from "vitest";
import { m4AllowedContextValues } from "@/db/experiment-text-preparation";
import { m4BindAllowedValues, m4RequestDefinition, type M4RequestSelector } from "@/lib/experiment-runner/m4-request";
import { m4TestId as id } from "@/tests/helpers/m4-policy";
import { CASES, personaSchema } from "@/lib/contracts/experiment-runner";
import { m4TesterRevisionEligibility } from "@/lib/experiment-runner/tester-decision-eligibility";

const specialist = (taskId: M4RequestSelector["taskId"]): M4RequestSelector => ({ role: "specialist", taskId, persona: "playful_kid", report: false });
describe("M4 choices from protected role context", () => {
  it("pins manager selection to the eligible task and exact subject", () => {
    const selector: M4RequestSelector = { role: "manager", taskId: null, persona: "playful_kid", report: false };
    const allowed = m4AllowedContextValues(selector, { run: { bookletId: id(1) }, eligibleRoute: "J13", eligibleTarget: { subjectKind: "page", subjectId: id(2) } });
    expect(allowed).toMatchObject({ taskId: ["J13"], subjectKind: ["page"], subjectId: [id(2)] });
    const schema = JSON.stringify(m4BindAllowedValues(m4RequestDefinition(selector).outputSchema, allowed));
    expect(schema).toContain(id(2)); expect(schema).not.toContain('"J01"');
  });
  it("retains manuscript free text while restricting entity and unit identities", () => {
    const selector = specialist("J05");
    const allowed = m4AllowedContextValues(selector, { approvedSources: [{ content: { characters: [{ characterId: id(1) }], locations: [{ locationId: id(2) }] } }] });
    const bound = m4BindAllowedValues(m4RequestDefinition(selector).outputSchema, allowed);
    expect(allowed).toMatchObject({ characterIds: [id(1)], speakerId: [id(1)], locationId: [id(2)] });
    expect(JSON.stringify(bound)).toContain('"proposal"');
    // Narrative action prose must not be confused with the tester action enum.
    expect(JSON.stringify(bound)).toContain('"action":{"type":"string"');
  });
  it("routes only approved sheet references to pagination and page Bibles", () => {
    const allowed = m4AllowedContextValues(specialist("J12"), { approvedSources: [
      { id: id(1), taskId: "J08", content: { samples: [{ build: { assetId: id(2) } }] } },
      { id: id(3), taskId: "J09", content: { build: { assetId: id(4) } } },
      { id: id(5), taskId: "J11", content: { pages: [{ panels: [{ sheetReferences: [{ artifactVersionId: id(6), assetId: id(7) }] }] }] } },
    ] });
    expect(allowed.assetId).toEqual([id(4), id(7)]);
    expect(allowed.artifactVersionId).toEqual([id(3), id(6)]);
  });
  it("preserves Creator explicit approval and restricts questions to answers", () => {
    const selector: M4RequestSelector = { role: "tester", taskId: null, persona: "professional_creator", report: false };
    const context = { bookletId: id(1), currentArtifacts: [{ taskId: "J01", currentVersionId: id(2), state: "draft" }, { taskId: "J01", currentVersionId: id(3), state: "approved" }], eligibleTaskIds: ["J01"], revisionCounts: { text: 0, image: 0 } };
    const allowed = m4AllowedContextValues(selector, context);
    expect(allowed.action).toEqual(["approve", "revise"]);
    expect(allowed.versionIds).toEqual([id(2)]);
    expect(m4AllowedContextValues(selector, { ...context, pendingDecision: { kind: "question", questionId: id(4) } }).action).toEqual(["answer"]);
    expect(m4AllowedContextValues({ ...selector, persona: "playful_kid" }, context).action).toContain("delegate");
    expect(m4AllowedContextValues({ ...selector, persona: "playful_kid" }, { ...context, activeDelegation: { id: id(5) } }).action).toEqual(["approve", "revise", "revoke_delegation"]);
  });
  it.each(personaSchema.options)("restricts %s revision choices without changing approval or delegation targets", persona => {
    const selector = { role: "tester", taskId: null, persona, report: false } as const;
    const context = { bookletId: id(1), eligibleTaskIds: ["J01", "J13"], currentArtifacts: [
      { taskId: "J01", currentVersionId: id(2), state: "draft" },
      { taskId: "J13", currentVersionId: id(3), state: "approved" },
      { taskId: "J13", currentVersionId: id(4), state: "needs_review" },
    ], revisionCounts: { text: CASES[persona].textRevisionLimit, image: CASES[persona].imageRevisionLimit } };
    const exhausted = m4AllowedContextValues(selector, context);
    expect(exhausted.action).not.toContain("revise");
    expect(exhausted.versionIds).toEqual([id(2), id(4)]);
    expect(exhausted.taskIds).toEqual(["J01", "J13"]);
    expect(JSON.stringify(m4BindAllowedValues(m4RequestDefinition(selector).outputSchema, exhausted))).not.toContain('"revise"');
    const imageOnly = m4AllowedContextValues(selector, { ...context, revisionCounts: { ...context.revisionCounts, image: 0 } });
    expect(imageOnly.taskId).toEqual(["J13"]); expect(imageOnly.artifactVersionId).toEqual([id(3)]);
    const textOnly = m4AllowedContextValues(selector, { ...context, revisionCounts: { ...context.revisionCounts, text: 0 } });
    expect(textOnly.taskId).toEqual(["J01"]); expect(textOnly.artifactVersionId).toEqual([id(2)]);
    expect(textOnly.taskIds).toEqual(exhausted.taskIds); expect(textOnly.versionIds).toEqual(exhausted.versionIds);
  });
  it("binds revision task/version pairs while retaining free instruction text and unrelated controls", () => {
    const selector = { role: "tester", taskId: null, persona: "professional_creator", report: false } as const;
    const context = { bookletId: id(1), eligibleTaskIds: ["J01", "J13"], revisionCounts: { text: 0, image: 0 },
      currentArtifacts: [{ taskId: "J01", currentVersionId: id(2), state: "draft" }, { taskId: "J13", currentVersionId: id(3), state: "approved" }] };
    const schema = m4BindAllowedValues(m4RequestDefinition(selector).outputSchema, m4AllowedContextValues(selector, context));
    const revisions: Array<Record<string, { enum?: string[]; type?: string }>> = [];
    function visit(raw: unknown) {
      if (!raw || typeof raw !== "object") return;
      const node = raw as Record<string, unknown>;
      const properties = node.properties as Record<string, { enum?: string[]; type?: string }> | undefined;
      if (properties?.action?.enum?.includes("revise")) revisions.push(properties);
      for (const child of Object.values(node)) if (Array.isArray(child)) child.forEach(visit); else visit(child);
    }
    visit(schema);
    expect(revisions.map(properties => [properties.taskId.enum, properties.artifactVersionId.enum])).toEqual([
      [["J01"], [id(2)]], [["J13"], [id(3)]],
    ]);
    expect(revisions.every(properties => properties.instruction.type === "string")).toBe(true);
    expect(JSON.stringify(schema)).toContain('"approve"');
  });
  it("requires saved counts and excludes pending decisions and unavailable targets", () => {
    const context = { eligibleTaskIds: ["J13"], currentArtifacts: [
      { taskId: "J13", currentVersionId: id(2), state: "needs_review" },
      { taskId: "J01", currentVersionId: id(3), state: "approved" },
    ], revisionCounts: { text: 0, image: 0 } };
    expect(m4TesterRevisionEligibility("professional_creator", context).revisionTargets).toEqual([]);
    expect(m4TesterRevisionEligibility("professional_creator", { ...context, currentArtifacts: [
      { taskId: "J13", currentVersionId: id(2), state: "draft" },
    ], pendingDecision: { kind: "question", questionId: id(4) } }).revisionTargets).toEqual([]);
    expect(() => m4TesterRevisionEligibility("professional_creator", { ...context, revisionCounts: undefined })).toThrow();
    expect(() => m4TesterRevisionEligibility("professional_creator", { ...context, revisionCounts: { text: -1, image: 0 } })).toThrow();
    // J09/J10 design revisions remain text controls in the owning materializer.
    expect(m4TesterRevisionEligibility("professional_creator", { ...context, eligibleTaskIds: ["J09"],
      revisionCounts: { text: 3, image: 0 }, currentArtifacts: [{ taskId: "J09", currentVersionId: id(5), state: "approved" }] }).revisionTargets).toEqual([]);
  });
});
