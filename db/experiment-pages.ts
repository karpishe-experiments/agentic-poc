import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";
import type { Database } from "@/db/client";
import type { ExperimentRunDocument } from "@/db/documents";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { storedManuscriptSchema, type Persona } from "@/lib/contracts/experiment-runner";
import { parsePageProposal, parseStoredPageLayout, type StoredPageLayout } from "@/lib/contracts/experiment-pages";
import { parseReferenceProposal } from "@/lib/contracts/experiment-references";
import { referenceSheetTargets, type SheetTarget } from "@/lib/experiment-runner/reference-targets";
import { currentPaginationSourceIds, type PaginationSource } from "@/lib/experiment-runner/pagination-tasks";
import { createExperimentSheetAssembly } from "@/db/experiment-sheets";
import { createExperimentStyleAssembly } from "@/db/experiment-style";
import type { AssetStore } from "@/lib/assets/asset-store";

// Pure preparation for the existing completion transaction. The application
// allocates page identities; a specialist's supplied pageId is discarded by
// the proposal parser. No artifact, approval or page row is written here.
export function materializePageLayout(
  persona: Persona, proposal: unknown, previous: unknown | null, allocateId: () => string = randomUUID,
): StoredPageLayout {
  const content = parsePageProposal("J11", persona, proposal).content;
  const prior = previous === null ? null : parseStoredPageLayout(persona, previous);
  const previousIds = new Map(prior?.pages.map((page) => [page.pageIndex, page.pageId]));
  const pages = content.pages.map((page) => ({ ...page, pageId: previousIds.get(page.pageIndex) ?? allocateId() }));
  return parseStoredPageLayout(persona, { ...content, pages });
}

const fixedTasks = ["J01", "J02", "J05", "J06", "J07", "J08"] as const;
type Reference = { subjectKind: "character" | "location"; subjectId: string; artifactVersionId: string; assetId: string };
function reject(message: string): never { throw new ExperimentRepositoryError("invalid_result", message); }
function canonical(value: unknown): string { return JSON.stringify(value, (_key, item: unknown) =>
  item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item); }

// Called inside each J11 admission, completion and approval transaction. This
// read validates current identities and approval records. Sheet verification
// also checks assembly lineage and reads original bytes without a new claim.
export async function verifyCurrentPaginationSources(database: Database, session: ClientSession, run: ExperimentRunDocument, store: AssetStore): Promise<{
  versionIds: string[]; targets: SheetTarget[]; references: Reference[]; manuscriptUnitIds: string[]; manuscriptUnits: ReturnType<typeof storedManuscriptSchema.parse>["units"];
}> {
  const projection: PaginationSource[] = [];
  const contents = new Map<string, unknown>();
  for (const taskId of fixedTasks) {
    const rows = await database.collections.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId,
      taskId, subjectKind: "book", subjectId: run.bookletId }, { session }).toArray();
    const artifact = rows.length === 1 ? rows[0] : null;
    if (!artifact || artifact.state !== "approved" || !artifact.currentVersionId) reject(`J11 requires approved ${taskId}.`);
    const version = await database.collections.artifact_versions.findOne({ _id: artifact.currentVersionId, artifactId: artifact._id }, { session });
    const approval = await database.collections.approvals.findOne({ experimentRunId: run._id, bookletId: run.bookletId,
      artifactVersionId: artifact.currentVersionId, action: "approve", scope: "artifact" }, { session });
    if (!version || !approval) reject(`J11 ${taskId} approval evidence is incomplete.`);
    projection.push({ bookletId: run.bookletId, runId: run._id, taskId, subjectKind: "book", subjectId: run.bookletId,
      state: artifact.state, currentVersionId: version._id });
    contents.set(taskId, JSON.parse(version.contentJson) as unknown);
  }
  await createExperimentStyleAssembly({ database, store }).verifyVersion({ runId: run._id,
    versionId: projection.find((item) => item.taskId === "J08")!.currentVersionId! }, session);
  const source = (taskId: "J06" | "J07" | "J08") => ({ versionId: projection.find((item) => item.taskId === taskId)!.currentVersionId!, content: contents.get(taskId) });
  const targets = referenceSheetTargets({ characters: source("J06"), locations: source("J07"), style: source("J08") });
  const references: Reference[] = [];
  for (const target of targets) {
    const rows = await database.collections.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId,
      taskId: target.taskId, subjectKind: target.subjectKind, subjectId: target.subjectId }, { session }).toArray();
    const artifact = rows.length === 1 ? rows[0] : null;
    if (!artifact || artifact.state !== "approved" || !artifact.currentVersionId) reject("J11 requires every approved reference sheet.");
    const version = await database.collections.artifact_versions.findOne({ _id: artifact.currentVersionId, artifactId: artifact._id }, { session });
    const approval = await database.collections.approvals.findOne({ experimentRunId: run._id, bookletId: run.bookletId,
      artifactVersionId: artifact.currentVersionId, action: "approve", scope: "artifact" }, { session });
    if (!version || !approval || version.createdBy !== "application") reject("J11 sheet approval evidence is incomplete.");
    await createExperimentSheetAssembly({ database, store }).verifyVersion({ runId: run._id, versionId: version._id }, session);
    const content = parseReferenceProposal(target.taskId, "assembled", JSON.parse(version.contentJson)).content;
    if (!("build" in content)) reject("J11 sheet image is missing.");
    projection.push({ bookletId: run.bookletId, runId: run._id, taskId: target.taskId, subjectKind: target.subjectKind,
      subjectId: target.subjectId, state: artifact.state, currentVersionId: version._id,
      sourceVersionIds: JSON.parse(version.dependencyVersionIdsJson).slice(1) as string[] });
    references.push({ subjectKind: target.subjectKind, subjectId: target.subjectId, artifactVersionId: version._id, assetId: content.build.assetId });
  }
  const versionIds = currentPaginationSourceIds(run.bookletId, run._id, targets, projection);
  if (!versionIds) reject("J11 sources are missing, ambiguous or stale.");
  const manuscriptUnits = storedManuscriptSchema.parse(contents.get("J05")).units;
  return { versionIds, targets, references, manuscriptUnitIds: manuscriptUnits.map((unit) => unit.unitId), manuscriptUnits };
}

