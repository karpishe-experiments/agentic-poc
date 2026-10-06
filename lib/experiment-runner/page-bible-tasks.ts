import { opaqueIdSchema } from "@/lib/contracts/common";
import type { Persona } from "@/lib/contracts/experiment-runner";
import { parsePageProposal, parseStoredPageLayout, type PageSubjectProposal, type PageWarning } from "@/lib/contracts/experiment-pages";
import { configuredPaginationTask } from "@/lib/experiment-runner/pagination-tasks";

// Eligibility only. Repository admission still verifies current source records and bytes.
export function configuredPageBibleTask(configurationJson: string): boolean {
  if (!configuredPaginationTask(configurationJson)) return false;
  let entries: unknown;
  try { entries = JSON.parse(configurationJson); } catch { return false; }
  if (!Array.isArray(entries) || ![15, 16, 17, 18].includes(entries.length)) return false;
  return entries.filter((entry) => entry && typeof entry === "object" &&
    (entry as Record<string, unknown>).role === "specialist" && (entry as Record<string, unknown>).taskId === "J12").length === 1;
}

type Input = {
  persona: Persona;
  pageId: string;
  layout: unknown;
  layoutVersionId: string;
  manuscriptVersionId: string;
  styleVersionId: string;
  proposal: unknown;
};

function sameMembers(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function referenceKey(reference: { subjectKind: string; subjectId: string; artifactVersionId: string; assetId: string }): string {
  return JSON.stringify([reference.subjectKind, reference.subjectId, reference.artifactVersionId, reference.assetId]);
}

// This pure check binds a J12 proposal to one application-owned J11 page.
// Transactional admission must separately verify current approvals, assembly
// lineage and original asset bytes; this function cannot establish those facts.
export function parsePageBibleForLayout(input: Input): {
  content: PageSubjectProposal;
  warnings: PageWarning[];
  dependencyVersionIds: string[];
} {
  const layout = parseStoredPageLayout(input.persona, input.layout);
  const pageId = opaqueIdSchema.parse(input.pageId);
  const layoutVersionId = opaqueIdSchema.parse(input.layoutVersionId);
  const manuscriptVersionId = opaqueIdSchema.parse(input.manuscriptVersionId);
  const styleVersionId = opaqueIdSchema.parse(input.styleVersionId);
  const pages = layout.pages.filter((page) => page.pageId === pageId);
  if (pages.length !== 1) throw new Error("J12 page is not in the saved J11 layout.");
  const page = pages[0];
  const { content, warnings } = parsePageProposal("J12", input.persona, input.proposal);
  if (content.pageId !== pageId || content.pageIndex !== page.pageIndex) throw new Error("J12 page identity does not match J11.");
  if (content.layoutVersionId !== layoutVersionId || content.manuscriptVersionId !== manuscriptVersionId || content.styleVersionId !== styleVersionId) {
    throw new Error("J12 source versions do not match the expected versions.");
  }
  if (content.panels.length !== page.panels.length || content.panels.some((panel, index) => panel.panelKey !== page.panels[index].panelKey)) {
    throw new Error("J12 panel order does not match J11.");
  }
  for (let index = 0; index < page.panels.length; index++) {
    const expected = page.panels[index];
    const actual = content.panels[index];
    if (!sameMembers(actual.manuscriptUnitIds, expected.manuscriptUnitIds)) throw new Error("J12 manuscript routing differs from J11.");
    if (!sameMembers(actual.sheetReferences.map(referenceKey), expected.sheetReferences.map(referenceKey))) {
      throw new Error("J12 sheet routing differs from J11.");
    }
  }
  const dependencyVersionIds = [...new Set([
    layoutVersionId, manuscriptVersionId, styleVersionId,
    ...page.panels.flatMap((panel) => panel.sheetReferences)
      .sort((a, b) => (a.subjectKind === "character" ? "J09" : "J10").localeCompare(b.subjectKind === "character" ? "J09" : "J10") ||
        a.subjectId.localeCompare(b.subjectId))
      .map((reference) => reference.artifactVersionId),
  ])];
  return { content, warnings, dependencyVersionIds };
}
