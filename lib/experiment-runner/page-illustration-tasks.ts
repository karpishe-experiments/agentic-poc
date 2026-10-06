import { savedConfigurationSchema } from "@/lib/experiment-runner/config";
import { CASES, type Persona } from "@/lib/contracts/experiment-runner";
import { validateSavedPageIllustrationPackage } from "@/lib/contracts/experiment-page-illustrations";
import { opaqueIdSchema } from "@/lib/contracts/common";

// Eligibility only. Admission must still verify current approvals, bytes,
// manager selection and the published runtime binding.
export function configuredPageIllustrationTask(configurationJson: string): boolean {
  let value: unknown;
  try { value = JSON.parse(configurationJson) as unknown; } catch { return false; }
  const parsed = savedConfigurationSchema.safeParse(value);
  return parsed.success && parsed.data.some((item) => item.role === "image" &&
    item.taskId === null && item.finalPageIllustration === true);
}

type ApprovedPage = { pageId: string; pageIndex: number; pageBibleVersionId: string; sourceVersionIds: string[] };
type PageArtifact = { taskId?: string; subjectKind?: string; subjectId?: string | null; state: string; currentVersionId: string | null;
  versions: { id: string; content: unknown; dependencyVersionIds: unknown; approval: unknown }[] };
export type PageIllustrationWork = { kind: "image" | "review"; taskId: "J13"; subjectKind: "page";
  subjectId: string; pageIndex: number; sourceVersionIds: string[]; currentVersionId: string | null } | { kind: "complete" };

// Planning projection only: the caller supplies all currently approved J12
// pages. Admission and approval must independently verify current stored bytes.
export function nextPageIllustrationWork(input: {
  runId: string; persona: Persona; configurationJson: string; pages: ApprovedPage[]; artifacts: PageArtifact[];
  revision?: { pageId: string; artifactVersionId: string } | null;
  selectedPageIds?: string[];
}): PageIllustrationWork | null {
  if (!configuredPageIllustrationTask(input.configurationJson) || !opaqueIdSchema.safeParse(input.runId).success) return null;
  const pages = [...input.pages].sort((a, b) => a.pageIndex - b.pageIndex);
  if (pages.length !== CASES[input.persona].storyPages + 1 || new Set(pages.map((page) => page.pageId)).size !== pages.length ||
      new Set(pages.map((page) => page.pageBibleVersionId)).size !== pages.length ||
      pages.some((page, index) => page.pageIndex !== index || !opaqueIdSchema.safeParse(page.pageId).success ||
        !opaqueIdSchema.safeParse(page.pageBibleVersionId).success || page.sourceVersionIds[0] !== page.pageBibleVersionId ||
        new Set(page.sourceVersionIds).size !== page.sourceVersionIds.length ||
        page.sourceVersionIds.some((id) => !opaqueIdSchema.safeParse(id).success))) return null;
  const artifacts = input.artifacts.filter((item) => item.taskId === "J13" && item.subjectKind === "page");
  if (artifacts.some((artifact) => !pages.some((page) => page.pageId === artifact.subjectId)) ||
      new Set(artifacts.map((artifact) => artifact.subjectId)).size !== artifacts.length) return null;
  if (input.revision && !pages.some((page) => page.pageId === input.revision!.pageId)) return null;
  const selection = input.selectedPageIds ?? [];
  if (new Set(selection).size !== selection.length ||
      selection.some((id) => !pages.some((page) => page.pageId === id))) return null;
  // A selection changes dispatch/review order, not the required full-booklet set.
  const orderedPages = [...selection.map((id) => pages.find((page) => page.pageId === id)!),
    ...pages.filter((page) => !selection.includes(page.pageId))];
  for (const page of orderedPages) {
    if (input.revision && input.revision.pageId !== page.pageId) continue;
    const artifact = artifacts.find((item) => item.subjectId === page.pageId);
    const work = (kind: "image" | "review"): PageIllustrationWork => ({ kind, taskId: "J13", subjectKind: "page",
      subjectId: page.pageId, pageIndex: page.pageIndex, sourceVersionIds: [...page.sourceVersionIds], currentVersionId: artifact?.currentVersionId ?? null });
    if (input.revision) {
      if (!artifact || artifact.currentVersionId !== input.revision.artifactVersionId ||
          !["draft", "needs_review"].includes(artifact.state)) return null;
      return work("image");
    }
    if (!artifact || artifact.state === "needs_review") return work("image");
    const matches = artifact.versions.filter((version) => version.id === artifact.currentVersionId);
    if (matches.length !== 1 || !artifact.currentVersionId) return null;
    const version = matches[0]!;
    try {
      const content = validateSavedPageIllustrationPackage(version.content);
      if (content.runId !== input.runId || content.pageId !== page.pageId || content.pageIndex !== page.pageIndex ||
          content.pageBibleVersionId !== page.pageBibleVersionId || JSON.stringify(content.sourceVersionIds) !== JSON.stringify(page.sourceVersionIds) ||
          JSON.stringify(version.dependencyVersionIds) !== JSON.stringify(page.sourceVersionIds)) return null;
    } catch { return null; }
    if (artifact.state === "draft") return work("review");
    if (artifact.state !== "approved" || !version.approval) return null;
  }
  return input.revision ? null : { kind: "complete" };
}
