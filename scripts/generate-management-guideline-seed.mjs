import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const commit = "631f547ec3f7ce375f740dd6f2b1b9aaebbde940";
const sourceDirectory =
  "docs/accepted/2026-08-22_guideline-driven-booklet-workflow-v2/task-guidelines";
const outputDirectory = new URL(
  "../lib/mockups/specialty-management/",
  import.meta.url,
);
const readSource = (file) =>
  execFileSync("git", ["show", `${commit}:${sourceDirectory}/${file}`], {
    encoding: "utf8",
  }).replace(/\r\n/g, "\n");
const checksum = (text) =>
  createHash("sha256").update(text).digest("hex");

const definitions = [
  {
    prefix: "00",
    file: "00-booklet-workflow-orchestration.md",
    taskId: null,
    specialtyId: "sp-orchestrator",
    specialty: "Orchestrator",
    agentId: "agent-guide",
    agentTitle: "Booklet Guide",
    outputType: "text",
    description: "Routes eligible booklet tasks without changing application-owned state.",
    agentDescription: "Reviews the artifact graph and selects one eligible specialty.",
    dependsOn: [],
  },
  {
    prefix: "01",
    file: "01-book-concept-brief.md",
    taskId: "book_concept_brief",
    specialtyId: "sp-book-concept",
    specialty: "Book Concept Brief",
    agentId: "agent-book-concept",
    agentTitle: "Concept Brief Writer",
    outputType: "text",
    description: "Shapes the concise creative foundation for a booklet.",
    agentDescription: "Turns an initial idea and target age into an approval-ready concept brief.",
    dependsOn: [],
  },
  {
    prefix: "02",
    file: "02-story-outline.md",
    taskId: "story_outline",
    specialtyId: "sp-story",
    specialty: "Story Outline",
    agentId: "agent-playful",
    agentTitle: "Playful Writer",
    outputType: "text",
    description: "Builds a short causal story skeleton from an approved concept.",
    agentDescription: "Creates concise, age-appropriate story outlines with clear agency.",
    dependsOn: ["book_concept_brief"],
  },
  {
    prefix: "03",
    file: "03-draft-character-list.md",
    taskId: "draft_character_list",
    specialtyId: "sp-draft-character",
    specialty: "Draft Character List",
    agentId: "agent-draft-character",
    agentTitle: "Draft Cast Planner",
    outputType: "text",
    description: "Records the working cast needed before manuscript drafting.",
    agentDescription: "Separates known cast facts from questions without locking visual design.",
    dependsOn: ["book_concept_brief", "story_outline"],
  },
  {
    prefix: "04",
    file: "04-draft-location-list.md",
    taskId: "draft_location_list",
    specialtyId: "sp-draft-location",
    specialty: "Draft Location List",
    agentId: "agent-draft-location",
    agentTitle: "Draft Location Planner",
    outputType: "text",
    description: "Records only the places needed by the approved outline.",
    agentDescription: "Creates stable working location records without premature visual choices.",
    dependsOn: ["book_concept_brief", "story_outline"],
  },
  {
    prefix: "05",
    file: "05-page-by-page-manuscript.md",
    taskId: "page_by_page_manuscript",
    specialtyId: "sp-manuscript",
    specialty: "Page-by-Page Manuscript",
    agentId: "agent-manuscript",
    agentTitle: "Manuscript Writer",
    outputType: "text",
    description: "Writes the complete readable story page by page.",
    agentDescription: "Expands approved narrative sources into complete child-facing prose.",
    dependsOn: [
      "book_concept_brief",
      "story_outline",
      "draft_character_list",
      "draft_location_list",
    ],
  },
  {
    prefix: "06",
    file: "06-final-character-list.md",
    taskId: "final_character_list",
    specialtyId: "sp-final-character",
    specialty: "Final Character List",
    agentId: "agent-final-character",
    agentTitle: "Character Continuity Editor",
    outputType: "text",
    description: "Creates the production source for every manuscript character.",
    agentDescription: "Builds stable character records and identifies required character sheets.",
    dependsOn: [
      "story_outline",
      "draft_character_list",
      "page_by_page_manuscript",
    ],
  },
  {
    prefix: "07",
    file: "07-final-location-list.md",
    taskId: "final_location_list",
    specialtyId: "sp-final-location",
    specialty: "Final Location List",
    agentId: "agent-final-location",
    agentTitle: "Location Continuity Editor",
    outputType: "text",
    description: "Creates the production source for every manuscript location.",
    agentDescription: "Builds stable location records and identifies required location sheets.",
    dependsOn: [
      "story_outline",
      "draft_location_list",
      "page_by_page_manuscript",
    ],
  },
  {
    prefix: "08",
    file: "08-visual-style-package.md",
    taskId: "visual_style_package",
    specialtyId: "sp-illustration",
    specialty: "Visual Style Package",
    agentId: "agent-watercolor",
    agentTitle: "Watercolor Illustrator",
    outputType: "image",
    description: "Defines and validates the reusable visual language for a booklet.",
    agentDescription: "Produces a shared style module and bundled validation samples.",
    dependsOn: [
      "book_concept_brief",
      "story_outline",
      "page_by_page_manuscript",
      "final_character_list",
      "final_location_list",
    ],
  },
  {
    prefix: "09",
    file: "09-individual-character-sheet-package.md",
    taskId: "character_sheet_package",
    specialtyId: "sp-character-sheet",
    specialty: "Individual Character Sheet Package",
    agentId: "agent-character-sheet",
    agentTitle: "Character Sheet Illustrator",
    outputType: "image",
    description: "Creates one reusable visual-reference package per required character.",
    agentDescription: "Builds complete character views, expressions, attire, and reference records.",
    dependsOn: ["final_character_list", "visual_style_package"],
  },
  {
    prefix: "10",
    file: "10-location-sheet-package.md",
    taskId: "location_sheet_package",
    specialtyId: "sp-location-sheet",
    specialty: "Location Sheet Package",
    agentId: "agent-location-sheet",
    agentTitle: "Location Sheet Illustrator",
    outputType: "image",
    description: "Creates reusable spatial references for approved locations.",
    agentDescription: "Builds an isometric overview and supporting views for one location.",
    dependsOn: ["final_location_list", "visual_style_package"],
  },
  {
    prefix: "11",
    file: "11-pagination-and-layout-plan.md",
    taskId: "pagination_layout_plan",
    specialtyId: "sp-pagination",
    specialty: "Pagination & Layout Plan",
    agentId: "agent-pagination",
    agentTitle: "Book Layout Planner",
    outputType: "text",
    description: "Locks the physical page, typography, and routing system.",
    agentDescription: "Maps approved story and visual sources onto a consistent physical book.",
    dependsOn: [
      "page_by_page_manuscript",
      "final_character_list",
      "final_location_list",
      "visual_style_package",
      "character_sheet_package",
      "location_sheet_package",
    ],
  },
  {
    prefix: "12",
    file: "12-final-page-bible.md",
    taskId: "final_page_bible",
    specialtyId: "sp-page-bible",
    specialty: "Final Page Bible",
    agentId: "agent-page-bible",
    agentTitle: "Page Bible Editor",
    outputType: "text",
    description: "Defines the exact production source for every physical page.",
    agentDescription: "Specifies page action, composition, exact text, and approved references.",
    dependsOn: [
      "page_by_page_manuscript",
      "final_character_list",
      "final_location_list",
      "visual_style_package",
      "character_sheet_package",
      "location_sheet_package",
      "pagination_layout_plan",
    ],
  },
  {
    prefix: "13",
    file: "13-final-page-illustration-package.md",
    taskId: "final_page_illustration_package",
    specialtyId: "sp-final-page",
    specialty: "Final Page Illustration Package",
    agentId: "agent-final-page",
    agentTitle: "Final Page Illustrator",
    outputType: "image",
    description: "Creates one complete, reviewable physical page at a time.",
    agentDescription: "Generates bundled page examples with exact text and reference lineage.",
    dependsOn: [
      "page_by_page_manuscript",
      "visual_style_package",
      "character_sheet_package",
      "location_sheet_package",
      "pagination_layout_plan",
      "final_page_bible",
    ],
  },
  {
    prefix: "14",
    file: "14-book-export-package.md",
    taskId: "book_export_package",
    specialtyId: "sp-export",
    specialty: "Book Export Package",
    agentId: "agent-export",
    agentTitle: "Export Preflight Editor",
    outputType: "text",
    description: "Prepares a traceable source manifest and export preflight.",
    agentDescription: "Validates approved pages and returns a synthetic export package.",
    dependsOn: [
      "pagination_layout_plan",
      "final_page_illustration_package",
    ],
  },
];

