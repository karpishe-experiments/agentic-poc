import { describe, expect, it } from "vitest";
import { createSimulationGraph, M1_SIMULATION_MODULES, M2_SIMULATION_MODULES, M3_SIMULATION_MODULES, m3SimulationModuleName, simulationModuleName } from "@/lib/experiment-runner/workflow-graph";

describe("independent M1 simulation graph candidates", () => {
  it("prepares five independent M3 modules while retaining the M1/M2 names and graph code", async () => {
    expect(M3_SIMULATION_MODULES.map(m3SimulationModuleName)).toEqual([
      "issue65_m3_manager", "issue65_m3_playful_kid", "issue65_m3_enthusiast_parent",
      "issue65_m3_professional_creator", "issue65_m3_J11",
    ]);
    const legacy = await createSimulationGraph(M2_SIMULATION_MODULES[0], "m2");
    expect(legacy.nodes.find((node) => node.id === "simulate")!.data.code).not.toContain("M3 J11 extension");
    for (const selectedModule of M3_SIMULATION_MODULES) {
      const graph = await createSimulationGraph(selectedModule, "m3");
      expect(graph.nodes).toHaveLength(9);
      expect(graph.nodes.find((node) => node.id === "simulate")!.data.code).toContain("M3 J11 extension");
      expect(graph.nodes.filter((node) => node.data.type === "http-request")).toHaveLength(2);
      expect(graph.nodes.every((node) => node.data.retry_config === undefined ||
        (node.data.retry_config as { retry_enabled: boolean }).retry_enabled === false)).toBe(true);
      const outputs = graph.nodes.filter((node) => node.data.type === "end")
        .flatMap((node) => (node.data.outputs as { variable: string }[]).map((item) => item.variable));
      expect(new Set(outputs).size).toBe(outputs.length);
      expect(JSON.stringify(graph)).not.toContain("test-key");
    }
    await expect(createSimulationGraph(M2_SIMULATION_MODULES[6], "m3")).rejects.toThrow("Unsupported simulation module");
  });
  it("builds fourteen separate M2 text modules without renaming existing apps", async () => {
    expect(M2_SIMULATION_MODULES).toHaveLength(14);
    expect(M2_SIMULATION_MODULES.slice(0, 6).map(simulationModuleName)).toEqual(M1_SIMULATION_MODULES.map(simulationModuleName));
    expect(new Set(M2_SIMULATION_MODULES.map(simulationModuleName)).size).toBe(14);
    expect(simulationModuleName(M2_SIMULATION_MODULES[11])).toBe("issue65_m2_J08");
    expect(M2_SIMULATION_MODULES.slice(12).map(simulationModuleName)).toEqual(["issue65_m2_J09", "issue65_m2_J10"]);
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
