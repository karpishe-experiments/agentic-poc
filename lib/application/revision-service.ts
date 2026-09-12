import { randomUUID } from "node:crypto";
import { getDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import type { AssetStore } from "@/lib/assets/asset-store";
import { ArtifactService } from "@/lib/application/artifact-service";
import { GenerationService } from "@/lib/application/generation-service";
import { pagePlanSchema, type ArtifactDetail } from "@/lib/contracts/artifacts";
import { regenerationRequestSchema, type RegenerationRequest } from "@/lib/contracts/regeneration";
import { assertMutationsAllowed } from "@/lib/application/deployment-control";

export class RevisionService {
  private readonly repositories: Repositories;
  private readonly artifacts: ArtifactService;
  private readonly generation?: GenerationService;
  private readonly assets?: AssetStore;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; artifacts?: ArtifactService; assets?: AssetStore; generation?: GenerationService } = {}) {
    const database = dependencies.database ?? dependencies.repositories?.database ?? getDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.artifacts = dependencies.artifacts ?? new ArtifactService({ database, repositories: this.repositories });
    this.generation = dependencies.generation;
    this.assets = dependencies.assets;
  }

  public async regenerateImage(bookletId: string, input: RegenerationRequest) {
    await assertMutationsAllowed();
    const parsed = regenerationRequestSchema.parse(input);
    const generation = this.generation ?? new GenerationService({ repositories: this.repositories, assets: this.assets });
    let job: { id: string; status: string; reused: boolean };
    if (parsed.target.kind === "page") {
      const target = parsed.target;
      const [plan, finalPages] = await Promise.all([this.artifacts.get(bookletId, "page_plan"), this.artifacts.get(bookletId, "final_pages")]);
      if (plan.state !== "approved" || !plan.currentVersion) throw new Error("Approve the comic-lettered Page Plan before regenerating a page.");
      const planned = pagePlanSchema.parse(plan.currentVersion.content).pages.find((page) => page.pageId === target.pageId);
      const current = (finalPages.currentVersion?.content as { pages?: Array<{ pageId: string; composedAssetId: string }> } | undefined)?.pages?.find((page) => page.pageId === target.pageId);
      if (!planned || !current) throw new Error("The selected current page is not available for regeneration.");
      job = await generation.createPageJob(bookletId, { pageIds: [planned.pageId], revisionKey: randomUUID(), revisionInstruction: parsed.instruction, editTargetAssetId: parsed.instruction ? current.composedAssetId : undefined });
      if (process.env.VITEST) generation.startPageJob(bookletId, job.id);
    } else {
      const target = parsed.target;
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
