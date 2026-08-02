import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import type { AssetStore } from "@/lib/assets/asset-store";
import { ArtifactService } from "@/lib/application/artifact-service";
import { getServerEnv, resolveDataRoot } from "@/lib/config/env";
import { composePage } from "@/lib/composition/compose-page";
import { GenerationService } from "@/lib/application/generation-service";

export class RevisionService {
  private readonly repositories: Repositories;
  private readonly artifacts: ArtifactService;
  private assets?: AssetStore;
  private readonly dataRoot?: string;
  private readonly generation?: GenerationService;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; artifacts?: ArtifactService; assets?: AssetStore; generation?: GenerationService } = {}) {
    const database = dependencies.database ?? createDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.artifacts = dependencies.artifacts ?? new ArtifactService({ database });
    this.assets = dependencies.assets;
    this.dataRoot = dependencies.assets ? undefined : resolveDataRoot(getServerEnv());
    this.generation = dependencies.generation;
  }

  public async recomposePageText(bookletId: string, pageId: string, readerText: string) {
    const finalPages = await this.artifacts.get(bookletId, "final_pages");
    const pagePlan = await this.artifacts.get(bookletId, "page_plan");
    if (!finalPages.currentVersion || !pagePlan.currentVersion) throw new Error("A saved Final Pages version and Page Plan are required before editing page text.");
    const finalContent = finalPages.currentVersion.content as { pages: Array<{ pageId: string; pageIndex: number; sourceIllustrationAssetId: string; composedAssetId: string; readerText: string; textSafeRegion: { x: number; y: number; width: number; height: number }; revisionNumber: number; acceptedQualityIssueIds: string[] }> };
    const currentPage = finalContent.pages.find((page) => page.pageId === pageId);
    const plannedPage = (pagePlan.currentVersion.content as { geometry: "square_1_1" | "landscape_5_4" | "portrait_4_5"; pages: Array<Record<string, unknown> & { pageId: string }> }).pages.find((page) => page.pageId === pageId);
    if (!currentPage || !plannedPage) throw new Error("The selected page is not part of the current booklet.");
    const source = await this.repositories.assets.get(currentPage.sourceIllustrationAssetId);
    if (!source) throw new Error("The source illustration for this page is missing.");

    const store = await this.getAssetStore();
    const composed = await composePage({
      source: Buffer.from(await store.get(source.uri)),
      page: { ...plannedPage, readerText: readerText.trim() },
      geometry: (pagePlan.currentVersion.content as { geometry: "square_1_1" | "landscape_5_4" | "portrait_4_5" }).geometry,
    });
    const assetId = randomUUID();
    const uri = `${bookletId}/pages/composed/${currentPage.pageIndex}/${assetId}.png`;
    await store.put(uri, composed.bytes, "image/png");
    await this.repositories.assets.create({
      id: assetId, bookletId, kind: "page_composed", uri, mimeType: "image/png", width: composed.width, height: composed.height,
      sourceAssetId: source.id, metadata: { operation: "text_recompose", previousComposedAssetId: currentPage.composedAssetId, pageId }, createdAtMs: Date.now(),
    });
    const revised = {
      ...finalContent,
      pages: finalContent.pages.map((page) => page.pageId === pageId
        ? { ...page, readerText: readerText.trim(), composedAssetId: assetId, revisionNumber: page.revisionNumber + 1, acceptedQualityIssueIds: [] }
        : page),
    };
    return this.artifacts.revise(bookletId, "final_pages", revised, { createdBy: "user_edit" });
  }

  public async regeneratePageVisual(bookletId: string, pageId: string) {
    const generation = this.generation ?? new GenerationService({ repositories: this.repositories, assets: this.assets });
    const job = await generation.createPageJob(bookletId, { pageIds: [pageId], revisionKey: randomUUID() });
    // Normal execution is picked up by instrumentation's persistent runner.
    if (process.env.VITEST) generation.startPageJob(bookletId, job.id);
    return job;
  }

  private async getAssetStore(): Promise<AssetStore> {
    if (this.assets) return this.assets;
    const { FilesystemAssetStore } = await import("@/lib/assets/filesystem-asset-store");
    this.assets = new FilesystemAssetStore(this.dataRoot ?? resolveDataRoot(getServerEnv()));
    return this.assets;
  }
}
