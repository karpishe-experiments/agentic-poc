import { randomUUID } from "node:crypto";
import { getDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import { RecoverableApplicationError } from "@/lib/application/application-error";
import { pagePlanSchema, parseArtifactDocument, storyPlanSchema, visualBibleSchema, type ArtifactDetail } from "@/lib/contracts/artifacts";
import { BOOKLET_ARTIFACT_TYPES, type ArtifactType } from "@/lib/contracts/domain";

const upstreamArtifactTypes: Record<ArtifactType, ArtifactType[]> = {
  audience_profile: [],
  story_plan: ["audience_profile"],
  visual_style: ["story_plan"],
  visual_bible: ["visual_style"],
  booklet_specification: ["story_plan", "visual_bible"],
  page_plan: ["story_plan", "visual_bible", "booklet_specification"],
  final_pages: ["visual_bible", "booklet_specification", "page_plan"],
  pdf_export: ["final_pages"],
};

export class ArtifactService {
  private readonly repositories: Repositories;

  public constructor(dependencies: { database?: Database; repositories?: Repositories } = {}) {
    const database = dependencies.database ?? dependencies.repositories?.database ?? getDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
  }

  public async get(bookletId: string, artifactType: ArtifactType): Promise<ArtifactDetail> {
    const detail = await this.repositories.artifacts.getDetail(bookletId, artifactType);
    if (!detail) throw new RecoverableApplicationError({ code: "artifact_not_found", message: "This artifact could not be found.", status: 404 });
    return detail;
  }

  public async revise(bookletId: string, artifactType: ArtifactType, content: unknown, options: { createdBy?: "agent" | "user_edit" | "repair" | "application"; sourceExecutionBatchId?: string | null } = {}): Promise<ArtifactDetail> {
    const parsedContent = parseArtifactDocument(artifactType, content);
    const artifactSummaries = await this.repositories.artifacts.listByBooklet(bookletId);
    if (artifactSummaries.length !== BOOKLET_ARTIFACT_TYPES.length) {
      throw new RecoverableApplicationError({ code: "artifact_graph_incomplete", message: "This booklet is missing one of its required artifact stages.", status: 409 });
    }
    const upstreamDetails = await Promise.all(upstreamArtifactTypes[artifactType].map(async (upstreamType) => {
      const detail = await this.get(bookletId, upstreamType);
      if (!detail.currentVersion) {
        throw new RecoverableApplicationError({ code: "upstream_artifact_missing", message: `${upstreamType.replaceAll("_", " ")} needs a version before this artifact can be revised.`, status: 409 });
      }
      return [upstreamType, detail] as const;
    }));
    const upstream = new Map(upstreamDetails);
    await this.validateCrossDocumentInvariants(bookletId, artifactType, parsedContent, upstream);
    await this.repositories.artifacts.createVersion({
      id: randomUUID(),
      bookletId,
      artifactType,
      content: parsedContent,
      dependencyVersionIds: upstreamDetails.map(([, detail]) => detail.currentVersion!.id),
      createdBy: options.createdBy ?? "user_edit",
      sourceExecutionBatchId: options.sourceExecutionBatchId ?? null,
      createdAtMs: Date.now(),
    });
    await this.refreshDerivedStage(bookletId);
    return this.get(bookletId, artifactType);
  }

  public async approve(bookletId: string, artifactType: ArtifactType, artifactVersionId: string, options: { scope?: "artifact_content" | "reference" | "page" | "artifact"; subjectKey?: string | null } = {}): Promise<ArtifactDetail> {
    const detail = await this.get(bookletId, artifactType);
    if (detail.currentVersion?.id !== artifactVersionId) {
      throw new RecoverableApplicationError({ code: "artifact_version_not_current", message: "Approve the current saved version after reviewing it.", status: 409 });
    }
    if ((options.scope ?? "artifact") === "artifact") this.assertScopedApprovalEligibility(detail, artifactType, artifactVersionId);
    await this.repositories.artifacts.approve({
      id: randomUUID(),
      bookletId,
      artifactType,
      artifactVersionId,
      scope: options.scope,
      subjectKey: options.subjectKey,
      createdAtMs: Date.now(),
    });
    if ((options.scope ?? "artifact") === "artifact") await this.refreshDerivedStage(bookletId);
    return this.get(bookletId, artifactType);
  }

  private assertScopedApprovalEligibility(detail: ArtifactDetail, artifactType: ArtifactType, artifactVersionId: string): void {
    const approved = new Set(detail.approvals.filter((approval) => approval.artifactVersionId === artifactVersionId).map((approval) => `${approval.scope}:${approval.subjectKey ?? ""}`));
    if (artifactType === "visual_bible") {
      const content = detail.currentVersion?.content as { characters?: Array<{ entityId: string; referenceRequired: boolean }>; locations?: Array<{ entityId: string; referenceRequired: boolean }> } | undefined;
      const required = [...(content?.characters ?? []), ...(content?.locations ?? [])].filter((item) => item.referenceRequired);
      if (!approved.has("artifact_content:")) throw new RecoverableApplicationError({ code: "visual_bible_content_unapproved", message: "Approve the Visual Bible definitions before approving its canonical references.", status: 409 });
      if (required.some((item) => !approved.has(`reference:${item.entityId}`))) throw new RecoverableApplicationError({ code: "reference_approval_incomplete", message: "Approve each required canonical reference before approving the Visual Bible.", status: 409 });
    }
    if (artifactType === "final_pages") {
      const content = detail.currentVersion?.content as { pages?: Array<{ pageId: string }> } | undefined;
      if (!content?.pages?.length || content.pages.some((page) => !approved.has(`page:${page.pageId}`))) throw new RecoverableApplicationError({ code: "page_approval_incomplete", message: "Approve each composed page before approving Final Pages.", status: 409 });
    }
  }

  private async refreshDerivedStage(bookletId: string) {
    const artifacts = await this.repositories.artifacts.listByBooklet(bookletId);
    const nextIncomplete = BOOKLET_ARTIFACT_TYPES.find((artifactType) => artifacts.find((artifact) => artifact.artifactType === artifactType)?.state !== "approved");
    await this.repositories.booklets.updateDerivedState({
      id: bookletId,
      lifecycle: nextIncomplete ? "draft" : "completed",
      currentStage: nextIncomplete ?? "pdf_export",
      updatedAtMs: Date.now(),
    });
  }

  private async validateCrossDocumentInvariants(bookletId: string, artifactType: ArtifactType, content: unknown, upstream: Map<ArtifactType, ArtifactDetail>) {
    if (artifactType === "visual_bible") {
      const story = storyPlanSchema.parse((upstream.get("story_plan") ?? await this.get(bookletId, "story_plan")).currentVersion?.content);
      const bible = visualBibleSchema.parse(content);
      const expectedCharacterIds = story.characters.filter((character) => character.named || character.continuityRelevant).map((character) => character.entityId).sort();
      const expectedLocationIds = story.settings.filter((setting) => setting.named || setting.continuityRelevant).map((setting) => setting.entityId).sort();
      const actualCharacterIds = bible.characters.map((character) => character.entityId).sort();
      const actualLocationIds = bible.locations.map((location) => location.entityId).sort();
      if (JSON.stringify(expectedCharacterIds) !== JSON.stringify(actualCharacterIds) || JSON.stringify(expectedLocationIds) !== JSON.stringify(actualLocationIds)) {
        const describeMismatch = (expected: string[], actual: string[], entities: Array<{ entityId: string; name: string }>, label: string) => {
          const names = new Map(entities.map((entity) => [entity.entityId, entity.name]));
          const missing = expected.filter((id) => !actual.includes(id)).map((id) => names.get(id) ?? id);
          const extra = actual.filter((id) => !expected.includes(id)).map((id) => names.get(id) ?? id);
          return [missing.length ? `missing ${label}: ${missing.join(", ")}` : null, extra.length ? `unexpected ${label}: ${extra.join(", ")}` : null].filter(Boolean).join("; ");
        };
        const details = [
          describeMismatch(expectedCharacterIds, actualCharacterIds, story.characters, "characters"),
          describeMismatch(expectedLocationIds, actualLocationIds, story.settings, "locations"),
        ].filter(Boolean).join("; ");
        throw new RecoverableApplicationError({ code: "visual_bible_entities_mismatch", message: `The Visual Bible must define every named or continuity-relevant Story Plan subject and no incidental subjects.${details ? ` Please revise: ${details}.` : ""}`, status: 400 });
      }
    }

    if (artifactType === "page_plan") {
      const specification = upstream.get("booklet_specification")?.currentVersion?.content;
      const bible = visualBibleSchema.parse(upstream.get("visual_bible")?.currentVersion?.content);
      const plan = pagePlanSchema.parse(content);
      if (!specification || typeof specification !== "object" || !("storyPageCount" in specification) || !("geometry" in specification) || specification.storyPageCount !== plan.storyPageCount || specification.geometry !== plan.geometry) {
        throw new RecoverableApplicationError({ code: "page_plan_specification_mismatch", message: "The Page Plan must use the current confirmed page count and geometry.", status: 400 });
      }
      const characterIds = new Set(bible.characters.map((character) => character.entityId));
      const locationIds = new Set(bible.locations.map((location) => location.entityId));
      const referenceIds = new Set([
        ...bible.styleReferences,
        ...bible.characters.map((character) => character.currentReferenceAssetId).filter((id): id is string => Boolean(id)),
        ...bible.locations.map((location) => location.currentReferenceAssetId).filter((id): id is string => Boolean(id)),
      ]);
      for (const page of plan.pages) {
        if (page.characterIds.some((id) => !characterIds.has(id)) || page.locationIds.some((id) => !locationIds.has(id)) || page.relevantReferenceIds.some((id) => !referenceIds.has(id))) {
          throw new RecoverableApplicationError({ code: "page_plan_reference_mismatch", message: "Each page must use only current Visual Bible entity and reference IDs.", status: 400 });
        }
      }
    }
  }
}

export function getArtifactService(): ArtifactService {
  return new ArtifactService();
}