const taskById = new Map(
  definitions
    .filter((definition) => definition.taskId)
    .map((definition) => [definition.taskId, definition]),
);
const requiredArtifact =
  /## Required artifact[^\n]*\n\n\`\`\`markdown\n([\s\S]*?)\n\`\`\`/;

function transformedInstructions(definition, source, referenceId) {
  let instructions = source.trim();
  if (definition.taskId) {
    if (!requiredArtifact.test(instructions))
      throw new Error(`Required artifact template missing from ${definition.file}`);
    requiredArtifact.lastIndex = 0;
    instructions = instructions.replace(
      requiredArtifact,
      `## Required artifact\n\nFollow [$artifact-template.md](reference:${referenceId}) exactly for the artifact structure.`,
    );
  }
  if (definition.dependsOn.length) {
    const mentions = definition.dependsOn.map((id) => {
      const dependency = taskById.get(id);
      return `- [@${dependency.specialty}](specialty:${dependency.specialtyId})`;
    });
    instructions += `\n\n## Related specialties\n\n${mentions.join("\n")}`;
  }
  instructions +=
    "\n\n## Agent Studio mockup boundary\n\nTest agent returns bundled synthetic examples only. Do not execute approvals, jobs, exports, model calls, or application-owned state changes.";
  return instructions;
}

