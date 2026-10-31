import { executionTextModel, type ExecutionPolicy } from "@/lib/experiment-runner/execution-policy";
import { z } from "zod";
import { personaSchema, specialistTaskSchema, roleResultSchema, executionAllowanceRequestSchema } from "@/lib/contracts/experiment-runner";
import { m4ModelBucket } from "@/lib/experiment-runner/m4-policy";
import { experimentReportSchema } from "@/lib/contracts/experiment-reports";
import { m4AuthorizedCarrier, m4BindAllowedValues, m4CanonicalJson, m4Hash, m4RequestDefinition, m4StrictSchema,
  M4ReportSizeError, type M4AllowedValues, type M4RequestSelector } from "@/lib/experiment-runner/m4-request";

const executionDefinitions = new Map<string, ReturnType<typeof m4RequestDefinition>>();
export function executionRequestDefinition(selector: M4RequestSelector) {
  const key = m4CanonicalJson(selector);
  const cached = executionDefinitions.get(key);
  if (cached) return cached;
  const base = m4RequestDefinition(selector);
  const decision = roleResultSchema.options.find(option => option.shape.kind.value === "decision")!;
  const outputSchema = selector.role === "tester" && !selector.report
    ? m4StrictSchema(z.strictObject({ result: z.union([decision, executionAllowanceRequestSchema]) }))
    : base.outputSchema;
  const definition = { ...base, version: "execution_request_v1",
    systemPrompt: selector.role === "tester" && !selector.report ? `${base.systemPrompt} When a current eligible artifact requires a revision but its text or image revision allowance is exhausted, request an operator allowance with allowance_request, the exact current task/version, the exhausted revision kind and the intended instruction. This is a pause request, not approval. Never request money, calls, steps or no-progress changes yourself.` : base.systemPrompt,
    outputSchema };
  const { hash: _ignored, ...contents } = definition;
  void _ignored;
  const result = { ...contents, hash: m4Hash(m4CanonicalJson(contents)) } as ReturnType<typeof m4RequestDefinition>;
  executionDefinitions.set(key, result);
  return result;
}

let bundleHash: string | undefined;
export function executionRequestBundleHash() {
  if (bundleHash) return bundleHash;
  const selectors: M4RequestSelector[] = personaSchema.options.flatMap(persona => [
    { role: "manager", taskId: null, persona, report: false },
    { role: "tester", taskId: null, persona, report: false },
    { role: "tester", taskId: null, persona, report: true },
    { role: "judge", taskId: null, persona, report: true },
    ...specialistTaskSchema.options.map(taskId => ({ role: "specialist" as const, taskId, persona, report: false })),
  ]);
  return bundleHash = m4Hash(m4CanonicalJson(selectors.map(executionRequestDefinition)));
}

const realDefinitions = new Map<string, ReturnType<typeof m4RequestDefinition>>();
export function realRequestDefinition(selector: M4RequestSelector) {
  const key = m4CanonicalJson(selector);
  const cached = realDefinitions.get(key);
  if (cached) return cached;
  const base = executionRequestDefinition(selector);
  const report = selector.report && ["tester", "judge"].includes(selector.role);
  const outputSchema = report ? m4StrictSchema(z.strictObject({ report: experimentReportSchema.pick({
    summary: true, intent: true, consistency: true, interaction: true, findings: true,
  }) })) : base.outputSchema;
  const systemPrompt = report ? base.systemPrompt.replace(
    "Images are simulated and this request is text-only: visual consistency must be not_assessed.",
    "Real original current page images are attached in the reviewed manifest order. Inspect each supplied cover and final page before assessing visual consistency. Mark consistency observed only when every required final image is delivered; identify concrete visible evidence and limitations. Do not infer unseen historical images.") :
    selector.role === "tester" ? base.systemPrompt.replace(
      "Images are simulated and text-only: visual assessment is not_assessed; do not claim to have inspected rendered images.",
      "This decision request is text-only. Do not claim to have inspected image pixels; decide from saved identities, text, source rules and warnings.") : base.systemPrompt;
  const definition = { ...base, version: "real_request_v1", systemPrompt, outputSchema };
  const { hash: _ignored, ...contents } = definition;
  void _ignored;
  const result = { ...contents, hash: m4Hash(m4CanonicalJson(contents)) } as ReturnType<typeof m4RequestDefinition>;
  realDefinitions.set(key, result);
  return result;
}

let realBundleHash: string | undefined;
export function realRequestBundleHash() {
  if (realBundleHash) return realBundleHash;
  const selectors: M4RequestSelector[] = personaSchema.options.flatMap(persona => [
    { role: "manager", taskId: null, persona, report: false },
    { role: "tester", taskId: null, persona, report: false },
    { role: "tester", taskId: null, persona, report: true },
    { role: "judge", taskId: null, persona, report: true },
    ...specialistTaskSchema.options.map(taskId => ({ role: "specialist" as const, taskId, persona, report: false })),
  ]);
  return realBundleHash = m4Hash(m4CanonicalJson(selectors.map(realRequestDefinition)));
}

