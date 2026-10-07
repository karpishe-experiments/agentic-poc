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
import { parsePageBibleForLayout } from "@/lib/experiment-runner/page-bible-tasks";
import { createExperimentSheetAssembly } from "@/db/experiment-sheets";
import { createExperimentStyleAssembly } from "@/db/experiment-style";
import type { AssetStore } from "@/lib/assets/asset-store";
import { validateExperimentImage } from "@/lib/experiment-runner/image-validation";
import { pageSourceRequest, withPageImageRevisions } from "@/lib/experiment-runner/page-image-requests";
import { pageImageRevisionsSchema } from "@/lib/contracts/experiment-image";
import { validateSavedPageIllustrationPackage } from "@/lib/contracts/experiment-page-illustrations";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";
import { createVerificationAttempt, type VerificationAttempt } from "@/lib/experiment-runner/verification-attempt";
import { countVerificationQuery } from "@/lib/experiment-runner/diagnostics";

type Verification = { verifyBytes?: boolean; attempt?: VerificationAttempt };

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
export async function verifyCurrentPaginationSources(database: Database, session: ClientSession, run: ExperimentRunDocument, store: AssetStore,
  verification: Verification = {}): Promise<{
  versionIds: string[]; targets: SheetTarget[]; references: Reference[]; manuscriptUnitIds: string[]; manuscriptUnits: ReturnType<typeof storedManuscriptSchema.parse>["units"];
}> {
  const attempt = verification.attempt ?? createVerificationAttempt(store);
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
  const styleId = projection.find((item) => item.taskId === "J08")!.currentVersionId!;
  await attempt.once(`style:${verification.verifyBytes !== false}:${run._id}:${styleId}`, () => createExperimentStyleAssembly({ database, store })
    .verifyVersion({ runId: run._id, versionId: styleId }, session, { ...verification, attempt }));
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
    await attempt.once(`sheet:${verification.verifyBytes !== false}:${run._id}:${version._id}`, () => createExperimentSheetAssembly({ database, store })
      .verifyVersion({ runId: run._id, versionId: version._id }, session, { ...verification, attempt }));
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
  pageId: string, store: AssetStore, verification: Verification = {}) {
  const attempt = verification.attempt ?? createVerificationAttempt(store);
  countVerificationQuery();
  // Batch independent reads, but keep commands serial on the transaction session.
  const books = await database.collections.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId,
    taskId: { $in: ["J11", "J05", "J08"] }, subjectKind: "book", subjectId: run.bookletId }, { session }).toArray();
  const bookIds = books.flatMap((artifact) => artifact.currentVersionId ? [artifact.currentVersionId] : []);
  countVerificationQuery();
  const bookVersions = await database.collections.artifact_versions.find({ _id: { $in: bookIds } }, { session }).toArray();
  countVerificationQuery();
  const bookApprovals = await database.collections.approvals.find({ experimentRunId: run._id, bookletId: run.bookletId,
    artifactVersionId: { $in: bookIds }, action: "approve", scope: "artifact" }, { session }).toArray();
  const book = (taskId: "J11" | "J05" | "J08") => {
    const rows = books.filter((artifact) => artifact.taskId === taskId);
    const artifact = rows.length === 1 ? rows[0] : null;
    if (!artifact || artifact.state !== "approved" || !artifact.currentVersionId) reject(`J12 requires current approved ${taskId}.`);
    const version = bookVersions.find((item) => item._id === artifact.currentVersionId && item.artifactId === artifact._id);
    const approval = bookApprovals.find((item) => item.artifactVersionId === artifact.currentVersionId);
    if (!version || !approval) reject(`J12 ${taskId} approval evidence is incomplete.`);
    return version;
  };
  const layoutVersion = book("J11");
  const manuscriptVersion = book("J05");
  const styleVersion = book("J08");
  const layout = parseStoredPageLayout(run.persona, JSON.parse(layoutVersion.contentJson) as unknown);
  const pages = layout.pages.filter((item) => item.pageId === pageId);
  if (pages.length !== 1) reject("J12 page is not in the current J11 layout.");
  const page = pages[0];
  const savedDependencies = JSON.parse(layoutVersion.dependencyVersionIdsJson) as unknown;
  if (!Array.isArray(savedDependencies) || savedDependencies.some((item) => typeof item !== "string") ||
      new Set(savedDependencies).size !== savedDependencies.length) reject("J11 dependencies are malformed.");
  countVerificationQuery();
  const edges = await database.collections.artifact_dependencies.find({ downstreamVersionId: layoutVersion._id }, { session }).toArray();
  const edgeIds = edges.map((edge) => edge.upstreamVersionId);
  if (edgeIds.length !== savedDependencies.length || new Set(edgeIds).size !== edgeIds.length ||
      !savedDependencies.every((item) => edgeIds.includes(item))) reject("J11 dependency edges differ from its saved sources.");
  if (!savedDependencies.includes(manuscriptVersion._id) || !savedDependencies.includes(styleVersion._id)) reject("J11 manuscript or style source changed.");
  const approvedUpstream = new Map<string, { taskId?: string; subjectKind?: string; subjectId?: string }>();
  countVerificationQuery();
  const upstreamVersions = await database.collections.artifact_versions.find({ _id: { $in: savedDependencies } }, { session }).toArray();
  countVerificationQuery();
  const upstreamArtifacts = await database.collections.artifacts.find({ _id: { $in: upstreamVersions.map((version) => version.artifactId) } }, { session }).toArray();
  countVerificationQuery();
  const upstreamApprovals = await database.collections.approvals.find({ experimentRunId: run._id, bookletId: run.bookletId,
    artifactVersionId: { $in: savedDependencies }, action: "approve", scope: "artifact" }, { session }).toArray();
  const versionsById = new Map(upstreamVersions.map((version) => [version._id, version]));
  const artifactsById = new Map(upstreamArtifacts.map((artifact) => [artifact._id, artifact]));
  const approvedIds = new Set(upstreamApprovals.map((approval) => approval.artifactVersionId));
  for (const versionId of savedDependencies) {
    const version = versionsById.get(versionId);
    const artifact = version ? artifactsById.get(version.artifactId) : null;
    if (!artifact || !approvedIds.has(versionId) || artifact.experimentRunId !== run._id || artifact.bookletId !== run.bookletId ||
        artifact.state !== "approved" || artifact.currentVersionId !== versionId) reject("J11 has a stale or unapproved source.");
    approvedUpstream.set(versionId, artifact);
  }
  await attempt.once(`style:${verification.verifyBytes !== false}:${run._id}:${styleVersion._id}`, () => createExperimentStyleAssembly({ database, store })
    .verifyVersion({ runId: run._id, versionId: styleVersion._id }, session, { ...verification, attempt }));
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
    const version = versionsById.get(ref.artifactVersionId);
    if (!version || version.createdBy !== "application") reject("J12 requires assembled sheet references.");
    const content = parseReferenceProposal(source.taskId as "J09" | "J10", "assembled", JSON.parse(version.contentJson) as unknown).content;
    if (!("build" in content) || content.build.assetId !== ref.assetId) reject("J11 page sheet asset differs from its approved version.");
    await attempt.once(`sheet:${verification.verifyBytes !== false}:${run._id}:${ref.artifactVersionId}`, () => createExperimentSheetAssembly({ database, store })
      .verifyVersion({ runId: run._id, versionId: ref.artifactVersionId }, session, { ...verification, attempt }));
  }
  return { layout, page, layoutVersionId: layoutVersion._id, manuscriptVersionId: manuscriptVersion._id,
    styleVersionId: styleVersion._id, versionIds: [layoutVersion._id, manuscriptVersion._id, styleVersion._id,
      ...ordered.map((ref) => ref.artifactVersionId)] };
}

