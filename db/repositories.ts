import { asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  artifacts,
  assets,
  booklets,
  cards,
  exportsTable,
  generationItems,
  generationJobs,
  messages,
  modelCalls,
  qualityReviews,
} from "@/db/schema";
import type { Asset } from "@/lib/contracts/assets";
import type {
  ActiveJobSummary,
  ArtifactSummary,
  ExportSummary,
  PersistedMessage,
} from "@/lib/contracts/booklets";
import { artifactStateSchema, artifactTypeSchema, bookletLifecycleSchema, type ArtifactType, type Booklet } from "@/lib/contracts/domain";
import { SCHEMA_VERSION } from "@/lib/contracts/common";

const activeJobStatuses = new Set(["pending", "running", "partial"]);

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function toBooklet(row: typeof booklets.$inferSelect): Booklet {
  return {
    id: row.id,
    schemaVersion: SCHEMA_VERSION,
    workingTitle: row.workingTitle,
    lifecycle: bookletLifecycleSchema.parse(row.lifecycle),
    currentStage: artifactTypeSchema.parse(row.currentStage),
    coverAssetId: row.coverAssetId,
    createdAt: iso(row.createdAtMs),
    updatedAt: iso(row.updatedAtMs),
  };
}

function toArtifactSummary(row: typeof artifacts.$inferSelect): ArtifactSummary {
  return {
    id: row.id,
    artifactType: artifactTypeSchema.parse(row.artifactType),
    state: artifactStateSchema.parse(row.state),
    currentVersionId: row.currentVersionId,
    createdAt: iso(row.createdAtMs),
    updatedAt: iso(row.updatedAtMs),
  };
}

function toAsset(row: typeof assets.$inferSelect): Asset {
  return {
    id: row.id,
    bookletId: row.bookletId,
    kind: row.kind as Asset["kind"],
    uri: row.uri,
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    sourceAssetId: row.sourceAssetId,
    metadata: row.metadataJson ? (parseJson(row.metadataJson) as Record<string, unknown>) : null,
    createdAtMs: row.createdAtMs,
  };
}

export type NewBookletState = {
  booklet: { id: string; workingTitle: string; createdAtMs: number };
  artifacts: Array<{ id: string; artifactType: ArtifactType }>;
  initialMessage: { id: string; idea: string };
};

export type BookletRepository = {
  createWithInitialState(input: NewBookletState): Promise<Booklet>;
  list(): Promise<Booklet[]>;
  get(id: string): Promise<Booklet | null>;
  updateDerivedState(input: { id: string; lifecycle: Booklet["lifecycle"]; currentStage: ArtifactType; updatedAtMs: number }): Promise<void>;
};

export type ArtifactRepository = {
  listByBooklet(bookletId: string): Promise<ArtifactSummary[]>;
};

export type ConversationRepository = {
  listMessages(bookletId: string): Promise<PersistedMessage[]>;
  getActiveCard(bookletId: string): Promise<unknown | null>;
};

export type JobRepository = {
  listActiveByBooklet(bookletId: string): Promise<ActiveJobSummary[]>;
};

export type AssetRepository = {
  get(id: string): Promise<Asset | null>;
};

export type EvidenceRepository = {
  countModelCalls(bookletId: string): Promise<number>;
  countQualityReviews(bookletId: string): Promise<number>;
};

export type ExportRepository = {
  listByBooklet(bookletId: string): Promise<ExportSummary[]>;
};

export type Repositories = {
  booklets: BookletRepository;
  artifacts: ArtifactRepository;
  conversation: ConversationRepository;
  jobs: JobRepository;
  assets: AssetRepository;
  evidence: EvidenceRepository;
  exports: ExportRepository;
};

