import { createM4ImageWorkflowGraph, createM4WorkflowGraph, M4_CARRIER_CHUNKS } from "@/lib/experiment-runner/m4-workflow-graph";
import type { SimulationModule } from "@/lib/experiment-runner/workflow-graph";

type TextGraph = Awaited<ReturnType<typeof createM4WorkflowGraph>>;
type ImageGraph = ReturnType<typeof createM4ImageWorkflowGraph>;
type Node = TextGraph["nodes"][number];
type Edge = TextGraph["edges"][number];
const noRetry = { retry_enabled: false, max_retries: 0, retry_interval: 0 };

// These are publication candidates. Installation and native-file delivery
// remain separate checks before any Real request can be enabled.
export const REAL_TEXT_PROVIDER = "langgenius/openai/openai";
// Dify 1.17.1 loads workspace tool credentials through its builtin runtime path.
// The plugin path returns a tool without resolving that existing authorization.
export const REAL_IMAGE_TOOL = { provider_type: "builtin", provider_id: "langgenius/openai_tool/openai",
  provider_name: "openai", tool_name: "booklet_real_image" } as const;

function route(id: string, selector: string[], value: string): Node {
  return { id, type: "custom", position: { x: 250, y: 600 }, data: { type: "if-else", title: id,
    cases: [{ case_id: "true", logical_operator: "and", conditions: [{ id: `${id}-match`,
      comparison_operator: "is", variable_selector: selector, varType: "string", value }] }] } };
}
function code(id: string, source: string, variables: Record<string, string[]>, outputs: Record<string, "string" | "number">): Node {
  return { id, type: "custom", position: { x: 1000, y: 600 }, data: { type: "code", title: id,
    code_language: "python3", code: source, retry_config: noRetry,
    variables: Object.entries(variables).map(([variable, value_selector]) => ({ variable, value_selector })),
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, type]) => [name, { type, children: null }])) } };
}
function end(id: string, variable: string, selector: string[]): Node {
  return { id, type: "custom", position: { x: 2100, y: 600 }, data: { type: "end", title: id,
    outputs: [{ variable, value_type: "string", value_selector: selector }] } };
}
function edge(nodes: Node[], source: string, target: string, handle = "source"): Edge {
  return { id: `${source}-${target}`, source, target, sourceHandle: handle, targetHandle: "target", type: "custom",
    data: { sourceType: nodes.find(node => node.id === source)!.data.type,
      targetType: nodes.find(node => node.id === target)!.data.type } };
}
function divertAtStart<T extends { nodes: Node[]; edges: Edge[] }>(graph: T, next: string): void {
  const original = graph.edges.find(item => item.source === "start")!;
  graph.nodes.push(route("real_mode", ["start", "mode"], "real"));
  graph.edges.splice(graph.edges.indexOf(original), 1,
    edge(graph.nodes, "start", "real_mode"), edge(graph.nodes, "real_mode", next, "true"),
    edge(graph.nodes, "real_mode", original.target, "false"));
}
function realIdentity(from: Node, id: string): Node {
  const node = structuredClone(from);
  node.id = id;
  node.data.title = "Validate Real identity";
  node.data.code = (node.data.code as string).replace("mode != 'balanced'", "mode != 'real'")
    .replace("This branch supports Balanced only", "This branch supports Real only");
  return node;
}

