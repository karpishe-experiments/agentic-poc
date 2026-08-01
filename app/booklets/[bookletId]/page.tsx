import { notFound } from "next/navigation";
import { BookletNotFoundError, getBookletService } from "@/lib/application/booklet-service";
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
  return <WorkspaceShell snapshot={snapshot} selectedArtifact={selectWorkspaceArtifact(query, snapshot.booklet.currentStage)} />;
}
