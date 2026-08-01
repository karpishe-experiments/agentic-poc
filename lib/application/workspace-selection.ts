import { artifactTypeSchema, type ArtifactType } from "@/lib/contracts/domain";

export type WorkspaceSearchParameters = { artifact?: string | string[]; page?: string | string[] };

export function selectWorkspaceArtifact(searchParams: WorkspaceSearchParameters, fallback: ArtifactType): ArtifactType {
  const candidate = Array.isArray(searchParams.artifact) ? searchParams.artifact[0] : searchParams.artifact;
  return artifactTypeSchema.safeParse(candidate).data ?? fallback;
}
