import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import type { AssetStore } from "@/lib/assets/asset-store";
import { ArtifactService } from "@/lib/application/artifact-service";
import { ManagerService } from "@/lib/application/manager-service";
import { GenerationService } from "@/lib/application/generation-service";
import { resolveComicCopyMode } from "@/lib/config/env";
import { materializePagePlan } from "@/lib/application/entity-materialization";
import { pagePlanSchema, type ArtifactDetail } from "@/lib/contracts/artifacts";
import { pagePlanDraftSchema } from "@/lib/contracts/drafts";
import { regenerationRequestSchema, type RegenerationRequest } from "@/lib/contracts/regeneration";
import { pagePlanningResultSchema } from "@/lib/skills/page-planning-writing";
import { SCHEMA_VERSION } from "@/lib/contracts/common";
import type { GenUICard } from "@/lib/contracts/cards";

export class RevisionService {
  private readonly repositories: Repositories;
  private readonly artifacts: ArtifactService;
  private readonly generation?: GenerationService;
  private readonly manager: ManagerService;
  private readonly assets?: AssetStore;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; artifacts?: ArtifactService; assets?: AssetStore; generation?: GenerationService; manager?: ManagerService } = {}) {
    const database = dependencies.database ?? createDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.artifacts = dependencies.artifacts ?? new ArtifactService({ database, repositories: this.repositories });
    this.generation = dependencies.generation;
    this.manager = dependencies.manager ?? new ManagerService({ database, repositories: this.repositories });
    this.assets = dependencies.assets;
  }

  public async upgradePagePlanLettering(bookletId: string) {
    const [booklet, story, bible, specification, pagePlan, summaries, messages] = await Promise.all([
      this.repositories.booklets.get(bookletId),
      this.artifacts.get(bookletId, "story_plan"),
      this.artifacts.get(bookletId, "visual_bible"),
      this.artifacts.get(bookletId, "booklet_specification"),
      this.artifacts.get(bookletId, "page_plan"),
      this.repositories.artifacts.listByBooklet(bookletId),
      this.repositories.conversation.listMessages(bookletId),
    ]);
    if (!booklet || !story.currentVersion || !bible.currentVersion || !specification.currentVersion || !pagePlan.currentVersion) throw new Error("The current Story Plan, Visual Bible, Booklet Specification, and Page Plan are required for this upgrade.");
    const current = pagePlanSchema.parse(pagePlan.currentVersion.content);
    if (current.pages.every((page) => page.lettering?.length)) return pagePlan;
    const copyMode = resolveComicCopyMode();
    const intent = copyMode === "creative"
      ? "Upgrade the existing Page Plan to concise, professional single-scene comic lettering. Preserve every story beat and page identity while creatively using narration, dialogue, thoughts, and restrained sound effects where natural."
      : "Upgrade the existing Page Plan to structured comic lettering without changing any approved reader-facing words.";
    const result = await this.manager.run({
      bookletId,
      stage: "page_plan",
      operation: "upgrade_comic_lettering",
      intent,
      knownFacts: [intent, `COMIC_COPY_MODE=${copyMode}`],
      recentMessages: messages.slice(-8).map((message) => JSON.stringify(message.message)),
      approvedArtifactVersionIds: summaries.filter((artifact) => artifact.state === "approved" && artifact.currentVersionId).map((artifact) => artifact.currentVersionId!),
      traceId: randomUUID(),
    }, {
      cardId: randomUUID(),
      skillInput: { intent, storyPlan: story.currentVersion.content, visualBible: bible.currentVersion.content, specification: specification.currentVersion.content, currentPagePlan: current, copyMode },
    });
    const planned = pagePlanningResultSchema.parse(result.output);
    const draft = pagePlanDraftSchema.parse(planned.content);
    const detail = await this.artifacts.revise(bookletId, "page_plan", materializePagePlan(draft, current), { createdBy: "agent" });
    const card: GenUICard = {
      schemaVersion: SCHEMA_VERSION,
      cardId: randomUUID(),
      family: "artifact_review",
      variant: "summary",
      status: "active",
      title: "Review Comic Lettering",
      explanation: "Review the exact narration, dialogue, thoughts, and sound effects before regenerating any page images.",
      allowedActions: ["approve_and_continue", "request_revision"],
      payload: { artifactType: "page_plan", versionId: detail.currentVersion!.id, summary: [{ label: "Pages", value: String(current.pages.length) }, { label: "Copy mode", value: copyMode }, { label: "Image lettering", value: "Rendered verbatim by the image model" }] },
    };
    await this.repositories.conversation.persistAssistantCard({ bookletId, messageId: randomUUID(), narration: planned.summary, card, createdAtMs: Date.now() });
    return detail;
  }

  public async regenerateImage(bookletId: string, input: RegenerationRequest) {
    const parsed = regenerationRequestSchema.parse(input);
    const generation = this.generation ?? new GenerationService({ repositories: this.repositories, assets: this.assets });
    let resolvedTarget = parsed.target;
    if (resolvedTarget.kind === "asset") {
      const selectedAssetId = resolvedTarget.assetId;
      const [finalPages, bible] = await Promise.all([this.artifacts.get(bookletId, "final_pages"), this.artifacts.get(bookletId, "visual_bible")]);
      const page = (finalPages.currentVersion?.content as { pages?: Array<{ pageId: string; composedAssetId: string }> } | undefined)?.pages?.find((candidate) => candidate.composedAssetId === selectedAssetId);
      const entities = bible.currentVersion?.content as { characters?: Array<{ entityId: string; currentReferenceAssetId: string | null }>; locations?: Array<{ entityId: string; currentReferenceAssetId: string | null }> } | undefined;
      const entity = [...(entities?.characters ?? []), ...(entities?.locations ?? [])].find((candidate) => candidate.currentReferenceAssetId === selectedAssetId);
      if (page) resolvedTarget = { kind: "page", pageId: page.pageId };
      else if (entity) resolvedTarget = { kind: "reference", entityId: entity.entityId };
      else throw new Error("The selected image is not current in this booklet and cannot be regenerated.");
    }
    let job: { id: string; status: string; reused: boolean };
    if (resolvedTarget.kind === "page") {
      const target = resolvedTarget;
      const [plan, finalPages] = await Promise.all([this.artifacts.get(bookletId, "page_plan"), this.artifacts.get(bookletId, "final_pages")]);
      if (plan.state !== "approved" || !plan.currentVersion) throw new Error("Approve the comic-lettered Page Plan before regenerating a page.");
      const planned = pagePlanSchema.parse(plan.currentVersion.content).pages.find((page) => page.pageId === target.pageId);
      const current = (finalPages.currentVersion?.content as { pages?: Array<{ pageId: string; composedAssetId: string }> } | undefined)?.pages?.find((page) => page.pageId === target.pageId);
      if (!planned?.lettering?.length || !current) throw new Error("The selected current page is not available for regeneration.");
      job = await generation.createPageJob(bookletId, { pageIds: [planned.pageId], revisionKey: randomUUID(), revisionInstruction: parsed.instruction, editTargetAssetId: parsed.instruction ? current.composedAssetId : undefined });
      if (process.env.VITEST) generation.startPageJob(bookletId, job.id);
    } else {
      const target = resolvedTarget;
      const bible = await this.artifacts.get(bookletId, "visual_bible");
      const entities = bible.currentVersion?.content as { characters?: Array<{ entityId: string; currentReferenceAssetId: string | null }>; locations?: Array<{ entityId: string; currentReferenceAssetId: string | null }> } | undefined;
      const current = [...(entities?.characters ?? []), ...(entities?.locations ?? [])].find((entity) => entity.entityId === target.entityId);
      if (!current?.currentReferenceAssetId) throw new Error("The selected canonical reference is not available for regeneration.");
      job = await generation.createReferenceJob(bookletId, { entityIds: [current.entityId], revisionKey: randomUUID(), revisionInstruction: parsed.instruction, editTargetAssetId: parsed.instruction ? current.currentReferenceAssetId : undefined });
      if (process.env.VITEST) generation.startReferenceJob(bookletId, job.id);
    }
    return await this.repositories.jobs.getStatus(job.id) ?? job;
  }

  public async regeneratePageVisual(bookletId: string, pageId: string) {
    return this.regenerateImage(bookletId, { target: { kind: "page", pageId } });
  }

  public async recomposePageText(bookletId: string, pageId: string, readerText: string): Promise<ArtifactDetail> {
    void bookletId;
    void pageId;
    void readerText;
    throw new Error("Revise and approve the Page Plan lettering before regenerating this page.");
  }
}
