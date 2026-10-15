import { createSimulatedImageGraph, createSimulationGraph, M2_SIMULATION_MODULES, M3_FINAL_SIMULATION_MODULES,
  m3SimulationModuleName, simulationModuleName, type SimulationModule } from "@/lib/experiment-runner/workflow-graph";

export const M4_WORKFLOW_MODULES: SimulationModule[] = [...M2_SIMULATION_MODULES.filter((module) => module.role === "specialist"), ...M3_FINAL_SIMULATION_MODULES];
export function m4WorkflowModuleName(module: SimulationModule) {
  return module.role === "specialist" && module.taskId && !["J11", "J12"].includes(module.taskId) ? simulationModuleName(module) : m3SimulationModuleName(module);
}

type Graph = Awaited<ReturnType<typeof createSimulationGraph>>;
type Node = Graph["nodes"][number];
const noRetry = { retry_enabled: false, max_retries: 0, retry_interval: 0 };
export const M4_CARRIER_CHUNKS = Array.from({ length: 32 }, (_, i) => `request_${String(i).padStart(2, "0")}`);

function code(id: string, source: string, variables: Record<string, string[]>, outputs: Record<string, "string" | "number">): Node {
  return { id, type: "custom", position: { x: 840, y: 600 }, data: { type: "code", title: id,
    code_language: "python3", code: source, retry_config: noRetry,
    variables: Object.entries(variables).map(([variable, value_selector]) => ({ variable, value_selector })),
    outputs: Object.fromEntries(Object.entries(outputs).map(([key, type]) => [key, { type, children: null }])),
  } };
}
function route(id: string, selector: string[], value: string): Node {
  return { id, type: "custom", position: { x: 1120, y: 600 }, data: { type: "if-else", title: id,
    cases: [{ case_id: "true", logical_operator: "and", conditions: [{ id: `${id}-match`,
      comparison_operator: "is", variable_selector: selector, varType: "string", value }] }],
  } };
}
function end(id: string, variable: string, selector: string[]): Node {
  return { id, type: "custom", position: { x: 1960, y: 600 }, data: { type: "end", title: id,
    outputs: [{ variable, value_type: "string", value_selector: selector }],
  } };
}

