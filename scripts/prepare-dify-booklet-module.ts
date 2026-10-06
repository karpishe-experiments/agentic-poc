import { createSimulatedImageGraph, createSimulationGraph, M1_SIMULATION_MODULES, M2_SIMULATION_MODULES, M3_SIMULATION_MODULES, M3_J12_SIMULATION_MODULES, M3_FINAL_SIMULATION_MODULES, m3SimulationModuleName, simulationModuleName } from "@/lib/experiment-runner/workflow-graph";

const IMAGE_PROBE_NAME = "issue65_m2_image_probe";
type Profile = "m1" | "m2" | "m3" | "m3-j12" | "m3-j13";

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log("Usage: tsx scripts/prepare-dify-booklet-module.ts --module <name> [--profile m1|m2|m3|m3-j12|m3-j13] [--graph]\nNames: " + [...new Set([...M2_SIMULATION_MODULES.map(simulationModuleName), ...M3_FINAL_SIMULATION_MODULES.map(m3SimulationModuleName), IMAGE_PROBE_NAME])].join(", "));
} else {
  if (args[0] !== "--module" || !args[1]) throw new Error("Use --help for the exact module preparation arguments.");
  let profile: Profile = "m1";
  let graphOnly = false;
  let hasProfile = false;
  for (let index = 2; index < args.length; index++) {
    if (args[index] === "--graph" && !graphOnly) graphOnly = true;
    else if (args[index] === "--profile" && !hasProfile && ["m1", "m2", "m3", "m3-j12", "m3-j13"].includes(args[index + 1])) {
      profile = args[++index] as Profile; hasProfile = true;
    } else throw new Error("Use --help for the exact module preparation arguments.");
  }
  const finalPages = profile === "m3-j13";
  const m3 = profile === "m3" || profile === "m3-j12" || finalPages;
  const imageProbe = args[1] === IMAGE_PROBE_NAME && (profile === "m2" || finalPages);
  const selectedModule = (finalPages ? M3_FINAL_SIMULATION_MODULES : profile === "m3-j12" ? M3_J12_SIMULATION_MODULES : profile === "m3" ? M3_SIMULATION_MODULES : profile === "m2" ? M2_SIMULATION_MODULES : M1_SIMULATION_MODULES).find((item) => (m3 ? m3SimulationModuleName(item) : simulationModuleName(item)) === args[1]);
  if (!selectedModule && !imageProbe) throw new Error("Unknown simulation module for this profile; use --help.");
  const graph = imageProbe ? createSimulatedImageGraph({ finalPages }) : await createSimulationGraph(selectedModule!, profile);
  const value = graphOnly ? graph : {
    app: { name: imageProbe ? IMAGE_PROBE_NAME : m3 ? m3SimulationModuleName(selectedModule!) : simulationModuleName(selectedModule!), description: `Issue65 ${profile.toUpperCase()} model-free ${imageProbe ? "image transport probe" : "narrative module"}. Private bindings and live acceptance remain separate.`, mode: "workflow", icon: "M", icon_type: "emoji", icon_background: "#E8F4FF", use_icon_as_answer_icon: false },
    dependencies: [], kind: "app", version: "0.7.0",
    workflow: { graph, features: { file_upload: { enabled: false } }, conversation_variables: [], environment_variables: [
      { id: "00000000-0000-4000-8000-000000000065", name: "BOOKLET_ORIGIN", selector: ["env", "BOOKLET_ORIGIN"], value: "https://booklet-staging.uniwares.co.uk", value_type: "string", description: "Reviewed Booklet staging origin." },
      { id: "00000000-0000-4000-8000-000000000066", name: "BOOKLET_TOOL_KEY", selector: ["env", "BOOKLET_TOOL_KEY"], value: "", value_type: "secret", description: "Dedicated runner callback key; bind privately before execution." },
    ] },
  };
  // JSON is valid YAML. No secret value is read or embedded in this candidate DSL.
  console.log(JSON.stringify(value));
}
