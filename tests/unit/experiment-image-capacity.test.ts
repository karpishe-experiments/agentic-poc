import { expect, it } from "vitest";
import { imageCapacity } from "@/lib/experiment-runner/image-capacity";

const source = (taskId: string, subjectId?: string) => ({ taskId, subjectId, state: "approved", currentVersionId: taskId,
  versions: [] });
const input = { runId: "run", limit: 20, used: 13, pageIds: ["page"], unresolved: false,
  artifacts: [source("J08"), source("J09"), source("J10"), source("J12", "page")] };
it("reports required outputs independently of the number of historical attempts", () => {
  expect(imageCapacity(input)).toEqual({ status: "available", remainingImageCalls: 7, requiredNewImages: 1,
    savedDraftsAwaitingApproval: 0, spareImageCalls: 6 });
  expect(imageCapacity({ ...input, used: 19 })).toMatchObject({ spareImageCalls: 0 });
  expect(imageCapacity({ ...input, used: 20 })).toMatchObject({ spareImageCalls: -1 });
});
it("does not guess when attempts, sources or saved packages are unresolved", () => {
  expect(imageCapacity({ ...input, unresolved: true })).toMatchObject({ status: "unavailable", reason: "unresolved_attempts" });
  expect(imageCapacity({ ...input, artifacts: [] })).toMatchObject({ status: "unavailable", reason: "unfinished_sources" });
  expect(imageCapacity({ ...input, pageIds: ["page", "page"] })).toMatchObject({ status: "unavailable", reason: "ambiguous_evidence" });
  expect(imageCapacity({ ...input, artifacts: [...input.artifacts, { ...source("J13", "page"), state: "draft" }] }))
    .toMatchObject({ status: "unavailable", reason: "ambiguous_evidence" });
});
