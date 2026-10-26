import { validateSavedPageIllustrationPackage } from "@/lib/contracts/experiment-page-illustrations";

export type ImageCapacity = { status: "unavailable"; remainingImageCalls: number; reason: "unfinished_sources" | "unresolved_attempts" | "ambiguous_evidence" } |
  { status: "available"; remainingImageCalls: number; requiredNewImages: number; savedDraftsAwaitingApproval: number; spareImageCalls: number };
type Artifact = { taskId: string; subjectId?: string; state: string; currentVersionId: string | null;
  versions: { id: string; content: unknown; dependencyVersionIds: unknown }[] };

// An informational snapshot only. Dispatch still owns limits and original-byte
// verification. Uncertain evidence must never imply that another call is safe.
export function imageCapacity(input: { runId: string; limit: number; used: number; pageIds: string[];
  artifacts: Artifact[]; unresolved: boolean; revisionPageId?: string | null }): ImageCapacity {
  const remainingImageCalls = Math.max(0, input.limit - input.used);
  const unavailable = (reason: Extract<ImageCapacity, { status: "unavailable" }>["reason"]): ImageCapacity =>
    ({ status: "unavailable", remainingImageCalls, reason });
  try {
    if (input.unresolved) return unavailable("unresolved_attempts");
    if (!input.pageIds.length || new Set(input.pageIds).size !== input.pageIds.length) return unavailable("ambiguous_evidence");
    if (["J08", "J09", "J10"].some(task => !input.artifacts.some(a => a.taskId === task) ||
      input.artifacts.some(a => a.taskId === task && a.state !== "approved")) || input.pageIds.some(pageId =>
        input.artifacts.filter(a => a.taskId === "J12" && a.subjectId === pageId && a.state === "approved").length !== 1))
      return unavailable("unfinished_sources");
    const currentIds = new Set(input.artifacts.flatMap(a => a.currentVersionId ? [a.currentVersionId] : []));
    let requiredNewImages = 0, savedDraftsAwaitingApproval = 0;
    for (const pageId of input.pageIds) {
      const targets = input.artifacts.filter(a => a.taskId === "J13" && a.subjectId === pageId);
      if (targets.length > 1) return unavailable("ambiguous_evidence");
      const target = targets[0];
      if (!target?.currentVersionId || target.state === "needs_review") { requiredNewImages++; continue; }
      if (!["draft", "approved"].includes(target.state)) return unavailable("ambiguous_evidence");
      const versions = target.versions.filter(v => v.id === target.currentVersionId);
      if (versions.length !== 1 || !Array.isArray(versions[0].dependencyVersionIds) ||
        versions[0].dependencyVersionIds.some(id => typeof id !== "string" || !currentIds.has(id))) return unavailable("ambiguous_evidence");
      const saved = validateSavedPageIllustrationPackage(versions[0].content);
      if (saved.runId !== input.runId || saved.pageId !== pageId) return unavailable("ambiguous_evidence");
      if (pageId === input.revisionPageId) requiredNewImages++;
      else if (target.state === "draft") savedDraftsAwaitingApproval++;
    }
    return { status: "available", remainingImageCalls, requiredNewImages, savedDraftsAwaitingApproval,
      spareImageCalls: remainingImageCalls - requiredNewImages };
  } catch { return unavailable("ambiguous_evidence"); }
}