const textDecoder = (module: SimulationModule) => `import hashlib
import json
import math
import re
import time

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)

def main(authorization_body, status_code):
    if status_code != 200 or not isinstance(authorization_body, str) or len(authorization_body.encode('utf-8')) > 1048576:
        raise ValueError('Booklet authorization transport failed')
    data = json.loads(authorization_body).get('data')
    if not isinstance(data, dict):
        raise ValueError('Booklet authorization envelope is missing')
    result = {'request_%02d' % i: '' for i in range(32)}
    result.update(authorized='', authorization_reason='', report='', digest='', timeout_seconds=0, deadline_at_ms=0,
                  token_policy_version='', token_policy_hash='', max_input_tokens=0, warning_input_tokens=0, schema_json='')
    if data.get('started') is not True:
        reason = data.get('reason')
        if data.get('started') is not False or not isinstance(reason, str) or not reason or len(reason) > 1024:
            raise ValueError('Booklet authorization denial is invalid')
        result['authorization_reason'] = reason
        return result
    if data.get('mode') != 'real' or data.get('role') != ${JSON.stringify(module.role)} or data.get('taskId') != ${module.taskId ? JSON.stringify(module.taskId) : "None"}:
        raise ValueError('Booklet authorization role differs')
    if not isinstance(data.get('inputFingerprint'), str) or not re.fullmatch('[0-9a-f]{64}', data['inputFingerprint']):
        raise ValueError('Booklet fingerprint is missing')
    prepared = data.get('m4')
    if not isinstance(prepared, dict) or type(prepared.get('report')) is not bool:
        raise ValueError('Booklet preparation is missing')
    report = prepared['report']
    if ${module.role === "judge" ? "not report" : module.role === "tester" ? "False" : "report"}:
        raise ValueError('Booklet report route differs')
    request = prepared.get('requestJson')
    digest = prepared.get('requestDigest')
    seconds = prepared.get('timeoutSeconds')
    deadline = prepared.get('deadlineAtMs')
    if not isinstance(request, str) or not request or '\\x00' in request or len(request) > 32 * 65536:
        raise ValueError('Booklet prepared carrier exceeds its limit')
    if not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest):
        raise ValueError('Booklet digest is missing')
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or not 0 < seconds <= 120:
        raise ValueError('Booklet remaining timeout is invalid')
    if type(deadline) is not int or not 0 < deadline <= 9007199254740991 or deadline <= time.time() * 1000:
        raise ValueError('Booklet original deadline expired')
    payload = json.loads(request)
    if request != canonical(payload):
        raise ValueError('Booklet prepared bytes differ')
    if report:
        if payload.get('schemaVersion') != 'booklet_real_report_carrier_v1' or payload.get('adapterIdentity') != 'm5-openai-bounded@1' or payload.get('finalRequestDigest') != digest or not isinstance(payload.get('orderedImages'), list) or not 1 <= len(payload['orderedImages']) <= 15 or hashlib.sha256(canonical(payload['orderedImages']).encode()).hexdigest() != payload.get('manifestDigest') or not isinstance(payload.get('textRequestJson'), str) or hashlib.sha256(payload['textRequestJson'].encode()).hexdigest() != payload.get('textRequestDigest') or payload.get('deadlineAtMs') != deadline:
            raise ValueError('Booklet Real report carrier differs')
        text = json.loads(payload['textRequestJson'])
        if payload['textRequestJson'] != canonical(text):
            raise ValueError('Booklet Real text carrier differs')
        output_format = text.get('text', {}).get('format', {})
        if output_format.get('type') != 'json_schema' or output_format.get('strict') is not True or not isinstance(output_format.get('schema'), dict):
            raise ValueError('Booklet Real report schema differs')
        result['schema_json'] = canonical({key: value for key, value in output_format.items() if key != 'type'})
    elif hashlib.sha256(request.encode()).hexdigest() != digest:
        raise ValueError('Booklet prepared bytes differ')
    else:
        text = payload
${module.persona ? `    if not report:
        context = json.loads(text['input'][1]['content'])
        if context.get('persona') != ${JSON.stringify(module.persona)}:
            raise ValueError('Booklet tester persona differs')
` : ""}    policy = text.get('bookletPolicy')
    if not isinstance(policy, dict) or policy.get('contractVersion') != 'booklet_carrier_v2':
        raise ValueError('Booklet token policy missing')
    original = {key: value for key, value in text.items() if key != 'bookletPolicy'}
    if hashlib.sha256(canonical(original).encode()).hexdigest() != policy.get('requestDigest'):
        raise ValueError('Booklet text request digest differs')
    token = policy.get('tokenPolicy')
    if not isinstance(token, dict) or token.get('version') != 'm4_context_policy_v2' or token.get('maxInputTokens') != 128000 or token.get('warningInputTokens') != 32000 or not isinstance(token.get('hash'), str) or not re.fullmatch('[0-9a-f]{64}', token['hash']):
        raise ValueError('Booklet token policy differs')
    for i in range(32):
        result['request_%02d' % i] = request[i * 65536:(i + 1) * 65536]
    result.update(authorized='yes', report='yes' if report else 'no', digest='sha256:' + digest,
                  timeout_seconds=seconds, deadline_at_ms=deadline, token_policy_version=token['version'],
                  token_policy_hash='sha256:' + token['hash'], max_input_tokens=128000, warning_input_tokens=32000)
    return result
`;

