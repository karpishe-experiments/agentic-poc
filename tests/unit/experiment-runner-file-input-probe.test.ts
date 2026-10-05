import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const probePath = resolve("docs/accepted/2026-09-27_dify-booklet-runner/dify/m3-file-input-probe.json");

describe("M3 file-input probe candidate", () => {
  it("has no provider, callback, plugin or credential dependency", async () => {
    const probe = JSON.parse(await readFile(probePath, "utf8"));
    expect(probe.app.name).toBe("issue65_m3_file_input_probe");
    expect(probe.app.mode).toBe("workflow");
    expect(probe.dependencies).toEqual([]);
    expect(probe.workflow.environment_variables).toEqual([]);
    expect(probe.workflow.graph.nodes.map((node: { data: { type: string } }) => node.data.type)).toEqual(["start", "end"]);
    expect(probe.workflow.graph.edges).toHaveLength(1);
  });

  it("passes the ordered image list directly to output with a bounded input", async () => {
    const probe = JSON.parse(await readFile(probePath, "utf8"));
    const [start, finish] = probe.workflow.graph.nodes;
    expect(start.data.variables.find((variable: { variable: string }) => variable.variable === "reference_files")).toEqual({
      variable: "reference_files", label: "Ordered synthetic images", type: "file-list",
      required: true, max_length: 15, allowed_file_types: ["image"],
      allowed_file_extensions: [".png"], allowed_file_upload_methods: ["local_file"],
    });
    expect(finish.data.outputs).toContainEqual({ variable: "reference_files", value_type: "array[file]", value_selector: ["start", "reference_files"] });
    expect(finish.data.outputs).toContainEqual({ variable: "correlation_id", value_type: "string", value_selector: ["start", "correlation_id"] });
  });
});
