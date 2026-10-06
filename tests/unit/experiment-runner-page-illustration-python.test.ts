import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createSimulationGraph, M3_SIMULATION_MODULES } from "@/lib/experiment-runner/workflow-graph";
import { simulatedExperimentReport } from "@/lib/experiment-runner/report-fixtures";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("model-free Dify final-page manager candidate", () => {
  it.each(["tester", "judge"] as const)("executes the separate %s report branch with TypeScript parity", async (role) => {
    const selectedModule = { role, taskId: null, persona: role === "tester" ? "playful_kid" as const : null };
    const graph = await createSimulationGraph(selectedModule, "m3-j13");
    const source = graph.nodes.find((node) => node.id === "simulate")!.data.code;
    const evidence = { role, mode: "simulated", runId: id(1), configurationHash: "a".repeat(64), versionIds: [id(6)], warningCount: 2 };
    const args = { authorization_body: JSON.stringify({ data: { started: true, mode: "simulated", inputFingerprint: "a".repeat(64),
      context: { role, persona: selectedModule.persona, reportEvidence: evidence } } }),
      run_id: id(1), operation_id: id(2), workflow_run_id: id(3), parent_workflow_run_id: "" };
    const program = "import json,sys; data=json.load(sys.stdin); scope={}; exec(data['source'],scope); print(json.dumps(scope['main'](**data['args'])))";
    const result = spawnSync("python", ["-c", program], { input: JSON.stringify({ source, args }), encoding: "utf8",
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" } });
    expect(result.stderr).toBe(""); expect(result.status).toBe(0);
    expect(JSON.parse(JSON.parse(result.stdout).booklet_result).result).toEqual({
      kind: role === "tester" ? "feedback" : "assessment", payload: simulatedExperimentReport(evidence) });
    const reportRoute = graph.nodes.find((node) => node.id === "report-kind")!.data.code;
    for (const [kind, expected] of [["feedback", "feedback"], ["assessment", "assessment"], ["decision", ""], ["proposal", ""]]) {
      const routed = spawnSync("python", ["-c", program], { input: JSON.stringify({ source: reportRoute,
        args: { booklet_result: JSON.stringify({ result: { kind, payload: {} } }) } }), encoding: "utf8",
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" } });
      expect(routed.status, routed.stderr).toBe(0);
      expect(JSON.parse(routed.stdout)).toEqual({ report_kind: expected });
    }
    expect(graph.edges.find((edge) => edge.source === "report-route" && edge.sourceHandle === "true")?.target).toBe("finish");
    expect(graph.edges.find((edge) => edge.source === "report-route" && edge.sourceHandle === "false")?.target).toBe("save");
    expect(graph.edges.find((edge) => edge.source === "save")?.target).toBe("ack");
    expect(graph.edges.find((edge) => edge.source === "ack")?.target).toBe("finish");
    expect(graph.nodes.find((node) => node.id === "finish")!.data.outputs).toEqual([
      { variable: "booklet_result", value_type: "string", value_selector: ["simulate", "booklet_result"] },
    ]);
  });
  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("preserves %s final-page review preference", async (persona) => {
    const selectedModule = M3_SIMULATION_MODULES.find((item) => item.persona === persona)!;
    const graph = await createSimulationGraph(selectedModule, "m3-j13");
    const source = graph.nodes.find((node) => node.id === "simulate")!.data.code;
    const context = { role: "tester", persona, bookletId: id(5), pendingDecision: null, creatorMessages: [{ id: id(9) }],
      activeDelegation: { taskIds: ["J13"] }, currentArtifacts: [{ taskId: "J13", subjectKind: "page", subjectId: id(4),
        state: "draft", currentVersionId: id(6), versions: [{ id: id(6), dependencyVersionIds: [], content: {} }] }] };
    const args = { authorization_body: JSON.stringify({ data: { started: true, mode: "simulated", inputFingerprint: "a".repeat(64), context } }),
      run_id: id(1), operation_id: id(2), workflow_run_id: id(3), parent_workflow_run_id: "" };
    const program = "import json,sys; data=json.load(sys.stdin); scope={}; exec(data['source'],scope); print(json.dumps(scope['main'](**data['args'])))";
    const result = spawnSync("python", ["-c", program], { input: JSON.stringify({ source, args }), encoding: "utf8",
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" } });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(JSON.parse(result.stdout).booklet_result).result.payload.decision).toEqual(persona === "professional_creator" ?
      { action: "approve", versionIds: [id(6)] } : { action: "delegate", taskIds: ["J13"], subjectId: id(5) });
  });
  it("executes Python routing for the exact selected page and preserves older graphs", async () => {
    const selectedModule = M3_SIMULATION_MODULES[0];
    const graph = await createSimulationGraph(selectedModule, "m3-j13");
    const source = graph.nodes.find((node) => node.id === "simulate")!.data.code;
    const args = { authorization_body: JSON.stringify({ data: { started: true, mode: "simulated", inputFingerprint: "a".repeat(64),
      context: { role: "manager", eligibleRoute: "J13", eligibleTarget: { kind: "image", taskId: "J13", subjectKind: "page", subjectId: id(4) } } } }),
      run_id: id(1), operation_id: id(2), workflow_run_id: id(3), parent_workflow_run_id: "" };
    const program = "import json,sys; data=json.load(sys.stdin); scope={}; exec(data['source'],scope); print(json.dumps(scope['main'](**data['args'])))";
    const result = spawnSync("python", ["-c", program], { input: JSON.stringify({ source, args }), encoding: "utf8",
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" } });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(JSON.parse(result.stdout).booklet_result).result).toEqual({ kind: "delegate",
      payload: { taskId: "J13", subjectKind: "page", subjectId: id(4) } });
    const old = await createSimulationGraph(selectedModule, "m3-j12");
    expect(old.nodes.find((node) => node.id === "simulate")!.data.code).not.toContain("M3_PAGE_BIBLE_FIXTURE");
    expect(graph.nodes.every((node) => ["start", "code", "http-request", "if-else", "end"].includes(String(node.data.type)))).toBe(true);
  });
});