// Run after selected-page verification in the same transaction. All Page Bibles
// must remain current and approved; only the selected image needs attachments.
export async function verifyCurrentApprovedPageBibles(database: Database, session: ClientSession,
  run: ExperimentRunDocument, sources: Pick<Awaited<ReturnType<typeof verifyCurrentPageBibleSources>>,
    "layout" | "layoutVersionId" | "manuscriptVersionId" | "styleVersionId">) {
  const rows = await database.collections.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId,
    taskId: "J12", subjectKind: "page", subjectId: { $in: sources.layout.pages.map((page) => page.pageId) } }, { session }).toArray();
  const ids = rows.flatMap((artifact) => artifact.currentVersionId ? [artifact.currentVersionId] : []);
  const versions = await database.collections.artifact_versions.find({ _id: { $in: ids } }, { session }).toArray();
  const approvals = await database.collections.approvals.find({ experimentRunId: run._id, bookletId: run.bookletId,
    artifactVersionId: { $in: ids }, action: "approve", scope: "artifact" }, { session }).toArray();
  const edges = await database.collections.artifact_dependencies.find({ downstreamVersionId: { $in: ids } }, { session }).toArray();
  for (const page of sources.layout.pages) {
    const matches = rows.filter((artifact) => artifact.subjectId === page.pageId);
    const artifact = matches.length === 1 ? matches[0] : null;
    const version = artifact?.currentVersionId ? versions.find((item) => item._id === artifact.currentVersionId && item.artifactId === artifact._id) : null;
    if (!artifact || artifact.state !== "approved" || !version ||
        !approvals.some((approval) => approval.artifactVersionId === version._id)) reject("J13 requires every current approved Page Bible.");
    const parsed = parsePageBibleForLayout({ persona: run.persona, pageId: page.pageId, layout: sources.layout,
      layoutVersionId: sources.layoutVersionId, manuscriptVersionId: sources.manuscriptVersionId,
      styleVersionId: sources.styleVersionId, proposal: JSON.parse(version.contentJson) });
    const saved = JSON.parse(version.dependencyVersionIdsJson) as unknown;
    const pageEdges = edges.filter((edge) => edge.downstreamVersionId === version._id);
    if (!Array.isArray(saved) || canonical(saved) !== canonical(parsed.dependencyVersionIds) ||
        pageEdges.length !== parsed.dependencyVersionIds.length ||
        new Set(pageEdges.map((edge) => edge.upstreamVersionId)).size !== pageEdges.length ||
        !parsed.dependencyVersionIds.every((id) => pageEdges.some((edge) => edge.upstreamVersionId === id))) {
      reject("J13 Page Bible dependencies differ from current sources.");
    }
  }
}

