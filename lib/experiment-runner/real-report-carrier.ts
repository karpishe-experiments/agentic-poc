import { createHash } from "node:crypto";
import { z } from "zod";
import { m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import { realImageReferenceSchema } from "@/lib/experiment-runner/real-image-contract";

export const REAL_REPORT_ADAPTER_IDENTITY = "m5-openai-bounded@1" as const;
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const manifestSchema = z.array(realImageReferenceSchema).min(1).max(15);
export const realReportCarrierSchema = z.strictObject({
  schemaVersion: z.literal("booklet_real_report_carrier_v1"),
  textRequestJson: z.string().min(1).max(2 * 1024 * 1024), textRequestDigest: digest,
  orderedImages: manifestSchema, manifestDigest: digest, finalRequestDigest: digest,
  deadlineAtMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  adapterIdentity: z.literal(REAL_REPORT_ADAPTER_IDENTITY),
});
export type RealReportCarrier = z.infer<typeof realReportCarrierSchema>;

// Native image parts travel beside this small carrier in Dify. The digest
// covers the exact final Responses payload built from original bytes; it does
// not place those bytes in the 2 MiB text carrier.
export function realReportCarrier(input: { textRequestJson: string;
  images: Array<{ manifest: z.infer<typeof realImageReferenceSchema>; bytes: Uint8Array }>;
  deadlineAtMs: number }): { carrier: RealReportCarrier; carrierJson: string } {
  const textRequest = JSON.parse(input.textRequestJson) as Record<string, unknown>;
  if (m4CanonicalJson(textRequest) !== input.textRequestJson) throw new Error("Real report text request is not canonical.");
  const policy = textRequest.bookletPolicy as Record<string, unknown> | undefined;
  if (!policy || policy.contractVersion !== "booklet_carrier_v2") throw new Error("Real report text policy is missing.");
  const { bookletPolicy: _policy, ...providerRequest } = textRequest;
  void _policy;
  if (policy.requestDigest !== m4Hash(m4CanonicalJson(providerRequest))) throw new Error("Real report text policy digest differs.");
  const messages = providerRequest.input;
  if (!Array.isArray(messages) || messages.length !== 2 || typeof messages[1] !== "object" || !messages[1]) {
    throw new Error("Real report text messages differ.");
  }
  const user = messages[1] as Record<string, unknown>;
  if (user.role !== "user" || typeof user.content !== "string") throw new Error("Real report user context is missing.");
  const manifest = manifestSchema.parse(input.images.map(item => item.manifest));
  const finalImages = input.images.map((item, index) => {
    const expected = manifest[index]!;
    const bytes = Buffer.from(item.bytes);
    if (bytes.length !== expected.byteLength || createHash("sha256").update(bytes).digest("hex") !== expected.sha256 ||
        bytes.length > 10 * 1024 * 1024 || expected.width * expected.height > 64_000_000) {
      throw new Error("Real report original image differs from its manifest.");
    }
    return { type: "input_image", image_url: `data:${expected.mimeType};base64,${bytes.toString("base64")}`, detail: "high" };
  });
  const finalRequest = { ...providerRequest, input: [messages[0], { ...user,
    content: [{ type: "input_text", text: user.content }, ...finalImages] }] };
  const carrier = realReportCarrierSchema.parse({ schemaVersion: "booklet_real_report_carrier_v1",
    textRequestJson: input.textRequestJson, textRequestDigest: m4Hash(input.textRequestJson),
    orderedImages: manifest, manifestDigest: m4Hash(m4CanonicalJson(manifest)),
    finalRequestDigest: m4Hash(m4CanonicalJson(finalRequest)), deadlineAtMs: input.deadlineAtMs,
    adapterIdentity: REAL_REPORT_ADAPTER_IDENTITY });
  const carrierJson = m4CanonicalJson(carrier);
  if (Buffer.byteLength(carrierJson, "utf8") > 2 * 1024 * 1024) throw new Error("Real report carrier exceeds its transport limit.");
  return { carrier, carrierJson };
}
