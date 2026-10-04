import { describe, expect, it } from "vitest";
import { createSimulationGraph, M1_SIMULATION_MODULES, M2_SIMULATION_MODULES, simulationModuleName } from "@/lib/experiment-runner/workflow-graph";

describe("independent M1 simulation graph candidates", () => {
  it("builds eleven separate M2 modules without renaming existing apps", async () => {
    expect(M2_SIMULATION_MODULES).toHaveLength(11);
    expect(M2_SIMULATION_MODULES.slice(0, 6).map(simulationModuleName)).toEqual(M1_SIMULATION_MODULES.map(simulationModuleName));
    expect(new Set(M2_SIMULATION_MODULES.map(simulationModuleName)).size).toBe(11);
    for (const selectedModule of M2_SIMULATION_MODULES) {
      const graph = await createSimulationGraph(selectedModule, "m2");
      expect(graph.nodes.filter((node) => node.data.type === "http-request")).toHaveLength(2);
      expect(graph.nodes.every((node) => ["start", "code", "http-request", "if-else", "end"].includes(node.data.type as string))).toBe(true);
      expect(graph.nodes.find((node) => node.id === "simulate")!.data.code).toContain(`ctx.get("role") != "${selectedModule.role}"`);
      expect(graph.nodes.find((node) => node.id === "identity")!.data.code).toContain("mode != 'simulated'");
      expect(graph.nodes.find((node) => node.id === "ack")!.data.code).toContain("data.get('state') != 'succeeded'");
    }
    await expect(createSimulationGraph(M2_SIMULATION_MODULES[6], "m1")).rejects.toThrow("Unsupported simulation module");
  });
  it("builds six focused modules with no provider/plugin/tool execution", async () => {
    expect(new Set(M1_SIMULATION_MODULES.map(simulationModuleName)).size).toBe(6);
    for (const selectedModule of M1_SIMULATION_MODULES) {
      const graph = await createSimulationGraph(selectedModule);
      expect(graph.nodes.every((node) => ["start", "code", "http-request", "if-else", "end"].includes(node.data.type as string))).toBe(true);
      const requests = graph.nodes.filter((node) => node.data.type === "http-request");
      expect(requests).toHaveLength(2);
      // Dify reads raw-text items from `value`; `text` silently sends an empty body.
      for (const [id, selector] of [["authorize", "identity.identity_json"], ["save", "simulate.booklet_result"]]) {
        expect(requests.find((node) => node.id === id)!.data.body).toEqual({
          type: "raw-text", data: [{ type: "text", value: `{{#${selector}#}}` }],
        });
      }
      expect(requests.every((node) => (node.data.retry_config as { retry_enabled: boolean }).retry_enabled === false)).toBe(true);
      expect(JSON.stringify(graph)).not.toContain("apiKey");
      expect(graph.nodes.find((node) => node.id === "identity")!.data.code).toContain("mode != 'simulated'");
      expect(graph.edges.find((edge) => edge.source === "authorized" && edge.target === "paused")!.sourceHandle).toBe("false");
      expect(graph.nodes.find((node) => node.id === "ack")!.data.code).toContain("data.get('state') != 'succeeded'");
      expect(graph.nodes.find((node) => node.id === "simulate")!.data.code).toContain(`ctx.get("role") != "${selectedModule.role}"`);
    }
  });
});