type StoredImageMetadata = {
  sha256: string;
  byteLength: number;
};

function imageMetadata(raw: string): StoredImageMetadata {
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; } catch { return reject("Saved sheet asset metadata is malformed."); }
  if (!parsed || typeof parsed !== "object") return reject("Saved sheet asset metadata is malformed.");
  const value = parsed as Record<string, unknown>;
  if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256) ||
      typeof value.byteLength !== "number" || !Number.isSafeInteger(value.byteLength) || value.byteLength <= 0) {
    return reject("Saved sheet asset metadata is incomplete.");
  }
  return { sha256: value.sha256, byteLength: value.byteLength };
}

// This is the final read-only admission check before a future J13 page-image
// operation. It does not claim, upload, dispatch or persist an image. Each
// invocation rechecks the selected, currently approved J12 page and only the
// sheet assets that its approved panel routing selects.
export async function verifyCurrentPageIllustrationSources(database: Database, session: ClientSession,
  run: ExperimentRunDocument, pageId: string, store: AssetStore, verification: Verification = {}) {
  const attempt = verification.attempt ?? createVerificationAttempt(store);
  const sources = await verifyCurrentPageBibleSources(database, session, run, pageId, store, { ...verification, attempt });
  const rows = await database.collections.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId,
    taskId: "J12", subjectKind: "page", subjectId: pageId }, { session }).toArray();
  const artifact = rows.length === 1 ? rows[0] : null;
  if (!artifact || artifact.state !== "approved" || !artifact.currentVersionId) reject("J13 requires the current approved J12 page.");
  const version = await database.collections.artifact_versions.findOne({ _id: artifact.currentVersionId, artifactId: artifact._id }, { session });
  const approval = await database.collections.approvals.findOne({ experimentRunId: run._id, bookletId: run.bookletId,
    artifactVersionId: artifact.currentVersionId, action: "approve", scope: "artifact" }, { session });
  if (!version || !approval) reject("J13 J12 approval evidence is incomplete.");

  const pageBible = JSON.parse(version.contentJson) as unknown;
  let parsed: ReturnType<typeof parsePageBibleForLayout>;
  try {
    parsed = parsePageBibleForLayout({ persona: run.persona, pageId, layout: sources.layout,
      layoutVersionId: sources.layoutVersionId, manuscriptVersionId: sources.manuscriptVersionId,
      styleVersionId: sources.styleVersionId, proposal: pageBible });
  } catch { return reject("J12 page content does not match its current sources."); }
  const dependencies = JSON.parse(version.dependencyVersionIdsJson) as unknown;
  if (!Array.isArray(dependencies) || dependencies.some((item) => typeof item !== "string") ||
      canonical(dependencies) !== canonical(parsed.dependencyVersionIds)) reject("J12 dependencies differ from its selected sources.");
  const edges = await database.collections.artifact_dependencies.find({ downstreamVersionId: version._id }, { session }).toArray();
  if (edges.length !== parsed.dependencyVersionIds.length || new Set(edges.map((edge) => edge.upstreamVersionId)).size !== edges.length ||
      !parsed.dependencyVersionIds.every((id) => edges.some((edge) => edge.upstreamVersionId === id))) {
    reject("J12 dependency edges differ from its selected sources.");
  }
  const style = await database.collections.artifact_versions.findOne({ _id: sources.styleVersionId }, { session });
  if (!style) reject("J13 approved style source is missing.");
  const request = pageSourceRequest({ persona: run.persona, pageId, layout: sources.layout,
    layoutVersionId: sources.layoutVersionId, manuscriptVersionId: sources.manuscriptVersionId,
    styleVersionId: sources.styleVersionId, pageBibleVersionId: version._id, pageBible,
    approvedVisualStyle: JSON.parse(style.contentJson) as unknown });
  const baseRequest = request.request;

  const illustrations = await database.collections.artifacts.find({ experimentRunId: run._id, bookletId: run.bookletId,
    taskId: "J13", subjectKind: "page", subjectId: pageId }, { session }).toArray();
  if (illustrations.length > 1) reject("J13 page image target is ambiguous.");
  const illustration = illustrations[0];
  const currentImage = illustration?.currentVersionId ? await database.collections.artifact_versions.findOne({
    _id: illustration.currentVersionId, artifactId: illustration._id }, { session }) : null;
  if (illustration?.currentVersionId && !currentImage) reject("J13 current image version is missing.");
  const packageContent = currentImage ? validateSavedPageIllustrationPackage(JSON.parse(currentImage.contentJson)) : null;
  if (packageContent && (packageContent.runId !== run._id || packageContent.pageId !== pageId)) reject("J13 current package belongs to another page.");
  // A changed upstream source invalidates the old image request. Feedback for
  // unchanged sources remains explicit, cumulative and linked to tester decisions.
  const revisions = packageContent && canonical(packageContent.sourceVersionIds) === canonical(request.request.sourceVersionIds)
    ? [...packageContent.request.revisions ?? []] : [];
  const pending = run.pendingDecisionJson ? JSON.parse(run.pendingDecisionJson) as Record<string, unknown> : null;
  if (pending?.kind === "revision" && pending.taskId === "J13" && pending.subjectKind === "page" && pending.subjectId === pageId) {
    if (!currentImage || pending.artifactVersionId !== currentImage._id || typeof pending.decisionId !== "string") reject("J13 pending revision target is not current.");
    if (!revisions.some((revision) => revision.decisionId === pending.decisionId)) {
      revisions.push({ decisionId: pending.decisionId, previousPageVersionId: currentImage._id, instruction: String(pending.instruction ?? "") });
    }
  }
  if (revisions.length) {
    const checked = pageImageRevisionsSchema.parse(revisions);
    const testerBinding = savedConfigurationSchema.parse(JSON.parse(run.configurationJson)).find((binding) => binding.role === "tester");
    for (const [index, revision] of checked.entries()) {
      const decision = await database.collections.experiment_operations.findOne({ _id: revision.decisionId, runId: run._id,
        role: "tester", state: "succeeded", reservationCount: 1 }, { session });
      const result = decision?.resultJson ? JSON.parse(decision.resultJson) as { kind?: string; payload?: { decision?: {
        action?: string; taskId?: string; artifactVersionId?: string; instruction?: string } } } : null;
      const action = result?.payload?.decision;
      const previous = illustration ? await database.collections.artifact_versions.findOne({ _id: revision.previousPageVersionId,
        artifactId: illustration._id, createdBy: "application" }, { session }) : null;
      const prior = previous ? validateSavedPageIllustrationPackage(JSON.parse(previous.contentJson)) : null;
      if (!decision || !testerBinding || !decision.workflowRunId || decision.verifiedWorkflowId !== testerBinding.publishedWorkflowId ||
          result?.kind !== "decision" || action?.action !== "revise" || action.taskId !== "J13" ||
          action.artifactVersionId !== revision.previousPageVersionId || action.instruction !== revision.instruction ||
          !prior || prior.runId !== run._id || prior.pageId !== pageId || canonical(prior.sourceVersionIds) !== canonical(request.request.sourceVersionIds) ||
          canonical(prior.request.revisions ?? []) !== canonical(checked.slice(0, index))) reject("J13 revision decision or version ancestry is invalid.");
    }
    request.request = withPageImageRevisions(request.request, checked);
  }

  const warnings: string[] = [];
  const attachments = [] as Array<{
    panelKey: string;
    subjectKind: "character" | "location";
    subjectId: string;
    artifactVersionId: string;
    assetId: string;
    bytes: Uint8Array;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
    byteLength: number;
    sha256: string;
    width: number;
    height: number;
  }>;
  countVerificationQuery();
  const assets = await database.collections.assets.find({ _id: { $in: request.references.map((reference) => reference.assetId) },
    bookletId: run.bookletId }, { session }).toArray();
  for (const reference of request.references) {
    const asset = assets.find((item) => item._id === reference.assetId);
    if (!asset) reject("J13 selected sheet asset is missing.");
    if (!asset.metadataJson) reject("Saved sheet asset metadata is missing.");
    const metadata = imageMetadata(asset.metadataJson);
    // Fixture creation needs current lineage, not reference bytes. Admission
    // and final acceptance always use the default complete byte verification.
    if (verification.verifyBytes === false) continue;
    let bytes: Uint8Array;
    try { bytes = await attempt.read({ ...metadata, assetId: asset._id, uri: asset.uri }); } catch { return reject("J13 selected sheet bytes are unavailable."); }
    let decoded: Awaited<ReturnType<typeof validateExperimentImage>>;
    try { decoded = await validateExperimentImage(bytes); } catch { return reject("J13 selected sheet bytes are corrupt."); }
    if (metadata.byteLength !== decoded.byteLength || metadata.sha256 !== decoded.sha256 ||
        asset.width !== decoded.width || asset.height !== decoded.height) reject("J13 selected sheet evidence differs from original bytes.");
    if (asset.mimeType !== decoded.mimeType) warnings.push(`Selected sheet ${asset._id} metadata MIME ${asset.mimeType} differs from decoded ${decoded.mimeType}.`);
    attachments.push({ ...reference, bytes: Uint8Array.from(bytes), mimeType: decoded.mimeType, byteLength: decoded.byteLength,
      sha256: decoded.sha256, width: decoded.width, height: decoded.height });
  }
  return { ...sources, pageBibleVersionId: version._id, pageBible, baseRequest, request, attachments, warnings };
}
