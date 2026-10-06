import { describe, expect, it } from "vitest";
import { imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { buildSavedPageIllustrationPackage, validateSavedPageIllustrationPackage } from "@/lib/contracts/experiment-page-illustrations";
import { configuredPageIllustrationTask, nextPageIllustrationWork } from "@/lib/experiment-runner/page-illustration-tasks";
import { CASES, type Persona } from "@/lib/contracts/experiment-runner";

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

function fixture() {
  const request = { kind: "page_source" as const, prompt: "Exact style and lettering:  Hello, moon!  ",
    sourceVersionIds: [id(1), id(2), id(3)], styleVersionId: id(3) };
  const expectedAttachments = [
    { role: "character" as const, subjectId: id(10), assetId: id(11), artifactVersionId: id(2) },
    { role: "location" as const, subjectId: id(12), assetId: id(13), artifactVersionId: id(3) },
  ];
  const uploadAcknowledgements = expectedAttachments.map((attachment, index) => ({ ...attachment, uploadFileId: id(20 + index),
    mimeType: "image/png" as const, sha256: String(index + 4).repeat(64), byteLength: 128, width: 8, height: 8 }));
  const input = { runId: id(30), pageId: id(31), pageIndex: 1, pageBibleVersionId: id(1), assetId: id(32),
    output: { mimeType: "image/png" as const, sha256: "f".repeat(64), byteLength: 256, width: 16, height: 16 }, request,
    operationId: id(33), workflowRunId: id(34), publishedWorkflowId: id(35), parentWorkflowRunId: id(36),
    inputFingerprint: imageRequestFingerprint(request), candidateLineage: { previousPageVersionId: null }, warnings: [],
    expectedAttachments, uploadAcknowledgements };
  return { input, request };
}

function planningFixture(persona: Persona) {
  const slots = [{ role: "manager", taskId: null },
    ...Array.from({ length: 12 }, (_, index) => ({ role: "specialist", taskId: `J${String(index + 1).padStart(2, "0")}` })),
    { role: "tester", taskId: null }, { role: "image", taskId: null, finalPageIllustration: true }];
  const configurationJson = JSON.stringify(slots.map((slot, index) => ({ ...slot,
    appId: id(500 + index), publishedWorkflowId: id(600 + index), toolProviderId: null })));
  const base = fixture().input;
  const pages = Array.from({ length: CASES[persona].storyPages + 1 }, (_, index) => ({
    pageId: id(100 + index), pageIndex: index, pageBibleVersionId: id(200 + index), sourceVersionIds: [id(200 + index), id(2), id(3)],
  }));
  const artifacts = pages.map((page, index) => {
    const request = { ...base.request, sourceVersionIds: page.sourceVersionIds };
    const content = buildSavedPageIllustrationPackage({ ...base, ...page, request, inputFingerprint: imageRequestFingerprint(request) });
    return { taskId: "J13", subjectKind: "page", subjectId: page.pageId, state: "approved", currentVersionId: id(300 + index),
      versions: [{ id: id(300 + index), content, dependencyVersionIds: page.sourceVersionIds, approval: { id: id(400 + index) } as { id: string } | null }] };
  });
  return { runId: base.runId, persona, configurationJson, pages, artifacts };
}

describe("J13 per-page planning projection", () => {
  it("honors selected order, retains separate review, then returns to remaining pages", () => {
    const input = planningFixture("enthusiast_parent");
    const selectedPageIds = [input.pages[3]!.pageId, input.pages[1]!.pageId];
    const selected = { ...input, selectedPageIds, artifacts: [] };
    expect(nextPageIllustrationWork(selected)).toMatchObject({ kind: "image", subjectId: selectedPageIds[0], pageIndex: 3 });
    const draft = structuredClone(input.artifacts[3]!);
    draft.state = "draft";
    expect(nextPageIllustrationWork({ ...selected, artifacts: [draft] })).toMatchObject({ kind: "review", subjectId: selectedPageIds[0] });
    expect(nextPageIllustrationWork({ ...selected, artifacts: [input.artifacts[3]!] })).toMatchObject({ kind: "image", subjectId: selectedPageIds[1] });
    expect(nextPageIllustrationWork({ ...selected, artifacts: [input.artifacts[3]!, input.artifacts[1]!] })).toMatchObject({ kind: "image", pageIndex: 0 });
    expect(nextPageIllustrationWork({ ...input, selectedPageIds })).toEqual({ kind: "complete" });
    expect(nextPageIllustrationWork({ ...input, selectedPageIds: [selectedPageIds[0]!, selectedPageIds[0]!] })).toBeNull();
    expect(nextPageIllustrationWork({ ...input, selectedPageIds: [id(999)] })).toBeNull();
    draft.state = "needs_review";
    expect(nextPageIllustrationWork({ ...input, artifacts: [...input.artifacts.filter((item) => item.subjectId !== draft.subjectId), draft],
      selectedPageIds, revision: { pageId: draft.subjectId, artifactVersionId: draft.currentVersionId } })).toMatchObject({ kind: "image", subjectId: draft.subjectId });
  });
  for (const persona of ["playful_kid", "enthusiast_parent", "professional_creator"] as const) {
    it(`requires every current page plus cover for ${persona}`, () => {
      const input = planningFixture(persona);
      expect(nextPageIllustrationWork(input)).toEqual({ kind: "complete" });
      expect(nextPageIllustrationWork({ ...input, artifacts: [] })).toMatchObject({ kind: "image", subjectId: input.pages[0]!.pageId, pageIndex: 0 });
      expect(nextPageIllustrationWork({ ...input, pages: input.pages.slice(1) })).toBeNull();
      input.artifacts.at(-1)!.versions[0]!.approval = null;
      expect(nextPageIllustrationWork(input)).toBeNull();
    });
  }

  it("reviews one exact draft and routes an exact page revision without changing other pages", () => {
    const input = planningFixture("enthusiast_parent");
    input.artifacts[1]!.state = "draft";
    expect(nextPageIllustrationWork(input)).toMatchObject({ kind: "review", subjectId: input.pages[1]!.pageId, currentVersionId: input.artifacts[1]!.currentVersionId });
    const revision = { pageId: input.pages[1]!.pageId, artifactVersionId: input.artifacts[1]!.currentVersionId };
    expect(nextPageIllustrationWork({ ...input, revision })).toMatchObject({ kind: "image", subjectId: revision.pageId });
    expect(nextPageIllustrationWork({ ...input, revision: { ...revision, artifactVersionId: id(999) } })).toBeNull();
    expect(input.artifacts[0]!.state).toBe("approved");
  });

  it("refuses stale, ambiguous or unenabled evidence instead of reporting completion", () => {
    const input = planningFixture("playful_kid");
    expect(nextPageIllustrationWork({ ...input, artifacts: [...input.artifacts, input.artifacts[0]!] })).toBeNull();
    expect(nextPageIllustrationWork({ ...input, configurationJson: "[]" })).toBeNull();
    input.pages[0]!.sourceVersionIds.push(id(999));
    expect(nextPageIllustrationWork(input)).toBeNull();
  });
});

describe("J13 saved page illustration package", () => {
  it("requires explicit enablement on the complete saved persona profile", () => {
    const slots = [{ role: "manager", taskId: null },
      ...Array.from({ length: 12 }, (_, index) => ({ role: "specialist", taskId: `J${String(index + 1).padStart(2, "0")}` })),
      { role: "tester", taskId: null }, { role: "image", taskId: null }];
    const profile = slots.map((slot, index) => ({ ...slot, appId: id(100 + index), publishedWorkflowId: id(200 + index),
      toolProviderId: null, ...(slot.role === "image" ? { finalPageIllustration: true } : {}) }));
    expect(configuredPageIllustrationTask(JSON.stringify(profile))).toBe(true);
    expect(configuredPageIllustrationTask(JSON.stringify(profile.slice(1)))).toBe(false);
    expect(configuredPageIllustrationTask(JSON.stringify(profile.map((slot) => {
      const legacy = { ...slot }; delete legacy.finalPageIllustration; return legacy;
    })))).toBe(false);
    expect(configuredPageIllustrationTask("malformed")).toBe(false);
  });
  it("freezes exact request, style, lettering and attachment evidence deterministically", () => {
    const { input, request } = fixture();
    const first = buildSavedPageIllustrationPackage(input);
    const replay = buildSavedPageIllustrationPackage(structuredClone(input));
    expect(replay).toEqual(first);
    expect(JSON.stringify(replay)).toBe(JSON.stringify(first));
    expect(first.request).toEqual(request);
    expect(first.sourceVersionIds).toEqual([id(1), id(2), id(3)]);
    expect(first.attachments.map((item) => item.uploadUser)).toEqual([`booklet-${id(30)}`, `booklet-${id(30)}`]);
  });

  it("rejects bad source order, fingerprint, upload identity and duplicate attachments", () => {
    const { input } = fixture();
    const saved = buildSavedPageIllustrationPackage(input);
    expect(() => validateSavedPageIllustrationPackage({ ...saved, sourceVersionIds: [id(2), id(1), id(3)] })).toThrow("page bible first");
    expect(() => validateSavedPageIllustrationPackage({ ...saved, inputFingerprint: "0".repeat(64) })).toThrow("fingerprint");
    expect(() => validateSavedPageIllustrationPackage({ ...saved, attachments: [{ ...saved.attachments[0], uploadUser: `booklet-${id(99)}` }, saved.attachments[1]] })).toThrow("ownership");
    expect(() => buildSavedPageIllustrationPackage({ ...input, uploadAcknowledgements: [...input.uploadAcknowledgements].reverse() })).toThrow("in order");
    expect(() => validateSavedPageIllustrationPackage({ ...saved, attachments: [...saved.attachments, saved.attachments[0]] })).toThrow("unique");
    expect(() => validateSavedPageIllustrationPackage({ ...saved, attachments: [{ ...saved.attachments[0], artifactVersionId: id(99) }, saved.attachments[1]] })).toThrow("request sources");
  });

  it("keeps upload and final-output size limits separate", () => {
    const { input } = fixture();
    expect(() => buildSavedPageIllustrationPackage({ ...input, uploadAcknowledgements: [{ ...input.uploadAcknowledgements[0], byteLength: 10 * 1024 * 1024 + 1 }, input.uploadAcknowledgements[1]] })).toThrow();
    expect(() => buildSavedPageIllustrationPackage({ ...input, output: { ...input.output, byteLength: 20 * 1024 * 1024 + 1 } })).toThrow();
    expect(() => buildSavedPageIllustrationPackage({ ...input, output: { ...input.output, width: 64_000_001 } })).toThrow("dimensions");
  });

  it("accepts a source-free approved page but rejects a nonempty unmatched acknowledgement", () => {
    const { input } = fixture();
    expect(buildSavedPageIllustrationPackage({ ...input, expectedAttachments: [], uploadAcknowledgements: [] }).attachments).toEqual([]);
    expect(() => buildSavedPageIllustrationPackage({ ...input, expectedAttachments: [], uploadAcknowledgements: [input.uploadAcknowledgements[0]] })).toThrow("in order");
  });

  it("keeps secret and URL fields outside the strict frozen contract", () => {
    const { input } = fixture();
    const saved = buildSavedPageIllustrationPackage(input);
    expect(JSON.stringify(saved)).not.toMatch(/apiKey|secret|https?:\/\//i);
    expect(() => validateSavedPageIllustrationPackage({ ...saved, apiKey: "secret" })).toThrow();
    expect(() => validateSavedPageIllustrationPackage({ ...saved, attachments: [{ ...saved.attachments[0], url: "https://private.example" }, saved.attachments[1]] })).toThrow();
  });
});
