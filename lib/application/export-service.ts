import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { getDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import type { AssetStore } from "@/lib/assets/asset-store";
import { ArtifactService } from "@/lib/application/artifact-service";
import { getServerEnv, resolveDataRoot } from "@/lib/config/env";

const pagePoints = {
  landscape_5_4: [720, 576] as const,
  portrait_4_5: [576, 720] as const,
  square_1_1: [648, 648] as const,
};

export class ExportService {
  private readonly repositories: Repositories;
  private readonly artifacts: ArtifactService;
  private assets?: AssetStore;
  private readonly dataRoot?: string;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; artifacts?: ArtifactService; assets?: AssetStore } = {}) {
    const database = dependencies.database ?? dependencies.repositories?.database ?? getDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.artifacts = dependencies.artifacts ?? new ArtifactService({ database });
    this.assets = dependencies.assets;
    this.dataRoot = dependencies.assets ? undefined : resolveDataRoot(getServerEnv());
  }

  public async export(bookletId: string) {
    const finalPages = await this.artifacts.get(bookletId, "final_pages");
    const pagePlan = await this.artifacts.get(bookletId, "page_plan");
    if (!finalPages.currentVersion || !pagePlan.currentVersion) throw new Error("Approved Final Pages and Page Plan are required before export.");
    const pages = (finalPages.currentVersion.content as { pages: Array<{ pageIndex: number; composedAssetId: string }> }).pages.slice().sort((a, b) => a.pageIndex - b.pageIndex);
    if (!pages.length) throw new Error("There are no composed pages to export.");
    const assetIds = pages.map((page) => page.composedAssetId);
    const records = await Promise.all(assetIds.map((id) => this.repositories.assets.get(id)));
    if (records.some((record) => !record)) throw new Error("One or more composed page assets are missing.");
    const exportId = randomUUID();
    const now = Date.now();
    await this.repositories.exports.create({ id: exportId, bookletId, artifactVersionId: finalPages.currentVersion.id, pageAssetIds: assetIds, createdAtMs: now });
    try {
      const geometry = (pagePlan.currentVersion.content as { geometry: keyof typeof pagePoints }).geometry;
      const [width, height] = pagePoints[geometry];
      const pdf = await PDFDocument.create();
      pdf.setTitle("Kids Booklet");
      pdf.setCreator("Kids Booklet POC");
      const store = await this.getAssetStore();
      for (const asset of records) {
        if (!asset) continue;
        const image = await pdf.embedPng(await store.get(asset.uri));
        const page = pdf.addPage([width, height]);
        page.drawImage(image, { x: 0, y: 0, width, height });
      }
      const bytes = await pdf.save();
      const assetId = randomUUID();
      const uri = `${bookletId}/exports/${exportId}.pdf`;
      await store.put(uri, bytes, "application/pdf");
      await this.repositories.assets.create({ id: assetId, bookletId, kind: "pdf_export", uri, mimeType: "application/pdf", width: null, height: null, sourceAssetId: null, metadata: { exportId, pageAssetIds: assetIds }, createdAtMs: Date.now() });
      await this.repositories.exports.complete({ id: exportId, assetId, preflight: { passed: true, checks: [`${pages.length} pages`, `${width}x${height}pt`, "all composed assets present"] }, updatedAtMs: Date.now() });
      const pdfArtifact = await this.artifacts.revise(bookletId, "pdf_export", { schemaVersion: "1", exportId, finalPageVersionIds: [finalPages.currentVersion.id], finalPageAssetIds: assetIds, preflightSummary: { passed: true, checks: [`${pages.length} pages`, `${width}x${height}pt`, "all composed assets present"] }, pdfAssetId: assetId, createdAt: new Date().toISOString() }, { createdBy: "application" });
      await this.artifacts.approve(bookletId, "pdf_export", pdfArtifact.currentVersion!.id);
      const { EvidenceService } = await import("@/lib/application/evidence-service");
      const evidence = await new EvidenceService({ repositories: this.repositories, assets: store }).writeSummary(bookletId);
      return { exportId, assetId, evidenceAssetId: evidence.assetId, pageCount: pages.length };
    } catch (error) {
      await this.repositories.exports.fail({ id: exportId, error: { message: error instanceof Error ? error.message : "Export failed." }, updatedAtMs: Date.now() });
      throw error;
    }
  }

  private async getAssetStore(): Promise<AssetStore> {
    if (this.assets) return this.assets;
    const { FilesystemAssetStore } = await import("@/lib/assets/filesystem-asset-store");
    this.assets = new FilesystemAssetStore(this.dataRoot ?? resolveDataRoot(getServerEnv()));
    return this.assets;
  }
}
