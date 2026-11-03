import { describe, expect, it } from "vitest";
import { projectRealReportContext } from "@/lib/experiment-runner/real-report-context";

function artifact(taskId: string, content: unknown) {
  return { id: `artifact-${taskId}`, taskId, state: "approved", currentVersionId: `version-${taskId}`,
    versions: [{ id: `version-${taskId}`, number: 2, dependencyVersionIds: ["approved-source"],
      approval: { id: "approval", delegationId: "delegation" }, warnings: ["retained warning"], content }] };
}
function fixture() {
  const styleModule = "Canonical style instructions. ".repeat(100);
  return { role: "judge", brief: "A safe rescue", reportEvidence: { versionIds: ["version-J12"] },
    evidenceScope: { cost: "Invoice cost unavailable" }, creatorMessages: [{ text: "Keep the robot blue" }],
    operationHistory: [{ role: "image", count: 9 }], counters: { payableImage: 9 },
    imageEvidence: { finalPages: [{ pageIndex: 0, assetId: "cover" }, { pageIndex: 1, assetId: "story" }] },
    currentArtifacts: [
      artifact("J05", { units: [{ narration: "Exact narration — unchanged.", dialogue: [{ text: "Go!\nTogether!" }] }] }),
      artifact("J08", { title: "Style", stylePromptModule: styleModule, styleDefinition: { emotionalTone: "Reassuring" },
        samples: [1, 2].map(n => ({ sampleKey: `sample_${n}`, purpose: `Purpose ${n}`,
          build: { assetId: `sample-${n}`, sourceVersionIds: ["source"], prompt: styleModule } })) }),
      artifact("J09", { characterId: "inventor", characterDesignProfile: "Blue coat", attireRequirements: ["Blue coat"],
        sheetPromptModule: styleModule, stylePromptModule: styleModule, build: { assetId: "sheet", sourceVersionIds: ["source"] } }),
      artifact("J11", { canvas: { orientation: "portrait", workingPixels: { width: 1800, height: 2700 } }, pages: ["cover", "story"] }),
      artifact("J12", { pageId: "cover", panels: [{ panelKey: "cover", noText: false,
        lettering: [{ kind: "title", text: "The Kite" }], composition: "Both friends safely on the ground" }] }),
      artifact("J13", { pageId: "cover", assetId: "cover", output: { width: 1024, height: 1536 },
        sourceVersionIds: ["version-J12"], candidateLineage: { previousPageVersionId: null },
        attachments: [{ assetId: "sheet", artifactVersionId: "version-J09" }], request: { prompt: styleModule.repeat(2) } }),
    ] };
}

describe("new-profile approved Real report evidence", () => {
  it("preserves approved creative facts, exact words, provenance and original ordering", () => {
    const source = fixture();
    const before = JSON.stringify(source);
    const projected = projectRealReportContext(source) as typeof source;
    for (const task of ["J05", "J11", "J12"]) {
      expect(projected.currentArtifacts.find(a => a.taskId === task)).toEqual(source.currentArtifacts.find(a => a.taskId === task));
    }
    expect(projected.creatorMessages).toEqual(source.creatorMessages);
    expect(projected.imageEvidence).toEqual(source.imageEvidence);
    expect(projected.reportEvidence).toEqual(source.reportEvidence);
    expect(projected.currentArtifacts.map(a => a.versions[0].approval)).toEqual(source.currentArtifacts.map(a => a.versions[0].approval));
    expect(JSON.stringify(source)).toBe(before);
  });

  it("omits generation envelopes and duplicate modules while retaining the canonical style once", () => {
    const source = fixture();
    const projected = projectRealReportContext(source);
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('"sheetPromptModule"');
    expect(serialized).not.toContain('"request"');
    expect(serialized).not.toContain('"prompt"');
    expect(serialized.match(/"stylePromptModule"/g)).toHaveLength(1);
    expect(serialized).toContain("Blue coat");
    expect(serialized).toContain("Purpose 2");
    expect(serialized).toContain("version-J09");
    expect(Buffer.byteLength(serialized)).toBeLessThan(Buffer.byteLength(JSON.stringify(source)));
    expect(projected.evidenceScope).toMatchObject({ cost: "Invoice cost unavailable" });
    expect(JSON.stringify(projected.evidenceScope)).toContain("exact current approved J12");
    expect(JSON.stringify(projected.evidenceScope)).not.toContain("Simulated images");
  });

  it("rejects ambiguous or historical version input rather than silently replacing current evidence", () => {
    const source = fixture();
    source.currentArtifacts[0].versions.push({ ...source.currentArtifacts[0].versions[0], id: "old-version" });
    expect(() => projectRealReportContext(source)).toThrow("current versions only");
    const missing = fixture(); missing.currentArtifacts[0].versions = [];
    expect(() => projectRealReportContext(missing)).toThrow("one current version");
  });
});
