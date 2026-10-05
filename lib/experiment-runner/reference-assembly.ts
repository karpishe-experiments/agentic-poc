import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentImageRequestSchema, imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { parseReferenceProposal } from "@/lib/contracts/experiment-references";
import { referenceSheetRequest } from "@/lib/experiment-runner/reference-requests";

const evidenceSchema = z.strictObject({
  operationId: opaqueIdSchema,
  assetId: opaqueIdSchema,
  inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  request: experimentImageRequestSchema,
});

// The repository supplies evidence read from the saved operation and asset.
// This pure step does not prove storage, current approval, or operation success.
export function assembleReferenceSheet(task: "J09" | "J10", proposal: unknown, savedEvidence: unknown) {
  const parsed = parseReferenceProposal(task, "proposal", proposal);
  const evidence = evidenceSchema.parse(savedEvidence);
  const expected = referenceSheetRequest(task, parsed.content);
  const fingerprint = imageRequestFingerprint(expected);
  if (evidence.inputFingerprint !== fingerprint || imageRequestFingerprint(evidence.request) !== fingerprint) {
    throw new Error("Saved sheet image request differs from its proposal.");
  }
  return parseReferenceProposal(task, "assembled", {
    ...parsed.content,
    build: {
      prompt: expected.prompt,
      stylePromptModuleHash: parsed.content.stylePromptModuleHash,
      operationId: evidence.operationId,
      assetId: evidence.assetId,
      sourceVersionIds: expected.sourceVersionIds,
    },
  });
}
