import { randomUUID } from "node:crypto";
import { getDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import type { AssetStore } from "@/lib/assets/asset-store";
import { createAssetStore } from "@/lib/assets/create-asset-store";

type SummaryBucket = { calls: number; failures: number; latencyMs: number };

export class EvidenceService {
  private readonly repositories: Repositories;
  private assets?: AssetStore;

  public constructor(dependencies: { database?: Database; repositories?: Repositories; assets?: AssetStore } = {}) {
    const database = dependencies.database ?? dependencies.repositories?.database ?? getDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.assets = dependencies.assets;
  }

  public async buildSummary(bookletId: string) {
    const [calls, qualityReviews, exports, assets] = await Promise.all([
      this.repositories.evidence.listModelCalls(bookletId),
      this.repositories.evidence.countQualityReviews(bookletId),
      this.repositories.exports.listByBooklet(bookletId),
      this.repositories.assets.listByBooklet(bookletId),
    ]);
    const byOperation: Record<string, SummaryBucket> = {};
    let actualCostUsd = 0;
    let estimatedCostUsd = 0;
    let hasActualCost = false;
    let hasEstimatedCost = false;
    for (const call of calls) {
      const bucket = byOperation[call.operation] ?? { calls: 0, failures: 0, latencyMs: 0 };
      bucket.calls += 1;
      bucket.failures += call.status === "failed" ? 1 : 0;
      bucket.latencyMs += call.latencyMs;
      byOperation[call.operation] = bucket;
      if (call.actualCostUsd !== null) { actualCostUsd += Number(call.actualCostUsd); hasActualCost = true; }
      if (call.estimatedCostUsd !== null) { estimatedCostUsd += Number(call.estimatedCostUsd); hasEstimatedCost = true; }
    }
    return {
      schemaVersion: "1" as const,
      bookletId,
      generatedAt: new Date().toISOString(),
      totals: {
        modelCalls: calls.length,
        qualityReviews,
        assets: assets.length,
        actualCostUsd: hasActualCost ? actualCostUsd.toFixed(6) : null,
        estimatedCostUsd: hasEstimatedCost ? estimatedCostUsd.toFixed(6) : null,
      },
      byOperation,
      calls,
      exports,
      traceIds: [...new Set(calls.map((call) => call.traceId).filter((traceId): traceId is string => Boolean(traceId)))],
    };
  }

  public async writeSummary(bookletId: string) {
    const summary = await this.buildSummary(bookletId);
    const assetId = randomUUID();
    const uri = `${bookletId}/evidence/${assetId}.json`;
    const bytes = Buffer.from(JSON.stringify(summary, null, 2));
    await (await this.getAssetStore()).put(uri, bytes, "application/json");
    await this.repositories.assets.create({
      id: assetId, bookletId, kind: "evidence", uri, mimeType: "application/json", width: null, height: null, sourceAssetId: null,
      metadata: { type: "engineering_summary", modelCallCount: summary.totals.modelCalls }, createdAtMs: Date.now(),
    });
    return { assetId, summary };
  }

  private async getAssetStore(): Promise<AssetStore> {
    if (this.assets) return this.assets;
    this.assets = createAssetStore();
    return this.assets;
  }
}