// Historical v1 definitions above are immutable inputs to retained profile hashes.
export function executionDefinitionFor(policy: Pick<ExecutionPolicy, "mode" | "schemaVersion">, selector: M4RequestSelector) {
  const base = policy.mode === "real" ? realRequestDefinition(selector) : executionRequestDefinition(selector);
  if (policy.schemaVersion !== "execution_v2" || selector.role !== "manager") return base;
  const delegate = roleResultSchema.options.find(option => option.shape.kind.value === "delegate")!;
  const ask = z.strictObject({ kind: z.literal("ask"), payload: z.strictObject({ question: z.string().min(1).max(500) }) });
  const { hash: _prior, ...contents } = base;
  void _prior;
  const definition = { ...contents, version: "real_manager_compact_v2",
    systemPrompt: `${base.systemPrompt} Return exactly one compact JSON object. Copy the supplied eligible route and target identities exactly. Include no explanation, markdown or repeated context outside the result. If clarification is necessary, ask one question of at most 500 characters. Stop immediately after the final closing brace.`,
    outputSchema: m4StrictSchema(z.strictObject({ result: z.union([delegate, ask]) })) };
  return { ...definition, hash: m4Hash(m4CanonicalJson(definition)) };
}

export function executionV2RequestBundleHash() {
  const selectors: M4RequestSelector[] = personaSchema.options.flatMap(persona => [
    { role: "manager", taskId: null, persona, report: false },
    { role: "tester", taskId: null, persona, report: false },
    { role: "tester", taskId: null, persona, report: true },
    { role: "judge", taskId: null, persona, report: true },
    ...specialistTaskSchema.options.map(taskId => ({ role: "specialist" as const, taskId, persona, report: false })),
  ]);
  return m4Hash(m4CanonicalJson(selectors.map(selector => executionDefinitionFor({ mode: "real", schemaVersion: "execution_v2" }, selector))));
}

/** Execution profiles retain the M4 carrier and preparation lifecycle. */
export function prepareExecutionRequest(policy: ExecutionPolicy, selector: M4RequestSelector,
  contextJson: string, allowed: M4AllowedValues) {
  if (!contextJson.trim()) throw new Error("Execution context must not be blank.");
  const context = JSON.parse(contextJson) as unknown;
  if (!context || typeof context !== "object" || Array.isArray(context)) throw new Error("Execution context must be an object.");
  const definition = executionDefinitionFor(policy, selector);
  const contextBytes = Buffer.byteLength(contextJson, "utf8");
  if (contextBytes > 2 * 1024 * 1024) {
    if (selector.report) throw new M4ReportSizeError(contextBytes, 2 * 1024 * 1024,
      definition.hash, m4Hash(contextJson), "context");
    throw new Error("Execution context exceeds the preparation byte limit.");
  }
  if ((selector.role === "manager" || selector.role === "tester" && !selector.report) &&
      (!allowed.taskId || !allowed.subjectId || selector.role === "manager" && !allowed.subjectKind ||
        selector.role === "tester" && (!allowed.action || !allowed.taskIds))) {
    throw new Error("Execution decisions require protected choices.");
  }
  const model = executionTextModel(policy, m4ModelBucket(selector.role, selector.report), selector.role);
  const format = { type: "json_schema", name: "booklet_role_v1", strict: true,
    schema: m4BindAllowedValues(definition.outputSchema, allowed) };
  const payload = { model: model.model,
    input: [{ type: "message", role: "system", content: definition.systemPrompt },
      { type: "message", role: "user", content: contextJson }],
    max_output_tokens: model.maxOutputTokens,
    reasoning: { effort: model.reasoningEffort, mode: "standard" },
    service_tier: policy.serviceTier, text: { format }, store: false,
    truncation: "disabled", include: ["reasoning.encrypted_content"] };
  const requestJson = m4CanonicalJson(payload);
  // The installed Dify provider consumes this existing carrier format. The
  // execution policy validates its fixed token identity independently of M4.
  const carrier = m4AuthorizedCarrier(requestJson, policy.tokenPolicy);
  const requestBytes = Buffer.byteLength(requestJson, "utf8");
  const carrierBytes = Buffer.byteLength(carrier.requestJson, "utf8");
  if (requestBytes > 2 * 1024 * 1024 || carrierBytes > 2 * 1024 * 1024) {
    if (selector.report) throw new M4ReportSizeError(Math.max(requestBytes, carrierBytes),
      2 * 1024 * 1024, definition.hash, m4Hash(requestJson), "request");
    throw new Error("Execution request exceeds the transport byte limit.");
  }
  if (definition.preparationByteLimit !== null && requestBytes > definition.preparationByteLimit) {
    if (selector.report) throw new M4ReportSizeError(requestBytes, definition.preparationByteLimit,
      definition.hash, m4Hash(requestJson));
    throw new Error("Execution request exceeds the preparation byte limit.");
  }
  return { definitionHash: definition.hash, requestJson, requestDigest: m4Hash(requestJson),
    systemPrompt: definition.systemPrompt, contextJson,
    modelParameters: { max_tokens: model.maxOutputTokens, reasoning_effort: model.reasoningEffort,
      reasoning_mode: "standard", service_tier: policy.serviceTier, response_format: "json_schema",
      json_schema: { name: format.name, strict: true, schema: format.schema } } };
}
