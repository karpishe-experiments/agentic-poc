import { describe, expect, it } from "vitest";
import { buildContextDiagnostics, mergeAuthoritativeCount } from "@/lib/experiment-runner/context-diagnostics";

const digest = "a".repeat(64);
const base = { projectionVersion: "preparation_v1", requestDigest: digest, role: "specialist" as const,
  contextJson: JSON.stringify({ brief: "private brief", approvedSources: [{ content: "private source" }],
    currentArtifacts: [{ content: "private artifact" }], operationHistory: [{ result: "private history" }],
    unknownFutureField: "private extra" }), systemPrompt: "private system prompt",
  outputSchema: { type: "object", description: "private schema" }, requestJson: "private request" };

describe("size-only context diagnostics", () => {
  it("retains allowlisted sizes and counts without any content", () => {
    const value = buildContextDiagnostics(base)!;
    expect(value).toMatchObject({ version: "context_diagnostics_v1", projectionVersion: "preparation_v1",
      requestDigest: digest, estimator: "utf8_bytes_div4_v1", authoritativeInputTokens: null,
      currentCount: 1, historyCount: 1, warnings: [] });
    expect(value.contextBytes).toBe(Buffer.byteLength(base.contextJson, "utf8"));
    expect(value.systemPromptBytes).toBe(Buffer.byteLength(base.systemPrompt, "utf8"));
    expect(value.schemaBytes).toBe(Buffer.byteLength(JSON.stringify(base.outputSchema), "utf8"));
    expect(value.sectionBytes.approvedSources).toBeGreaterThan(0);
    expect(value.sectionBytes.other).toBeGreaterThan(0);
    expect(JSON.stringify(value)).not.toMatch(/private|source|future|prompt|requestJson/);
  });

  it("warns at strict byte, estimate, count and read thresholds with deduplicated codes", () => {
    const boundary = buildContextDiagnostics({ ...base, role: "manager", requestJson: "x".repeat(16_384),
      read: { returnedJsonBytes: 262_144, elapsedMs: 10_000 } })!;
    expect(boundary.warnings).toEqual([]);
    expect(mergeAuthoritativeCount(boundary, 24_000).warnings).toEqual([]);
    const manager = buildContextDiagnostics({ ...base, role: "manager", requestJson: "x".repeat(16_385),
      read: { returnedJsonBytes: 262_145, elapsedMs: 10_001 } })!;
    expect(manager.warnings.map(w => w.code)).toEqual(["request_bytes_high", "read_json_bytes_high", "read_elapsed_high"]);
    const large = buildContextDiagnostics({ ...base, requestJson: "x".repeat(131_073) })!;
    expect(large.estimatedInputTokens).toBe(32_769);
    expect(large.warnings.map(w => w.code)).toEqual(["request_bytes_high", "estimated_input_tokens_high"]);
    const counted = mergeAuthoritativeCount(large, 32_001);
    expect(counted.warnings.map(w => w.code)).toEqual(["request_bytes_high", "estimated_input_tokens_high",
      "counted_input_tokens_high", "counted_input_tokens_large"]);
    expect(mergeAuthoritativeCount(counted, 32_001)).toEqual(counted);
    expect(mergeAuthoritativeCount(counted, Number.NaN)).toBe(counted);
    expect(mergeAuthoritativeCount(counted, -1)).toBe(counted);
    expect(mergeAuthoritativeCount(counted, "32001")).toBe(counted);
    expect(mergeAuthoritativeCount(large, 32_000).warnings.map(w => w.code)).toEqual([
      "request_bytes_high", "estimated_input_tokens_high", "counted_input_tokens_high"]);
  });

  it("uses UTF-8 bytes, leaves unsupported counts null, and never throws on serialization failure", () => {
    const unicode = buildContextDiagnostics({ ...base, contextJson: JSON.stringify({ brief: "é" }), requestJson: "é" })!;
    expect(unicode.requestBytes).toBe(2); expect(unicode.estimatedInputTokens).toBe(1);
    expect(unicode.currentCount).toBeNull(); expect(unicode.historyCount).toBeNull();
    expect(buildContextDiagnostics({ ...base, contextJson: "{" })).toBeUndefined();
    expect(buildContextDiagnostics({ ...base, outputSchema: { invalid: BigInt(1) } })).toBeUndefined();
    expect(buildContextDiagnostics({ ...base, requestDigest: "private data" })).toBeUndefined();
    const malformed = { ...unicode, warnings: null } as unknown as typeof unicode;
    expect(mergeAuthoritativeCount(malformed, 32_001)).toBe(malformed);
  });
});
