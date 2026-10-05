import { describe, expect, it } from "vitest";
import { styleModuleHash } from "@/lib/contracts/experiment-references";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { assembleReferenceSheet } from "@/lib/experiment-runner/reference-assembly";
import { referenceSheetRequest } from "@/lib/experiment-runner/reference-requests";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const styleText = "  ink lines\nsoft colours  \n";
const base = { schemaVersion: "2", title: "Reference", finalListVersionId: id(1), styleVersionId: id(2),
  stylePromptModule: styleText, stylePromptModuleHash: styleModuleHash(styleText),
  sheetPromptModule: "One montage, no labels.", reviewQuestions: [] };
const character = { ...base, characterId: id(3), characterDesignProfile: "Inventor",
  attireRequirements: [], accessories: [], requiredViews: ["front", "back", "side", "neutral_facial"],
  additionalExpressions: ["joy", "concern", "relief"] };
const location = { ...base, locationId: id(4), locationDefinitionProfile: "Park", stableAnchors: ["gate"],
  requiredFeatures: [], overview: "isometric", supportingViews: [{ angle: "entry", shows: "gate" }, { angle: "reverse", shows: "path" }] };

describe("reference sheet assembly contract", () => {
  for (const [task, proposal] of [["J09", character], ["J10", location]] as const) {
    const request = referenceSheetRequest(task, proposal);
    const evidence = { operationId: id(5), assetId: id(6), request, inputFingerprint: imageRequestFingerprint(request) };
    it(`${task} assembles exact saved evidence deterministically after reload`, () => {
      const first = assembleReferenceSheet(task, proposal, evidence);
      const reloaded = assembleReferenceSheet(task, JSON.parse(JSON.stringify(proposal)), JSON.parse(JSON.stringify(evidence)));
      expect(reloaded).toEqual(first);
      expect("build" in first.content && first.content.build).toEqual({ prompt: request.prompt,
        stylePromptModuleHash: base.stylePromptModuleHash, operationId: id(5), assetId: id(6), sourceVersionIds: [id(1), id(2)] });
      expect(first.content.stylePromptModule).toBe(styleText);
    });
    it(`${task} rejects changed prompt, sources, fingerprint or subject`, () => {
      for (const changed of [{ ...request, prompt: `${request.prompt} changed` },
        { ...request, sourceVersionIds: [...request.sourceVersionIds].reverse() },
        { ...request, sourceVersionIds: [...request.sourceVersionIds, id(7)] }]) {
        expect(() => assembleReferenceSheet(task, proposal, { ...evidence, request: changed })).toThrow();
      }
      expect(() => assembleReferenceSheet(task, proposal, { ...evidence, inputFingerprint: "0".repeat(64) })).toThrow();
      const changedSubject = task === "J09" ? { ...proposal, characterId: id(8) } : { ...proposal, locationId: id(8) };
      expect(() => assembleReferenceSheet(task, changedSubject, evidence)).toThrow();
      expect(() => assembleReferenceSheet(task, proposal, { ...evidence, assetId: "invalid" })).toThrow();
    });
  }
});