/** Add Real routes without rewriting the existing Simulated or Balanced nodes. */
export async function createRealWorkflowGraph(module: SimulationModule): Promise<TextGraph> {
  const graph = await createM4WorkflowGraph(module);
  const nodes = graph.nodes;
  const balancedIdentity = nodes.find(node => node.id === "m4_identity")!;
  nodes.push(realIdentity(balancedIdentity, "real_identity"));
  divertAtStart(graph, "real_identity");
  const authorize = structuredClone(nodes.find(node => node.id === "m4_authorize")!);
  authorize.id = "real_authorize";
  authorize.data.title = "Claim the prepared Real request once";
  authorize.data.body = { type: "raw-text", data: [{ type: "text", value: "{{#real_identity.identity_json#}}" }] };
  nodes.push(authorize);
  nodes.push(code("real_decode", textDecoder(module), { authorization_body: ["real_authorize", "body"],
    status_code: ["real_authorize", "status_code"] }, {
    ...Object.fromEntries(M4_CARRIER_CHUNKS.map(name => [name, "string" as const])),
    authorized: "string", authorization_reason: "string", report: "string", digest: "string",
    timeout_seconds: "number", deadline_at_ms: "number", token_policy_version: "string", token_policy_hash: "string",
    max_input_tokens: "number", warning_input_tokens: "number", schema_json: "string",
  }));
  nodes.push(route("real_authorized", ["real_decode", "authorized"], "yes"));
  nodes.push(end("real_paused", "authorization_reason", ["real_decode", "authorization_reason"]));
  if (module.role === "tester") nodes.push(route("real_report", ["real_decode", "report"], "yes"));
  const selected = module.role === "tester" ? [false, true] : [module.role === "judge"];
  for (const report of selected) {
    const source = nodes.find(node => node.id === (report ? "m4_report_llm" : "m4_llm"))!;
    const llm = structuredClone(source);
    llm.id = report ? "real_report_llm" : "real_llm";
    const model = llm.data.model as { provider: string; completion_params: Record<string, unknown> };
    model.provider = REAL_TEXT_PROVIDER;
    model.completion_params = { ...model.completion_params,
      ...(module.role === "manager" ? { max_tokens: 4096 } : {}),
      booklet_request_digest: "{{#real_decode.digest#}}", booklet_timeout_seconds: "{{#real_decode.timeout_seconds#}}",
      booklet_deadline_at_ms: "{{#real_decode.deadline_at_ms#}}",
      booklet_token_policy_version: "{{#real_decode.token_policy_version#}}",
      booklet_token_policy_hash: "{{#real_decode.token_policy_hash#}}",
      booklet_max_input_tokens: "{{#real_decode.max_input_tokens#}}",
      booklet_warning_input_tokens: "{{#real_decode.warning_input_tokens#}}",
      ...(report ? { booklet_real_report_execution: true, response_format: "json_schema", json_schema: "{{#real_decode.schema_json#}}" } : {}),
    };
    llm.data.prompt_template = [{ role: "user", edition_type: "basic",
      text: M4_CARRIER_CHUNKS.map(name => `{{#real_decode.${name}#}}`).join("") }];
    llm.data.vision = report ? { enabled: true, configs: { variable_selector: ["start", "reference_files"], detail: "high" } } : { enabled: false };
    nodes.push(llm);
    nodes.push(end(`${llm.id}-finish`, "booklet_provider_result", [llm.id, "text"]));
    graph.edges.push(edge(nodes, module.role === "tester" ? "real_report" : "real_authorized", llm.id,
      module.role === "tester" ? report ? "true" : "false" : "true"), edge(nodes, llm.id, `${llm.id}-finish`));
  }
  graph.edges.push(edge(nodes, "real_identity", "real_authorize"), edge(nodes, "real_authorize", "real_decode"),
    edge(nodes, "real_decode", "real_authorized"), edge(nodes, "real_authorized", "real_paused", "false"),
    ...(module.role === "tester" ? [edge(nodes, "real_authorized", "real_report", "true")] : []));
  if (module.role === "tester" || module.role === "judge") {
    const start = nodes.find(node => node.id === "start")!;
    const variables = start.data.variables as Record<string, unknown>[];
    variables.push({ variable: "reference_files", label: "Ordered approved image references", type: "file-list",
      required: false, max_length: 15, allowed_file_types: ["image"],
      allowed_file_extensions: [".png", ".jpg", ".jpeg", ".webp"], allowed_file_upload_methods: ["local_file"] });
    const finish = nodes.find(node => node.id === "real_report_llm-finish")!;
    (finish.data.outputs as Record<string, unknown>[]).push({ variable: "reference_files", value_type: "array[file]",
      value_selector: ["start", "reference_files"] });
  }
  return graph;
}

