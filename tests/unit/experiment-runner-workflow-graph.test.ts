import { describe, expect, it } from "vitest";
import { createSimulationGraph, M1_SIMULATION_MODULES, simulationModuleName } from "@/lib/experiment-runner/workflow-graph";

describe("independent M1 simulation graph candidates", () => {
  it("builds six focused modules with no provider/plugin/tool execution", async () => {
    expect(new Set(M1_SIMULATION_MODULES.map(simulationModuleName)).size).toBe(6);
    for (const selectedModule of M1_SIMULATION_MODULES) {
      const graph = await createSimulationGraph(selectedModule);
      expect(graph.nodes.every((node) => ["start", "code", "http-request", "if-else", "end"].includes(node.data.type as string))).toBe(true);
      const requests = graph.nodes.filter((node) => node.data.type === "http-request");
      expect(requests).toHaveLength(2);
      expect(requests.every((node) => (node.data.retry_config as { retry_enabled: boolean }).retry_enabled === false)).toBe(true);
      expect(JSON.stringify(graph)).not.toContain("apiKey");
      expect(graph.nodes.find((node) => node.id === "identity")!.data.code).toContain("mode != 'simulated'");
      expect(graph.edges.find((edge) => edge.source === "authorized" && edge.target === "paused")!.sourceHandle).toBe("false");
      expect(graph.nodes.find((node) => node.id === "ack")!.data.code).toContain("data.get('state') != 'succeeded'");
      const endOutputs = graph.nodes.filter((node) => node.data.type === "end")
        .flatMap((node) => node.data.outputs as { variable: string; value_selector: string[] }[]);
      expect(new Set(endOutputs.map((item) => item.variable)).size).toBe(endOutputs.length);
      expect(graph.nodes.find((node) => node.id === "finish")!.data.outputs).toEqual([
        { variable: "booklet_result", value_type: "string", value_selector: ["ack", "booklet_result"] },
      ]);
      expect(graph.nodes.find((node) => node.id === "paused")!.data.outputs).toEqual([
        { variable: "authorization_reason", value_type: "string", value_selector: ["simulate", "authorization_reason"] },
      ]);
      expect(graph.nodes.find((node) => node.id === "simulate")!.data.code).toContain(`ctx.get("role") != "${selectedModule.role}"`);
    }
  });
});
