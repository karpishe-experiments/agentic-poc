import { randomUUID } from "node:crypto";
import { validateUIMessages } from "ai";
import { createDatabase, type Database } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import {
  createBookletRequestSchema,
  homeBookletSchema,
  workspaceSnapshotSchema,
  type BookletSnapshot,
  type BookletSummary,
} from "@/lib/contracts/booklets";
import { BOOKLET_ARTIFACT_TYPES } from "@/lib/contracts/domain";
import { bookletMessageMetadataSchema, bookletUIMessageDataSchemas, type BookletUIMessage } from "@/lib/contracts/messages";

export class BookletNotFoundError extends Error {
  public constructor(bookletId: string) {
    super(`Booklet ${bookletId} was not found.`);
    this.name = "BookletNotFoundError";
  }
}

export type IdGenerator = { next(): string };
export type Clock = { now(): number };

const systemIds: IdGenerator = { next: randomUUID };
const systemClock: Clock = { now: Date.now };

function titleFromIdea(idea: string): string {
  const firstSentence = idea.split(/[.!?]/, 1)[0]?.replaceAll(/\s+/g, " ").trim() ?? "";
  return firstSentence.slice(0, 80) || "Untitled booklet";
}

export type BookletServiceDependencies = {
  database?: Database;
  repositories?: Repositories;
  ids?: IdGenerator;
  clock?: Clock;
};

export class BookletService {
  private readonly repositories: Repositories;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;

  public constructor(dependencies: BookletServiceDependencies = {}) {
    const database = dependencies.database ?? createDatabase();
    this.repositories = dependencies.repositories ?? createRepositories(database);
    this.ids = dependencies.ids ?? systemIds;
    this.clock = dependencies.clock ?? systemClock;
  }

  public async create(input: unknown) {
    const { idea } = createBookletRequestSchema.parse(input);
    const now = this.clock.now();
    const booklet = await this.repositories.booklets.createWithInitialState({
      booklet: { id: this.ids.next(), workingTitle: titleFromIdea(idea), createdAtMs: now },
      artifacts: BOOKLET_ARTIFACT_TYPES.map((artifactType) => ({ id: this.ids.next(), artifactType })),
      initialMessage: { id: this.ids.next(), idea },
    });
    return booklet;
  }

  public async list(): Promise<BookletSummary[]> {
    const rows = await this.repositories.booklets.list();
    return Promise.all(rows.map(async (booklet) => {
      const activeJobs = await this.repositories.jobs.listActiveByBooklet(booklet.id);
      const generationProgress = activeJobs.length === 0
        ? null
        : activeJobs.reduce((total, job) => ({
          completed: total.completed + job.progress.completed,
          total: total.total + job.progress.total,
        }), { completed: 0, total: 0 });
      return homeBookletSchema.parse({ ...booklet, generationProgress });
    }));
  }

  public async getWorkspaceSnapshot(bookletId: string): Promise<BookletSnapshot> {
    const booklet = await this.repositories.booklets.get(bookletId);
    if (!booklet) throw new BookletNotFoundError(bookletId);

    const [artifactSummaries, messages, activeCard, activeJobs, exports] = await Promise.all([
      this.repositories.artifacts.listByBooklet(bookletId),
      this.repositories.conversation.listMessages(bookletId),
      this.repositories.conversation.getActiveCard(bookletId),
      this.repositories.jobs.listActiveByBooklet(bookletId),
      this.repositories.exports.listByBooklet(bookletId),
    ]);

    const orderedArtifacts = BOOKLET_ARTIFACT_TYPES.map((artifactType) => {
      const artifact = artifactSummaries.find((candidate) => candidate.artifactType === artifactType);
      if (!artifact) throw new Error(`Booklet ${bookletId} is missing its ${artifactType} artifact placeholder.`);
      return artifact;
    });

    const validatedMessages = await validateUIMessages<BookletUIMessage>({
      messages: messages.map((message) => message.message),
      metadataSchema: bookletMessageMetadataSchema,
      dataSchemas: bookletUIMessageDataSchemas,
    });

    return workspaceSnapshotSchema.parse({
      booklet,
      artifacts: orderedArtifacts,
      messages: messages.map((message, index) => ({ ...message, message: validatedMessages[index] })),
      activeCard,
      activeJobs,
      exports,
    });
  }

  public async getAsset(assetId: string) {
    return this.repositories.assets.get(assetId);
  }
}

export function getBookletService(): BookletService {
  return new BookletService();
}
