import "server-only";

import type { ArtifactState, ArtifactType, Booklet, BookletLifecycle } from "@/lib/contracts/domain";

export type BookletSummary = Pick<Booklet, "id" | "workingTitle" | "lifecycle" | "currentStage" | "coverAssetId" | "updatedAt"> & {
  generationProgress: { completed: number; total: number } | null;
};

export interface BookletRepository {
  create(input: { id: string; workingTitle: string; createdAtMs: number }): Promise<Booklet>;
  list(): Promise<BookletSummary[]>;
  get(id: string): Promise<Booklet | null>;
  updateDerivedState(input: { id: string; lifecycle: BookletLifecycle; currentStage: ArtifactType; updatedAtMs: number }): Promise<void>;
}

export interface ArtifactRepository {
  getByBooklet(bookletId: string, artifactType: ArtifactType): Promise<{ id: string; state: ArtifactState } | null>;
}
