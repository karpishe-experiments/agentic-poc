import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createM4WorkflowGraph, M4_CARRIER_CHUNKS } from "@/lib/experiment-runner/m4-workflow-graph";
import { createSimulationGraph, M2_SIMULATION_MODULES, M3_FINAL_SIMULATION_MODULES, type SimulationModule } from "@/lib/experiment-runner/workflow-graph";
import { m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";

type Graph = Awaited<ReturnType<typeof createM4WorkflowGraph>>;
const manager: SimulationModule = { role: "manager", taskId: null, persona: null };
const tester: SimulationModule = { role: "tester", taskId: null, persona: "playful_kid" };
const judge: SimulationModule = { role: "judge", taskId: null, persona: null };
const wheel = "output/issue65-openai-plugin-audit/graphon/graphon-0.7.0-py3-none-any.whl";
const env = { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" };
function execute(source: unknown, args: Record<string, unknown>) {
  const result = spawnSync("python", ["-c", "import json,sys; p=json.load(sys.stdin); s={}; exec(p['source'],s); print(json.dumps(s['main'](**p['args'])))"], {
    input: JSON.stringify({ source, args }), encoding: "utf8", env, maxBuffer: 8 * 1024 * 1024, timeout: 10_000,
  });
  if (result.status !== 0) throw new Error(result.stderr || `Python exited ${result.status}`);
  return JSON.parse(result.stdout) as Record<string, string | number>;
}
function authorization(module = manager, report = false, content = "fixture") {
  const requestJson = m4CanonicalJson({ model: module.role === "judge" ? "gpt-6-sol" : "gpt-6-luna",
    input: [{ type: "message", role: "system", content: "fixture" },
      { type: "message", role: "user", content: JSON.stringify({ persona: module.persona ?? "playful_kid", content }) }],
    max_output_tokens: module.role === "specialist" || report ? 8192 : 2048,
    reasoning: { effort: module.role === "specialist" || module.role === "judge" ? "low" : "none", mode: "standard" },
    service_tier: "default", text: { format: { type: "json_schema", strict: true, name: "fixture",
      schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false } } },
    store: false, truncation: "disabled", include: ["reasoning.encrypted_content"],
  });
  return { started: true, reason: null, mode: "balanced", role: module.role, taskId: module.taskId,
    subjectKind: null, subjectId: null, inputFingerprint: "a".repeat(64),
    m4: { requestJson, requestDigest: m4Hash(requestJson), timeoutSeconds: 60, deadlineAtMs: Date.now() + 120_000, report } };
}
function decode(graph: Graph, data: unknown, status_code = 200) {
  return execute(graph.nodes.find((node) => node.id === "m4_decode")!.data.code,
    { authorization_body: JSON.stringify({ data }), status_code });
}
function selectedLlm(graph: Graph, values: Record<string, string | number>) {
  const ids: string[] = [];
  let current = "m4_authorized";
  for (let step = 0; step < 10; step++) {
    const node = graph.nodes.find((item) => item.id === current)!;
    if (node.data.type === "llm") ids.push(current);
    if (node.data.type === "end") return ids;
    let handle = "source";
    if (node.data.type === "if-else") {
      const cases = node.data.cases as { conditions: { variable_selector: string[]; value: string }[] }[];
      handle = cases[0].conditions.every((condition) => values[condition.variable_selector[1]] === condition.value) ? "true" : "false";
    }
    const edge = graph.edges.find((item) => item.source === current && item.sourceHandle === handle);
    if (!edge) throw new Error("Missing graph transition");
    current = edge.target;
  }
  throw new Error("Graph did not terminate");
}

describe("offline Balanced graph candidate", () => {
  it("preserves all existing Simulated modules and edges after the new mode gate", async () => {
    const modules = [...M2_SIMULATION_MODULES.filter((item) => item.role === "specialist"), ...M3_FINAL_SIMULATION_MODULES];
    for (const selectedModule of modules) {
      const profile = selectedModule.role === "specialist" && selectedModule.taskId && !["J11", "J12"].includes(selectedModule.taskId) ? "m2" : "m3-j13";
      const original = await createSimulationGraph(selectedModule, profile);
      const graph = await createM4WorkflowGraph(selectedModule);
      expect(graph.nodes.filter((node) => !node.id.startsWith("m4_"))).toEqual(original.nodes);
      expect(graph.edges.filter((edge) => !edge.source.startsWith("m4_") && !edge.target.startsWith("m4_")))
        .toEqual(original.edges.filter((edge) => edge.source !== "start"));
      expect(graph.edges).toContainEqual(expect.objectContaining({ source: "m4_mode", target: "identity", sourceHandle: "true" }));
    }
  });

  it("rejects Real before authorization and validates operation identities", async () => {
    const graph = await createM4WorkflowGraph(manager);
    const source = graph.nodes.find((node) => node.id === "m4_identity")!.data.code;
    const args = { run_id: "00000000-0000-4000-8000-000000000001", operation_id: "00000000-0000-4000-8000-000000000002",
      workflow_run_id: "00000000-0000-4000-8000-000000000003", parent_workflow_run_id: "", mode: "balanced" };
    expect(execute(source, args).identity_json).toContain(args.run_id);
    expect(() => execute(source, { ...args, mode: "real" })).toThrow("Balanced only");
    expect(() => execute(source, { ...args, run_id: "invalid" })).toThrow();
  });

  it("selects exactly one role model with static role limits and returns raw text without a callback", async () => {
    for (const [module, report, model, output, effort] of [
      [manager, false, "gpt-6-luna", 2048, "none"], [tester, false, "gpt-6-luna", 2048, "none"],
      [tester, true, "gpt-6-luna", 8192, "none"], [judge, true, "gpt-6-sol", 8192, "low"],
      [{ role: "specialist", taskId: "J12", persona: null }, false, "gpt-6-luna", 8192, "low"],
    ] as const) {
      const graph = await createM4WorkflowGraph(module);
      const selected = selectedLlm(graph, decode(graph, authorization(module, report)));
      expect(selected).toHaveLength(1);
      const node = graph.nodes.find((item) => item.id === selected[0])!;
      expect(node.data.model).toMatchObject({ name: model, completion_params: { max_tokens: output, reasoning_effort: effort,
        enable_stream: false, booklet_prepared_request: true, booklet_bounded_execution: true, service_tier: "default", reasoning_mode: "standard" } });
      expect(node.data).toMatchObject({ memory: null, context: { enabled: false }, vision: { enabled: false }, structured_output_enabled: false,
        retry_config: { retry_enabled: false, max_retries: 0 } });
      const final = graph.nodes.find((item) => item.id === `${selected[0]}-finish`)!;
      expect(final.data.outputs).toEqual([{ variable: "booklet_provider_result", value_type: "string", value_selector: [selected[0], "text"] }]);
      expect(graph.nodes.filter((item) => item.id.startsWith("m4_") && item.data.type === "http-request")).toHaveLength(1);
    }
  });

  it("executes zero model nodes on denial and rejects malformed authorization before selection", async () => {
    const graph = await createM4WorkflowGraph(tester);
    expect(selectedLlm(graph, decode(graph, { started: false, reason: "paused" }))).toEqual([]);
    const good = authorization(tester);
    for (const invalid of [
      { ...good, mode: "real" }, { ...good, role: "manager" }, { ...good, taskId: "J01" },
      { ...good, inputFingerprint: "bad" }, { ...good, m4: { ...good.m4, requestDigest: "0".repeat(64) } },
      { ...good, m4: { ...good.m4, requestJson: good.m4.requestJson + " " } },
      { ...good, m4: { ...good.m4, deadlineAtMs: 1 } }, { ...good, m4: { ...good.m4, timeoutSeconds: 121 } },
      authorization({ ...tester, persona: "professional_creator" }), { started: false, reason: "" },
    ]) expect(() => decode(graph, invalid)).toThrow();
    expect(() => decode(graph, good, 403)).toThrow();
    expect(() => decode(graph, authorization(tester, false, "x".repeat(1048576)))).toThrow("transport failed");
  });

  it("preserves Unicode and literal interpolation text across exact 65536-character chunks", async () => {
    const graph = await createM4WorkflowGraph(tester);
    const data = authorization(tester, true, "😀فارسی{{#env.SECRET#}}".repeat(5000));
    const decoded = decode(graph, data);
    expect(M4_CARRIER_CHUNKS.map((key) => decoded[key]).join("")).toBe(data.m4.requestJson);
    expect(M4_CARRIER_CHUNKS).toHaveLength(32);
    expect(Array.from(decoded.request_00 as string)).toHaveLength(65536);
    expect(decoded.request_31).toBe("");
    expect(decoded.digest).toBe(`sha256:${data.m4.requestDigest}`);
  });

  it.skipIf(!existsSync(wheel))("rehearses actual pinned Graphon template, parameter coercion and text normalization", async () => {
    const graph = await createM4WorkflowGraph(tester);
    const modelNode = graph.nodes.find((node) => node.id === "m4_report_llm")!;
    const model = modelNode.data.model as { completion_params: Record<string, unknown> };
    const prompt = modelNode.data.prompt_template as { text: string }[];
    const data = authorization(tester, true, "😀فارسی{{#env.SECRET#}}".repeat(5000));
    const run = spawnSync("python", ["tests/helpers/m4-graphon-rehearsal.py", wheel], {
      input: JSON.stringify({ source: graph.nodes.find((node) => node.id === "m4_decode")!.data.code,
        args: { authorization_body: JSON.stringify({ data }), status_code: 200 }, prompt: prompt[0].text, params: model.completion_params }),
      encoding: "utf8", env, timeout: 10_000, maxBuffer: 8 * 1024 * 1024,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ exact: true, carrierBytes: Buffer.byteLength(data.m4.requestJson, "utf8") });
  });
});
