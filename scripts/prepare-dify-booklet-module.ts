import { createSimulationGraph, M1_SIMULATION_MODULES, simulationModuleName } from "@/lib/experiment-runner/workflow-graph";

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log("Usage: tsx scripts/prepare-dify-booklet-module.ts --module <name> [--graph]\nNames: " + M1_SIMULATION_MODULES.map(simulationModuleName).join(", "));
} else {
  if ((args.length !== 2 && args.length !== 3) || args[0] !== "--module" || (args.length === 3 && args[2] !== "--graph")) throw new Error("Use --help for the exact module preparation arguments.");
  const selectedModule = M1_SIMULATION_MODULES.find((item) => simulationModuleName(item) === args[1]);
  if (!selectedModule) throw new Error("Unknown M1 simulation module; use --help.");
  const graph = await createSimulationGraph(selectedModule);
  const value = args[2] === "--graph" ? graph : {
    app: { name: simulationModuleName(selectedModule), description: "Issue65 M1 model-free narrative module. Private bindings and live acceptance remain separate.", mode: "workflow", icon: "M", icon_type: "emoji", icon_background: "#E8F4FF", use_icon_as_answer_icon: false },
    dependencies: [], kind: "app", version: "0.7.0",
    workflow: { graph, features: { file_upload: { enabled: false } }, conversation_variables: [], environment_variables: [
      { id: "00000000-0000-4000-8000-000000000065", name: "BOOKLET_ORIGIN", selector: ["env", "BOOKLET_ORIGIN"], value: "https://booklet-staging.uniwares.co.uk", value_type: "string", description: "Reviewed Booklet staging origin." },
      { id: "00000000-0000-4000-8000-000000000066", name: "BOOKLET_TOOL_KEY", selector: ["env", "BOOKLET_TOOL_KEY"], value: "", value_type: "secret", description: "Dedicated runner callback key; bind privately before execution." },
    ] },
  };
  // JSON is valid YAML. No secret value is read or embedded in this candidate DSL.
  console.log(JSON.stringify(value));
}
