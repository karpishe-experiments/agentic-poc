import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { personaSchema, specialistTaskSchema } from "@/lib/contracts/experiment-runner";
import { M4ReportSizeError, assertM4SchemaLimits, m4BindAllowedValues, m4CanonicalJson, m4Hash, m4RequestBundleHash,
  m4RequestDefinition, m4SavedReportDefinition, m4StrictSchema, prepareM4Request, projectM4Context } from "@/lib/experiment-runner/m4-request";
import { m4TestId, m4TestPolicy } from "@/tests/helpers/m4-policy";
import { m4RequestVectors } from "@/tests/helpers/m4-request-vectors";

describe("M4 reviewed request contract", () => {
  it("never scopes away unknown creative instructions attached to a control", () => {
    const content = { type: "tester_decision", decision: { action: "approve", versionIds: ["v"] },
      prose: "Keep the night sky.\nExactly." };
    const result = projectM4Context({ role: "specialist", taskId: "J01", persona: "playful_kid", report: false },
      { role: "specialist", creatorMessages: [{ id: "message", sequence: 1, content, createdAtMs: 1 }], approvedSources: [] }, "operation");
    expect(result.creatorMessages).toEqual([{ id: "message", sequence: 1, content, createdAtMs: 1 }]);
  });
  it.each(personaSchema.options)("compacts %s pending tester evidence while preserving review controls and exact creative content", (persona) => {
    const selector = { role: "tester", taskId: null, persona, report: false } as const;
    const current = { id: "current", number: 8, dependencyVersionIds: ["approved-source"], sourceVersionId: "revision-7",
      warnings: ["Keep current warning"], approval: { id: "approval", delegationId: "grant" }, content: {
        manuscript: "A new ending respects the creator's request.", lettering: [{ text: "Wait!  Is that our kite?\nYes." }],
        characterDesignProfile: "Blue jacket", sheetPromptModule: "Front, back and side views in a blue jacket.",
        attireRequirements: ["Preserve approved clothes"], accessories: ["Bag"],
        build: { prompt: "duplicated execution prompt ".repeat(4000), assetId: "sheet-asset", operationId: "transport" },
        sheetReferences: [{ subjectId: "character", artifactVersionId: "sheet-version", assetId: "sheet-asset" }],
        stylePromptModule: "duplicated style", stylePromptModuleHash: "transport-hash" } };
    const raw = { role: "tester", bookletId: "book", brief: "A playful rescue", persona,
      currentArtifacts: [{ id: "artifact", taskId: "J09", subjectKind: "character", subjectId: "character", state: "draft", currentVersionId: "current",
        versions: [...Array.from({ length: 7 }, (_, i) => ({ id: `revision-${i + 1}`, content: { prose: "historical body ".repeat(2000) } })), current] },
      { id: "style", taskId: "J08", state: "approved", currentVersionId: "style-current", versions: [{ id: "style-current", content: { stylePromptModule: "canonical style" } }] }],
      pendingDecision: { kind: "review", artifactVersionId: "current", questionId: "question" },
      activeDelegation: { id: "grant", taskIds: ["J09"] }, eligibleTaskIds: ["J09"],
      creatorMessages: [{ sequence: 1, content: "Please use a blue jacket." }, { sequence: 2, content: "The jacket revision is complete." }],
      revisionCounts: { text: 7, image: 1 } };
    const original = structuredClone(raw);
    const result = projectM4Context(selector, raw, "operation");
    const serialized = JSON.stringify(result);
    expect(raw).toEqual(original);
    expect(projectM4Context(selector, raw, "operation")).toEqual(result);
    for (const field of ["brief", "persona", "bookletId", "pendingDecision", "activeDelegation", "eligibleTaskIds", "creatorMessages", "revisionCounts"] as const) {
      expect(result[field]).toEqual(raw[field]);
    }
    expect(result.currentArtifacts).toMatchObject([{ id: "artifact", state: "draft", currentVersionId: "current", versions: [{
      id: "current", number: 8, dependencyVersionIds: current.dependencyVersionIds, sourceVersionId: "revision-7", warnings: current.warnings,
      approval: current.approval, content: { manuscript: current.content.manuscript, lettering: current.content.lettering,
        characterDesignProfile: current.content.characterDesignProfile, sheetPromptModule: current.content.sheetPromptModule,
        attireRequirements: current.content.attireRequirements, accessories: current.content.accessories, sheetReferences: current.content.sheetReferences,
        build: { assetId: "sheet-asset" } } }] }, { versions: [{ content: { stylePromptModule: "canonical style" } }] }]);
    expect((result.currentArtifacts as { versions: unknown[] }[])[0].versions).toHaveLength(1);
    for (const omitted of ["historical body", "duplicated execution prompt", "duplicated style", "transport-hash"]) expect(serialized).not.toContain(omitted);
    expect(Buffer.byteLength(serialized)).toBeLessThan(Buffer.byteLength(JSON.stringify(raw)) / 10);
    const lessHistory = { ...raw, currentArtifacts: [{ ...raw.currentArtifacts[0], versions: [current] }, raw.currentArtifacts[1]] };
    expect(projectM4Context(selector, lessHistory, "operation")).toEqual(result);
    expect(result.evidenceScope).toMatchObject({ artifactVersions: expect.stringContaining("including drafts"), images: expect.stringContaining("not_assessed") });
    const definition = m4RequestDefinition(selector);
    expect(definition.version).toBe("m4_context_current_v2");
    expect(definition.projection).toMatchObject({ artifactProjection: "compact-current-review-v1", creativeContent: true, evidenceScope: result.evidenceScope });
    expect(definition.systemPrompt).toContain("Do not assess unseen historical versions");
    expect(definition.systemPrompt).toContain("required current creative and technical checks still apply");
  });
  it("versions new creative projections while retaining the exact historical report definition", () => {
    expect(m4RequestDefinition({ role: "specialist", taskId: "J09", persona: "playful_kid", report: false }).hash)
      .not.toBe("9c10d49c293b1035080d849e2d3ff4fa925548d96fb4c5df186d9dc6ae6a11d7");
    const report = { role: "tester", taskId: null, persona: "playful_kid", report: true } as const;
    const legacyHash = "c029e95876aea579de9232d4bce510d3cd74e49c6e4d3c18c2a3229c83a9d0b8";
    expect(m4RequestDefinition(report).hash).not.toBe(legacyHash);
    expect(m4SavedReportDefinition(report, legacyHash)?.hash).toBe(legacyHash);
    expect(m4SavedReportDefinition(report, "0".repeat(64))).toBeNull();
  });
  it("versions creative contexts across personas and preserves ownership instructions", () => {
    const unchanged = personaSchema.options.flatMap(persona => [
      m4RequestDefinition({ role: "manager", taskId: null, persona, report: false }),
      m4RequestDefinition({ role: "tester", taskId: null, persona, report: true }),
      m4RequestDefinition({ role: "judge", taskId: null, persona, report: true }),
      ...specialistTaskSchema.options.filter(taskId => taskId !== "J09").map(taskId =>
        m4RequestDefinition({ role: "specialist", taskId, persona, report: false })),
    ]);
    for (const definition of unchanged) expect(definition.version).toBe(definition.role === "manager" ? "m4_request_v1" : "m4_context_current_v2");
    for (const persona of personaSchema.options) {
      const specialist = m4RequestDefinition({ role: "specialist", taskId: "J09", persona, report: false });
      const tester = m4RequestDefinition({ role: "tester", taskId: null, persona, report: false });
      for (const definition of [specialist, tester]) {
        expect(definition.version).toBe("m4_context_current_v2");
        expect(definition.systemPrompt).toContain("characterDesignProfile and sheetPromptModule");
        expect(definition.systemPrompt).toContain("not a prohibition on later");
        expect(definition.systemPrompt).toContain("approved hard constraints");
        expect(definition.systemPrompt).toContain("clarification or an upstream revision");
      }
      expect(specialist.systemPrompt).toContain("J09 cannot edit them");
      expect(tester.systemPrompt).toContain("do not repeat a revision solely because the inherited note remains");
      expect(tester.systemPrompt).toContain("does not require approval of missing, contradictory or technically invalid work");
    }
  });
  it.each(personaSchema.options)("retains typed local report-size rejection for %s without truncation", (persona) => {
    const policy = { ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash() };
    const allowed = { runId: [m4TestId(1)], artifactId: [m4TestId(2)], versionId: [m4TestId(3)], pageId: [m4TestId(4)] };
    for (const role of ["tester", "judge"] as const) {
      const selector = { role, taskId: null, persona, report: true } as const;
      let caught: unknown;
      try { prepareM4Request(policy, selector, JSON.stringify({ brief: "x".repeat(128 * 1024) }), allowed); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(M4ReportSizeError);
      expect(caught).toMatchObject({ byteLimit: 128 * 1024, definitionHash: m4RequestDefinition(selector).hash,
        requestDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
      expect((caught as M4ReportSizeError).requestBytes).toBeGreaterThan(128 * 1024);
      expect(() => prepareM4Request(policy, selector, JSON.stringify({ brief: "x".repeat(2 * 1024 * 1024) }), allowed))
        .toThrow(expect.objectContaining({ scope: "context", byteLimit: 2 * 1024 * 1024 }));
      expect(() => prepareM4Request(policy, selector, "{" + "x".repeat(2 * 1024 * 1024), allowed)).not.toThrow(M4ReportSizeError);
    }
    expect(() => prepareM4Request(policy, { role: "manager", taskId: null, persona, report: false },
      JSON.stringify({ brief: "x".repeat(20 * 1024) }), { taskId: [], subjectId: [], subjectKind: [] })).not.toThrow(M4ReportSizeError);
  });
  it.each(personaSchema.options)("bounds %s manager routing independently of the retained provenance graph", (persona) => {
    const artifact = { id: m4TestId(2), taskId: "J13", subjectKind: "page", subjectId: m4TestId(3), state: "approved", currentVersionId: m4TestId(4),
      versions: [{ id: m4TestId(4), number: 1, dependencyVersionIds: [m4TestId(5)], approval: { id: m4TestId(6) },
        content: { request: { prompt: "large saved image instruction".repeat(10000) } } }, { id: m4TestId(7), content: "historical" }] };
    const projected = projectM4Context({ role: "manager", taskId: null, persona, report: false },
      { role: "manager", run: { bookletId: m4TestId(1), persona, brief: "brief", currentArtifacts: Array(100).fill(artifact),
        creatorMessages: ["retained feedback".repeat(10000)] }, eligibleRoute: "J13", eligibleTarget: { subjectId: m4TestId(3) } }, "operation");
    expect(projected).toEqual({ role: "manager", eligibleRoute: "J13", eligibleTarget: { subjectId: m4TestId(3) },
      run: { bookletId: m4TestId(1), persona, generationStatus: undefined } });
    expect(JSON.stringify(projected)).not.toContain("content");
    expect(JSON.stringify(projected).length).toBeLessThan(2000);
    expect(artifact.versions[0].content).toBeDefined();
    const prepared = prepareM4Request({ ...m4TestPolicy(), requestDefinitionHash: m4RequestBundleHash() },
      { role: "manager", taskId: null, persona, report: false }, JSON.stringify(projected),
      { taskId: ["J13"], subjectId: [m4TestId(3)], subjectKind: ["page"] });
    expect(Buffer.byteLength(prepared.requestJson)).toBeLessThan(16 * 1024);
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
      expect(result.operationHistory).toEqual([{ role: null, taskId: null, state: null, safeFailure: null,
        countFailureReason: null, count: 1, reservations: 0, measuredTimings: 0, elapsedMsTotal: 0, elapsedMsMax: 0 }]);
      expect(result.reportEvidence).toEqual({ versionIds: ["v", "style"] });
    }
  });
  it.each(personaSchema.options)("compacts %s history deterministically without losing creative or finding evidence", (persona) => {
    const history = Array.from({ length: 300 }, (_, index) => ({ id: `historical-${index}`, role: "tester", taskId: "J08",
      state: "succeeded", reservationCount: 1, elapsedMs: 20, workflowRunId: `transport-${index}` }));
    history.push({ ...history[0], id: "current", reservationCount: 1000 });
    const raw = { role: "tester", brief: "Creator brief", persona, creatorMessages: [{ sequence: 1, content: "Please revise the ending." }],
      operationHistory: history, counters: { textCalls: 300 }, limits: { textCalls: 500 }, warnings: ["Retained warning"],
      currentArtifacts: [{ id: "artifact", taskId: "J12", currentVersionId: "current-version", versions: [
        { id: "old-version", content: { prose: "Historical body" } },
        { id: "current-version", number: 3, dependencyVersionIds: ["manuscript"], approval: { id: "approval", state: "approved" },
          content: { panels: [{ lettering: [{ text: "Exact text\n  unchanged!", speakerEntityId: "character" }],
            sheetReferences: [{ subjectId: "character", assetId: "image", artifactVersionId: "reference" }] }],
            attachments: [{ subjectId: "character", assetId: "image", artifactVersionId: "reference", uploadFileId: "private-upload", uploadUser: "transport-user", sha256: "digest", byteLength: 95, width: 8, height: 8 }],
            output: { width: 8, height: 8, sha256: "digest" } } }] }], reportEvidence: { versionIds: ["current-version"] } };
    const before = structuredClone(raw);
    const selector = { role: "tester" as const, taskId: null, persona, report: true };
    const result = projectM4Context(selector, raw, "current");
    expect(result).toEqual(projectM4Context(selector, { ...raw, operationHistory: [...history].reverse() }, "current"));
    expect(result.operationHistory).toEqual([{ role: "tester", taskId: "J08", state: "succeeded", safeFailure: null,
      countFailureReason: null, count: 300, reservations: 300, measuredTimings: 300, elapsedMsTotal: 6000, elapsedMsMax: 20 }]);
    const serialized = JSON.stringify(result);
    for (const value of ["current-version", "manuscript", "approval", "character", "reference", "Please revise the ending.", "Retained warning"]) expect(serialized).toContain(value);
    expect(serialized).toContain(JSON.stringify("Exact text\n  unchanged!").slice(1, -1));
    for (const value of ["Historical body", "private-upload", "transport-user", "digest", "historical-"]) expect(serialized).not.toContain(value);
    expect(serialized.length).toBeLessThan(JSON.stringify(raw).length / 5);
    expect(result.evidenceScope).toMatchObject({ images: expect.stringContaining("not_assessed"), cost: expect.stringContaining("unavailable") });
    expect(raw).toEqual(before);
    expect(m4RequestDefinition(selector).projection.artifactProjection).toBe("compact-advisory-v3");
  });
  it("retains aggregate failure kinds and distinguishes missing timings from zero", () => {
    const result = projectM4Context({ role: "judge", taskId: null, persona: "playful_kid", report: true }, {
      role: "judge", operationHistory: [
        { id: "a", role: "tester", state: "failed", safeFailure: "definite_failure", countFailure: { code: "input_limit_exceeded" }, reservationCount: 1, elapsedMs: null },
        { id: "b", role: "tester", state: "failed", safeFailure: "unknown_outcome", reservationCount: 1, elapsedMs: 0 },
      ],
    }, "current");
    expect(result.operationHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ safeFailure: "definite_failure", countFailureReason: "input_limit_exceeded", measuredTimings: 0, reservations: 1 }),
      expect.objectContaining({ safeFailure: "unknown_outcome", measuredTimings: 1, elapsedMsTotal: 0 }),
    ]));
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
      expect(pages.items.properties.panels.items.properties.sheetSubjects).toBeDefined();
      expect(pages.items.properties.panels.items.properties.sheetReferences).toBeUndefined();
      expect(definition.projection).toMatchObject({ layoutContract: "sheet-subjects-v1" });
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
