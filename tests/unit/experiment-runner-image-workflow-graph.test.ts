import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createSimulatedImageGraph, M2_SIMULATION_MODULES, simulationModuleName } from "@/lib/experiment-runner/workflow-graph";

function executeCode(nodeId: string, args: Record<string, unknown>) {
  const source = createSimulatedImageGraph().nodes.find((node) => node.id === nodeId)!.data.code;
  const result = spawnSync("python", ["-c", "import json,sys; p=json.load(sys.stdin); scope={}; exec(p['source'],scope); print(json.dumps(scope['main'](**p['args'])))"], {
    input: JSON.stringify({ source, args }), encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" },
  });
  if (result.status !== 0) throw new Error(result.stderr || `Python exited ${result.status}`);
  return JSON.parse(result.stdout) as Record<string, string>;
}

const identity = { run_id: "00000000-0000-4000-8000-000000000001", operation_id: "00000000-0000-4000-8000-000000000002", workflow_run_id: "00000000-0000-4000-8000-000000000003", parent_workflow_run_id: "" };
const fingerprint = "a".repeat(64);
const authorization = { started: true, role: "image", mode: "simulated", inputFingerprint: fingerprint, context: { role: "image", mode: "simulated", inputFingerprint: fingerprint, imageRequest: { prompt: "Synthetic transport probe", sourceVersionIds: [identity.run_id] } } };

