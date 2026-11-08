# Real image-request construction

## Ownership and applicable source

Booklet builds the logical creative prompt from saved artifacts. The Real image workflow authorizes and forwards a prepared provider request through the custom image tool. J13 has no separate text-role prompt. All excerpts below are exact source from commit `1d4cc02307edad21aadefc244bcc4e286396b88f`; they document implementation, not live execution.

## Style samples and reference sheets

[lib/experiment-runner/reference-requests.ts](https://github.com/karpishe-experiments/agentic-poc/blob/1d4cc02307edad21aadefc244bcc4e286396b88f/lib/experiment-runner/reference-requests.ts) supplies these exact serializers. Template substitutions are dynamic: sample purpose, typography, bubble direction, exclusions, shared style module, selected subject requirements and sheet module come from validated saved creative artifacts. Non-rendered slot/subject IDs must not become lettering.

```typescript
import { z } from "zod";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentImageRequestSchema, type ExperimentImageRequest } from "@/lib/contracts/experiment-image";
import { parseReferenceProposal } from "@/lib/contracts/experiment-references";

const styleSourcesSchema = z.strictObject({
  draftStyleVersionId: opaqueIdSchema,
  conceptVersionId: opaqueIdSchema,
  outlineVersionId: opaqueIdSchema,
  manuscriptVersionId: opaqueIdSchema,
  finalCharactersVersionId: opaqueIdSchema,
  finalLocationsVersionId: opaqueIdSchema,
});
export type StyleSampleSources = z.infer<typeof styleSourcesSchema>;

// These pure serializers check shape, not database approval or asset existence.
// Their owning operation service must check current saved sources before dispatch.
export function styleSampleRequests(proposal: unknown, sources: StyleSampleSources): {
  sampleKey: "sample_1" | "sample_2"; request: ExperimentImageRequest;
}[] {
  const style = parseReferenceProposal("J08", "proposal", proposal).content;
  const ids = styleSourcesSchema.parse(sources);
  const sourceVersionIds = [ids.draftStyleVersionId, ids.conceptVersionId,
    ids.outlineVersionId, ids.manuscriptVersionId,
    ids.finalCharactersVersionId, ids.finalLocationsVersionId];
  return (["sample_1", "sample_2"] as const).map((sampleKey) => {
    const sample = style.samplePlan.find((item) => item.sampleKey === sampleKey)!;
    return { sampleKey, request: experimentImageRequestSchema.parse({
      kind: "style_preview", styleVersionId: ids.draftStyleVersionId, sourceVersionIds,
      prompt: [
        `Style validation sample. Non-rendered slot identity: ${sampleKey}. Do not draw this identity.`,
        `Purpose: ${sample.purpose}`,
        `Typography: ${style.typographyDirection}`,
        `Speech/thought bubbles: ${style.speechAndThoughtBubbleDirection}`,
        `Excluded content: ${JSON.stringify(style.exclusions)}`,
        "Use the following shared style instructions unchanged:",
        style.stylePromptModule,
      ].join("\n"),
    }) };
  });
}

export function referenceSheetRequest(task: "J09" | "J10", proposal: unknown): ExperimentImageRequest {
  const sheet = task === "J09" ? parseReferenceProposal("J09", "proposal", proposal).content
    : parseReferenceProposal("J10", "proposal", proposal).content;
  const subject = "characterId" in sheet
    ? { characterId: sheet.characterId, characterDesignProfile: sheet.characterDesignProfile,
        attireRequirements: sheet.attireRequirements, accessories: sheet.accessories,
        requiredViews: sheet.requiredViews, additionalExpressions: sheet.additionalExpressions }
    : { locationId: sheet.locationId, locationDefinitionProfile: sheet.locationDefinitionProfile,
        stableAnchors: sheet.stableAnchors, requiredFeatures: sheet.requiredFeatures,
        overview: sheet.overview, supportingViews: sheet.supportingViews };
  return experimentImageRequestSchema.parse({
    kind: "reference", styleVersionId: sheet.styleVersionId,
    sourceVersionIds: [sheet.finalListVersionId, sheet.styleVersionId],
    prompt: [
      "Generate one reference-sheet montage. Subject IDs are non-rendered metadata; do not draw them.",
      task === "J09"
        ? "Include full-body front, full-body back and full-body side views, a detailed neutral facial view, and three additional facial-expression shots from the subject requirements."
        : "Include an isometric overview and each specified supporting view, showing the required features and stable anchors.",
      `Subject requirements: ${JSON.stringify(subject)}`,
      sheet.sheetPromptModule,
      "Use the following shared style instructions unchanged:",
      sheet.stylePromptModule,
    ].join("\n"),
  });
}
```

Style samples have two fixture slots. Character sheets require the four base views plus three additional expression shots; location sheets require an isometric overview and specified supporting views. These counts are experiment constraints to generalize for Unitale. Pure parsing does not prove current database approval, original asset existence or operation eligibility.

## Pages, covers and image revisions

[lib/experiment-runner/page-image-requests.ts](https://github.com/karpishe-experiments/agentic-poc/blob/1d4cc02307edad21aadefc244bcc4e286396b88f/lib/experiment-runner/page-image-requests.ts) supplies exact static instruction text and interpolation order. Covers use the same page-source serializer. Dynamic values include approved page-turn rhythm, canvas, typography, panel action/emotion/composition, manuscript IDs, reference identities, exact lettering and shared style module.

References are traversed in panel/reading order and deduplicated by subject kind, subject ID, artifact version ID and asset ID. The first occurrence establishes the attached reference order. Revisions append saved feedback in order while preserving approved lettering, style bytes and reference routing.

```typescript
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
```

## Provider request and custom tool

[db/experiment-real-image-preparation.ts](https://github.com/karpishe-experiments/agentic-poc/blob/1d4cc02307edad21aadefc244bcc4e286396b88f/db/experiment-real-image-preparation.ts) verifies current campaign/profile, logical fingerprint, source dependencies and original references before forming the provider request. For J13 it verifies original attachments and their ordered uploaded-file metadata. `execution_v3` selects page dimensions from approved canvas orientation: portrait 1024×1536, landscape 1536×1024, square 1024×1024. Other image kinds use the profile size.

[lib/experiment-runner/real-image-contract.ts](https://github.com/karpishe-experiments/agentic-poc/blob/1d4cc02307edad21aadefc244bcc4e286396b88f/lib/experiment-runner/real-image-contract.ts) defines the request:

| Field | Source behavior |
| --- | --- |
| Model | `gpt-image-2.5-sunburst-2026-09-08` |
| Operation | `edit` when references exist; otherwise `generate` |
| Prompt | Logical prompt, nonempty and at most 32,000 characters |
| Defaults from profile builder | High quality, opaque background, PNG, square size except v3 page orientation |
| Count/retries | One image; zero provider retries |
| Time | Profile timeout at most 270 seconds; deadline reduced by reconciliation reserve |
| References | At most 15 unique asset/version pairs, each bound to hash, byte length, MIME type and dimensions |
| Digest | Canonical provider-request body hash |

These are inspected source identifiers/settings, not recommendations or current public model availability claims. Profile values determine the effective request. The contract additionally rejects inconsistent generate/edit references and transparent JPEG.

The exported node names `booklet_real_image`. Its [docs/accepted/2026-09-27_dify-booklet-runner/dify/m5-openai-image-bounded.py](https://github.com/karpishe-experiments/agentic-poc/blob/1d4cc02307edad21aadefc244bcc4e286396b88f/docs/accepted/2026-09-27_dify-booklet-runner/dify/m5-openai-image-bounded.py) implementation validates the carrier and native file evidence, observes deadline/bounded execution, performs the image request and participates in result upload/accounting. Its network work is inside one graph tool node. A single node therefore does not establish total HTTP or underlying provider-call counts. Do not replay an unknown paid outcome without reconciliation.

## Synthetic page assembly example

This example is illustrative; it is not a complete valid fixture or a generated result.

1. Approved J11 selects a portrait page with one panel. Approved J12 sets `noText=true`; approved J08 supplies `<exact saved style module>`.
2. The panel routes `<character sheet revision A>` followed by `<location sheet revision B>`. A later panel reusing A does not attach A again.
3. `pageSourceRequest` emits the quoted page/canvas/panel instructions, the literal no-text prohibition and the exact style module. It does not append manuscript dialogue absent from the approved Page Bible.
4. Preparation proves current sources and original bytes, maps portrait to 1024×1536 and binds ordered reference manifests to an `edit` request.
5. Dify's Real path executes that request and returns image evidence. Application validation and persistence remain necessary.

## Unitale migration

Move these creative serializers into the Image Executor's Prepare operation. The Manager supplies approved source artifacts and constraints. Unitale retains authentication, immutable sources, bytes and product guards. Add independent review of the **final assembled prompt, actual ordered references and meaningful settings before generation**, then review the generated image. This preflight gate is an agreed target requirement; it is not implemented by the experiment's structural preparation checks. [Full migration requirements](unitale-migration.md).
