import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Persona } from "@/lib/contracts/experiment-runner";
import type { NarrativeTask } from "@/lib/experiment-runner/narrative-tasks";

export type SimulationModule = { role: "manager" | "specialist" | "tester"; taskId: NarrativeTask | null; persona: Persona | null };
export const M1_SIMULATION_MODULES: SimulationModule[] = [
  { role: "manager", taskId: null, persona: null },
  { role: "specialist", taskId: "J01", persona: null }, { role: "specialist", taskId: "J02", persona: null },
  ...(["playful_kid", "enthusiast_parent", "professional_creator"] as const).map((persona) => ({ role: "tester" as const, taskId: null, persona })),
];
export const M2_SIMULATION_MODULES: SimulationModule[] = [
  ...M1_SIMULATION_MODULES,
  ...(["J03", "J04", "J05", "J06", "J07"] as const).map((taskId) => ({ role: "specialist" as const, taskId, persona: null })),
];
export function simulationModuleName(module: SimulationModule) {
  const milestone = module.taskId && !["J01", "J02"].includes(module.taskId) ? "m2" : "m1";
  return `issue65_${milestone}_${module.taskId ?? module.persona ?? module.role}`;
}

type Node = { id: string; type: "custom"; position: { x: number; y: number }; data: Record<string, unknown> };
const output = { type: "string", children: null };
function code(id: string, title: string, source: string, variables: Record<string, string[]>, outputs: string[], x: number): Node {
  return { id, type: "custom", position: { x, y: 0 }, data: { title, type: "code", code_language: "python3", code: source, variables: Object.entries(variables).map(([variable, value_selector]) => ({ variable, value_selector })), outputs: Object.fromEntries(outputs.map((key) => [key, output])), retry_config: { retry_enabled: false, max_retries: 0, retry_interval: 0 } } };
}
function http(id: string, title: string, path: string, selector: string[], x: number): Node {
  return { id, type: "custom", position: { x, y: 0 }, data: {
    type: "http-request", title, method: "post", url: `{{#env.BOOKLET_ORIGIN#}}/api/experiments/booklet-tools/${path}`,
    authorization: { type: "no-auth" }, headers: "Content-Type:application/json\nx-booklet-tool-key:{{#env.BOOKLET_TOOL_KEY#}}",
    params: "", body: { type: "raw-text", data: [{ type: "text", value: `{{#${selector.join(".")}#}}` }] },
    timeout: { connect: 10, read: 30, write: 30 }, ssl_verify: true,
    retry_config: { retry_enabled: false, max_retries: 0, retry_interval: 0 },
  } };
}

