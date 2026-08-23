import { randomUUID } from "node:crypto";
import { getDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import { ArtifactService } from "@/lib/application/artifact-service";
import { createQualityIssueCard } from "@/lib/application/card-factories";
import { storyPlanSchema } from "@/lib/contracts/artifacts";
import { materializeStoryPlan } from "@/lib/application/entity-materialization";
import { qualityReviewSchema } from "@/lib/contracts/quality";
import { storyQualityResultSchema } from "@/lib/skills/quality-review-repair";
import type { QualityReview } from "@/lib/contracts/quality";

export class QualityService {
  private readonly repositories: Repositories;
  private readonly artifacts: ArtifactService;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; artifacts?: ArtifactService } = {}) {
    const database = dependencies.database ?? dependencies.repositories?.database ?? getDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.artifacts = dependencies.artifacts ?? new ArtifactService({ database });
  }
  public async applyStoryReview(bookletId: string, output: unknown) {
    const result = storyQualityResultSchema.parse(output);
    const current = await this.artifacts.get(bookletId, "story_plan");
    if (!current.currentVersion) throw new Error("Story quality needs a saved Story Plan.");

    if (result.review.status === "passed") {
      await this.record(bookletId, result.review, [current.currentVersion.id], []);
      return { kind: "passed" as const, versionId: current.currentVersion.id };
    }

    let repairVersionId: string | null = null;
    try {
      if (result.forceValidationFailure) throw new Error("The structured repair was rejected by deterministic validation.");
      const repaired = materializeStoryPlan(result.repairedStory!, storyPlanSchema.parse(current.currentVersion.content));
      const detail = await this.artifacts.revise(bookletId, "story_plan", repaired, { createdBy: "repair" });
      repairVersionId = detail.currentVersion?.id ?? null;
      if (!repairVersionId) throw new Error("The repair did not create a Story Plan version.");
      await this.record(bookletId, result.review, [current.currentVersion.id], [repairVersionId]);
      const passed = qualityReviewSchema.parse({ gate: "story_readiness", attempt: 2, status: "passed", issues: [] });
      await this.record(bookletId, passed, [repairVersionId], []);
      return { kind: "repaired" as const, versionId: repairVersionId, issues: result.review.issues };
    } catch (error) {
      const unresolved = qualityReviewSchema.parse({
        ...result.review,
        attempt: 2,
        status: "unresolved",
        issues: result.review.issues.length ? result.review.issues : [{
          id: randomUUID(), severity: "major", target: "Story Plan", message: error instanceof Error ? error.message : "The repair could not be validated.", suggestedRepair: "Revise the Story Plan and retry the review.",
        }],
      });
      await this.record(bookletId, unresolved, [current.currentVersion.id], repairVersionId ? [repairVersionId] : []);
      return {
        kind: "unresolved" as const,
        card: createQualityIssueCard({
          cardId: randomUUID(), title: "Story Plan needs a revision", code: "story_quality_unresolved",
          summary: "One structured repair was attempted, but the resulting Story Plan still needs your review.",
          details: unresolved.issues.map((issue) => issue.message),
        }),
      };
    }
  }

  public async reviewGenerationReadiness(bookletId: string): Promise<QualityReview> {
    const [bible, specification] = await Promise.all([
      this.artifacts.get(bookletId, "visual_bible"),
      this.artifacts.get(bookletId, "booklet_specification"),
    ]);
    const bibleContent = bible.currentVersion?.content as { characters?: Array<{ name: string; referenceRequired: boolean; currentReferenceAssetId: string | null }>; locations?: Array<{ name: string; referenceRequired: boolean; currentReferenceAssetId: string | null }> } | undefined;
    const specificationContent = specification.currentVersion?.content as { geometryConfirmed?: boolean } | undefined;
    const missingReferences = [...(bibleContent?.characters ?? []), ...(bibleContent?.locations ?? [])]
      .filter((item) => item.referenceRequired && !item.currentReferenceAssetId);
    const issues = [
      ...missingReferences.map((item) => ({ id: randomUUID(), severity: "major" as const, target: item.name, message: "A required canonical reference is missing.", suggestedRepair: "Generate and approve the reference before page generation." })),
      ...(specificationContent?.geometryConfirmed ? [] : [{ id: randomUUID(), severity: "major" as const, target: "Booklet Specification", message: "The final page geometry is not confirmed.", suggestedRepair: "Confirm one geometry before generating pages." }]),
    ];
    const review = qualityReviewSchema.parse({ gate: "generation_readiness", attempt: 1, status: issues.length ? "repair_needed" : "passed", issues });
    await this.record(bookletId, review, [bible.currentVersion?.id, specification.currentVersion?.id].filter((id): id is string => Boolean(id)), []);
    return review;
  }

  public async reviewFinalPages(bookletId: string): Promise<QualityReview> {
    const finalPages = await this.artifacts.get(bookletId, "final_pages");
    const content = finalPages.currentVersion?.content as { pages?: Array<{ pageId: string; readerText: string; composedAssetId: string }> } | undefined;
    const issues: QualityReview["issues"] = [];
    if (!content?.pages?.length) {
      issues.push({ id: randomUUID(), severity: "critical", target: "Final Pages", message: "There are no composed pages to review.", suggestedRepair: "Generate the cover and every story page before approval." });
    } else {
      for (const page of content.pages) {
        if (!page.readerText.trim()) issues.push({ id: randomUUID(), severity: "major", target: page.pageId, message: "Reader text is empty.", suggestedRepair: "Add reader text and recompose the selected page." });
        if (!await this.repositories.assets.get(page.composedAssetId)) issues.push({ id: randomUUID(), severity: "critical", target: page.pageId, message: "The composed image asset is missing.", suggestedRepair: "Regenerate the selected page before approval." });
      }
    }
    const review = qualityReviewSchema.parse({ gate: "final_page_quality", attempt: 1, status: issues.length ? "repair_needed" : "passed", issues });
    await this.record(bookletId, review, finalPages.currentVersion ? [finalPages.currentVersion.id] : [], []);
    return review;
  }

  private async record(bookletId: string, review: QualityReview, artifactVersionIds: string[], repairVersionIds: string[]) {
    await this.repositories.evidence.recordQualityReview({
      id: randomUUID(), bookletId, review, artifactVersionIds, repairVersionIds, createdAtMs: Date.now(),
    });
  }
}