const contextTools = [
  "get_workflow_overview",
  "get_artifact_context",
  "get_conversation_context",
  "get_execution_context",
];
const specialties = definitions.map((definition) => ({
  id: definition.specialtyId,
  name: definition.specialty,
  description: definition.description,
  outputType: definition.outputType,
  allowedToolIds:
    definition.outputType === "image"
      ? [...contextTools, "generate_image"]
      : [...contextTools],
  builtIn: definition.prefix === "00",
  retired: false,
}));
const manifestGuidelines = [];
const agents = definitions.map((definition) => {
  const source = readSource(definition.file);
  const template = definition.taskId
    ? source.match(requiredArtifact)?.[1] ?? null
    : null;
  const versions = [1, 2].map((number) => {
    const slug = definition.agentId.replace(/^agent-/, "");
    const versionId = `${slug}-v${number}`;
    const referenceId = `ref-${slug}-template-v${number}`;
    return {
      id: versionId,
      number,
      parentVersionId: number === 1 ? null : `${slug}-v1`,
      status: number === 1 ? "confirmed" : "draft",
      title: definition.agentTitle,
      description: definition.agentDescription,
      versionNote: number === 1 ? "Guideline seed baseline." : "",
      languageModel: {
        provider: "Demo North",
        model:
          definition.prefix === "00" || definition.outputType === "image"
            ? "Reason"
            : "Story",
      },
      imageModel:
        definition.outputType === "image"
          ? { provider: "Demo North", model: "Watercolor" }
          : null,
      mainInstructions: transformedInstructions(
        definition,
        source,
        referenceId,
      ),
      references: template
        ? [
            {
              id: referenceId,
              name: "artifact-template.md",
              description:
                "Required artifact structure extracted from the pinned guideline.",
              content: template,
            },
          ]
        : [],
    };
  });
  manifestGuidelines.push({
    prefix: definition.prefix,
    taskId: definition.taskId,
    sourcePath: `${sourceDirectory}/${definition.file}`,
    sourceSha256: checksum(source),
    specialtyId: definition.specialtyId,
    agentId: definition.agentId,
    extractedReference:
      definition.taskId === null ? null : "artifact-template.md",
  });
  return {
    id: definition.agentId,
    specialtyId: definition.specialtyId,
    activeVersionId: versions[0].id,
    versions,
  };
});
const taskCatalog = definitions
  .filter((definition) => definition.taskId)
  .map((definition, index) => ({
    id: definition.taskId,
    label: definition.specialty,
    index,
    specialtyId: definition.specialtyId,
    dependsOn: definition.dependsOn,
    outputType: definition.outputType,
  }));

