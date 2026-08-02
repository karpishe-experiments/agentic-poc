import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createDefaultSkillRegistry } from "@/lib/skills/default-registry";
import { assessIntake } from "@/lib/skills/intake-readiness";
import { planOrReviseStory } from "@/lib/skills/story-planning-revision";
import { reviewAndRepairStory } from "@/lib/skills/quality-review-repair";
import { FakeModelRuntime } from "@/lib/testing/fake-model-runtime";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import type { SkillContext } from "@/lib/contracts/skills";

const fixtureSchema = z.object({
  id: z.string(),
  stage: z.enum(["audience_profile", "story_plan", "visual_style", "visual_bible", "booklet_specification", "page_plan", "final_pages", "pdf_export"]),
  operation: z.string(),
  intent: z.string(),
  knownFacts: z.array(z.string()),
  recentMessages: z.array(z.string()),
  approvedArtifactVersionIds: z.array(z.string().uuid()),
  availableSkillIds: z.array(z.string()),
  expectedSelectedSkill: z.string().nullable(),
  maximumCalls: z.object({ manager: z.number().int().nonnegative(), specialist: z.number().int().nonnegative(), repair: z.number().int().nonnegative() }),
});

const sampleStory = {
  schemaVersion: SCHEMA_VERSION,
  premise: "A robin learns to share water.",
  theme: "Care",
  characters: [{ entityId: "00000000-0000-4000-8000-000000000811", name: "Robin", narrativeRole: "hero", goal: "Share water", relationships: [], named: true, continuityRelevant: true, recurringVisualSubject: true }],
  settings: [{ entityId: "00000000-0000-4000-8000-000000000812", name: "Garden", narrativeRole: "main setting", named: true, continuityRelevant: true, recurringVisualSubject: true }],
  storyArc: "Robin finds water and learns to share it.",
  keyEvents: ["Robin finds water."],
  ending: "The garden friends share together.",
  ageFitNotes: "Suitable for ages 6–8.",
  continuityConstraints: ["Keep Robin red and the garden calm."],
};

const directory = path.join(process.cwd(), "tests", "agent", "fixtures");
const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
if (files.length !== 12) throw new Error(`Expected exactly 12 initial agent fixtures; found ${files.length}.`);

for (const file of files) {
  const fixture = fixtureSchema.parse(JSON.parse(await readFile(path.join(directory, file), "utf8")));
  const registry = createDefaultSkillRegistry();
  const allowed = registry.getAllowed(fixture.stage);
  const allowedIds = allowed.map((skill) => skill.id);
  if (JSON.stringify(allowedIds) !== JSON.stringify(fixture.availableSkillIds)) throw new Error(`${fixture.id}: available skills differ from the registered stage contract.`);
  if (!fixture.expectedSelectedSkill) {
    if (allowed.length !== 0 || fixture.maximumCalls.manager !== 0) throw new Error(`${fixture.id}: illegal stage must expose no manager route.`);
    continue;
  }
  const context: SkillContext = { ...fixture, approvedArtifactVersionIds: fixture.approvedArtifactVersionIds, traceId: "00000000-0000-4000-8000-000000000899", bookletId: "00000000-0000-4000-8000-000000000898" };
  const route = new FakeModelRuntime().route({ stage: fixture.stage, operation: fixture.operation, intent: fixture.intent, availableSkills: allowed.map((skill) => ({ id: skill.id, description: skill.description })) });
  if (route.skillId !== fixture.expectedSelectedSkill || fixture.maximumCalls.manager !== 1 || fixture.maximumCalls.specialist !== 1) throw new Error(`${fixture.id}: manager did not select exactly one expected specialist.`);
  if (fixture.id === "reject-story-skill-during-visual-stage" && route.skillId === "story_planning_revision@1") throw new Error("The Story Plan skill must not be available in the visual stage.");

  if (route.skillId === "intake_readiness@1") {
    const assessment = await assessIntake({ cardId: "00000000-0000-4000-8000-000000000897" }, context);
    if (fixture.id === "choose-question-card-variant" && assessment.questionCard?.variant !== "single_select") throw new Error("Question fixture did not produce the expected card variant.");
    if (["infer-age-and-interest-from-idea", "avoid-repeated-intake-question", "stop-intake-when-ready"].includes(fixture.id) && (!assessment.ready || assessment.questionCard)) throw new Error(`${fixture.id}: intake should not repeat a known age question.`);
  }
  if (route.skillId === "story_planning_revision@1") {
    const result = await planOrReviseStory({ intent: fixture.intent, currentStory: fixture.id === "preserve-approved-story-constraints" ? sampleStory : null }, context);
    if (fixture.id === "preserve-approved-story-constraints" && (result.storyPlan.characters[0]?.entityId !== sampleStory.characters[0]?.entityId || !result.storyPlan.storyArc.includes(fixture.intent))) throw new Error("Story revision did not preserve approved constraints.");
  }
  if (route.skillId === "quality_review_targeted_repair@1") {
    const needsRepair = fixture.id === "repair-invalid-structured-output-once" ? { ...sampleStory, characters: [], settings: [], continuityConstraints: [] } : sampleStory;
    const result = await reviewAndRepairStory({ intent: fixture.intent, storyPlan: needsRepair }, context);
    if (fixture.id === "repair-invalid-structured-output-once" && (!result.repairedStory || result.review.status !== "repair_needed")) throw new Error("Repair fixture did not return one valid targeted repair.");
    if (fixture.id === "fail-after-second-invalid-output" && !result.forceValidationFailure) throw new Error("Validation failure fixture did not force deterministic recovery.");
    if (fixture.id === "quality-repair-is-targeted" && result.review.status !== "passed") throw new Error("Targeted quality fixture changed an unrelated valid Story Plan.");
  }
  console.log(`passed ${fixture.id}`);
}
