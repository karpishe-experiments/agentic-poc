import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createM4ImageWorkflowGraph } from "@/lib/experiment-runner/m4-workflow-graph";
import { createSimulatedImageGraph } from "@/lib/experiment-runner/workflow-graph";

function execute(nodeId: string, args: Record<string, unknown>) {
  const source = createM4ImageWorkflowGraph().nodes.find((node) => node.id === nodeId)!.data.code;
  const run = spawnSync("python", ["-c", "import json,sys; p=json.load(sys.stdin); s={}; exec(p['source'],s); print(json.dumps(s['main'](**p['args'])))"], {
    input: JSON.stringify({ source, args }), encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" },
  });
  if (run.status !== 0) throw new Error(run.stderr);
  return JSON.parse(run.stdout);
}
const identity = { run_id: "00000000-0000-4000-8000-000000000001", operation_id: "00000000-0000-4000-8000-000000000002",
  workflow_run_id: "00000000-0000-4000-8000-000000000003", parent_workflow_run_id: "00000000-0000-4000-8000-000000000004" };
describe("offline Balanced synthetic image workflow", () => {
  it("preserves the final-page Simulated graph and ordered references with no model nodes", () => {
    const graph = createM4ImageWorkflowGraph(), original = createSimulatedImageGraph({ finalPages: true });
    expect(graph.nodes.filter((node) => !node.id.startsWith("m4_"))).toEqual(original.nodes);
    expect(graph.edges.filter((edge) => !edge.source.startsWith("m4_") && !edge.target.startsWith("m4_")))
      .toEqual(original.edges.filter((edge) => edge.source !== "start"));
    expect(graph.nodes.some((node) => ["llm", "agent", "tool", "parameter-extractor"].includes(String(node.data.type)))).toBe(false);
    expect(graph.nodes.find((node) => node.id === "m4_image_authorize")!.data.body).toEqual({ type: "raw-text", data: [{ type: "text", value: "{{#m4_image_identity.identity_json#}}" }] });
    expect(graph.nodes.find((node) => node.id === "m4_image_finish")!.data.outputs).toContainEqual({ variable: "reference_files", value_type: "array[file]", value_selector: ["start", "reference_files"] });
    expect(graph.nodes.filter((node) => node.data.type === "http-request").every((node) =>
      (node.data.retry_config as { retry_enabled: boolean }).retry_enabled === false)).toBe(true);
  });
  it("requires Balanced authorization with explicit synthetic provider and rejects Real", () => {
    expect(execute("m4_image_identity", { ...identity, mode: "balanced" }).identity_json).toContain(identity.run_id);
    expect(() => execute("m4_image_identity", { ...identity, mode: "real" })).toThrow("Balanced only");
    const data = { started: true, mode: "balanced", role: "image", inputFingerprint: "a".repeat(64), context: {
      role: "image", mode: "balanced", imageProvider: "simulated", inputFingerprint: "a".repeat(64), imageRequest: { prompt: "synthetic", sourceVersionIds: [] },
    } };
    const args = { ...identity, authorization_body: JSON.stringify({ data }), status_code: 200, booklet_origin: "https://booklet.example" };
    expect(execute("m4_image_prepare", args).fixture_url).toContain("/image-fixture?");
    expect(execute("m4_image_prepare", { ...args, authorization_body: JSON.stringify({ data: { started: false, reason: "paused" } }) })).toMatchObject({ fixture_url: "", authorization_reason: "paused" });
    for (const imageProvider of [undefined, "real"]) {
      expect(() => execute("m4_image_prepare", { ...args, authorization_body: JSON.stringify({ data: { ...data, context: { ...data.context, imageProvider } } }) })).toThrow("inconsistent");
    }
  });
});
