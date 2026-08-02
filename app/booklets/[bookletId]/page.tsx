import { notFound } from "next/navigation";
import { BookletNotFoundError, getBookletService } from "@/lib/application/booklet-service";
import { getArtifactService } from "@/lib/application/artifact-service";
import { selectWorkspaceArtifact, type WorkspaceSearchParameters } from "@/lib/application/workspace-selection";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export const runtime = "nodejs";

export default async function BookletWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ bookletId: string }>;
  searchParams: Promise<WorkspaceSearchParameters>;
}) {
  const { bookletId } = await params;
  const query = await searchParams;

  const snapshot = await getBookletService().getWorkspaceSnapshot(bookletId).catch((error: unknown) => {
    if (error instanceof BookletNotFoundError) notFound();
    throw error;
  });
  const selectedArtifact = selectWorkspaceArtifact(query, snapshot.booklet.currentStage);
  const artifacts = getArtifactService();
  const selectedArtifactDetail = await artifacts.get(bookletId, selectedArtifact);
  const pagePlanDetail = selectedArtifact === "page_plan" ? selectedArtifactDetail : await artifacts.get(bookletId, "page_plan");
  const pageItems = pagePlanDetail.currentVersion?.content && typeof pagePlanDetail.currentVersion.content === "object" && "pages" in pagePlanDetail.currentVersion.content
    ? (pagePlanDetail.currentVersion.content as { pages?: Array<{ pageId: string; pageIndex: number; kind: "cover" | "story" }> }).pages ?? []
    : [];
  return <WorkspaceShell snapshot={snapshot} selectedArtifact={selectedArtifact} selectedArtifactDetail={selectedArtifactDetail} pageItems={pageItems} />;
}
