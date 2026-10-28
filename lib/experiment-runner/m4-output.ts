import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { finalCharacterListSchema, finalLocationListSchema, roleResultSchema, type RoleResult } from "@/lib/contracts/experiment-runner";
import { parseReferenceProposal, styleModuleHash } from "@/lib/contracts/experiment-references";
import { pageLayoutProposalSchema, pageSubjectProposalSchema, storedPageLayoutSchema } from "@/lib/contracts/experiment-pages";
import { experimentReportSchema, type ExperimentReport } from "@/lib/contracts/experiment-reports";
import { M4_LAYOUT_CONTRACT, m4ModelOutputSchema, type M4RequestSelector } from "@/lib/experiment-runner/m4-request";
import { executionAllowanceRequestSchema } from "@/lib/contracts/experiment-runner";

import { m4LayoutCatalog } from "@/lib/experiment-runner/m4-layout";

const source = z.object({ id: opaqueIdSchema, taskId: z.string(), content: z.unknown(), subjectKind: z.string().optional(), subjectId: opaqueIdSchema.optional() });
const specialistContext = z.object({ role: z.literal("specialist"), subjectId: opaqueIdSchema, approvedSources: z.array(source) });
const unavailableCost: ExperimentReport["costEvidence"] = { status: "unavailable", actualUsd: null, estimatedUsd: null,
  explanation: "Attributable campaign cost is supplied by the saved ledger. This text-only assessment does not establish invoice charges." };

// This helper consumes the SERVER-SAVED prepared context, never model-supplied
// identity fields. Its output must still pass normal completion/currentness
// validation. It neither completes an operation nor releases a reservation.
export class M4CreativeOutputError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "M4 creative output is invalid.", { cause });
    this.name = "M4CreativeOutputError";
  }
}

