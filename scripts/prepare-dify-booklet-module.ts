import { createSimulationGraph, M1_SIMULATION_MODULES, M2_SIMULATION_MODULES, simulationModuleName } from "@/lib/experiment-runner/workflow-graph";

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log("Usage: tsx scripts/prepare-dify-booklet-module.ts --module <name> [--profile m1|m2] [--graph]\nNames: " + M2_SIMULATION_MODULES.map(simulationModuleName).join(", "));
} else {
  if (args[0] !== "--module" || !args[1]) throw new Error("Use --help for the exact module preparation arguments.");
  let profile: "m1" | "m2" = "m1";
  let graphOnly = false;
  let hasProfile = false;
  for (let index = 2; index < args.length; index++) {
    if (args[index] === "--graph" && !graphOnly) graphOnly = true;
    else if (args[index] === "--profile" && !hasProfile && ["m1", "m2"].includes(args[index + 1])) {
      profile = args[++index] as "m1" | "m2"; hasProfile = true;
    } else throw new Error("Use --help for the exact module preparation arguments.");
  }
  const selectedModule = (profile === "m2" ? M2_SIMULATION_MODULES : M1_SIMULATION_MODULES).find((item) => simulationModuleName(item) === args[1]);
  if (!selectedModule) throw new Error("Unknown simulation module for this profile; use --help.");
  const graph = await createSimulationGraph(selectedModule, profile);
  const value = graphOnly ? graph : {
    app: { name: simulationModuleName(selectedModule), description: `Issue65 ${profile.toUpperCase()} model-free narrative module. Private bindings and live acceptance remain separate.`, mode: "workflow", icon: "M", icon_type: "emoji", icon_background: "#E8F4FF", use_icon_as_answer_icon: false },
    dependencies: [], kind: "app", version: "0.7.0",
    workflow: { graph, features: { file_upload: { enabled: false } }, conversation_variables: [], environment_variables: [
      { id: "00000000-0000-4000-8000-000000000065", name: "BOOKLET_ORIGIN", selector: ["env", "BOOKLET_ORIGIN"], value: "https://booklet-staging.uniwares.co.uk", value_type: "string", description: "Reviewed Booklet staging origin." },
      { id: "00000000-0000-4000-8000-000000000066", name: "BOOKLET_TOOL_KEY", selector: ["env", "BOOKLET_TOOL_KEY"], value: "", value_type: "secret", description: "Dedicated runner callback key; bind privately before execution." },
    ] },
  };
  // JSON is valid YAML. No secret value is read or embedded in this candidate DSL.
  console.log(JSON.stringify(value));
}
