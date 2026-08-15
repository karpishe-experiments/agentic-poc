import { OpenAIManagerRuntime } from "@/lib/agents/openai-manager-runtime";
import { createDefaultSkillRegistry } from "@/lib/skills/default-registry";

if (process.env.ALLOW_REAL_AGENT_SMOKE !== "true") {
  throw new Error("Set ALLOW_REAL_AGENT_SMOKE=true to run this paid, networked smoke check.");
}
process.env.MODEL_RUNTIME = "real";

const registry = createDefaultSkillRegistry();
const allowed = registry.getAllowed("audience_profile");
const route = await new OpenAIManagerRuntime(registry).route({
  stage: "audience_profile",
  operation: "guided_intake",
  intent: "A robin learns to share water.",
  availableSkills: allowed.map((skill) => ({ id: skill.id, description: skill.description })),
});
console.log(JSON.stringify({ selectedSkill: route.skillId }, null, 2));
