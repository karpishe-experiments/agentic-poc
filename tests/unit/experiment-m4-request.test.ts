import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { personaSchema, specialistTaskSchema } from "@/lib/contracts/experiment-runner";
import { assertM4SchemaLimits, m4BindAllowedValues, m4CanonicalJson, m4Hash, m4RequestBundleHash,
  m4RequestDefinition, m4StrictSchema, prepareM4Request, projectM4Context } from "@/lib/experiment-runner/m4-request";
import { m4TestId, m4TestPolicy } from "@/tests/helpers/m4-policy";
import { m4RequestVectors } from "@/tests/helpers/m4-request-vectors";

describe("M4 reviewed request contract", () => {
  it("bounds manager context independently of completed image prompt size, retaining exact current provenance", () => {
    const artifact = { id: m4TestId(2), taskId: "J13", subjectKind: "page", subjectId: m4TestId(3), state: "approved", currentVersionId: m4TestId(4),
      versions: [{ id: m4TestId(4), number: 1, dependencyVersionIds: [m4TestId(5)], approval: { id: m4TestId(6) },
        content: { request: { prompt: "large saved image instruction".repeat(10000) } } }, { id: m4TestId(7), content: "historical" }] };
    const projected = projectM4Context({ role: "manager", taskId: null, persona: "playful_kid", report: false },
      { role: "manager", run: { bookletId: m4TestId(1), brief: "brief", currentArtifacts: [artifact] }, eligibleRoute: "J13", eligibleTarget: { subjectId: m4TestId(3) } }, "operation");
    expect(projected).toMatchObject({ eligibleRoute: "J13", eligibleTarget: { subjectId: m4TestId(3) }, run: { currentArtifacts: [{
      currentVersionId: m4TestId(4), dependencyVersionIds: [m4TestId(5)], approvalId: m4TestId(6) }] } });
    expect(JSON.stringify(projected)).not.toContain("content");
    expect(JSON.stringify(projected).length).toBeLessThan(2000);
    expect(artifact.versions[0].content).toBeDefined();
  });
  it("retains report creative text, lettering and reference identities while excluding duplicated execution prompts", () => {
    const project = (role: "tester" | "judge") => projectM4Context({ role, taskId: null, persona: "playful_kid", report: true }, { role,
      currentArtifacts: [{ id: "a", taskId: "J13", currentVersionId: "v", versions: [{ id: "v", content: {
        request: { prompt: "assembled", sourceVersionIds: ["source"] }, build: { prompt: "assembled", assetId: "asset" },
        stylePromptModule: "duplicate style", lettering: [{ text: "Required dialogue" }], prompt: "creative field must survive" } }] },
      { id: "s", taskId: "J08", currentVersionId: "style", versions: [{ id: "style", content: { stylePromptModule: "canonical style" } }] }],
      operationHistory: [{ id: "current" }, { id: "previous" }], reportEvidence: { versionIds: ["v", "style"] } }, "current");
    for (const role of ["tester", "judge"] as const) {
      const result = project(role); const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("assembled"); expect(serialized).not.toContain("duplicate style");
      for (const value of ["Required dialogue", "canonical style", "source", "asset", "creative field must survive"]) expect(serialized).toContain(value);
      expect(result.operationHistory).toEqual([{ id: "previous" }]); expect(result.reportEvidence).toEqual({ versionIds: ["v", "style"] });
    }
  });
  it("rejects complete manager/report requests above local byte bounds without truncating required text", () => {
    const policy = { ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash() };
    const allowed = { taskId: ["J01"], subjectKind: ["book"], subjectId: [m4TestId(1)], runId: [m4TestId(1)], artifactId: [m4TestId(2)], versionId: [m4TestId(3)], pageId: [m4TestId(4)] };
    for (const selector of [{ role: "manager" as const, taskId: null, persona: "playful_kid" as const, report: false },
      { role: "judge" as const, taskId: null, persona: "playful_kid" as const, report: true }]) {
      expect(() => prepareM4Request(policy, selector, JSON.stringify({ required: "🙂".repeat(34000) }), allowed)).toThrow("required content was not truncated");
    }
  });
  it("matches independent Python canonical bytes and digests, including Unicode and numeric keys", () => {
    const vectors = JSON.parse(readFileSync(new URL("../fixtures/m4-canonical-v1.json", import.meta.url), "utf8")) as { input: unknown; canonical: string; digest: string }[];
    for (const vector of vectors) {
      expect(m4CanonicalJson(vector.input)).toBe(vector.canonical);
      expect(m4Hash(m4CanonicalJson(vector.input))).toBe(vector.digest);
    }
    for (const invalid of [0.5, NaN, Infinity, -0, 2 ** 53, undefined, new Date(), "\ud800", "\udfff", [undefined], new Array(2)]) {
      expect(() => m4CanonicalJson(invalid)).toThrow();
    }
  });
  it("defines every role/task/persona and separate reports with provider-compatible roots", () => {
    const vectors = m4RequestVectors();
    expect(vectors).toHaveLength(48);
    for (const vector of vectors) expect(m4Hash(vector.requestJson)).toBe(vector.requestDigest);
    for (const persona of personaSchema.options) {
      for (const taskId of specialistTaskSchema.options) {
        const definition = m4RequestDefinition({ role: "specialist", taskId, persona, report: false });
        expect(definition.outputSchema.type).toBe("object");
        expect(definition.systemPrompt).toContain("Use supplied identities only");
        assertM4SchemaLimits(definition.outputSchema);
      }
      for (const role of ["manager", "tester", "judge"] as const) {
        const definition = m4RequestDefinition({ role, taskId: null, persona, report: role === "judge" });
        expect(definition.hash).toMatch(/^[a-f0-9]{64}$/);
      }
      expect(JSON.stringify(m4RequestDefinition({ role: "tester", taskId: null, persona, report: true }).outputSchema)).not.toContain("actualUsd");
    }
    expect(() => m4RequestDefinition({ role: "specialist", taskId: null, persona: "playful_kid", report: false })).toThrow();
  });
  it("omits workflow-owned hashes, identities and fixed tuple values from creative output", () => {
    for (const taskId of ["J08", "J09", "J10", "J12"] as const) {
      const schema = JSON.stringify(m4RequestDefinition({ role: "specialist", taskId, persona: "professional_creator", report: false }).outputSchema);
      expect(schema).not.toContain("stylePromptModuleHash");
      expect(schema).not.toContain("prefixItems");
      if (taskId === "J09") expect(schema).not.toContain("requiredViews");
      if (taskId === "J12") expect(schema).not.toContain('"layoutVersionId"');
    }
  });
  it("binds eligible identities and prunes impossible actions without empty enums", () => {
    const schema = m4StrictSchema(z.strictObject({ choice: z.union([
      z.strictObject({ action: z.literal("approve"), versionIds: z.array(z.string().uuid()).min(1) }),
      z.strictObject({ action: z.literal("delegate"), subjectId: z.string().uuid() }),
    ]) }));
    const bound = m4BindAllowedValues(schema, { action: ["delegate"], subjectId: [m4TestId(1)] });
    expect(JSON.stringify(bound)).not.toContain("versionIds");
    expect(JSON.stringify(bound)).toContain(m4TestId(1));
    expect(() => m4BindAllowedValues(schema, { action: ["approve"], versionIds: [] })).toThrow("no eligible");
    expect(() => m4BindAllowedValues(schema, { action: ["delegate"] })).toThrow("subjectId");
    expect(() => m4StrictSchema(z.strictObject({ tuple: z.tuple([z.string(), z.string()]) }))).toThrow("prefixItems");
  });
  it("pins definitions and translates one explicit text request with drift-visible hashes", () => {
    const policy = { ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash() };
    const selector = { role: "manager" as const, taskId: null, persona: "playful_kid" as const, report: false };
    const allowed = { taskId: ["J01"], subjectKind: ["book"], subjectId: [m4TestId(1)] };
    const request = prepareM4Request(policy, selector, '{"brief":"هواپیما 🪁","scale":0.5}', allowed);
    const payload = JSON.parse(request.requestJson);
    expect(payload).toMatchObject({ model: "gpt-6-luna", max_output_tokens: 2048, store: false, truncation: "disabled",
      reasoning: { effort: "none", mode: "standard" }, service_tier: "default", text: { format: { strict: true } } });
    expect(payload).not.toHaveProperty("tools");
    expect(payload.input[1].content).toBe(request.contextJson);
    expect(request.requestDigest).not.toBe(prepareM4Request(policy, selector, '{"brief":"changed"}', allowed).requestDigest);
    expect(() => prepareM4Request(m4TestPolicy(), selector, "{}", allowed)).toThrow("definitions differ");
    expect(() => prepareM4Request(policy, selector, "{}", {})).toThrow("protected task");
    expect(() => prepareM4Request(policy, selector, '"scalar"', allowed)).toThrow("must be an object");
  });
  it("rejects schema limits before provider access", () => {
    expect(() => assertM4SchemaLimits({ type: "object", properties: { x: { type: "string", enum: Array.from({ length: 1001 }, (_, i) => String(i)) } } })).toThrow("size limits");
    let schema: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 11; i++) schema = { type: "object", properties: { child: schema } };
    expect(() => assertM4SchemaLimits(schema)).toThrow("ten object levels");
  });
  it("constrains J11 page cardinality and explains top-left geometry for each persona", () => {
    for (const [persona, count] of [["playful_kid", 4], ["enthusiast_parent", 6], ["professional_creator", 9]] as const) {
      const definition = m4RequestDefinition({ role: "specialist", taskId: "J11", persona, report: false });
      const schema = JSON.parse(JSON.stringify(definition.outputSchema));
      const proposal = schema.properties.result.anyOf.find((item: { properties: { kind: { enum: string[] } } }) => item.properties.kind.enum.includes("proposal"));
      const pages = proposal.properties.payload.properties.content.properties.pages;
      expect(pages).toMatchObject({ minItems: count, maxItems: count });
      expect(pages.items.properties.panels.maxItems).toBe(persona === "playful_kid" ? 1 : 4);
      expect(pages.items.properties.panels.items.properties.liveTextSafeRegion.description).toContain("top-left");
      expect(definition.systemPrompt).toContain("x+width <= 1");
      expect(definition.systemPrompt).toContain("Kid story pages must each have exactly one panel");
      expect(definition.systemPrompt).toContain("exactly one two-panel story page");
      expect(definition.systemPrompt).toContain("one complete compact JSON object");
      expect(definition.systemPrompt).toContain("no indentation or blank lines outside strings");
      expect(definition.systemPrompt).toContain("Stop immediately after the final closing brace");
    }
  });
  it("requires an exact reviewed request-bundle amendment while retaining the old monetary policy", () => {
    const policy = { ...m4TestPolicy(), requestDefinitionHash: "a".repeat(64) };
    const grant = { campaignId: m4TestId(1), reference: "same-campaign", requestDefinitionUpdate: {
      fromBundleHash: policy.requestDefinitionHash, toBundleHash: m4RequestBundleHash(), reference: "reviewed-J11-correction" } };
    const selector = { role: "manager" as const, taskId: null, persona: "playful_kid" as const, report: false };
    const allowed = { taskId: ["J01"], subjectKind: ["book"], subjectId: [m4TestId(1)] };
    const before = structuredClone(policy);
    expect(prepareM4Request(policy, selector, "{}", allowed, grant).definitionHash).toBe(m4RequestDefinition(selector).hash);
    expect(policy).toEqual(before);
    expect(() => prepareM4Request(policy, selector, "{}", allowed)).toThrow("definitions differ");
    for (const update of [{ ...grant.requestDefinitionUpdate, fromBundleHash: "b".repeat(64) },
      { ...grant.requestDefinitionUpdate, toBundleHash: "b".repeat(64) }]) {
      expect(() => prepareM4Request(policy, selector, "{}", allowed, { ...grant, requestDefinitionUpdate: update })).toThrow("definitions differ");
    }
  });
});
