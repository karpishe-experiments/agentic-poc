import type {
  BookletFixture,
  BookletStageId,
  BookletStageSnapshot,
  StageArtifact,
} from "./types";

export const STAGES: Array<{ id: BookletStageId; label: string }> = [
  { id: "audience_profile", label: "Audience profile" },
  { id: "story_plan", label: "Story plan" },
  { id: "visual_style", label: "Visual style" },
  { id: "visual_bible", label: "Visual bible" },
  { id: "booklet_specification", label: "Booklet specification" },
  { id: "page_plan", label: "Page plan" },
  { id: "final_pages", label: "Final pages" },
  { id: "pdf_export", label: "PDF export" },
];

const artifact = (
  stageId: BookletStageId,
  premise: string,
  audience: string,
): StageArtifact => {
  const content: Record<BookletStageId, string> = {
    audience_profile: `Audience: ${audience}; gentle tone; one clear lesson.`,
    story_plan: `${premise}\nBeginning: introduce the goal.\nMiddle: overcome one obstacle.\nEnd: resolve through cooperation.`,
    visual_style: "Warm watercolor, simple shapes, clear focal point.",
    visual_bible: `Two protagonists from the premise; consistent colors and clothing.`,
    booklet_specification: "Square format; cover and three story pages.",
    page_plan: "Cover: introduce protagonists; page 1: goal; page 2: obstacle; page 3: resolution.",
    final_pages: "Goal caption; obstacle caption; resolution caption.",
    pdf_export: "Synthetic export summary only; no file was generated.",
  };
  return {
    stageId,
    label: STAGES.find((stage) => stage.id === stageId)!.label,
    content: content[stageId],
    ...(stageId === "visual_bible" || stageId === "final_pages"
      ? { assetPath: "/mockups/specialty-management/sample-image.svg" }
      : {}),
  };
};

function snapshots(
  bookletId: string,
  title: string,
  premise: string,
  audience: string,
  currentStageId: BookletStageId,
): BookletStageSnapshot[] {
  const current = STAGES.findIndex((stage) => stage.id === currentStageId);
  return STAGES.slice(0, current + 1).map((stage, index) => {
    const artifacts = STAGES.slice(0, index).map((item) => artifact(item.id, premise, audience));
    return {
      id: `${bookletId}:${stage.id}`,
      bookletId,
      stageId: stage.id,
      stageLabel: stage.label,
      stageIndex: index,
      premise,
      audience,
      artifacts,
      conversation: [
        ...artifacts.map((item) => ({ role: "assistant" as const, text: `${item.label}: ${item.content}` })),
        { role: "user" as const, text: `Help with ${stage.label} for ${title}.` },
      ],
      taskContext: `Prepare ${stage.label} using the available earlier artifacts.`,
    };
  });
}

export const bookletFixtures = (): BookletFixture[] => [
  {
    id: "demo-forest",
    title: "Forest Friends",
    premise: "A fox and a rabbit learn to share",
    audience: "ages 4–6",
    currentStageId: "story_plan",
    snapshots: snapshots("demo-forest", "Forest Friends", "A fox and a rabbit learn to share", "ages 4–6", "story_plan"),
  },
  {
    id: "demo-moon",
    title: "Moon Picnic",
    premise: "Two siblings prepare a picnic on the Moon",
    audience: "ages 6–8",
    currentStageId: "visual_bible",
    snapshots: snapshots("demo-moon", "Moon Picnic", "Two siblings prepare a picnic on the Moon", "ages 6–8", "visual_bible"),
  },
  {
    id: "demo-garden",
    title: "The Smallest Garden",
    premise: "A child builds a balcony garden",
    audience: "ages 8–10",
    currentStageId: "final_pages",
    snapshots: snapshots("demo-garden", "The Smallest Garden", "A child builds a balcony garden", "ages 8–10", "final_pages"),
  },
];

export function availableStages(booklet: BookletFixture) {
  return booklet.snapshots;
}