/** Model-free candidate graphs. Live graph validation and publication remain separate. */
export async function createSimulationGraph(module: SimulationModule, profile: "m1" | "m2" = "m1") {
  const modules = profile === "m2" ? M2_SIMULATION_MODULES : M1_SIMULATION_MODULES;
  if (!modules.some((item) => JSON.stringify(item) === JSON.stringify(module))) throw new Error("Unsupported simulation module");
  const fixture = await readFile(resolve(`docs/accepted/2026-09-27_dify-booklet-runner/dify/${profile}-simulation.py`), "utf8");
  const wrapper = `\n\ndef main(authorization_body, run_id, operation_id, workflow_run_id, parent_workflow_run_id):\n    data = json.loads(authorization_body)["data"]\n    if data.get("started") is True:\n        ctx = data["context"]\n        if ctx.get("role") != ${JSON.stringify(module.role)}:\n            raise ValueError("Wrong module role")\n${module.taskId ? `        if ctx.get("taskId") != ${JSON.stringify(module.taskId)}:\n            raise ValueError("Wrong specialist task")\n` : ""}${module.persona ? `        if ctx.get("persona") != ${JSON.stringify(module.persona)}:\n            raise ValueError("Wrong tester persona")\n` : ""}    return simulation_main(authorization_body, run_id, operation_id, workflow_run_id, parent_workflow_run_id)\n`;
  const nodes: Node[] = [
    { id: "start", type: "custom", position: { x: 0, y: 0 }, data: { title: "Simulated input only", type: "start", variables: ["run_id", "operation_id", "parent_workflow_run_id", "mode"].map((variable) => ({ variable, label: variable, type: "text-input", required: variable !== "parent_workflow_run_id", default: "", options: [] })) } },
    code("identity", "Validate simulation and build identity", "import json\nfrom uuid import UUID\n\ndef main(run_id, operation_id, workflow_run_id, parent_workflow_run_id, mode):\n    if mode != 'simulated':\n        raise ValueError('This publication supports simulation only')\n    for value in (run_id, operation_id, workflow_run_id):\n        UUID(value)\n    if parent_workflow_run_id:\n        UUID(parent_workflow_run_id)\n    return {'identity_json': json.dumps({'runId': run_id, 'operationId': operation_id, 'workflowRunId': workflow_run_id, 'parentWorkflowRunId': parent_workflow_run_id or None})}\n", { run_id: ["start", "run_id"], operation_id: ["start", "operation_id"], workflow_run_id: ["sys", "workflow_run_id"], parent_workflow_run_id: ["start", "parent_workflow_run_id"], mode: ["start", "mode"] }, ["identity_json"], 280),
    http("authorize", "Reserve once in Booklet", "authorize", ["identity", "identity_json"], 560),
    code("simulate", `Simulate ${module.taskId ?? module.persona ?? module.role}`, fixture.replace("def main(", "def simulation_main(") + wrapper, { authorization_body: ["authorize", "body"], run_id: ["start", "run_id"], operation_id: ["start", "operation_id"], workflow_run_id: ["sys", "workflow_run_id"], parent_workflow_run_id: ["start", "parent_workflow_run_id"] }, ["booklet_result", "authorization_reason"], 840),
    { id: "authorized", type: "custom", position: { x: 1120, y: 0 }, data: { title: "Save only an authorized result", type: "if-else", cases: [{ case_id: "true", logical_operator: "and", conditions: [{ id: "has-result", comparison_operator: "not empty", variable_selector: ["simulate", "booklet_result"], varType: "string", value: "" }] }] } },
    http("save", "Save original result in Booklet", "result", ["simulate", "booklet_result"], 1400),
    code("ack", "Require Booklet saved completion", "import json\n\ndef main(body, status_code, booklet_result):\n    data = json.loads(body).get('data', {})\n    if status_code != 200 or data.get('state') != 'succeeded':\n        raise ValueError('Booklet did not confirm saved completion')\n    return {'booklet_result': booklet_result, 'authorization_reason': ''}\n", { body: ["save", "body"], status_code: ["save", "status_code"], booklet_result: ["simulate", "booklet_result"] }, ["booklet_result", "authorization_reason"], 1680),
    // Studio requires globally unique End output names. Each branch exposes only
    // the output consumed by the runner; saved results still require the ack gate.
    { id: "finish", type: "custom", position: { x: 1960, y: 0 }, data: { title: "Saved completion", type: "end", outputs: [{ variable: "booklet_result", value_type: "string", value_selector: ["ack", "booklet_result"] }] } },
    { id: "paused", type: "custom", position: { x: 1400, y: 300 }, data: { title: "Paused without execution", type: "end", outputs: [{ variable: "authorization_reason", value_type: "string", value_selector: ["simulate", "authorization_reason"] }] } },
  ];
  const links = [["start", "identity"], ["identity", "authorize"], ["authorize", "simulate"], ["simulate", "authorized"], ["authorized", "save", "true"], ["authorized", "paused", "false"], ["save", "ack"], ["ack", "finish"]];
  const edges = links.map(([source, target, handle]) => ({ id: `${source}-${target}`, source, target, sourceHandle: handle ?? "source", targetHandle: "target", type: "custom", data: { sourceType: nodes.find((node) => node.id === source)!.data.type, targetType: nodes.find((node) => node.id === target)!.data.type } }));
  return { nodes, edges };
}
