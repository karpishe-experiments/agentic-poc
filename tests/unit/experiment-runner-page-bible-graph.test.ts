import { describe, expect, it } from "vitest";
import { createSimulationGraph, M3_J12_SIMULATION_MODULES, M3_SIMULATION_MODULES, m3SimulationModuleName } from "@/lib/experiment-runner/workflow-graph";

describe("explicit M3 J12 graph candidates", () => {
  it("selects only the existing manager name and new J12 specialist name", async () => {
    expect(M3_J12_SIMULATION_MODULES.map(m3SimulationModuleName)).toEqual(["issue65_m3_manager", "issue65_m3_J12"]);
    for (const candidate of M3_J12_SIMULATION_MODULES) {
      const graph = await createSimulationGraph(candidate, "m3-j12");
      expect(graph.nodes).toHaveLength(9);
      const source = graph.nodes.find((node) => node.id === "simulate")!.data.code as string;
      expect(source).toContain("M3 J11 extension");
      expect(source).toContain("Local M3 J12 simulation extension");
      expect(source).toContain(`ctx.get("role") != "${candidate.role}"`);
      if (candidate.taskId) expect(source).toContain('ctx.get("taskId") != "J12"');
      expect(graph.nodes.filter((node) => node.data.type === "http-request")).toHaveLength(2);
      expect(graph.nodes.every((node) => node.data.retry_config === undefined ||
        (node.data.retry_config as { retry_enabled: boolean }).retry_enabled === false)).toBe(true);
      const ends = graph.nodes.filter((node) => node.data.type === "end")
        .flatMap((node) => (node.data.outputs as { variable: string }[]).map((item) => item.variable));
      expect(new Set(ends).size).toBe(ends.length);
      expect(JSON.stringify(graph)).not.toContain("apiKey");
    }
    await expect(createSimulationGraph(M3_SIMULATION_MODULES[1], "m3-j12")).rejects.toThrow("Unsupported simulation module");
    await expect(createSimulationGraph(M3_J12_SIMULATION_MODULES[1], "m3")).rejects.toThrow("Unsupported simulation module");
  });
  it("leaves the existing M3 source extension unchanged", async () => {
    const graph = await createSimulationGraph(M3_SIMULATION_MODULES[0], "m3");
    const source = graph.nodes.find((node) => node.id === "simulate")!.data.code as string;
    expect(source).toContain("M3 J11 extension");
    expect(source).not.toContain("Local M3 J12 simulation extension");
  });
});