const imageDecoder = `import hashlib
import json
import re
import time

def main(authorization_body, status_code):
    if status_code != 200 or not isinstance(authorization_body, str) or len(authorization_body.encode('utf-8')) > 1048576:
        raise ValueError('Booklet authorization transport failed')
    data = json.loads(authorization_body).get('data')
    if not isinstance(data, dict):
        raise ValueError('Booklet authorization envelope is missing')
    result = {'authorized': '', 'authorization_reason': '', 'request_json': '', 'input_fingerprint': ''}
    if data.get('started') is not True:
        reason = data.get('reason')
        if data.get('started') is not False or not isinstance(reason, str) or not reason or len(reason) > 1024:
            raise ValueError('Booklet authorization denial is invalid')
        result['authorization_reason'] = reason
        return result
    if data.get('mode') != 'real' or data.get('role') != 'image' or data.get('taskId') not in ('J08', 'J09', 'J10', 'J13'):
        raise ValueError('Booklet image role differs')
    fingerprint = data.get('inputFingerprint')
    if not isinstance(fingerprint, str) or not re.fullmatch('[0-9a-f]{64}', fingerprint):
        raise ValueError('Booklet image fingerprint is missing')
    request = data.get('requestJson')
    if not isinstance(request, str) or not request or len(request.encode('utf-8')) > 131072 or '\\x00' in request:
        raise ValueError('Booklet image request is missing')
    payload = json.loads(request)
    canonical = lambda value: json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
    if request != canonical(payload) or payload.get('schemaVersion') != 'booklet_real_image_request_v1' or not isinstance(payload.get('requestDigest'), str):
        raise ValueError('Booklet image request differs')
    digest = payload['requestDigest']
    body = {key: value for key, value in payload.items() if key != 'requestDigest'}
    if not re.fullmatch('[0-9a-f]{64}', digest) or hashlib.sha256(canonical(body).encode()).hexdigest() != digest or type(payload.get('deadlineAtMs')) is not int or payload['deadlineAtMs'] <= time.time() * 1000:
        raise ValueError('Booklet image digest or deadline differs')
    result.update(authorized='yes', request_json=request, input_fingerprint=fingerprint)
    return result
`;

