import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Persona } from "@/lib/contracts/experiment-runner";
import type { NarrativeTask } from "@/lib/experiment-runner/narrative-tasks";

// Preparation can include sheet candidates before runtime admission is enabled.
export type SimulationModule = { role: "manager" | "specialist" | "tester" | "judge"; taskId: NarrativeTask | "J09" | "J10" | "J11" | "J12" | null; persona: Persona | null };
export const M1_SIMULATION_MODULES: SimulationModule[] = [
  { role: "manager", taskId: null, persona: null },
  { role: "specialist", taskId: "J01", persona: null }, { role: "specialist", taskId: "J02", persona: null },
  ...(["playful_kid", "enthusiast_parent", "professional_creator"] as const).map((persona) => ({ role: "tester" as const, taskId: null, persona })),
];
export const M2_SIMULATION_MODULES: SimulationModule[] = [
  ...M1_SIMULATION_MODULES,
  ...(["J03", "J04", "J05", "J06", "J07", "J08", "J09", "J10"] as const).map((taskId) => ({ role: "specialist" as const, taskId, persona: null })),
];
export const M3_SIMULATION_MODULES: SimulationModule[] = [
  { role: "manager", taskId: null, persona: null },
  ...(["playful_kid", "enthusiast_parent", "professional_creator"] as const).map((persona) => ({ role: "tester" as const, taskId: null, persona })),
  { role: "specialist", taskId: "J11", persona: null },
];
export const M3_J12_SIMULATION_MODULES: SimulationModule[] = [
  { role: "manager", taskId: null, persona: null },
  { role: "specialist", taskId: "J12", persona: null },
];
export const M3_FINAL_SIMULATION_MODULES: SimulationModule[] = [
  ...M3_SIMULATION_MODULES, M3_J12_SIMULATION_MODULES[1], { role: "judge", taskId: null, persona: null },
];
export function m3SimulationModuleName(module: SimulationModule) {
  return `issue65_m3_${module.taskId ?? module.persona ?? module.role}`;
}
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
export async function createSimulationGraph(module: SimulationModule, profile: "m1" | "m2" | "m3" | "m3-j12" | "m3-j13" = "m1") {
  const finalPages = profile === "m3-j13";
  const reports = finalPages && (module.role === "tester" || module.role === "judge");
  const pageBibles = profile === "m3-j12" || finalPages;
  const pagination = profile === "m3" || pageBibles;
  const modules: SimulationModule[] = finalPages ? M3_FINAL_SIMULATION_MODULES : profile === "m3-j12" ? M3_J12_SIMULATION_MODULES : profile === "m3" ? M3_SIMULATION_MODULES : profile === "m2" ? M2_SIMULATION_MODULES : M1_SIMULATION_MODULES;
  if (!modules.some((item) => JSON.stringify(item) === JSON.stringify(module))) throw new Error("Unsupported simulation module");
  const fixture = await readFile(resolve(`docs/accepted/2026-09-27_dify-booklet-runner/dify/${pagination ? "m2" : profile}-simulation.py`), "utf8") +
    (pagination ? `\n${await readFile(resolve("docs/accepted/2026-09-27_dify-booklet-runner/dify/m3-pagination.py"), "utf8")}` : "") +
    (pageBibles ? `\n${await readFile(resolve("docs/accepted/2026-09-27_dify-booklet-runner/dify/m3-page-bible.py"), "utf8")}` : "") +
    (finalPages ? `\n${await readFile(resolve("docs/accepted/2026-09-27_dify-booklet-runner/dify/m3-page-illustration.py"), "utf8")}` : "");
  const wrapper = `\n\ndef main(authorization_body, run_id, operation_id, workflow_run_id, parent_workflow_run_id):\n    data = json.loads(authorization_body)["data"]\n    if data.get("started") is True:\n        ctx = data["context"]\n        if ctx.get("role") != ${JSON.stringify(module.role)}:\n            raise ValueError("Wrong module role")\n${module.taskId ? `        if ctx.get("taskId") != ${JSON.stringify(module.taskId)}:\n            raise ValueError("Wrong specialist task")\n` : ""}${module.persona ? `        if ctx.get("persona") != ${JSON.stringify(module.persona)}:\n            raise ValueError("Wrong tester persona")\n` : ""}    return simulation_main(authorization_body, run_id, operation_id, workflow_run_id, parent_workflow_run_id)\n`;
  const nodes: Node[] = [
    { id: "start", type: "custom", position: { x: 0, y: 0 }, data: { title: "Simulated input only", type: "start", variables: ["run_id", "operation_id", "parent_workflow_run_id", "mode"].map((variable) => ({ variable, label: variable, type: "text-input", required: variable !== "parent_workflow_run_id", default: "", options: [] })) } },
    code("identity", "Validate simulation and build identity", "import json\nfrom uuid import UUID\n\ndef main(run_id, operation_id, workflow_run_id, parent_workflow_run_id, mode):\n    if mode != 'simulated':\n        raise ValueError('This publication supports simulation only')\n    for value in (run_id, operation_id, workflow_run_id):\n        UUID(value)\n    if parent_workflow_run_id:\n        UUID(parent_workflow_run_id)\n    return {'identity_json': json.dumps({'runId': run_id, 'operationId': operation_id, 'workflowRunId': workflow_run_id, 'parentWorkflowRunId': parent_workflow_run_id or None})}\n", { run_id: ["start", "run_id"], operation_id: ["start", "operation_id"], workflow_run_id: ["sys", "workflow_run_id"], parent_workflow_run_id: ["start", "parent_workflow_run_id"], mode: ["start", "mode"] }, ["identity_json"], 280),
    http("authorize", "Reserve once in Booklet", "authorize", ["identity", "identity_json"], 560),
    code("simulate", `Simulate ${module.taskId ?? module.persona ?? module.role}`, fixture.replace("def main(", "def simulation_main(") + wrapper, { authorization_body: ["authorize", "body"], run_id: ["start", "run_id"], operation_id: ["start", "operation_id"], workflow_run_id: ["sys", "workflow_run_id"], parent_workflow_run_id: ["start", "parent_workflow_run_id"] }, ["booklet_result", "authorization_reason"], 840),
    { id: "authorized", type: "custom", position: { x: 1120, y: 0 }, data: { title: "Save only an authorized result", type: "if-else", cases: [{ case_id: "true", logical_operator: "and", conditions: [{ id: "has-result", comparison_operator: "not empty", variable_selector: ["simulate", "booklet_result"], varType: "string", value: "" }] }] } },
    http("save", "Save original result in Booklet", "result", ["simulate", "booklet_result"], 1400),
    code("ack", "Require Booklet saved completion", "import json\n\ndef main(body, status_code, booklet_result):\n    data = json.loads(body).get('data', {})\n    if status_code != 200 or data.get('state') != 'succeeded':\n        raise ValueError('Booklet did not confirm saved completion')\n    return {'booklet_result': booklet_result, 'authorization_reason': ''}\n", { body: ["save", "body"], status_code: ["save", "status_code"], booklet_result: ["simulate", "booklet_result"] }, ["booklet_result", "authorization_reason"], 1680),
    // A report must return before Booklet can verify its runtime publication.
    // Ordinary results still traverse save + ack. Both paths share one End output
    // name, selected from their common simulation node, as required by Studio.
    { id: "finish", type: "custom", position: { x: 1960, y: 0 }, data: { title: reports ? "Result for publication-verified acceptance" : "Saved completion", type: "end", outputs: [{ variable: "booklet_result", value_type: "string", value_selector: [reports ? "simulate" : "ack", "booklet_result"] }] } },
    { id: "paused", type: "custom", position: { x: 1400, y: 300 }, data: { title: "Paused without execution", type: "end", outputs: [{ variable: "authorization_reason", value_type: "string", value_selector: ["simulate", "authorization_reason"] }] } },
  ];
  const links = [["start", "identity"], ["identity", "authorize"], ["authorize", "simulate"], ["simulate", "authorized"], ["authorized", "save", "true"], ["authorized", "paused", "false"], ["save", "ack"], ["ack", "finish"]];
  if (reports) {
    nodes.push(code("report-kind", "Separate advisory report from creator action",
      "import json\n\ndef main(booklet_result):\n    kind = json.loads(booklet_result).get('result', {}).get('kind')\n    return {'report_kind': kind if kind in ('feedback', 'assessment') else ''}\n",
      { booklet_result: ["simulate", "booklet_result"] }, ["report_kind"], 1400));
    nodes.push({ id: "report-route", type: "custom", position: { x: 1680, y: 300 }, data: {
      title: "Return report before publication readback", type: "if-else", cases: [{ case_id: "true", logical_operator: "and",
        conditions: [{ id: "is-report", comparison_operator: "not empty", variable_selector: ["report-kind", "report_kind"], varType: "string", value: "" }] }],
    } });
    const savedLink = links.findIndex(([source, target]) => source === "authorized" && target === "save");
    links.splice(savedLink, 1, ["authorized", "report-kind", "true"], ["report-kind", "report-route"],
      ["report-route", "finish", "true"], ["report-route", "save", "false"]);
  }
  const edges = links.map(([source, target, handle]) => ({ id: `${source}-${target}`, source, target, sourceHandle: handle ?? "source", targetHandle: "target", type: "custom", data: { sourceType: nodes.find((node) => node.id === source)!.data.type, targetType: nodes.find((node) => node.id === target)!.data.type } }));
  return { nodes, edges };
}

