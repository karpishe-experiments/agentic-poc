import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect } from "vitest";
import manifest from "@/lib/experiment-runner/m4-campaign-manifest.json";
import { createM4WorkflowGraph, M4_CARRIER_CHUNKS } from "@/lib/experiment-runner/m4-workflow-graph";
import type { SimulationModule } from "@/lib/experiment-runner/workflow-graph";

type Graph = Awaited<ReturnType<typeof createM4WorkflowGraph>>;
type Published = { role: string; appId: string; publicationId: string; graph: Graph };

// Explicit local rehearsal input: fresh, non-secret publication readbacks. CI
// retains the ordinary fixture; this mode fails if its retained input is absent.
export async function loadPublishedRehearsal() {
  const graphs = JSON.parse(readFileSync("output/issue65-m4-published-rehearsal.json", "utf8")) as Published[];
  expect(graphs.map((graph) => graph.role).sort()).toEqual(["manager", "specialist", "tester"]);
  for (const item of graphs) {
    const selectedModule = { role: item.role, taskId: item.role === "specialist" ? "J01" : null,
      persona: item.role === "tester" ? "playful_kid" : null } as SimulationModule;
    // Never execute Python from a remote graph unless it matches reviewed code.
    expect(item.graph).toEqual(await createM4WorkflowGraph(selectedModule));
    expect(manifest.policy.publications).toContainEqual(expect.objectContaining({
      role: item.role, taskId: selectedModule.taskId, persona: selectedModule.persona,
      appId: item.appId, publishedWorkflowId: item.publicationId,
    }));
  }
  return graphs;
}

export function publishedReturn(graph: Graph, authorizationBody: string, wrapper: string, requestJson: string, report: boolean) {
  const started = performance.now();
  const result = spawnSync("python", ["-c", "import json,sys,socket; socket.socket=lambda *a,**k: (_ for _ in ()).throw(RuntimeError('Network forbidden')); p=json.load(sys.stdin); s={}; exec(p['source'],s); print(json.dumps(s['main'](**p['args'])))"], {
    input: JSON.stringify({ source: graph.nodes.find((node) => node.id === "m4_decode")!.data.code,
      args: { authorization_body: authorizationBody, status_code: 200 } }),
    encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" },
    maxBuffer: 8 * 1024 * 1024, timeout: 10_000,
  });
  if (result.status !== 0) throw new Error(result.stderr || `Python exited ${result.status}`);
  const values = JSON.parse(result.stdout) as Record<string, string>;
  expect(M4_CARRIER_CHUNKS.map((key) => values[key]).join("")).toBe(requestJson);
  let current = "m4_authorized";
  const selected: string[] = [];
  for (let step = 0; step < 10; step++) {
    const node = graph.nodes.find((item) => item.id === current)!;
    if (node.data.type === "llm") selected.push(current);
    if (node.data.type === "end") {
      expect(selected).toEqual([report ? "m4_report_llm" : "m4_llm"]);
      const outputs = node.data.outputs as { variable: string; value_selector: string[] }[];
      expect(outputs).toEqual([{ variable: "booklet_provider_result", value_type: "string", value_selector: [selected[0], "text"] }]);
      // The sole substituted boundary is the model's text output. Resolve the
      // actual published end selector, then let original GET own materialization.
      const variables = { [selected[0]]: { text: wrapper } };
      const output = variables[outputs[0].value_selector[0]]["text"];
      expect(output.length).toBeGreaterThan(0);
      return { output, decodeReturnMs: performance.now() - started };
    }
    let handle = "source";
    if (node.data.type === "if-else") {
      const cases = node.data.cases as { conditions: { variable_selector: string[]; value: string }[] }[];
      handle = cases[0].conditions.every((condition) => values[condition.variable_selector[1]] === condition.value) ? "true" : "false";
    }
    const edge = graph.edges.find((item) => item.source === current && item.sourceHandle === handle);
    if (!edge) throw new Error("Missing published graph transition");
    current = edge.target;
  }
  throw new Error("Published graph did not terminate");
}
