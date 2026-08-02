import { describe, expect, it } from "vitest";
import { createManagerAgent } from "@/lib/agents/manager";
import { createSpecialistAgent } from "@/lib/agents/specialist";
import { createDefaultSkillRegistry } from "@/lib/skills/default-registry";
import { assessIntake } from "@/lib/skills/intake-readiness";
import { FakeModelRuntime } from "@/lib/testing/fake-model-runtime";

const context = {
  bookletId: "00000000-0000-4000-8000-000000000501",
  stage: "audience_profile" as const,
  operation: "intake",
  intent: "A robin learns to share water.",
  knownFacts: ["A robin learns to share water."],
  recentMessages: ["A robin learns to share water."],
  approvedArtifactVersionIds: [],
  traceId: "00000000-0000-4000-8000-000000000502",
};

describe("manager and fake model runtime", () => {
  it("exposes only allowed strict specialist tools and routes to exactly one", () => {
    const registry = createDefaultSkillRegistry();
    const manager = createManagerAgent(registry, "audience_profile");
    const route = new FakeModelRuntime().route({
      stage: "audience_profile",
      operation: "intake",
      intent: context.intent,
      availableSkills: registry.getAllowed("audience_profile").map((skill) => ({ id: skill.id, description: skill.description })),
    });

    expect(manager.toolUseBehavior).toBe("stop_on_first_tool");
    expect(manager.tools).toHaveLength(1);
    expect(route.skillId).toBe("intake_readiness@1");
  });

  it("asks one age decision only when that fact is missing", async () => {
    const missing = await assessIntake({ cardId: "00000000-0000-4000-8000-000000000503" }, context);
    const complete = await assessIntake({ cardId: "00000000-0000-4000-8000-000000000504" }, { ...context, knownFacts: [...context.knownFacts, "Audience is ages 6-8."] });

    expect(missing).toMatchObject({ ready: false, highestValueGap: "reading age", questionCard: { family: "question" } });
    expect(complete).toMatchObject({ ready: true, questionCard: null });
  });

  it("keeps a real specialist model call bounded to its one application-owned skill tool", () => {
    const registry = createDefaultSkillRegistry();
    const specialist = createSpecialistAgent(
      registry.get("intake_readiness@1"),
      { cardId: "00000000-0000-4000-8000-000000000505" },
      context,
    );

    expect(specialist.toolUseBehavior).toBe("stop_on_first_tool");
    expect(specialist.tools).toHaveLength(1);
    expect(specialist.modelSettings.toolChoice).toBe("required");
    expect(specialist.modelSettings.parallelToolCalls).toBe(false);
  });
});
