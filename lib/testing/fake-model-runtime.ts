import { managerRouteInputSchema, managerRouteResultSchema, type ManagerRouteInput, type ManagerRouteResult } from "@/lib/contracts/skills";

const preferredSkillByStage: Record<ManagerRouteInput["stage"], ManagerRouteResult["skillId"]> = {
  audience_profile: "intake_readiness@1",
  story_plan: "story_planning_revision@1",
  visual_style: "visual_direction_reference_planning@1",
  visual_bible: "visual_direction_reference_planning@1",
  booklet_specification: "booklet_specification@1",
  page_plan: "page_planning_writing@1",
  final_pages: "image_prompt_compilation@1",
  pdf_export: "quality_review_targeted_repair@1",
};

export class FakeModelRuntime {
  public route(input: ManagerRouteInput): ManagerRouteResult {
    const parsed = managerRouteInputSchema.parse(input);
    const requestedQualityReview = parsed.operation === "story_quality";
    const preferred = preferredSkillByStage[parsed.stage];
    const selected = (requestedQualityReview ? parsed.availableSkills.find((skill) => skill.id === "quality_review_targeted_repair@1") : undefined)
      ?? parsed.availableSkills.find((skill) => skill.id === preferred)
      ?? parsed.availableSkills[0];
    if (!selected) throw new Error("The manager needs at least one registered skill.");
    return managerRouteResultSchema.parse({
      skillId: selected.id,
      arguments: { intent: parsed.intent },
      explanation: `Fake manager selected ${selected.id} for ${parsed.stage}.`,
    });
  }
}