const seed = {
  formatVersion: 1,
  seedRevision: 2,
  specialties,
  agents,
  tools: [
    {
      id: "get_workflow_overview",
      name: "get_workflow_overview",
      description: "Read the frozen task graph and eligibility.",
    },
    {
      id: "get_artifact_context",
      name: "get_artifact_context",
      description: "Read frozen approved artifact context.",
    },
    {
      id: "get_conversation_context",
      name: "get_conversation_context",
      description: "Read frozen relevant creator decisions.",
    },
    {
      id: "get_execution_context",
      name: "get_execution_context",
      description: "Read frozen task and target context.",
    },
    {
      id: "generate_image",
      name: "generate_image",
      description: "Select a bundled synthetic image result.",
    },
  ],
  models: [
    {
      id: "north-story",
      provider: "Demo North",
      label: "Story",
      kind: "language",
    },
    {
      id: "north-reason",
      provider: "Demo North",
      label: "Reason",
      kind: "language",
    },
    {
      id: "south-quick",
      provider: "Demo South",
      label: "Quick",
      kind: "language",
    },
    {
      id: "south-story",
      provider: "Demo South",
      label: "Story",
      kind: "language",
    },
    {
      id: "north-watercolor",
      provider: "Demo North",
      label: "Watercolor",
      kind: "image",
    },
    {
      id: "south-shapes",
      provider: "Demo South",
      label: "Shapes",
      kind: "image",
    },
  ],
  taskCatalog,
  workingCopies: { specialties: {}, versions: {} },
  ui: {
    selection: { kind: "directory" },
    recentVersionIds: {},
    expandedSpecialtyIds: ["sp-story"],
    showRetired: false,
    navWidth: 240,
    chatWidth: 340,
    sectionWidth: 180,
    chatOpen: true,
    editorMode: "edit",
    imageDescriptions: {},
    testSetup: {
      bookletId: "demo-forest",
      stageId: "story_outline",
      openingRequest: "Produce a sample result",
      sourceSessionId: null,
    },
    focusMode: false,
    lastEditorSections: {},
    navigationNotice: null,
  },
  chat: {
    messages: [],
    proposals: [],
    pendingResponse: null,
    composerText: "",
    pendingClarification: null,
  },
  booklets: [],
  testSessions: [],
  pendingTestResponse: null,
};
const manifest = {
  repository: "karpishe-experiments/agentic-poc",
  pullRequest: 26,
  commit,
  sourceDirectory,
  generatedBy: "scripts/generate-management-guideline-seed.mjs",
  guidelines: manifestGuidelines,
  taskCatalog,
};

writeFileSync(
  new URL("seed.json", outputDirectory),
  `${JSON.stringify(seed, null, 2)}\n`,
);
writeFileSync(
  new URL("guideline-manifest.json", outputDirectory),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