/** Real image tool settles evidence and uploads original bytes before End. */
export function createRealImageWorkflowGraph(): ImageGraph {
  const graph = createM4ImageWorkflowGraph();
  const nodes = graph.nodes;
  nodes.push(realIdentity(nodes.find(node => node.id === "m4_image_identity")!, "real_identity"));
  divertAtStart(graph, "real_identity");
  const authorize = structuredClone(nodes.find(node => node.id === "m4_image_authorize")!);
  authorize.id = "real_authorize";
  authorize.data.title = "Claim the prepared Real image once";
  authorize.data.body = { type: "raw-text", data: [{ type: "text", value: "{{#real_identity.identity_json#}}" }] };
  nodes.push(authorize);
  nodes.push(code("real_decode", imageDecoder, { authorization_body: ["real_authorize", "body"],
    status_code: ["real_authorize", "status_code"] }, { authorized: "string", authorization_reason: "string",
    request_json: "string", input_fingerprint: "string" }));
  nodes.push(route("real_authorized", ["real_decode", "authorized"], "yes"));
  nodes.push(end("real_paused", "authorization_reason", ["real_decode", "authorization_reason"]));
  nodes.push({ id: "real_image_tool", type: "custom", position: { x: 1500, y: 600 }, data: {
    type: "tool", title: "Booklet bounded Real image", ...REAL_IMAGE_TOOL, tool_label: "Booklet Real image",
    tool_node_version: "2", tool_configurations: {}, retry_config: noRetry,
    tool_parameters: {
      request_json: { type: "variable", value: ["real_decode", "request_json"] },
      reference_files: { type: "variable", value: ["start", "reference_files"] },
      run_id: { type: "variable", value: ["start", "run_id"] },
      operation_id: { type: "variable", value: ["start", "operation_id"] },
      workflow_run_id: { type: "variable", value: ["sys", "workflow_run_id"] },
      parent_workflow_run_id: { type: "variable", value: ["start", "parent_workflow_run_id"] },
      input_fingerprint: { type: "variable", value: ["real_decode", "input_fingerprint"] },
      booklet_tool_key: { type: "mixed", value: "{{#env.BOOKLET_TOOL_KEY#}}" },
    },
  } });
  nodes.push(code("real_image_result", `import json
import re
from uuid import UUID

def main(tool_json, request_json, run_id, operation_id, workflow_run_id, parent_workflow_run_id, input_fingerprint):
    if not isinstance(tool_json, list) or len(tool_json) != 1 or not isinstance(tool_json[0], dict):
        raise ValueError('Booklet image tool result is missing')
    wrapper = tool_json[0]
    if set(wrapper) != {'result', 'upload'}:
        raise ValueError('Booklet image upload receipt is missing')
    result = wrapper['result']
    upload = wrapper['upload']
    request = json.loads(request_json)
    output = result.get('output') if isinstance(result, dict) else None
    if (not isinstance(result, dict) or result.get('schemaVersion') != 'booklet_real_image_result_v1'
            or result.get('adapterIdentity') != 'm5-openai-image-bounded@1'
            or result.get('status') != 'succeeded' or result.get('requestDigest') != request.get('requestDigest')
            or not isinstance(output, dict) or not isinstance(upload, dict)
            or upload.get('state') != 'succeeded' or upload.get('assetId') != operation_id
            or upload.get('sha256') != output.get('sha256')
            or not isinstance(output.get('sha256'), str) or not re.fullmatch('[0-9a-f]{64}', output['sha256'])
            or type(upload.get('reused')) is not bool):
        raise ValueError('Booklet image evidence is missing')
    for value in (run_id, operation_id, workflow_run_id):
        UUID(value)
    if parent_workflow_run_id:
        UUID(parent_workflow_run_id)
    if not isinstance(input_fingerprint, str) or not re.fullmatch('[0-9a-f]{64}', input_fingerprint):
        raise ValueError('Booklet image fingerprint is missing')
    ack = {'runId': run_id, 'operationId': operation_id, 'workflowRunId': workflow_run_id,
           'parentWorkflowRunId': parent_workflow_run_id or None, 'inputFingerprint': input_fingerprint,
           'assetId': upload['assetId'], 'sha256': output['sha256']}
    return {'image_result': json.dumps(ack, sort_keys=True, separators=(',', ':'), ensure_ascii=False)}
`, { tool_json: ["real_image_tool", "json"], request_json: ["real_decode", "request_json"],
    run_id: ["start", "run_id"], operation_id: ["start", "operation_id"],
    workflow_run_id: ["sys", "workflow_run_id"], parent_workflow_run_id: ["start", "parent_workflow_run_id"],
    input_fingerprint: ["real_decode", "input_fingerprint"] }, { image_result: "string" }));
  nodes.push(end("real_image_finish", "image_result", ["real_image_result", "image_result"]));
  graph.edges.push(edge(nodes, "real_identity", "real_authorize"), edge(nodes, "real_authorize", "real_decode"),
    edge(nodes, "real_decode", "real_authorized"), edge(nodes, "real_authorized", "real_paused", "false"),
    edge(nodes, "real_authorized", "real_image_tool", "true"), edge(nodes, "real_image_tool", "real_image_result"),
    edge(nodes, "real_image_result", "real_image_finish"));
  const finish = nodes.find(node => node.id === "real_image_finish")!;
  (finish.data.outputs as Record<string, unknown>[]).push({ variable: "reference_files", value_type: "array[file]",
    value_selector: ["start", "reference_files"] });
  return graph;
}
