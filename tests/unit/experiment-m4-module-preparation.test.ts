import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { M4_WORKFLOW_MODULES, m4WorkflowModuleName } from "@/lib/experiment-runner/m4-workflow-graph";

describe("M4 preparation CLI inventory", () => {
  it("contains all twelve specialists, three personas, manager and judge with unchanged module names", () => {
    const names = M4_WORKFLOW_MODULES.map(m4WorkflowModuleName);
    expect(names).toHaveLength(17);
    expect(new Set(names).size).toBe(17);
    expect(M4_WORKFLOW_MODULES.filter((item) => item.role === "specialist").map((item) => item.taskId).sort())
      .toEqual(Array.from({ length: 12 }, (_, index) => `J${String(index + 1).padStart(2, "0")}`));
    expect(names).toContain("issue65_m1_J01");
    expect(names).toContain("issue65_m2_J10");
    expect(names).toContain("issue65_m3_J12");
  });

  it.each(["issue65_m1_J01", "issue65_m2_J10", "issue65_m3_J12", "issue65_m3_playful_kid", "issue65_m2_image_probe"])
    ("prepares %s through the actual CLI without publication", (name) => {
      const child = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/prepare-dify-booklet-module.ts",
        "--module", name, "--profile", "m4", "--graph"], { encoding: "utf8", timeout: 15_000, maxBuffer: 8 * 1024 * 1024 });
      expect(child.status, child.stderr).toBe(0);
      const graph = JSON.parse(child.stdout) as { nodes: { data: { type: string } }[] };
      expect(graph.nodes.filter((node) => node.data.type === "llm")).toHaveLength(
        name === "issue65_m2_image_probe" ? 0 : name === "issue65_m3_playful_kid" ? 2 : 1);
    });
});
