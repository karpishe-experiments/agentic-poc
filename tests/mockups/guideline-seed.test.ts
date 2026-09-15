import { describe, expect, it } from "vitest";
import manifest from "@/lib/mockups/specialty-management/guideline-manifest.json";
import { TASK_CATALOG } from "@/lib/mockups/specialty-management/booklets";
import { freshSeed } from "@/lib/mockups/specialty-management/state";
import {
  completeTestResponse,
  createTestSession,
  startTestResponse,
} from "@/lib/mockups/specialty-management/testing";

let sequence = 0;
const id = (prefix: string) => `${prefix}-guideline-${++sequence}`;
const contextTools = [
  "get_workflow_overview",
  "get_artifact_context",
  "get_conversation_context",
  "get_execution_context",
];

describe("guideline-based Agent Studio seed", () => {
  it("covers every pinned source with one specialty and one two-version agent", () => {
    const state = freshSeed();
    expect(manifest.commit).toBe(
      "631f547ec3f7ce375f740dd6f2b1b9aaebbde940",
    );
    expect(manifest.guidelines).toHaveLength(15);
    expect(new Set(manifest.guidelines.map((item) => item.sourcePath)).size).toBe(
      15,
    );
    expect(
      manifest.guidelines.every((item) =>
        /^[a-f0-9]{64}$/.test(item.sourceSha256),
      ),
    ).toBe(true);
    expect(state.specialties).toHaveLength(15);
    expect(state.agents).toHaveLength(15);
    expect(state.taskCatalog).toEqual(TASK_CATALOG);

    for (const source of manifest.guidelines) {
      const specialty = state.specialties.find(
        (item) => item.id === source.specialtyId,
      );
      const agent = state.agents.find((item) => item.id === source.agentId);
      expect(specialty).toBeDefined();
      expect(agent?.specialtyId).toBe(specialty?.id);
      expect(agent?.versions.map((item) => item.status)).toEqual([
        "confirmed",
        "draft",
      ]);
      expect(agent?.activeVersionId).toBe(agent?.versions[0]?.id);
      expect(agent?.versions[1]?.parentVersionId).toBe(agent?.versions[0]?.id);
      expect(agent?.versions[1]?.versionNote).toBe("");

      for (const version of agent?.versions ?? []) {
        expect(version.mainInstructions).toContain("## Purpose");
        expect(version.mainInstructions).toContain(
          "## Agent Studio mockup boundary",
        );
        expect(version.description.length).toBeGreaterThan(0);
        expect(version.languageModel.model).toBe(
          specialty?.outputType === "image" ||
            specialty?.id === "sp-orchestrator"
            ? "Reason"
            : "Story",
        );
        expect(version.imageModel?.model ?? null).toBe(
          specialty?.outputType === "image" ? "Watercolor" : null,
        );
        expect(
          contextTools.every((tool) => specialty?.allowedToolIds.includes(tool)),
        ).toBe(true);
        expect(specialty?.allowedToolIds.includes("generate_image")).toBe(
          specialty?.outputType === "image",
        );

        if (source.extractedReference) {
          expect(version.references).toHaveLength(1);
          const reference = version.references[0]!;
          expect(reference.name).toBe("artifact-template.md");
          expect(reference.content).toMatch(/Draft awaiting/);
          expect(version.mainInstructions).toContain(
            `[$artifact-template.md](reference:${reference.id})`,
          );
        } else {
          expect(version.references).toEqual([]);
          expect(version.mainInstructions).toContain(
            "## Orchestrator responsibilities",
          );
          expect(version.mainInstructions).toContain("## Approval gates");
        }
      }
    }
  });

  it("has an acyclic dependency graph with independent sibling tasks", () => {
    const index = new Map(TASK_CATALOG.map((item) => [item.id, item.index]));
    for (const item of TASK_CATALOG)
      for (const dependency of item.dependsOn)
        expect(index.get(dependency)).toBeLessThan(item.index);

    const draftCharacter = TASK_CATALOG.find(
      (item) => item.id === "draft_character_list",
    )!;
    const draftLocation = TASK_CATALOG.find(
      (item) => item.id === "draft_location_list",
    )!;
    expect(draftCharacter.dependsOn).not.toContain("draft_location_list");
    expect(draftLocation.dependsOn).not.toContain("draft_character_list");
    const characterSheet = TASK_CATALOG.find(
      (item) => item.id === "character_sheet_package",
    )!;
    const locationSheet = TASK_CATALOG.find(
      (item) => item.id === "location_sheet_package",
    )!;
    expect(characterSheet.dependsOn).not.toContain("location_sheet_package");
    expect(locationSheet.dependsOn).not.toContain("character_sheet_package");
  });

  it("exposes only completed or eligible tasks and only explicit dependencies", () => {
    const state = freshSeed();
    for (const booklet of state.booklets) {
      expect(booklet.snapshots.map((item) => item.stageId)).toEqual(
        TASK_CATALOG.filter((item) =>
          [...booklet.completedTaskIds, ...booklet.eligibleTaskIds].includes(
            item.id,
          ),
        ).map((item) => item.id),
      );
      for (const snapshot of booklet.snapshots) {
        const allowed = new Set(
          TASK_CATALOG.find((item) => item.id === snapshot.stageId)?.dependsOn,
        );
        expect(
          snapshot.artifacts.every((artifact) =>
            allowed.has(artifact.stageId),
          ),
        ).toBe(true);
        expect(snapshot.currentArtifact?.stageId ?? snapshot.stageId).toBe(
          snapshot.stageId,
        );
      }
    }
    expect(
      state.booklets
        .find((item) => item.id === "demo-forest")
        ?.snapshots.map((item) => item.stageId),
    ).toEqual(["book_concept_brief", "story_outline"]);
    expect(
      state.booklets
        .find((item) => item.id === "demo-moon")
        ?.snapshots.at(-1)?.stageId,
    ).toBe("visual_style_package");
  });

  it("links every Garden sheet and approved page into export-ready context", () => {
    const garden = freshSeed().booklets.find(
      (item) => item.id === "demo-garden",
    )!;
    expect(garden.sourcePageManifest).toHaveLength(6);
    expect(
      garden.sourcePageManifest.every(
        (page) =>
          page.approved &&
          page.geometry === "2400×2400 px square" &&
          page.approvedFilename.includes(page.pageId.slice(-3)),
      ),
    ).toBe(true);
    const exportSnapshot = garden.snapshots.find(
      (item) => item.stageId === "book_export_package",
    )!;
    const bible = garden.snapshots.find(
      (item) => item.stageId === "final_page_bible",
    )!.currentArtifact!;
    const pages = exportSnapshot.artifacts.filter(
      (item) => item.stageId === "final_page_illustration_package",
    );
    expect(pages).toHaveLength(garden.sourcePageManifest.length);
    for (const page of garden.sourcePageManifest) {
      expect(bible.content).toContain(page.pageId);
      expect(bible.content).toContain(page.geometry);
      expect(
        pages.some(
          (artifact) =>
            artifact.assetId === page.approvedAssetId &&
            artifact.filename === page.approvedFilename &&
            artifact.revision === page.revision &&
            artifact.geometry === page.geometry &&
            artifact.content.includes(page.pageId) &&
            artifact.content.includes(bible.id),
        ),
      ).toBe(true);
    }
    expect(exportSnapshot.taskContext).toContain(
      "Export The Smallest Garden now",
    );

    const pagination = garden.snapshots.find(
      (item) => item.stageId === "pagination_layout_plan",
    )!;
    for (const character of garden.characters)
      expect(
        pagination.artifacts.some(
          (artifact) => artifact.assetId === character.sheetAssetId,
        ),
      ).toBe(true);
    for (const location of garden.locations)
      expect(
        pagination.artifacts.some(
          (artifact) => artifact.assetId === location.sheetAssetId,
        ),
      ).toBe(true);
  });

  it("provides task-specific results and Orchestrator routing for all 14 tasks", () => {
    const state = freshSeed();
    const garden = state.booklets.find((item) => item.id === "demo-garden")!;
    for (const task of TASK_CATALOG) {
      const agent = state.agents.find(
        (item) =>
          item.specialtyId === task.specialtyId &&
          item.id !== "agent-guide",
      )!;
      const setup = {
        bookletId: garden.id,
        stageId: task.id,
        openingRequest: "Produce a sample result",
        sourceSessionId: null,
      };
      const session = createTestSession(state, agent.id, setup, id)!;
      startTestResponse(
        state,
        session.id,
        setup.openingRequest,
        "opening",
        id,
      );
      completeTestResponse(state, id);
      const result = session.messages.at(-1)?.result;
      expect(result?.kind).toBe(
        task.outputType === "image" ? "image" : "text",
      );
      if (result?.kind === "image") {
        expect(result.metadata.asset).toBe("Bundled synthetic placeholder");
        expect(result.metadata.qualityReview).toBe("Not performed");
      }
      if (result?.kind === "text" && task.id === "book_export_package") {
        expect(result.markdown).toContain("Synthetic preflight passed");
        expect(result.markdown).toContain("No PDF was generated");
      }

      const routed = createTestSession(state, "agent-guide", setup, id)!;
      expect(routed.taskCatalogSnapshot).toEqual(state.taskCatalog);
      state.taskCatalog = state.taskCatalog.map((item) =>
        item.id === task.id ? { ...item, specialtyId: "sp-orchestrator" } : item,
      );
      startTestResponse(
        state,
        routed.id,
        setup.openingRequest,
        "opening",
        id,
      );
      completeTestResponse(state, id);
      const route = routed.messages.at(-1)?.result;
      expect(route?.kind).toBe("orchestrator");
      if (route?.kind === "orchestrator")
        expect(route.selectedSpecialtyId).toBe(task.specialtyId);
    }
  });
});