export function validatePaginationRouting(layout: StoredPageLayout, sources: Awaited<ReturnType<typeof verifyCurrentPaginationSources>>): void {
  const seenStory = new Set<string>();
  const units = new Set(sources.manuscriptUnitIds);
  const refs = new Map(sources.references.map((ref) => [`${ref.subjectKind}:${ref.subjectId}`, ref]));
  for (const page of layout.pages) for (const panel of page.panels) {
    for (const unitId of panel.manuscriptUnitIds) {
      if (!units.has(unitId)) reject("J11 routes an unknown manuscript unit.");
      if (page.pageIndex > 0) seenStory.add(unitId);
    }
    for (const ref of panel.sheetReferences) {
      if (canonical(ref) !== canonical(refs.get(`${ref.subjectKind}:${ref.subjectId}`))) reject("J11 panel uses an unknown or stale sheet reference.");
    }
  }
  if (seenStory.size !== units.size) reject("J11 story pages must cover every manuscript unit.");
}

// J12 reads only the selected page's sheet bytes. J11's full source set is
// checked through saved identities, approvals and dependency edges.
export async function verifyCurrentPageBibleSources(database: Database, session: ClientSession, run: ExperimentRunDocument,
  pageId: string, store: AssetStore) {
  const book = async (taskId: "J11" | "J05" | "J08") => {
    const rows = await database.collections.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId,
      taskId, subjectKind: "book", subjectId: run.bookletId }, { session }).toArray();
    const artifact = rows.length === 1 ? rows[0] : null;
    if (!artifact || artifact.state !== "approved" || !artifact.currentVersionId) reject(`J12 requires current approved ${taskId}.`);
    const version = await database.collections.artifact_versions.findOne({ _id: artifact.currentVersionId, artifactId: artifact._id }, { session });
    const approval = await database.collections.approvals.findOne({ experimentRunId: run._id, bookletId: run.bookletId,
      artifactVersionId: artifact.currentVersionId, action: "approve", scope: "artifact" }, { session });
    if (!version || !approval) reject(`J12 ${taskId} approval evidence is incomplete.`);
    return version;
  };
  // MongoDB transactions do not support parallel operations on one session.
  const layoutVersion = await book("J11");
  const manuscriptVersion = await book("J05");
  const styleVersion = await book("J08");
  const layout = parseStoredPageLayout(run.persona, JSON.parse(layoutVersion.contentJson) as unknown);
  const pages = layout.pages.filter((item) => item.pageId === pageId);
  if (pages.length !== 1) reject("J12 page is not in the current J11 layout.");
  const page = pages[0];
  const savedDependencies = JSON.parse(layoutVersion.dependencyVersionIdsJson) as unknown;
  if (!Array.isArray(savedDependencies) || savedDependencies.some((item) => typeof item !== "string") ||
      new Set(savedDependencies).size !== savedDependencies.length) reject("J11 dependencies are malformed.");
  const edges = await database.collections.artifact_dependencies.find({ downstreamVersionId: layoutVersion._id }, { session }).toArray();
  const edgeIds = edges.map((edge) => edge.upstreamVersionId);
  if (edgeIds.length !== savedDependencies.length || new Set(edgeIds).size !== edgeIds.length ||
      !savedDependencies.every((item) => edgeIds.includes(item))) reject("J11 dependency edges differ from its saved sources.");
  if (!savedDependencies.includes(manuscriptVersion._id) || !savedDependencies.includes(styleVersion._id)) reject("J11 manuscript or style source changed.");
  const approvedUpstream = new Map<string, { taskId?: string; subjectKind?: string; subjectId?: string }>();
  for (const versionId of savedDependencies) {
    const version = await database.collections.artifact_versions.findOne({ _id: versionId }, { session });
    const artifact = version ? await database.collections.artifacts.findOne({ _id: version.artifactId }, { session }) : null;
    const approval = await database.collections.approvals.findOne({ experimentRunId: run._id, bookletId: run.bookletId,
      artifactVersionId: versionId, action: "approve", scope: "artifact" }, { session });
    if (!artifact || !approval || artifact.experimentRunId !== run._id || artifact.bookletId !== run.bookletId ||
        artifact.state !== "approved" || artifact.currentVersionId !== versionId) reject("J11 has a stale or unapproved source.");
    approvedUpstream.set(versionId, artifact);
  }
  await createExperimentStyleAssembly({ database, store }).verifyVersion({ runId: run._id, versionId: styleVersion._id }, session);
  const references = new Map<string, Reference>();
  for (const panel of page.panels) for (const ref of panel.sheetReferences) {
    const key = `${ref.subjectKind}:${ref.subjectId}`;
    const prior = references.get(key);
    if (prior && canonical(prior) !== canonical(ref)) reject("J11 page has conflicting same-subject sheet references.");
    references.set(key, ref);
  }
  const ordered = [...references.values()].sort((a, b) =>
    (a.subjectKind === "character" ? "J09" : "J10").localeCompare(b.subjectKind === "character" ? "J09" : "J10") ||
    a.subjectId.localeCompare(b.subjectId));
  for (const ref of ordered) {
    const source = approvedUpstream.get(ref.artifactVersionId);
    if (!source || source.taskId !== (ref.subjectKind === "character" ? "J09" : "J10") ||
        source.subjectKind !== ref.subjectKind || source.subjectId !== ref.subjectId) reject("J11 page sheet reference is not an approved dependency.");
    const version = await database.collections.artifact_versions.findOne({ _id: ref.artifactVersionId }, { session });
    if (!version || version.createdBy !== "application") reject("J12 requires assembled sheet references.");
    const content = parseReferenceProposal(source.taskId as "J09" | "J10", "assembled", JSON.parse(version.contentJson) as unknown).content;
    if (!("build" in content) || content.build.assetId !== ref.assetId) reject("J11 page sheet asset differs from its approved version.");
    await createExperimentSheetAssembly({ database, store }).verifyVersion({ runId: run._id, versionId: ref.artifactVersionId }, session);
  }
  return { layout, page, layoutVersionId: layoutVersion._id, manuscriptVersionId: manuscriptVersion._id,
    styleVersionId: styleVersion._id, versionIds: [layoutVersion._id, manuscriptVersion._id, styleVersion._id,
      ...ordered.map((ref) => ref.artifactVersionId)] };
}
