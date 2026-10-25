/** Size-only evidence for one already-built M4 request. No content is retained. */
export const CONTEXT_DIAGNOSTICS_VERSION = "context_diagnostics_v1" as const;
export const CONTEXT_SECTION_NAMES = ["brief", "currentTarget", "approvedSources", "creatorMessages",
  "questionAnswers", "currentArtifacts", "operationHistory", "feedback", "layout", "requiredLettering", "evidenceScope", "other"] as const;
export type ContextSectionName = typeof CONTEXT_SECTION_NAMES[number];
export type ContextWarningCode = "request_bytes_high" | "estimated_input_tokens_high" |
  "counted_input_tokens_high" | "counted_input_tokens_large" | "read_json_bytes_high" | "read_elapsed_high";
export type ContextWarning = { code: ContextWarningCode; projectionVersion: string };
export type ContextDiagnostics = {
  version: typeof CONTEXT_DIAGNOSTICS_VERSION;
  projectionVersion: string; requestDigest: string;
  contextBytes: number; systemPromptBytes: number; schemaBytes: number; requestBytes: number;
  estimatedInputTokens: number; estimator: "utf8_bytes_div4_v1"; authoritativeInputTokens: number | null;
  sectionBytes: Record<ContextSectionName, number>;
  currentCount: number | null; historyCount: number | null;
  read: { returnedJsonBytes: number | null; elapsedMs: number | null };
  warnings: ContextWarning[];
};

export type ContextDiagnosticsInput = {
  projectionVersion: string; requestDigest: string;
  role: "manager" | "specialist" | "tester" | "judge" | "image";
  contextJson: string; systemPrompt: string; outputSchema: unknown; requestJson: string;
  read?: { returnedJsonBytes?: number | null; elapsedMs?: number | null };
};

const sections = CONTEXT_SECTION_NAMES.filter(name => name !== "other");
const requestLimit = (role: ContextDiagnosticsInput["role"]) => role === "manager" ? 16_384 : 131_072;
const validMeasure = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const byteLength = (value: string) => Buffer.byteLength(value, "utf8");

function appendWarning(warnings: ContextWarning[], code: ContextWarningCode, projectionVersion: string) {
  if (!warnings.some(warning => warning.code === code && warning.projectionVersion === projectionVersion))
    warnings.push({ code, projectionVersion });
}

/** A diagnostic failure must never turn preparation into a failure. */
export function buildContextDiagnostics(input: ContextDiagnosticsInput): ContextDiagnostics | undefined {
  try {
    if (!/^[a-z0-9_]{1,32}$/.test(input.projectionVersion) || !/^[a-f0-9]{64}$/i.test(input.requestDigest)) return undefined;
    const parsed: unknown = JSON.parse(input.contextJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const context = parsed as Record<string, unknown>;
    const sectionBytes = Object.fromEntries(CONTEXT_SECTION_NAMES.map(name => [name, 0])) as Record<ContextSectionName, number>;
    for (const name of sections) if (Object.hasOwn(context, name)) {
      const serialized = JSON.stringify(context[name]);
      if (serialized === undefined) return undefined;
      sectionBytes[name] = byteLength(serialized);
    }
    const other = Object.fromEntries(Object.entries(context).filter(([name]) => !sections.includes(name as Exclude<ContextSectionName, "other">)));
    const otherJson = JSON.stringify(other);
    const schemaJson = typeof input.outputSchema === "string" ? input.outputSchema : JSON.stringify(input.outputSchema);
    if (schemaJson === undefined || otherJson === undefined) return undefined;
    sectionBytes.other = byteLength(otherJson);
    const requestBytes = byteLength(input.requestJson);
    const projectionVersion = input.projectionVersion;
    const estimatedInputTokens = Math.ceil(requestBytes / 4);
    const warnings: ContextWarning[] = [];
    if (requestBytes > requestLimit(input.role)) appendWarning(warnings, "request_bytes_high", projectionVersion);
    if (estimatedInputTokens > 24_000) appendWarning(warnings, "estimated_input_tokens_high", projectionVersion);
    const read = { returnedJsonBytes: validMeasure(input.read?.returnedJsonBytes) ? input.read.returnedJsonBytes : null,
      elapsedMs: validMeasure(input.read?.elapsedMs) ? input.read.elapsedMs : null };
    if (read.returnedJsonBytes !== null && read.returnedJsonBytes > 262_144)
      appendWarning(warnings, "read_json_bytes_high", projectionVersion);
    if (read.elapsedMs !== null && read.elapsedMs > 10_000) appendWarning(warnings, "read_elapsed_high", projectionVersion);
    return { version: CONTEXT_DIAGNOSTICS_VERSION, projectionVersion, requestDigest: input.requestDigest,
      contextBytes: byteLength(input.contextJson), systemPromptBytes: byteLength(input.systemPrompt),
      schemaBytes: byteLength(schemaJson), requestBytes, estimatedInputTokens, estimator: "utf8_bytes_div4_v1",
      authoritativeInputTokens: null, sectionBytes,
      currentCount: Array.isArray(context.currentArtifacts) ? context.currentArtifacts.length : null,
      historyCount: Array.isArray(context.operationHistory) ? context.operationHistory.length : null,
      read, warnings };
  } catch { return undefined; }
}

/** Attach an existing provider count. This function performs no provider call. */
export function mergeAuthoritativeCount(value: ContextDiagnostics, countedInputTokens: unknown): ContextDiagnostics {
  try {
  if (!Number.isSafeInteger(countedInputTokens) || (countedInputTokens as number) < 0) return value;
  const count = countedInputTokens as number;
  const warnings = [...value.warnings];
  if (count > 24_000) appendWarning(warnings, "counted_input_tokens_high", value.projectionVersion);
  if (count > 32_000) appendWarning(warnings, "counted_input_tokens_large", value.projectionVersion);
  return { ...value, authoritativeInputTokens: count, warnings };
  } catch { return value; }
}
