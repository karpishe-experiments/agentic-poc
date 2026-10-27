import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentImageRequestSchema, pageImageRevisionsSchema, executionPageImageRevisionsSchema,
  executionImageRequestSchema, type ExperimentImageRequest } from "@/lib/contracts/experiment-image";
import type { Persona } from "@/lib/contracts/experiment-runner";
import { parseReferenceProposal } from "@/lib/contracts/experiment-references";
import { parseStoredPageLayout } from "@/lib/contracts/experiment-pages";
import { parsePageBibleForLayout } from "@/lib/experiment-runner/page-bible-tasks";

export type RoutedPageReference = {
  panelKey: string;
  subjectKind: "character" | "location";
  subjectId: string;
  artifactVersionId: string;
  assetId: string;
};

type Input = {
  persona: Persona;
  pageId: string;
  layout: unknown;
  layoutVersionId: string;
  manuscriptVersionId: string;
  styleVersionId: string;
  pageBibleVersionId: string;
  pageBible: unknown;
  approvedVisualStyle: unknown;
};

function referenceKey(reference: Omit<RoutedPageReference, "panelKey">): string {
  return JSON.stringify([
    reference.subjectKind,
    reference.subjectId,
    reference.artifactVersionId,
    reference.assetId,
  ]);
}

function compactCanvas(value: unknown): string {
  return JSON.stringify(value);
}

// The database caller must verify every recorded tester decision. Append scoped
// feedback without editing approved lettering, style bytes or reference routing.
export function withPageImageRevisions(base: ExperimentImageRequest, revisions: unknown, execution = false): ExperimentImageRequest {
  const original = experimentImageRequestSchema.parse(base);
  if (original.kind !== "page_source" || original.revisions) throw new Error("Revision serializer requires the base page request.");
  const accepted = (execution ? executionPageImageRevisionsSchema : pageImageRevisionsSchema).parse(revisions);
  const request = { ...original, ...(execution ? { schemaVersion: "execution_page_request_v1" } : {}), revisions: accepted, prompt: [original.prompt,
    "Apply the following creator image feedback in order. Preserve the approved exact lettering, reference identities and shared style module above.",
    ...accepted.map((revision, index) => `Image revision ${index + 1}: ${revision.instruction}`),
  ].join("\n") };
  return (execution ? executionImageRequestSchema : experimentImageRequestSchema).parse(request);
}

// This serializer establishes a deterministic request only. Its caller must
// prove current approvals, saved asset bytes and provider eligibility before it
// uses this request for an image operation.
export function pageSourceRequest(input: Input): {
  pageId: string;
  pageIndex: number;
  references: RoutedPageReference[];
  request: ExperimentImageRequest;
} {
  const pageBibleVersionId = opaqueIdSchema.parse(input.pageBibleVersionId);
  const layout = parseStoredPageLayout(input.persona, input.layout);
  const parsed = parsePageBibleForLayout({
    persona: input.persona,
    pageId: input.pageId,
    layout: input.layout,
    layoutVersionId: input.layoutVersionId,
    manuscriptVersionId: input.manuscriptVersionId,
    styleVersionId: input.styleVersionId,
    proposal: input.pageBible,
  });
  const style = parseReferenceProposal("J08", "assembled", input.approvedVisualStyle).content;

  // J12 binds this page to the supplied saved style-version identity. J08
  // separately validates the exact style-module bytes and its retained hash.
  // An assembled J08 package records the earlier draft style version, so the
  // repository must prove that this saved package is the approved J08 source;
  // this pure serializer cannot establish that external record identity.
  if (parsed.content.styleVersionId !== opaqueIdSchema.parse(input.styleVersionId)) {
    throw new Error("J12 style identity does not match the selected style version.");
  }
  const layoutPage = layout.pages.find((page) => page.pageId === parsed.content.pageId);
  if (!layoutPage) throw new Error("J12 page is not in the saved J11 layout.");

  const references: RoutedPageReference[] = [];
  const seen = new Set<string>();
  for (const panel of parsed.content.panels) {
    for (const reference of panel.sheetReferences) {
      const identity = {
        subjectKind: reference.subjectKind,
        subjectId: reference.subjectId,
        artifactVersionId: reference.artifactVersionId,
        assetId: reference.assetId,
      };
      const key = referenceKey(identity);
      if (!seen.has(key)) {
        seen.add(key);
        references.push({ panelKey: panel.panelKey, ...identity });
      }
    }
  }

  const prompt = [
    "Generate one complete illustrated booklet page. Metadata identifiers are non-rendered; do not draw them.",
    `Page identity: ${parsed.content.pageId}; physical page index: ${parsed.content.pageIndex}.`,
    `Approved page-turn rhythm: ${layoutPage.pageTurnRhythm}`,
    "Canvas requirements:",
    compactCanvas(layout.canvas),
    "Typography requirements:",
    compactCanvas(layout.typography),
    "Panel instructions in approved reading order:",
    ...parsed.content.panels.flatMap((panel, panelIndex) => [
      `Panel ${panelIndex + 1} (${panel.panelKey}).`,
      `Action beat: ${panel.actionBeat}`,
      `Emotional beat: ${panel.emotionalBeat}`,
      `Composition: ${panel.composition}`,
      `Manuscript units: ${JSON.stringify(panel.manuscriptUnitIds)}.`,
      `Approved J11 panel layout: text capacity=${layoutPage.panels[panelIndex].textCapacity}; live text safe region=${compactCanvas(layoutPage.panels[panelIndex].liveTextSafeRegion)}; deferred composition decisions=${compactCanvas(layoutPage.panels[panelIndex].deferredCompositionDecisions)}.`,
      `Approved reference identities: ${JSON.stringify(panel.sheetReferences.map((reference) => ({
        subjectKind: reference.subjectKind,
        subjectId: reference.subjectId,
        artifactVersionId: reference.artifactVersionId,
        assetId: reference.assetId,
      })))}.`,
      panel.noText
        ? "No text: true. Do not add lettering, speech bubbles or other readable text to this panel."
        : [
          "No text: false. Render only the following native lettering. Do not overlay text after image generation and do not rewrite any characters or whitespace.",
          ...panel.lettering.map((lettering, letteringIndex) => [
            `Lettering ${letteringIndex + 1}: kind=${lettering.kind}; form=${lettering.form}; panel=${lettering.panelKey}; speaker=${lettering.speakerEntityId ?? "none"}; placement=${lettering.placement}; typography=${lettering.typographyTreatment}; bubble=${lettering.bubbleTreatment}.`,
            `Exact native lettering begins (${lettering.text.length} UTF-16 code units):`,
            lettering.text,
            "Exact native lettering ends.",
          ].join("\n")),
        ].join("\n"),
    ]),
    "Shared style module begins. Use these exact instructions unchanged:",
    style.stylePromptModule,
    "Shared style module ends.",
  ].join("\n");

  return {
    pageId: parsed.content.pageId,
    pageIndex: parsed.content.pageIndex,
    references,
    request: experimentImageRequestSchema.parse({
      kind: "page_source",
      prompt,
      sourceVersionIds: [pageBibleVersionId, ...parsed.dependencyVersionIds],
      styleVersionId: parsed.content.styleVersionId,
    }),
  };
}
