import { personaSchema, specialistTaskSchema } from "@/lib/contracts/experiment-runner";
import { m4RequestBundleHash, prepareM4Request, type M4RequestSelector } from "@/lib/experiment-runner/m4-request";
import { m4TestId, m4TestPolicy } from "@/tests/helpers/m4-policy";

// Synthetic protocol vectors only. These are not persona acceptance evidence.
export function m4RequestVectors() {
  const policy = { ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash() };
  const allowed: Record<string, string[]> = { taskId: [...specialistTaskSchema.options, "J13"], taskIds: [...specialistTaskSchema.options, "J13"],
    subjectKind: ["book", "character", "location", "page"], action: ["delegate", "approve", "revise", "answer", "revoke_delegation"] };
  for (const field of ["subjectId", "versionIds", "questionId", "artifactVersionId", "delegationId", "charactersPresent", "locationId", "speakerId",
    "speakerEntityId", "characterId", "unitIds", "locationIds", "characterIds", "manuscriptUnitIds", "assetId", "runId", "artifactId", "versionId", "pageId"]) {
    allowed[field] = [m4TestId(1)];
  }
  return personaSchema.options.flatMap((persona) => {
    const selectors: M4RequestSelector[] = [
      { role: "manager", taskId: null, persona, report: false }, { role: "tester", taskId: null, persona, report: false },
      { role: "tester", taskId: null, persona, report: true }, { role: "judge", taskId: null, persona, report: true },
      ...specialistTaskSchema.options.map((taskId) => ({ role: "specialist" as const, taskId, persona, report: false })),
    ];
    return selectors.map((selector) => prepareM4Request(policy, selector, JSON.stringify({ brief: "هواپیما 🪁", layout: { x: 0.5 }, persona }), allowed));
  });
}
