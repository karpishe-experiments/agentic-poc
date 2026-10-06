import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentImageRequestSchema, imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { MAX_EXPERIMENT_IMAGE_BYTES, MAX_EXPERIMENT_IMAGE_PIXELS, MAX_REFERENCE_UPLOAD_BYTES } from "@/lib/experiment-runner/image-limits";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const uploadUserSchema = z.string().regex(/^booklet-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const attachmentRoleSchema = z.enum(["character", "location"]);
const positiveInteger = z.number().int().positive();

// This is an application-owned, replayable record. It intentionally contains
// neither credentials nor URLs. Database approval, retained asset bytes, and
// provider ownership require repository/network checks outside this pure module.
const pageIllustrationAttachmentFieldsSchema = z.strictObject({
  role: attachmentRoleSchema,
  subjectId: opaqueIdSchema,
  assetId: opaqueIdSchema,
  artifactVersionId: opaqueIdSchema,
  uploadFileId: opaqueIdSchema,
  uploadUser: uploadUserSchema,
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  sha256: sha256Schema,
  byteLength: positiveInteger.max(MAX_REFERENCE_UPLOAD_BYTES),
  width: positiveInteger,
  height: positiveInteger,
});
export const pageIllustrationAttachmentSchema = pageIllustrationAttachmentFieldsSchema.refine((attachment) => attachment.width * attachment.height <= MAX_EXPERIMENT_IMAGE_PIXELS,
  "Attachment dimensions exceed the image limit.");

export const pageIllustrationCandidateLineageSchema = z.strictObject({
  previousPageVersionId: opaqueIdSchema.nullable(),
});

export const pageIllustrationOutputSchema = z.strictObject({
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  sha256: sha256Schema,
  byteLength: positiveInteger.max(MAX_EXPERIMENT_IMAGE_BYTES),
  width: positiveInteger,
  height: positiveInteger,
}).refine((output) => output.width * output.height <= MAX_EXPERIMENT_IMAGE_PIXELS,
  "Output dimensions exceed the image limit.");

export const savedPageIllustrationPackageSchema = z.strictObject({
  schemaVersion: z.literal("2"),
  runId: opaqueIdSchema,
  pageId: opaqueIdSchema,
  pageIndex: z.number().int().nonnegative(),
  pageBibleVersionId: opaqueIdSchema,
  assetId: opaqueIdSchema,
  output: pageIllustrationOutputSchema,
  request: experimentImageRequestSchema,
  sourceVersionIds: z.array(opaqueIdSchema).min(1).max(50),
  operationId: opaqueIdSchema,
  workflowRunId: opaqueIdSchema,
  publishedWorkflowId: opaqueIdSchema,
  parentWorkflowRunId: opaqueIdSchema,
  inputFingerprint: sha256Schema,
  candidateLineage: pageIllustrationCandidateLineageSchema,
  attachments: z.array(pageIllustrationAttachmentSchema).max(15),
  warnings: z.array(z.string().min(1).max(1_000)).max(100),
});

export type PageIllustrationAttachment = z.infer<typeof pageIllustrationAttachmentSchema>;
export type SavedPageIllustrationPackage = z.infer<typeof savedPageIllustrationPackageSchema>;

type RoutedAttachment = Pick<PageIllustrationAttachment, "role" | "subjectId" | "assetId" | "artifactVersionId">;
type UploadAcknowledgement = RoutedAttachment & Omit<PageIllustrationAttachment, "role" | "subjectId" | "assetId" | "artifactVersionId" | "uploadUser">;

export type BuildSavedPageIllustrationPackageInput = Omit<SavedPageIllustrationPackage,
  "schemaVersion" | "sourceVersionIds" | "attachments"> & {
  expectedAttachments: RoutedAttachment[];
  uploadAcknowledgements: UploadAcknowledgement[];
};

function attachmentIdentity(value: RoutedAttachment): string {
  return JSON.stringify([value.role, value.subjectId, value.assetId, value.artifactVersionId]);
}

function sameOrder(left: RoutedAttachment[], right: RoutedAttachment[]): boolean {
  return left.length === right.length && left.every((item, index) => attachmentIdentity(item) === attachmentIdentity(right[index]!));
}

function assertPackageInvariants(value: SavedPageIllustrationPackage): void {
  if (value.request.kind !== "page_source") throw new Error("J13 requires a page_source image request.");
  if (value.request.styleVersionId === null) throw new Error("J13 requires a style source version.");
  if (value.sourceVersionIds[0] !== value.pageBibleVersionId ||
    JSON.stringify(value.sourceVersionIds) !== JSON.stringify(value.request.sourceVersionIds)) {
    throw new Error("J13 source versions must retain the request order with the page bible first.");
  }
  if (!value.sourceVersionIds.includes(value.request.styleVersionId)) throw new Error("J13 style version must be a source.");
  if (value.inputFingerprint !== imageRequestFingerprint(value.request)) throw new Error("J13 input fingerprint does not match the executed request.");
  if (value.attachments.some((item) => item.uploadUser !== `booklet-${value.runId}`)) throw new Error("J13 upload ownership must match the booklet run.");
  const identities = value.attachments.map(attachmentIdentity);
  if (new Set(identities).size !== identities.length || new Set(value.attachments.map((item) => item.uploadFileId)).size !== value.attachments.length) {
    throw new Error("J13 attachments and upload file IDs must be unique.");
  }
  if (value.attachments.some((item) => !value.sourceVersionIds.includes(item.artifactVersionId))) {
    throw new Error("J13 attachment versions must be retained request sources.");
  }
}

export function validateSavedPageIllustrationPackage(input: unknown): SavedPageIllustrationPackage {
  const parsed = savedPageIllustrationPackageSchema.parse(input);
  assertPackageInvariants(parsed);
  return parsed;
}

export function buildSavedPageIllustrationPackage(input: BuildSavedPageIllustrationPackageInput): SavedPageIllustrationPackage {
  const { expectedAttachments, uploadAcknowledgements, ...base } = input;
  const expected = z.array(pageIllustrationAttachmentFieldsSchema.pick({ role: true, subjectId: true, assetId: true, artifactVersionId: true })).max(15).parse(expectedAttachments);
  const acknowledgements = z.array(pageIllustrationAttachmentFieldsSchema.omit({ uploadUser: true })).max(15).parse(uploadAcknowledgements);
  if (!sameOrder(expected, acknowledgements)) throw new Error("J13 upload acknowledgements must match selected attachments in order.");
  const attachments = acknowledgements.map((acknowledgement) => ({ ...acknowledgement, uploadUser: `booklet-${input.runId}` }));
  const candidate = {
    ...base,
    schemaVersion: "2" as const,
    sourceVersionIds: input.request.sourceVersionIds,
    attachments,
  };
  return validateSavedPageIllustrationPackage(candidate);
}