describe("isolated simulated image transport graph", () => {
  it("executes identity, authorization URLs, pause and saved-result acknowledgement", () => {
    expect(JSON.parse(executeCode("identity", { ...identity, mode: "simulated" }).identity_json)).toMatchObject({ runId: identity.run_id, parentWorkflowRunId: null });
    const args = { ...identity, status_code: 200, authorization_body: JSON.stringify({ data: authorization }), booklet_origin: "https://booklet-staging.uniwares.co.uk/" };
    const prepared = executeCode("prepare", args);
    const fixture = new URL(prepared.fixture_url);
    expect(fixture.pathname).toBe("/api/experiments/booklet-tools/image-fixture");
    expect(Object.fromEntries(fixture.searchParams)).toEqual({ runId: identity.run_id, operationId: identity.operation_id, workflowRunId: identity.workflow_run_id, parentWorkflowRunId: "", inputFingerprint: fingerprint });
    expect(new URL(prepared.upload_url).pathname).toBe("/api/experiments/booklet-tools/image");
    expect(executeCode("prepare", { ...args, authorization_body: JSON.stringify({ data: { started: false, reason: "paused" } }) })).toEqual({ fixture_url: "", upload_url: "", input_fingerprint: "", authorization_reason: "paused" });
    const saved = executeCode("ack", { ...identity, status_code: 200, input_fingerprint: fingerprint, body: JSON.stringify({ data: { state: "succeeded", assetId: identity.operation_id, sha256: "b".repeat(64) } }) });
    expect(JSON.parse(saved.image_result)).toMatchObject({ operationId: identity.operation_id, inputFingerprint: fingerprint, assetId: identity.operation_id, parentWorkflowRunId: null });
  });

  it("rejects paid mode, wrong-role authorization and an unconfirmed upload", () => {
    expect(() => executeCode("identity", { ...identity, mode: "real" })).toThrow("simulation only");
    const args = { ...identity, status_code: 200, booklet_origin: "https://booklet-staging.uniwares.co.uk", authorization_body: JSON.stringify({ data: { ...authorization, role: "specialist" } }) };
    expect(() => executeCode("prepare", args)).toThrow("authorization is inconsistent");
    expect(() => executeCode("prepare", { ...args, status_code: 401 })).toThrow("authorization failed");
    expect(() => executeCode("ack", { ...identity, status_code: 200, input_fingerprint: fingerprint, body: JSON.stringify({ data: { state: "succeeded", assetId: identity.run_id, sha256: "b".repeat(64) } }) })).toThrow("saved image completion");
  });

  it("preserves the eleven narrative modules and has complete success and pause paths", () => {
    expect(M2_SIMULATION_MODULES).toHaveLength(11);
    expect(M2_SIMULATION_MODULES.map(simulationModuleName)).not.toContain("issue65_m2_image_probe");
    const graph = createSimulatedImageGraph();
    const node = (id: string) => graph.nodes.find((item) => item.id === id)!;
    expect(graph.nodes.map((item) => item.id)).toEqual(["start", "identity", "authorize", "prepare", "authorized", "fixture", "select_file", "upload", "ack", "finish", "paused"]);
    expect(graph.nodes.every((item) => ["start", "code", "http-request", "list-operator", "if-else", "end"].includes(item.data.type as string))).toBe(true);
    expect(graph.edges.map((edge) => `${edge.source}:${edge.sourceHandle}->${edge.target}`)).toEqual([
      "start:source->identity", "identity:source->authorize", "authorize:source->prepare", "prepare:source->authorized",
      "authorized:true->fixture", "authorized:false->paused", "fixture:source->select_file", "select_file:source->upload", "upload:source->ack", "ack:source->finish",
    ]);
    expect(node("identity").data.code).toContain("mode != 'simulated'");
    expect(node("identity").data.code).toContain("UUID(value)");
    expect(node("prepare").data.code).toContain("status_code != 200");
    expect(node("prepare").data.code).toContain("data.get('started') is not True");
    expect(node("prepare").data.code).toContain("context.get('imageRequest')");
    expect(node("prepare").data.code).toContain("data.get('role') != 'image'");
    expect(node("prepare").data.code).toContain("data.get('mode') != 'simulated'");
    expect(node("prepare").data.code).toContain("[0-9a-f]{64}");
    expect(node("prepare").data.code).toContain("image-fixture?");
    expect(node("prepare").data.code).toContain("'parentWorkflowRunId'");
    expect(node("authorized").data.cases).toMatchObject([{ conditions: [{ variable_selector: ["prepare", "fixture_url"], comparison_operator: "not empty" }] }]);
    expect(node("finish").data.outputs).toEqual([{ variable: "image_result", value_type: "string", value_selector: ["ack", "image_result"] }]);
    expect(node("paused").data.outputs).toEqual([{ variable: "authorization_reason", value_type: "string", value_selector: ["prepare", "authorization_reason"] }]);
  });

  it("uses authenticated binary HTTP nodes with no model, retry, or file transform", () => {
    const graph = createSimulatedImageGraph();
    const requests = graph.nodes.filter((item) => item.data.type === "http-request");
    expect(requests.map((item) => item.id)).toEqual(["authorize", "fixture", "upload"]);
    for (const item of requests) {
      expect(item.data.headers).toContain("x-booklet-tool-key:{{#env.BOOKLET_TOOL_KEY#}}");
      expect(item.data.authorization).toEqual({ type: "no-auth" });
      expect(item.data.retry_config).toMatchObject({ retry_enabled: false });
      expect(item.data.ssl_verify).toBe(true);
      expect(item.data.timeout).toEqual({ connect: 10, read: 30, write: 30 });
    }
    expect(requests[0].data.body).toEqual({ type: "raw-text", data: [{ type: "text", value: "{{#identity.identity_json#}}" }] });
    expect(requests[1].data.method).toBe("get");
    expect(requests[1].data.url).toBe("{{#prepare.fixture_url#}}");
    expect(requests[2].data.method).toBe("post");
    expect(requests[2].data.url).toBe("{{#prepare.upload_url#}}");
    expect(graph.nodes.find((node) => node.id === "select_file")!.data).toMatchObject({ type: "list-operator", variable: ["fixture", "files"], var_type: "array[file]", extract_by: { enabled: true, serial: "1" } });
    expect(requests[2].data.body).toEqual({ type: "binary", data: [{ type: "file", file: ["select_file", "first_record"] }] });
    expect(JSON.stringify(graph)).not.toMatch(/apiKey|"type":"llm"|base64/);
    const ack = graph.nodes.find((item) => item.id === "ack")!;
    expect(ack.data.code).toContain("status_code != 200");
    expect(ack.data.code).toContain("data.get('state') != 'succeeded'");
    expect(ack.data.code).toContain("asset_id != operation_id");
    expect(ack.data.code).toContain("[0-9a-f]{64}");
    expect(ack.data.code).not.toContain("uri");
  });
});