export function parseM4CreativeOutput(selector: M4RequestSelector, content: string, savedContextJson: string,
  costEvidence: ExperimentReport["costEvidence"] = unavailableCost, execution = false,
  inspectedAssetIds: string[] = []): RoleResult {
  let parsed: {
    result?: { kind: string; payload: { taskId?: string; content?: unknown } }; report?: Record<string, unknown>;
  };
  // The saved preparation chooses compatibility. Model bytes cannot select a
  // legacy parser or change the mapping used by this operation.
  const context = JSON.parse(savedContextJson) as Record<string, unknown>;
  const layoutSubjects = selector.role === "specialist" && selector.taskId === "J11" && context.layoutContract !== undefined;
  if (layoutSubjects && context.layoutContract !== M4_LAYOUT_CONTRACT) throw new Error("Unknown saved M4 layout contract.");
  // Only validation of model-supplied bytes can prove malformed creative output.
  // Saved context, attribution and hydration failures remain separate blockers.
  try {
    if (Buffer.byteLength(content, "utf8") > 2 * 1024 * 1024) throw new Error("M4 model output exceeds its parsing bound.");
    const schema = execution && selector.role === "tester" && !selector.report
      ? z.strictObject({ result: z.union([roleResultSchema.options.find(option => option.shape.kind.value === "decision")!, executionAllowanceRequestSchema]) })
      : selector.report && execution && context.reportEvidence &&
          (context.reportEvidence as Record<string, unknown>).mode === "real" && inspectedAssetIds.length > 0
        ? z.strictObject({ report: experimentReportSchema.pick({ summary: true, intent: true,
          consistency: true, interaction: true, findings: true }) })
        : m4ModelOutputSchema(selector, layoutSubjects);
    parsed = schema.parse(JSON.parse(content)) as typeof parsed;
  } catch (error) { throw new M4CreativeOutputError(error); }
  if (selector.report) {
    const evidence = z.object({ role: z.enum(["tester", "judge"]), mode: z.enum(["balanced", "real"]), runId: opaqueIdSchema,
      configurationHash: z.string().regex(/^[a-f0-9]{64}$/), versionIds: z.array(opaqueIdSchema) }).parse(context.reportEvidence);
    if (evidence.role !== selector.role) throw new Error("M4 report role differs from its saved context.");
    const report = experimentReportSchema.parse({ ...parsed.report, schemaVersion: "2", role: evidence.role, mode: evidence.mode,
      runId: evidence.runId, configurationHash: evidence.configurationHash, costEvidence,
      evidence: { versionIds: evidence.versionIds, inspectedAssetIds: evidence.mode === "real" ? inspectedAssetIds : [] } });
    return roleResultSchema.parse({ kind: selector.role === "judge" ? "assessment" : "feedback", payload: report });
  }
  const result = parsed.result!;
  if (selector.role !== "specialist" || result.kind !== "proposal") return roleResultSchema.parse(result);
  const saved = specialistContext.parse(context);
  const select = (taskId: string) => {
    const matches = saved.approvedSources.filter((row) => row.taskId === taskId);
    if (matches.length !== 1) throw new Error(`M4 prepared source ${taskId} is missing or ambiguous.`);
    return matches[0];
  };
  const creative = result.payload.content as Record<string, unknown>;
  let hydrated: unknown = creative;
  if (selector.taskId === "J08") {
    hydrated = parseReferenceProposal("J08", "proposal", { ...creative,
      stylePromptModuleHash: styleModuleHash(z.string().parse(creative.stylePromptModule)) }).content;
  } else if (selector.taskId === "J09" || selector.taskId === "J10") {
    const final = select(selector.taskId === "J09" ? "J06" : "J07"); const styleSource = select("J08");
    const style = context.evidenceProjection === "current_creative_v2"
      ? z.object({ stylePromptModule: z.string().min(1), stylePromptModuleHash: z.string().regex(/^[a-f0-9]{64}$/) }).parse(styleSource.content)
      : parseReferenceProposal("J08", "assembled", styleSource.content).content;
    const common = { ...creative, finalListVersionId: final.id, styleVersionId: styleSource.id,
      stylePromptModule: style.stylePromptModule, stylePromptModuleHash: style.stylePromptModuleHash };
    if (selector.taskId === "J09") {
      const subject = finalCharacterListSchema.parse(final.content).characters.find((row) => row.characterId === saved.subjectId);
      if (!subject?.sheetRequired || subject.recurrence !== "recurring") throw new Error("M4 prepared character is not eligible for a sheet.");
      hydrated = parseReferenceProposal("J09", "proposal", { ...common, characterId: subject.characterId,
        attireRequirements: subject.attireRequirements, accessories: subject.accessories,
        requiredViews: ["front", "back", "side", "neutral_facial"] }).content;
    } else {
      const subject = finalLocationListSchema.parse(final.content).locations.find((row) => row.locationId === saved.subjectId);
      if (!subject?.sheetRequired) throw new Error("M4 prepared location is not eligible for a sheet.");
      hydrated = parseReferenceProposal("J10", "proposal", { ...common, locationId: subject.locationId,
        stableAnchors: subject.stableAnchors, requiredFeatures: subject.requiredFeatures }).content;
    }
  } else if (selector.taskId === "J11" && layoutSubjects) {
    const catalog = m4LayoutCatalog(saved.approvedSources, context.evidenceProjection === "current_creative_v2");
    const pages = creative.pages as Array<{ panels: Array<{ sheetSubjects: Array<{ subjectKind: string; subjectId: string }> }> }>;
    hydrated = pageLayoutProposalSchema.parse({ ...creative, pages: pages.map(page => ({ ...page, panels: page.panels.map(panel => {
      const { sheetSubjects, ...rest } = panel;
      return { ...rest, sheetReferences: sheetSubjects.map(subject => {
        const reference = catalog.get(`${subject.subjectKind}:${subject.subjectId}`);
        if (!reference) throw new M4CreativeOutputError(new Error("Selected sheet subject is absent from the prepared catalog."));
        return reference;
      }) };
    }) })) });
  } else if (selector.taskId === "J12") {
    const layoutSource = select("J11"); const manuscript = select("J05"); const style = select("J08");
    const layout = context.evidenceProjection === "current_creative_v2"
      ? z.object({ pages: z.array(storedPageLayoutSchema.shape.pages.element).length(1) }).parse(layoutSource.content)
      : storedPageLayoutSchema.parse(layoutSource.content);
    const page = layout.pages.find((row) => row.pageId === saved.subjectId);
    if (!page) throw new Error("M4 prepared page is absent from its approved layout.");
    hydrated = pageSubjectProposalSchema.parse({ ...creative, pageId: page.pageId, pageIndex: page.pageIndex,
      layoutVersionId: layoutSource.id, manuscriptVersionId: manuscript.id, styleVersionId: style.id });
  }
  return roleResultSchema.parse({ ...result, payload: { taskId: selector.taskId, content: hydrated } });
}
