import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import { realReportCarrier } from "@/lib/experiment-runner/real-report-carrier";

describe("Real report native-image carrier", () => {
  it("matches the bounded Python adapter's canonical text and image digests", () => {
    const image = Buffer.concat([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
      Buffer.from("0000040000000400080200000000000000", "hex")]);
    const original = { model: "gpt-6-luna", input: [
      { type: "message", role: "system", content: "System" },
      { type: "message", role: "user", content: "Judge قاصدک" },
    ], max_output_tokens: 2048, reasoning: { effort: "none", mode: "standard" },
    service_tier: "default", text: { format: { type: "json_schema", name: "fixture", strict: true,
      schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"],
        additionalProperties: false } } }, store: false, truncation: "disabled",
    include: ["reasoning.encrypted_content"] };
    const policy = { version: "m4_context_policy_v2", hash: "a".repeat(64),
      maxInputTokens: 128000, warningInputTokens: 32000 };
    const textRequestJson = m4CanonicalJson({ ...original, bookletPolicy: { contractVersion: "booklet_carrier_v2",
      requestDigest: m4Hash(m4CanonicalJson(original)), tokenPolicy: policy } });
    const { carrier, carrierJson } = realReportCarrier({ textRequestJson,
      images: [{ manifest: { assetId: "00000000-0000-4000-8000-000000000001",
        versionId: "00000000-0000-4000-8000-000000000002",
        sha256: createHash("sha256").update(image).digest("hex"), byteLength: image.length,
        mimeType: "image/png", width: 1024, height: 1024 }, bytes: image }],
      deadlineAtMs: Number.MAX_SAFE_INTEGER });
    expect(carrier.textRequestDigest).toBe("e21c477c475be777f345695e41013203c4debf0bee671dd237f2566522eba108");
    expect(carrier.manifestDigest).toBe("da5c7ca35a4384829a683331a0f0087b49ce9cd905433a8c7dc3deba0c39c66e");
    expect(carrier.finalRequestDigest).toBe("cab519b767554c909be7d8a107426f7ee723b8dcbd2ac5f00074e26a372c68bb");
    expect(carrierJson).not.toContain("data:image/png;base64,");
  });
});