/** Candidate graph preparation grants no publication or execution authority. */
export async function createM4WorkflowGraph(module: SimulationModule) {
  // Later modules need the complete M3 report fixture; earlier specialists keep
  // their already-reviewed M2 implementation byte-for-byte.
  const profile = module.role === "specialist" && module.taskId && !["J11", "J12"].includes(module.taskId) ? "m2" : "m3-j13";
  const graph = await createSimulationGraph(module, profile);
  const nodes = graph.nodes;
  const links: string[][] = [["start", "m4_mode"], ["m4_mode", "identity", "true"],
    ["m4_mode", "m4_identity", "false"], ["m4_identity", "m4_authorize"],
    ["m4_authorize", "m4_decode"], ["m4_decode", "m4_authorized"],
    ["m4_authorized", "m4_paused", "false"]];
  nodes.push(route("m4_mode", ["start", "mode"], "simulated"));
  const identity = nodes.find((node) => node.id === "identity")!;
  nodes.push({ ...structuredClone(identity), id: "m4_identity", data: { ...identity.data,
    title: "Validate Balanced identity", code: (identity.data.code as string)
      .replace("mode != 'simulated'", "mode != 'balanced'")
      .replace("This publication supports simulation only", "This branch supports Balanced only"),
  } });
  const authorization = structuredClone(nodes.find((node) => node.id === "authorize")!);
  authorization.id = "m4_authorize";
  authorization.data.title = "Claim the prepared Balanced request once";
  authorization.data.body = { type: "raw-text", data: [{ type: "text", value: "{{#m4_identity.identity_json#}}" }] };
  nodes.push(authorization);
  nodes.push(code("m4_decode", decoder(module), {
    authorization_body: ["m4_authorize", "body"], status_code: ["m4_authorize", "status_code"],
  }, { ...Object.fromEntries(M4_CARRIER_CHUNKS.map((name) => [name, "string" as const])),
    authorized: "string", authorization_reason: "string", report: "string", digest: "string",
    timeout_seconds: "number", deadline_at_ms: "number",
  }));
  nodes.push(route("m4_authorized", ["m4_decode", "authorized"], "yes"));
  nodes.push(end("m4_paused", "authorization_reason", ["m4_decode", "authorization_reason"]));
  const selected = module.role === "tester" ? [false, true] : [module.role === "judge"];
  if (module.role === "tester") {
    nodes.push(route("m4_report", ["m4_decode", "report"], "yes"));
    links.push(["m4_authorized", "m4_report", "true"]);
  }
  for (const report of selected) {
    const id = report ? "m4_report_llm" : "m4_llm";
    const judge = module.role === "judge";
    const specialist = module.role === "specialist";
    nodes.push({ id, type: "custom", position: { x: 1400, y: report ? 900 : 600 }, data: {
      type: "llm", title: `${module.role} ${report ? "report" : "result"}`, retry_config: noRetry,
      model: { provider: "langgenius/openai/openai", name: judge ? "gpt-6-sol" : "gpt-6-luna", mode: "chat",
        completion_params: { enable_stream: false, booklet_bounded_execution: true, booklet_prepared_request: true,
          max_tokens: specialist || report ? 8192 : 2048, reasoning_effort: specialist || judge ? "low" : "none",
          reasoning_mode: "standard", service_tier: "default",
          booklet_request_digest: "{{#m4_decode.digest#}}", booklet_timeout_seconds: "{{#m4_decode.timeout_seconds#}}",
          booklet_deadline_at_ms: "{{#m4_decode.deadline_at_ms#}}",
        } },
      prompt_template: [{ role: "user", edition_type: "basic", text: M4_CARRIER_CHUNKS.map((name) => `{{#m4_decode.${name}#}}`).join("") }],
      context: { enabled: false, variable_selector: [] }, vision: { enabled: false },
      memory: null, prompt_config: { jinja2_variables: [] }, structured_output_enabled: false, reasoning_format: "separated",
    } });
    nodes.push(end(`${id}-finish`, "booklet_provider_result", [id, "text"]));
    links.push(module.role === "tester" ? ["m4_report", id, report ? "true" : "false"] : ["m4_authorized", id, "true"],
      [id, `${id}-finish`]);
  }
  const edges = graph.edges.filter((edge) => !(edge.source === "start" && edge.target === "identity"));
  edges.push(...links.map(([source, target, handle]) => ({ id: `${source}-${target}`, source, target,
    sourceHandle: handle ?? "source", targetHandle: "target", type: "custom",
    data: { sourceType: nodes.find((node) => node.id === source)!.data.type, targetType: nodes.find((node) => node.id === target)!.data.type },
  })));
  return { nodes, edges };
}