/** Separate model-free image transport; text modules never generate image bytes. */
export function createSimulatedImageGraph(options: { finalPages?: boolean } = {}) {
  const nodes: Node[] = [
    { id: "start", type: "custom", position: { x: 0, y: 0 }, data: { title: "Simulated image probe input", type: "start", variables: ["run_id", "operation_id", "parent_workflow_run_id", "mode"].map((variable) => ({ variable, label: variable, type: "text-input", required: variable !== "parent_workflow_run_id", default: "", options: [] })) } },
    code("identity", "Validate simulation identity", "import json\nfrom uuid import UUID\n\ndef main(run_id, operation_id, workflow_run_id, parent_workflow_run_id, mode):\n    if mode != 'simulated':\n        raise ValueError('This publication supports simulation only')\n    for value in (run_id, operation_id, workflow_run_id):\n        UUID(value)\n    if parent_workflow_run_id:\n        UUID(parent_workflow_run_id)\n    return {'identity_json': json.dumps({'runId': run_id, 'operationId': operation_id, 'workflowRunId': workflow_run_id, 'parentWorkflowRunId': parent_workflow_run_id or None})}\n", { run_id: ["start", "run_id"], operation_id: ["start", "operation_id"], workflow_run_id: ["sys", "workflow_run_id"], parent_workflow_run_id: ["start", "parent_workflow_run_id"], mode: ["start", "mode"] }, ["identity_json"], 280),
    http("authorize", "Reserve image once in Booklet", "authorize", ["identity", "identity_json"], 560),
    code("prepare", "Check authorization and form operation URLs", "import json\nimport re\nfrom urllib.parse import urlencode\n\ndef main(authorization_body, status_code, run_id, operation_id, workflow_run_id, parent_workflow_run_id, booklet_origin):\n    if status_code != 200:\n        raise ValueError('Booklet authorization failed')\n    data = json.loads(authorization_body).get('data', {})\n    if data.get('started') is not True:\n        reason = data.get('reason')\n        if not isinstance(reason, str) or not reason:\n            raise ValueError('Booklet did not provide an authorization reason')\n        return {'fixture_url': '', 'upload_url': '', 'input_fingerprint': '', 'authorization_reason': reason}\n    fingerprint = data.get('inputFingerprint')\n    context = data.get('context')\n    if data.get('role') != 'image' or data.get('mode') != 'simulated' or not isinstance(fingerprint, str) or not re.fullmatch(r'[0-9a-f]{64}', fingerprint) or not isinstance(context, dict) or context.get('role') != 'image' or context.get('mode') != 'simulated' or context.get('inputFingerprint') != fingerprint or not isinstance(context.get('imageRequest'), dict):\n        raise ValueError('Booklet image authorization is inconsistent')\n    request = context['imageRequest']\n    if not isinstance(request.get('prompt'), str) or not request['prompt'] or not isinstance(request.get('sourceVersionIds'), list):\n        raise ValueError('Booklet image request is incomplete')\n    query = urlencode({'runId': run_id, 'operationId': operation_id, 'workflowRunId': workflow_run_id, 'parentWorkflowRunId': parent_workflow_run_id or '', 'inputFingerprint': fingerprint})\n    base = booklet_origin.rstrip('/') + '/api/experiments/booklet-tools/'\n    return {'fixture_url': base + 'image-fixture?' + query, 'upload_url': base + 'image?' + query, 'input_fingerprint': fingerprint, 'authorization_reason': ''}\n", { authorization_body: ["authorize", "body"], status_code: ["authorize", "status_code"], run_id: ["start", "run_id"], operation_id: ["start", "operation_id"], workflow_run_id: ["sys", "workflow_run_id"], parent_workflow_run_id: ["start", "parent_workflow_run_id"], booklet_origin: ["env", "BOOKLET_ORIGIN"] }, ["fixture_url", "upload_url", "input_fingerprint", "authorization_reason"], 840),
    { id: "authorized", type: "custom", position: { x: 1120, y: 0 }, data: { title: "Download only after reservation", type: "if-else", cases: [{ case_id: "true", logical_operator: "and", conditions: [{ id: "has-fixture-url", comparison_operator: "not empty", variable_selector: ["prepare", "fixture_url"], varType: "string", value: "" }] }] } },
    { id: "fixture", type: "custom", position: { x: 1400, y: 0 }, data: { title: "Download synthetic PNG bytes", type: "http-request", method: "get", url: "{{#prepare.fixture_url#}}", authorization: { type: "no-auth" }, headers: "x-booklet-tool-key:{{#env.BOOKLET_TOOL_KEY#}}", params: "", body: { type: "none", data: [] }, timeout: { connect: 10, read: 30, write: 30 }, ssl_verify: true, retry_config: { retry_enabled: false, max_retries: 0, retry_interval: 0 } } },
    // HTTP output is array[file]; binary upload requires a single FileSegment.
    { id: "select_file", type: "custom", position: { x: 1540, y: 0 }, data: { title: "Select original fixture file", type: "list-operator", variable: ["fixture", "files"], var_type: "array[file]", item_var_type: "file", filter_by: { enabled: false, conditions: [] }, extract_by: { enabled: true, serial: "1" }, order_by: { enabled: false, key: "", value: "asc" }, limit: { enabled: false, size: 1 } } },
    { id: "upload", type: "custom", position: { x: 1680, y: 0 }, data: { title: "Upload original fixture bytes", type: "http-request", method: "post", url: "{{#prepare.upload_url#}}", authorization: { type: "no-auth" }, headers: "Content-Type:application/octet-stream\nx-booklet-tool-key:{{#env.BOOKLET_TOOL_KEY#}}", params: "", body: { type: "binary", data: [{ type: "file", file: ["select_file", "first_record"] }] }, timeout: { connect: 10, read: 30, write: 30 }, ssl_verify: true, retry_config: { retry_enabled: false, max_retries: 0, retry_interval: 0 } } },
    code("ack", "Require saved image completion", "import json\nimport re\n\ndef main(body, status_code, run_id, operation_id, workflow_run_id, parent_workflow_run_id, input_fingerprint):\n    data = json.loads(body).get('data', {})\n    asset_id = data.get('assetId')\n    digest = data.get('sha256')\n    if status_code != 200 or data.get('state') != 'succeeded' or asset_id != operation_id or not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest):\n        raise ValueError('Booklet did not confirm saved image completion')\n    result = {'runId': run_id, 'operationId': operation_id, 'workflowRunId': workflow_run_id, 'parentWorkflowRunId': parent_workflow_run_id or None, 'inputFingerprint': input_fingerprint, 'assetId': asset_id, 'sha256': digest}\n    return {'image_result': json.dumps(result)}\n", { body: ["upload", "body"], status_code: ["upload", "status_code"], run_id: ["start", "run_id"], operation_id: ["start", "operation_id"], workflow_run_id: ["sys", "workflow_run_id"], parent_workflow_run_id: ["start", "parent_workflow_run_id"], input_fingerprint: ["prepare", "input_fingerprint"] }, ["image_result"], 1960),
    { id: "finish", type: "custom", position: { x: 2240, y: 0 }, data: { title: "Saved image completion", type: "end", outputs: [{ variable: "image_result", value_type: "string", value_selector: ["ack", "image_result"] }] } },
    { id: "paused", type: "custom", position: { x: 1400, y: 300 }, data: { title: "Paused without execution", type: "end", outputs: [{ variable: "authorization_reason", value_type: "string", value_selector: ["prepare", "authorization_reason"] }] } },
  ];
  if (options.finalPages) {
    const variables = nodes.find((node) => node.id === "start")!.data.variables as Record<string, unknown>[];
    variables.push({ variable: "reference_files", label: "Ordered approved image references", type: "file-list",
      required: false, max_length: 15, allowed_file_types: ["image"], allowed_file_extensions: [".png", ".jpg", ".jpeg", ".webp"],
      allowed_file_upload_methods: ["local_file"] });
    // Return Dify's resolved file descriptors for runtime read-back. This is
    // transport evidence only; it does not establish provider use or identity parity.
    const outputs = nodes.find((node) => node.id === "finish")!.data.outputs as Record<string, unknown>[];
    outputs.push({ variable: "reference_files", value_type: "array[file]", value_selector: ["start", "reference_files"] });
  }
  const links = [["start", "identity"], ["identity", "authorize"], ["authorize", "prepare"], ["prepare", "authorized"], ["authorized", "fixture", "true"], ["authorized", "paused", "false"], ["fixture", "select_file"], ["select_file", "upload"], ["upload", "ack"], ["ack", "finish"]];
  const edges = links.map(([source, target, handle]) => ({ id: `${source}-${target}`, source, target, sourceHandle: handle ?? "source", targetHandle: "target", type: "custom", data: { sourceType: nodes.find((node) => node.id === source)!.data.type, targetType: nodes.find((node) => node.id === target)!.data.type } }));
  return { nodes, edges };
}
