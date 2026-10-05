import { describe, expect, it } from "vitest";
import { validatePaginationRouting } from "@/db/experiment-pages";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const reference = { subjectKind: "character" as const, subjectId: id(1), artifactVersionId: id(2), assetId: id(3) };
const sources = { manuscriptUnitIds: [id(10), id(11)], references: [reference] } as unknown as Parameters<typeof validatePaginationRouting>[1];
const layout = { pages: [
  { pageIndex: 0, panels: [{ manuscriptUnitIds: [id(10)], sheetReferences: [] }] },
  { pageIndex: 1, panels: [{ manuscriptUnitIds: [id(10)], sheetReferences: [reference] }] },
  { pageIndex: 2, panels: [{ manuscriptUnitIds: [id(10), id(11)], sheetReferences: [] }] },
] } as unknown as Parameters<typeof validatePaginationRouting>[0];

describe("J11 saved layout routing", () => {
  it("allows a unit across panels and pages, source-free panels, and cover reuse", () => {
    expect(() => validatePaginationRouting(layout, sources)).not.toThrow();
  });
  it("requires complete story coverage and known manuscript units", () => {
    const coverOnly = structuredClone(layout);
    coverOnly.pages[2].panels[0].manuscriptUnitIds = [id(10)];
    expect(() => validatePaginationRouting(coverOnly, sources)).toThrow(/cover every/);
    const unknown = structuredClone(layout);
    unknown.pages[1].panels[0].manuscriptUnitIds = [id(99)];
    expect(() => validatePaginationRouting(unknown, sources)).toThrow(/unknown manuscript/);
  });
  it("requires each routed sheet's exact current approved tuple", () => {
    for (const changed of [{ ...reference, artifactVersionId: id(99) }, { ...reference, assetId: id(99) },
      { ...reference, subjectId: id(99) }]) {
      const candidate = structuredClone(layout);
      candidate.pages[1].panels[0].sheetReferences = [changed];
      expect(() => validatePaginationRouting(candidate, sources)).toThrow(/unknown or stale/);
    }
  });
});
