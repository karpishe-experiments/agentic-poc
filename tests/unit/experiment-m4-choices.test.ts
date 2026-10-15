import { describe, expect, it } from "vitest";
import { m4AllowedContextValues } from "@/db/experiment-text-preparation";
import { m4BindAllowedValues, m4RequestDefinition, type M4RequestSelector } from "@/lib/experiment-runner/m4-request";
import { m4TestId as id } from "@/tests/helpers/m4-policy";

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
    const context = { bookletId: id(1), currentArtifacts: [{ currentVersionId: id(2), state: "draft" }, { currentVersionId: id(3), state: "approved" }], eligibleTaskIds: ["J01"] };
    const allowed = m4AllowedContextValues(selector, context);
    expect(allowed.action).toEqual(["approve", "revise"]);
    expect(allowed.versionIds).toEqual([id(2)]);
    expect(m4AllowedContextValues(selector, { ...context, pendingDecision: { kind: "question", questionId: id(4) } }).action).toEqual(["answer"]);
    expect(m4AllowedContextValues({ ...selector, persona: "playful_kid" }, context).action).toContain("delegate");
    expect(m4AllowedContextValues({ ...selector, persona: "playful_kid" }, { ...context, activeDelegation: { id: id(5) } }).action).toEqual(["approve", "revise", "revoke_delegation"]);
  });
});