export function createRepositories(database: Database): Repositories {
  return {
    booklets: {
      async createWithInitialState(input) {
        const { booklet, artifacts: initialArtifacts, initialMessage } = input;
        await database.transaction(async (transaction) => {
          await transaction.insert(booklets).values({
            id: booklet.id,
            schemaVersion: SCHEMA_VERSION,
            workingTitle: booklet.workingTitle,
            lifecycle: "draft",
            currentStage: "audience_profile",
            coverAssetId: null,
            createdAtMs: booklet.createdAtMs,
            updatedAtMs: booklet.createdAtMs,
          });
          await transaction.insert(artifacts).values(initialArtifacts.map((artifact) => ({
            id: artifact.id,
            bookletId: booklet.id,
            artifactType: artifact.artifactType,
            state: "empty",
            currentVersionId: null,
            createdAtMs: booklet.createdAtMs,
            updatedAtMs: booklet.createdAtMs,
          })));
          await transaction.insert(messages).values({
            id: initialMessage.id,
            bookletId: booklet.id,
            sequence: 0,
            role: "user",
            schemaVersion: SCHEMA_VERSION,
            uiMessageJson: JSON.stringify({
              id: initialMessage.id,
              role: "user",
              parts: [{ type: "text", text: initialMessage.idea }],
            }),
            createdAtMs: booklet.createdAtMs,
          });
        });
        return {
          id: booklet.id,
          schemaVersion: SCHEMA_VERSION,
          workingTitle: booklet.workingTitle,
          lifecycle: "draft",
          currentStage: "audience_profile",
          coverAssetId: null,
          createdAt: iso(booklet.createdAtMs),
          updatedAt: iso(booklet.createdAtMs),
        };
      },
      async list() {
        const rows = await database.select().from(booklets).orderBy(desc(booklets.updatedAtMs));
        return rows.map(toBooklet);
      },
      async get(id) {
        const row = await database.select().from(booklets).where(eq(booklets.id, id)).limit(1);
        return row[0] ? toBooklet(row[0]) : null;
      },
      async updateDerivedState(input) {
        await database.update(booklets).set({
          lifecycle: input.lifecycle,
          currentStage: input.currentStage,
          updatedAtMs: input.updatedAtMs,
        }).where(eq(booklets.id, input.id));
      },
    },
    artifacts: {
      async listByBooklet(bookletId) {
        const rows = await database.select().from(artifacts).where(eq(artifacts.bookletId, bookletId));
        return rows.map(toArtifactSummary);
      },
    },
    conversation: {
      async listMessages(bookletId) {
        const rows = await database.select().from(messages)
          .where(eq(messages.bookletId, bookletId))
          .orderBy(asc(messages.sequence));
        return rows.map((row) => ({
          id: row.id,
          role: row.role === "assistant" ? "assistant" : "user",
          sequence: row.sequence,
          message: parseJson(row.uiMessageJson),
          createdAt: iso(row.createdAtMs),
        }));
      },
      async getActiveCard(bookletId) {
        const row = await database.select({ cardJson: cards.cardJson }).from(cards)
          .where(sql`${cards.bookletId} = ${bookletId} and ${cards.status} = 'active'`)
          .orderBy(desc(cards.updatedAtMs))
          .limit(1);
        return row[0] ? parseJson(row[0].cardJson) : null;
      },
    },
    jobs: {
      async listActiveByBooklet(bookletId) {
        const rows = await database.select().from(generationJobs).where(eq(generationJobs.bookletId, bookletId));
        const active = rows.filter((row) => activeJobStatuses.has(row.status));
        return Promise.all(active.map(async (job) => {
          const counts = await database.select({
            total: sql<number>`count(*)`,
            completed: sql<number>`sum(case when ${generationItems.status} = 'succeeded' then 1 else 0 end)`,
          }).from(generationItems).where(eq(generationItems.jobId, job.id));
          return {
            id: job.id,
            jobType: job.jobType as ActiveJobSummary["jobType"],
            status: job.status as ActiveJobSummary["status"],
            progress: { completed: Number(counts[0]?.completed ?? 0), total: Number(counts[0]?.total ?? 0) },
            updatedAt: iso(job.updatedAtMs),
          };
        }));
      },
    },
    assets: {
      async get(id) {
        const row = await database.select().from(assets).where(eq(assets.id, id)).limit(1);
        return row[0] ? toAsset(row[0]) : null;
      },
    },
    evidence: {
      async countModelCalls(bookletId) {
        const result = await database.select({ count: sql<number>`count(*)` }).from(modelCalls)
          .where(eq(modelCalls.bookletId, bookletId));
        return Number(result[0]?.count ?? 0);
      },
      async countQualityReviews(bookletId) {
        const result = await database.select({ count: sql<number>`count(*)` }).from(qualityReviews)
          .where(eq(qualityReviews.bookletId, bookletId));
        return Number(result[0]?.count ?? 0);
      },
    },
    exports: {
      async listByBooklet(bookletId) {
        const rows = await database.select().from(exportsTable)
          .where(eq(exportsTable.bookletId, bookletId))
          .orderBy(desc(exportsTable.updatedAtMs));
        return rows.map((row) => ({
          id: row.id,
          status: row.status as ExportSummary["status"],
          assetId: row.assetId,
          createdAt: iso(row.createdAtMs),
          updatedAt: iso(row.updatedAtMs),
        }));
      },
    },
  };
}
