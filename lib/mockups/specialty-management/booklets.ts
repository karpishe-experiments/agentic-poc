import manifest from "./guideline-manifest.json";
import type {
  BookletFixture,
  BookletStageId,
  BookletStageSnapshot,
  SourcePageRecord,
  StageArtifact,
  TaskCatalogItem,
} from "./types";

export const TASK_CATALOG = manifest.taskCatalog as TaskCatalogItem[];
export const STAGES: Array<{ id: BookletStageId; label: string }> =
  TASK_CATALOG.map(({ id, label }) => ({ id, label }));

type FixtureDefinition = {
  id: string;
  title: string;
  premise: string;
  audience: string;
  completedTaskIds: BookletStageId[];
  eligibleTaskIds: BookletStageId[];
  characters: BookletFixture["characters"];
  locations: BookletFixture["locations"];
  sourcePageManifest: SourcePageRecord[];
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function artifactContent(
  definition: FixtureDefinition,
  stageId: BookletStageId,
  entityName?: string,
  entityId?: string,
) {
  const title = definition.title;
  const common = `**Status:** Approved\n\n**Premise:** ${definition.premise}\n\n**Audience:** ${definition.audience}`;
  const content: Record<BookletStageId, string> = {
    book_concept_brief: `# Book Concept Brief — ${title}\n\n${common}\n\n## Core Premise\n${definition.premise}.\n\n## Theme and Emotional Promise\nSmall, practical acts of care create confidence and connection.\n\n## Known Constraints\nKeep the story safe, hopeful, and age appropriate.`,
    story_outline: `# Story Outline — ${title}\n\n${common}\n\n## One-Paragraph Story Summary\nA curious child meets one manageable obstacle, learns from a trusted companion, and solves it through patient cooperation.\n\n## Story Arc\n1. Introduce the goal.\n2. Discover the obstacle.\n3. Try a thoughtful solution.\n4. Share the result.`,
    draft_character_list: `# Draft Character List — ${title}\n\n${common}\n\n| Name or role | Narrative function | Known facts |\n| --- | --- | --- |\n${definition.characters.map((item) => `| ${item.name} | Story-critical role | Stable ID: ${item.id} |`).join("\n")}`,
    draft_location_list: `# Draft Location List — ${title}\n\n${common}\n\n| Location title | Story purpose | Known facts |\n| --- | --- | --- |\n${definition.locations.map((item) => `| ${item.name} | Supports the central action | Stable ID: ${item.id} |`).join("\n")}`,
    page_by_page_manuscript: `# Page-by-Page Manuscript — ${title}\n\n${common}\n\n## Manuscript Pages\n### Manuscript Page 1 — The idea\nThe child names a hopeful goal.\n\n### Manuscript Page 2 — The challenge\nA small obstacle invites a new plan.\n\n### Manuscript Page 3 — The result\nPatient teamwork brings a joyful result.`,
    final_character_list: `# Final Character List — ${title}\n\n${common}\n\n| ID | Name or role | Recurrence | Character-sheet requirement |\n| --- | --- | --- | --- |\n${definition.characters.map((item) => `| ${item.id} | ${item.name} | Recurring | Required |`).join("\n")}`,
    final_location_list: `# Final Location List — ${title}\n\n${common}\n\n| ID | Location title | Stable environmental anchors | Location-sheet requirement |\n| --- | --- | --- | --- |\n${definition.locations.map((item) => `| ${item.id} | ${item.name} | Clear paths and recurring landmarks | Required |`).join("\n")}`,
    visual_style_package: `# Visual Style Package — ${title}\n\n${common}\n\n## Style Definition\nWarm watercolor, rounded shapes, readable contrast, and gentle natural light.\n\n## Style Prompt Module\nOriginal children's-book watercolor; clear focal action; accessible contrast; no watermark.\n\n## Validation Sample Plan and Results\nBundled synthetic samples cover emotion, environment, action, and prop readability.`,
    character_sheet_package: `# Individual Character Sheet Package — ${entityName ?? "Primary character"}\n\n${common}\n\n## Character Design Profile\nStable identity with front, back, side, neutral, and three expression views.\n\n## Character Sheet Image\nBundled synthetic asset; no image-quality claim.`,
    location_sheet_package: `# Location Sheet Package — ${entityName ?? "Primary location"}\n\n${common}\n\n## Location Definition Profile\nStable spatial anchors with an isometric overview and supporting views.\n\n## Location Sheet Image\nBundled synthetic asset; no image-quality claim.`,
    pagination_layout_plan: `# Pagination & Layout Plan — ${title}\n\n${common}\n\n## Physical Book Assumptions\n- Trim size, orientation, aspect ratio, and working pixel dimensions: square, 2400×2400 px\n- Bleed, binding, and live-text safe margins: 120 px live area\n- Reading direction and page-count assumptions: left to right; ${definition.sourcePageManifest.length || 6} physical pages\n\n## Source Routing\n${[...definition.characters, ...definition.locations].map((item) => `- ${item.id}: ${item.sheetAssetId ?? "sheet required before pagination"}`).join("\n")}`,
    final_page_bible: `# Final Page Bible — ${title}\n\n${common}\n\n## Global Production Rules\nUse the approved square canvas, watercolor style module, and exact manuscript wording.\n\n${definition.sourcePageManifest.map((page) => `## Physical Page ${String(page.readingOrder).padStart(3, "0")} — ${page.readingOrder === 1 ? "Cover" : "Story page"}\n- **Physical page ID:** ${page.pageId}\n- **Geometry:** ${page.geometry}\n- **Layout and panel/image structure:** One full-page image.\n- **Required character-sheet references:** ${definition.characters.map((item) => item.sheetAssetId ?? item.id).join(", ")}\n- **Required location-sheet references:** ${definition.locations.map((item) => item.sheetAssetId ?? item.id).join(", ")}\n- **Exact text plan:** ${page.readingOrder === 1 ? `${title} in the approved title treatment.` : `Approved manuscript text for physical page ${String(page.readingOrder).padStart(3, "0")}.`}`).join("\n\n") || `## Physical Page 001 — Cover\n- **Physical page ID:** pending-page-001\n- **Geometry:** Square working canvas\n- **Layout and panel/image structure:** One full-page image.\n- **Exact text plan:** ${title} in the approved title treatment.`}`,
    final_page_illustration_package: `# Final Page Illustration Package — ${entityName ?? "Page 001"}\n\n${common}\n\n## Page Composition Brief\n- **Physical page ID:** ${entityId ?? "pending-page-001"}\n- **Final Page Bible source:** ${definition.id}:artifact:final_page_bible:final_page_bible\n- **Geometry:** ${definition.sourcePageManifest.find((page) => page.pageId === entityId)?.geometry ?? "Square working canvas"}\n- **Composition:** One complete square composition with natively integrated approved text.\n\n## Attached Reference Record\n${[...definition.characters, ...definition.locations].map((item) => `- ${item.sheetAssetId ?? item.id}`).join("\n")}\n\n## Candidate and Approved Asset Record\nBundled synthetic asset; approval and revision remain scoped to this physical page.`,
    book_export_package: `# Book Export Package — ${title}\n\n**Status:** Draft awaiting user export request\n\n## Source Page Manifest\n| Reading order | Physical page ID | Approved asset filename | Asset revision | Preflight result |\n| --- | --- | --- | --- | --- |\n${definition.sourcePageManifest.map((page) => `| ${page.readingOrder} | ${page.pageId} | ${page.approvedFilename} | r${String(page.revision).padStart(2, "0")} | Pass |`).join("\n")}\n\n## Export Settings\n- Page geometry and order: 2400×2400 px, manifest order\n- File format: PDF\n- Output filename: ${slug(title)}.pdf\n\n## Preflight Results\nSynthetic preflight passed. No PDF was generated.`,
  };
  return content[stageId];
}

function artifactsFor(definition: FixtureDefinition) {
  const byTask = new Map<BookletStageId, StageArtifact[]>();
  for (const item of TASK_CATALOG) {
    const entities: Array<{
      id: string;
      name: string;
      assetId?: string;
      page?: SourcePageRecord;
    }> =
      item.id === "character_sheet_package"
        ? definition.characters.map((entity) => ({
            id: entity.id,
            name: entity.name,
            assetId: entity.sheetAssetId,
          }))
        : item.id === "location_sheet_package"
          ? definition.locations.map((entity) => ({
              id: entity.id,
              name: entity.name,
              assetId: entity.sheetAssetId,
            }))
          : item.id === "final_page_illustration_package"
            ? definition.sourcePageManifest.map((page) => ({
                id: page.pageId,
                name: `Page ${String(page.readingOrder).padStart(3, "0")}`,
                assetId: page.approvedAssetId,
                page,
              }))
            : [{ id: item.id, name: item.label }];
    byTask.set(
      item.id,
      entities.map((entity, index) => {
        const page = entity.page;
        const assetId = entity.assetId;
        return {
          id: `${definition.id}:artifact:${item.id}:${entity.id}`,
          stageId: item.id,
          label:
            entities.length > 1
              ? `${item.label} — ${entity.name}`
              : item.label,
          content: artifactContent(
            definition,
            item.id,
            entity.name,
            entity.id,
          ),
          status: "approved",
          version: 1,
          entityId: entity.id,
          ...(item.outputType === "image"
            ? {
                assetPath:
                  "/mockups/specialty-management/sample-image.svg",
                assetId:
                  assetId ??
                  `${definition.id}-asset-${item.id}-${index + 1}`,
              }
            : {}),
          ...(page
            ? {
                filename: page.approvedFilename,
                revision: page.revision,
                geometry: page.geometry,
              }
            : {}),
        };
      }),
    );
  }
  return byTask;
}

function snapshots(definition: FixtureDefinition): BookletStageSnapshot[] {
  const artifacts = artifactsFor(definition);
  const available = new Set([
    ...definition.completedTaskIds,
    ...definition.eligibleTaskIds,
  ]);
  return TASK_CATALOG.filter((item) => available.has(item.id)).map((item) => {
    const dependencies = item.dependsOn.flatMap(
      (dependency) => artifacts.get(dependency) ?? [],
    );
    const complete = definition.completedTaskIds.includes(item.id);
    const currentArtifact = complete ? artifacts.get(item.id)?.[0] : undefined;
    const explicitExportRequest =
      item.id === "book_export_package"
        ? `Export ${definition.title} now using the approved source-page manifest.`
        : null;
    return {
      id: `${definition.id}:${item.id}`,
      bookletId: definition.id,
      stageId: item.id,
      stageLabel: item.label,
      stageIndex: item.index,
      premise: definition.premise,
      audience: definition.audience,
      artifacts: dependencies,
      ...(currentArtifact
        ? { currentArtifact: structuredClone(currentArtifact) }
        : {}),
      conversation: [
        ...dependencies.map((artifact) => ({
          role: "assistant" as const,
          text: `${artifact.label} v${artifact.version} is approved.`,
        })),
        {
          role: "user" as const,
          text:
            explicitExportRequest ??
            `${complete ? "Review" : "Prepare"} ${item.label} for ${definition.title}.`,
        },
      ],
      taskContext:
        explicitExportRequest ??
        `${complete ? "Review the approved" : "Prepare an eligible"} ${item.label} using only its explicit approved dependencies.`,
    };
  });
}

const forest: FixtureDefinition = {
  id: "demo-forest",
  title: "Forest Friends",
  premise: "A fox and a rabbit learn to share a berry patch",
  audience: "ages 4–6",
  completedTaskIds: ["book_concept_brief"],
  eligibleTaskIds: ["story_outline"],
  characters: [
    { id: "forest-fox", name: "Fox" },
    { id: "forest-rabbit", name: "Rabbit" },
  ],
  locations: [{ id: "forest-berry-patch", name: "Berry Patch" }],
  sourcePageManifest: [],
};
const moon: FixtureDefinition = {
  id: "demo-moon",
  title: "Moon Picnic",
  premise: "Two siblings prepare a careful picnic on the Moon",
  audience: "ages 6–8",
  completedTaskIds: TASK_CATALOG.slice(0, 7).map((item) => item.id),
  eligibleTaskIds: ["visual_style_package"],
  characters: [
    { id: "moon-mira", name: "Mira" },
    { id: "moon-sami", name: "Sami" },
  ],
  locations: [{ id: "moon-picnic-site", name: "Moon Picnic Site" }],
  sourcePageManifest: [],
};
const gardenPages: SourcePageRecord[] = Array.from(
  { length: 6 },
  (_, index) => {
    const readingOrder = index + 1;
    const page = String(readingOrder).padStart(3, "0");
    return {
      readingOrder,
      pageId: `garden-page-${page}`,
      geometry: "2400×2400 px square",
      approvedAssetId: `garden-page-${page}-asset-r01`,
      approvedFilename: `the-smallest-garden_page-${page}_r01.png`,
      revision: 1,
      approved: true as const,
    };
  },
);
const garden: FixtureDefinition = {
  id: "demo-garden",
  title: "The Smallest Garden",
  premise: "A child builds a thriving balcony garden",
  audience: "ages 8–10",
  completedTaskIds: TASK_CATALOG.slice(0, 13).map((item) => item.id),
  eligibleTaskIds: ["book_export_package"],
  characters: [
    {
      id: "garden-noor",
      name: "Noor",
      sheetAssetId: "garden-character-noor-sheet-r01",
    },
    {
      id: "garden-grandfather",
      name: "Grandfather",
      sheetAssetId: "garden-character-grandfather-sheet-r01",
    },
  ],
  locations: [
    {
      id: "garden-balcony",
      name: "Balcony Garden",
      sheetAssetId: "garden-location-balcony-sheet-r01",
    },
    {
      id: "garden-kitchen",
      name: "Family Kitchen",
      sheetAssetId: "garden-location-kitchen-sheet-r01",
    },
  ],
  sourcePageManifest: gardenPages,
};

function booklet(definition: FixtureDefinition): BookletFixture {
  return {
    ...definition,
    currentStageId: definition.eligibleTaskIds[0]!,
    snapshots: snapshots(definition),
  };
}

export const bookletFixtures = (): BookletFixture[] => [
  booklet(forest),
  booklet(moon),
  booklet(garden),
];

export function availableStages(booklet: BookletFixture) {
  return booklet.snapshots;
}