function decoder(module: SimulationModule) {
  return `import hashlib
import json
import math
import re
import time

def main(authorization_body, status_code):
    if status_code != 200 or not isinstance(authorization_body, str) or len(authorization_body.encode('utf-8')) > 1048576:
        raise ValueError('Booklet authorization transport failed')
    data = json.loads(authorization_body).get('data')
    if not isinstance(data, dict):
        raise ValueError('Booklet authorization envelope is missing')
    result = {'request_%02d' % index: '' for index in range(32)}
    result.update(authorized='', authorization_reason='', report='', digest='', timeout_seconds=0, deadline_at_ms=0)
    if data.get('started') is not True:
        reason = data.get('reason')
        if data.get('started') is not False or not isinstance(reason, str) or not reason or len(reason) > 1024:
            raise ValueError('Booklet authorization denial is invalid')
        result['authorization_reason'] = reason
        return result
    if data.get('mode') != 'balanced' or data.get('role') != ${JSON.stringify(module.role)} or data.get('taskId') != ${module.taskId ? JSON.stringify(module.taskId) : "None"}:
        raise ValueError('Booklet authorization role differs')
    if not isinstance(data.get('inputFingerprint'), str) or not re.fullmatch('[0-9a-f]{64}', data['inputFingerprint']):
        raise ValueError('Booklet authorization fingerprint is missing')
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
        raise ValueError('Booklet prepared digest is missing')
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or not 0 < seconds <= 120:
        raise ValueError('Booklet remaining timeout is invalid')
    if type(deadline) is not int or not 0 < deadline <= 9007199254740991 or deadline <= time.time() * 1000:
        raise ValueError('Booklet original deadline expired')
    payload = json.loads(request)
    canonical = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
    if request != canonical or hashlib.sha256(request.encode('utf-8')).hexdigest() != digest:
        raise ValueError('Booklet prepared bytes differ')
${module.persona ? `    context = json.loads(payload['input'][1]['content'])
    if context.get('persona') != ${JSON.stringify(module.persona)}:
        raise ValueError('Booklet tester persona differs')
` : ""}    for index in range(32):
        result['request_%02d' % index] = request[index * 65536:(index + 1) * 65536]
    result.update(authorized='yes', report='yes' if report else 'no', digest='sha256:' + digest,
                  timeout_seconds=seconds, deadline_at_ms=deadline)
    return result
`;
}

/** Same synthetic image transport in both modes; never a model/provider node. */
export function createM4ImageWorkflowGraph() {
  const original = createSimulatedImageGraph({ finalPages: true });
  const mapped = new Map(original.nodes.filter((node) => node.id !== "start")
    .map((node) => [node.id, `m4_image_${node.id}`]));
  // Remap graph selectors and template references, not embedded Python source.
  // The source receives only the explicit mode/provider predicate changes below.
  const remap = (value: unknown, key?: string): unknown => {
    if (key === "code") return value;
    if (typeof value === "string") {
      if (mapped.has(value)) return mapped.get(value)!;
      return value.replace(/\{\{#([a-zA-Z0-9_]+)\./g, (match, id: string) => mapped.has(id) ? `{{#${mapped.get(id)}.` : match);
    }
    if (Array.isArray(value)) return value.map((item) => remap(item));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
      .map(([name, item]) => [name, remap(item, name)]));
    return value;
  };
  const balanced = original.nodes.filter((node) => node.id !== "start").map((node) => remap(node) as Node);
  const identity = balanced.find((node) => node.id === "m4_image_identity")!;
  identity.data.code = (identity.data.code as string).replace("mode != 'simulated'", "mode != 'balanced'")
    .replace("This publication supports simulation only", "This branch supports Balanced only");
  const prepare = balanced.find((node) => node.id === "m4_image_prepare")!;
  prepare.data.code = (prepare.data.code as string).replace("data.get('mode') != 'simulated'", "data.get('mode') != 'balanced'")
    .replace("context.get('mode') != 'simulated'", "(context.get('mode') != 'balanced' or context.get('imageProvider') != 'simulated')");
  const gate = route("m4_image_mode", ["start", "mode"], "simulated");
  const nodes = [...original.nodes, gate, ...balanced];
  const edges = [...original.edges.filter((edge) => edge.source !== "start"),
    ...original.edges.filter((edge) => edge.source !== "start").map((edge) => ({ ...edge,
      id: `m4_image_${edge.id}`, source: mapped.get(edge.source)!, target: mapped.get(edge.target)!,
    })),
    ...[["start", gate.id, "source"], [gate.id, "identity", "true"], [gate.id, identity.id, "false"]]
      .map(([source, target, sourceHandle]) => ({ id: `${source}-${target}`, source, target, sourceHandle,
        targetHandle: "target", type: "custom", data: { sourceType: nodes.find((node) => node.id === source)!.data.type,
          targetType: nodes.find((node) => node.id === target)!.data.type } })),
  ];
  return { nodes, edges };
}
