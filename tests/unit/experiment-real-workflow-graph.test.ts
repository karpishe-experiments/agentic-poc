import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createM4ImageWorkflowGraph, createM4WorkflowGraph } from "@/lib/experiment-runner/m4-workflow-graph";
import { m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import { realImageRequest } from "@/lib/experiment-runner/real-image-contract";
import { realReportCarrier } from "@/lib/experiment-runner/real-report-carrier";
import { createRealImageWorkflowGraph, createRealWorkflowGraph, REAL_IMAGE_TOOL } from "@/lib/experiment-runner/real-workflow-graph";
import type { SimulationModule } from "@/lib/experiment-runner/workflow-graph";

const tester: SimulationModule = { role: "tester", taskId: null, persona: "playful_kid" };
const manager: SimulationModule = { role: "manager", taskId: null, persona: null };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const identity = { run_id: id(1), operation_id: id(2), workflow_run_id: id(3), parent_workflow_run_id: "" };
function execute(source: unknown, args: Record<string, unknown>): Record<string, unknown> {
  const child = spawnSync("python", ["-B", "-c", "import json,sys; x=json.load(sys.stdin); scope={}; exec(x['source'],scope); print(json.dumps(scope['main'](**x['args'])))"], {
    input: JSON.stringify({ source, args }), encoding: "utf8", timeout: 10_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  if (child.status !== 0) throw new Error(child.stderr || `Python exited ${child.status}`);
  return JSON.parse(child.stdout) as Record<string, unknown>;
}
function node(graph: { nodes: Array<{ id: string; data: Record<string, unknown> }> }, id: string) {
  return graph.nodes.find(item => item.id === id)!;
}
function assertEdges(graph: { nodes: Array<{ id: string }>; edges: Array<{ source: string; target: string }> }) {
  const ids = new Set(graph.nodes.map(item => item.id));
  expect(ids.size).toBe(graph.nodes.length);
  for (const edge of graph.edges) { expect(ids.has(edge.source)).toBe(true); expect(ids.has(edge.target)).toBe(true); }
}
const original = m4CanonicalJson({ model: "gpt-6-luna", input: [
  { type: "message", role: "system", content: "System" },
  { type: "message", role: "user", content: "Judge saved images" },
], max_output_tokens: 8192, reasoning: { effort: "none", mode: "standard" },
service_tier: "default", text: { format: { type: "json_schema", name: "fixture", strict: true,
  schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false } } },
store: false, truncation: "disabled", include: ["reasoning.encrypted_content"] });
const token = { version: "m4_context_policy_v2", hash: "a".repeat(64), maxInputTokens: 128000, warningInputTokens: 32000 };
const textRequestJson = m4CanonicalJson({ ...JSON.parse(original) as object,
  bookletPolicy: { contractVersion: "booklet_carrier_v2", requestDigest: m4Hash(original), tokenPolicy: token } });
const png = Buffer.concat([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
  Buffer.from("0000040000000400080200000000000000", "hex")]);
const { carrier, carrierJson } = realReportCarrier({ textRequestJson, images: [{ manifest: {
  assetId: id(4), versionId: id(5), sha256: createHash("sha256").update(png).digest("hex"),
  byteLength: png.length, mimeType: "image/png", width: 1024, height: 1024,
}, bytes: png }], deadlineAtMs: Date.now() + 120_000 });

describe("Real workflow graph candidates", () => {
  it("keeps old branches and routes Real independently", async () => {
    const old = await createM4WorkflowGraph(manager);
    const graph = await createRealWorkflowGraph(manager);
    assertEdges(graph);
    expect(graph.nodes.filter(item => !item.id.startsWith("real_"))).toEqual(old.nodes);
    expect(node(graph, "real_llm").data.model).toMatchObject({ completion_params: { max_tokens: 4096 } });
    expect(graph.edges.filter(item => !item.source.startsWith("real_") && !item.target.startsWith("real_") && item.source !== "start"))
      .toEqual(old.edges.filter(item => item.source !== "start"));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "real_mode", target: "m4_mode", sourceHandle: "false" }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "real_mode", target: "real_identity", sourceHandle: "true" }));
    expect(execute(node(graph, "real_identity").data.code, { ...identity, mode: "real" }).identity_json).toContain(id(1));
    expect(() => execute(node(graph, "real_identity").data.code, { ...identity, mode: "balanced" })).toThrow();
  });

  it("uses native Dify vision only on Real reports and decodes final multimodal identity", async () => {
    const graph = await createRealWorkflowGraph(tester);
    assertEdges(graph);
    const report = node(graph, "real_report_llm").data;
    const decision = node(graph, "real_llm").data;
    expect(report.vision).toEqual({ enabled: true, configs: { variable_selector: ["start", "reference_files"], detail: "high" } });
    expect(decision.vision).toEqual({ enabled: false });
    expect((report.model as { completion_params: Record<string, unknown> }).completion_params)
      .toMatchObject({ booklet_real_report_execution: true, booklet_bounded_execution: true, booklet_prepared_request: true,
        response_format: "json_schema", json_schema: "{{#real_decode.schema_json#}}" });
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "real_report", target: "real_report_llm", sourceHandle: "true" }));
    const data = { started: true, mode: "real", role: "tester", taskId: null,
      inputFingerprint: "b".repeat(64), m4: { requestJson: carrierJson, requestDigest: carrier.finalRequestDigest,
        report: true, timeoutSeconds: 60, deadlineAtMs: carrier.deadlineAtMs } };
    const decoded = execute(node(graph, "real_decode").data.code, { authorization_body: JSON.stringify({ data }), status_code: 200 });
    expect(decoded.authorized).toBe("yes");
    expect(decoded.digest).toBe(`sha256:${carrier.finalRequestDigest}`);
    expect(decoded.request_00).toBe(carrierJson);
    expect(JSON.parse(String(decoded.schema_json))).toEqual({ name: "fixture", strict: true,
      schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false } });
    expect(decoded.token_policy_hash).toBe(`sha256:${token.hash}`);
    expect(() => execute(node(graph, "real_decode").data.code, { authorization_body: JSON.stringify({ data: {
      ...data, m4: { ...data.m4, requestDigest: "c".repeat(64) } } }), status_code: 200 })).toThrow();
    const ordinary = JSON.parse(textRequestJson) as { input: Array<{ content: string }>;
      bookletPolicy: { requestDigest: string } };
    ordinary.input[1]!.content = JSON.stringify({ persona: "playful_kid" });
    const { bookletPolicy: _policy, ...ordinaryProvider } = ordinary;
    void _policy;
    ordinary.bookletPolicy.requestDigest = m4Hash(m4CanonicalJson(ordinaryProvider));
    const ordinaryJson = m4CanonicalJson(ordinary);
    const ordinaryDecoded = execute(node(graph, "real_decode").data.code, { authorization_body: JSON.stringify({ data: {
      ...data, m4: { ...data.m4, requestJson: ordinaryJson, requestDigest: m4Hash(ordinaryJson), report: false },
    } }), status_code: 200 });
    expect(ordinaryDecoded).toMatchObject({ authorized: "yes", report: "no", digest: `sha256:${m4Hash(ordinaryJson)}` });
  });

  it("binds the image tool key as MIXED and returns JSON after the one tool call", () => {
    const old = createM4ImageWorkflowGraph();
    const graph = createRealImageWorkflowGraph();
    assertEdges(graph);
    expect(graph.nodes.filter(item => !item.id.startsWith("real_"))).toEqual(old.nodes);
    const tool = node(graph, "real_image_tool").data;
    // Upstream ToolManager resolves workspace credentials only on this path.
    expect(tool.provider_type).toBe("builtin");
    expect(tool).toMatchObject({ type: "tool", ...REAL_IMAGE_TOOL,
      retry_config: { retry_enabled: false, max_retries: 0 }, tool_parameters: {
        request_json: { type: "variable", value: ["real_decode", "request_json"] },
        reference_files: { type: "variable", value: ["start", "reference_files"] },
        booklet_tool_key: { type: "mixed", value: "{{#env.BOOKLET_TOOL_KEY#}}" },
      } });
    expect(graph.nodes.filter(item => item.data.type === "tool")).toHaveLength(1);
    expect(graph.nodes.filter(item => item.id.startsWith("real_") && item.data.type === "http-request")
      .map(item => item.id)).toEqual(["real_authorize"]);
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: "real_image_tool", target: "real_image_result" }));
    const request = realImageRequest({ schemaVersion: "booklet_real_image_request_v1", operation: "generate",
      prompt: "A page", model: "gpt-image-2.5-sunburst-2026-09-08", size: "1024x1024", quality: "high",
      background: "opaque", outputFormat: "png", n: 1, retries: 0, timeoutSeconds: 270,
      deadlineAtMs: Date.now() + 120_000, references: [] });
    const data = { started: true, mode: "real", role: "image", taskId: "J13",
      inputFingerprint: "a".repeat(64), requestJson: m4CanonicalJson(request) };
    const decoded = execute(node(graph, "real_decode").data.code, { authorization_body: JSON.stringify({ data }), status_code: 200 });
    expect(decoded.request_json).toBe(data.requestJson);
    expect(decoded.input_fingerprint).toBe(data.inputFingerprint);
    for (const taskId of ["J08", "J09", "J10", "J13"]) {
      expect(execute(node(graph, "real_decode").data.code, { authorization_body: JSON.stringify({ data: {
        ...data, taskId } }), status_code: 200 })).toMatchObject({ authorized: "yes", request_json: data.requestJson });
    }
    const sha256 = "d".repeat(64);
    const wrapper = { result: { schemaVersion: "booklet_real_image_result_v1",
      adapterIdentity: "m5-openai-image-bounded@1", status: "succeeded",
      requestDigest: request.requestDigest, output: { sha256 } },
    upload: { state: "succeeded", assetId: identity.operation_id, sha256, reused: false } };
    const ackArgs = { tool_json: [wrapper], request_json: data.requestJson, run_id: identity.run_id,
      operation_id: identity.operation_id, workflow_run_id: identity.workflow_run_id,
      parent_workflow_run_id: identity.parent_workflow_run_id, input_fingerprint: data.inputFingerprint };
    const ack = execute(node(graph, "real_image_result").data.code, ackArgs);
    expect(() => execute(node(graph, "real_image_result").data.code, { ...ackArgs,
      tool_json: [{ result: { status: "unknown_outcome", diagnostic: { code: "provider_timeout", requestId: "req_failure" } } }] }))
      .toThrow(/provider outcome.*provider_timeout/);
    expect(JSON.parse(ack.image_result as string)).toEqual({ runId: identity.run_id,
      operationId: identity.operation_id, workflowRunId: identity.workflow_run_id,
      parentWorkflowRunId: null, inputFingerprint: data.inputFingerprint,
      assetId: identity.operation_id, sha256 });
    expect(() => execute(node(graph, "real_image_result").data.code, { ...ackArgs,
      tool_json: [{ ...wrapper, upload: { ...wrapper.upload, sha256: "e".repeat(64) } }] })).toThrow();
    expect(() => execute(node(graph, "real_image_result").data.code, { ...ackArgs,
      tool_json: [{ ...wrapper, upload: { ...wrapper.upload, assetId: id(20) } }] })).toThrow();
    expect(() => execute(node(graph, "real_decode").data.code, { authorization_body: JSON.stringify({ data: {
      ...data, taskId: "J12" } }), status_code: 200 })).toThrow();
  });
});
