// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AllowanceReview } from "@/components/experiments/allowance-review";
import { ImageReplacementReview } from "@/components/experiments/image-replacement-review";
import { ExternalErrorDetails } from "@/components/experiments/external-error-details";

const totals = { maxMicrodollars: 5_000_000, textCalls: 120, imageCalls: 12, steps: 300,
  textRevisions: 1, imageRevisions: 1, noProgress: 3 };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("submits proactive authority through the same endpoint with exact totals and reference", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { approvalId: "saved", runRevision: 8 } }));
  vi.stubGlobal("fetch", fetcher);
  render(<AllowanceReview runId="run" runRevision={6} allowance={{ campaignId: "campaign", revision: 2, totals,
    settledMicrodollars: 500_000, reservedMicrodollars: 4_500_000, textRequests: 43, imageRequests: 9,
    latestApprovalReference: "original" }} onSaved={async () => true} />);
  fireEvent.change(screen.getByLabelText(/Maximum USD/), { target: { value: "6" } });
  fireEvent.change(screen.getByLabelText("Approval or decline reference"), { target: { value: "chat exact six dollars" } });
  fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ action: "adjust", expectedRevision: 6,
    expectedCampaignRevision: 2, reference: "chat exact six dollars", totals: { ...totals, maxMicrodollars: 6_000_000 } });
});
it("requires charge acknowledgement and never automatically repeats an uncertain replacement approval", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ data: { runId: "run", operationId: "old",
    expectedRevision: 6, expectedCampaignRevision: 2, previewDigest: "a".repeat(64), expiresAtMs: Date.now() + 300_000,
    terminalStatus: "failed", target: { taskId: "J13", subjectId: "page3" }, totals,
    settledMicrodollars: 500_000, reservedMicrodollars: 4_500_000, retainedLiabilityMicrodollars: 4_500_000 } }))
    .mockRejectedValueOnce(Error("Acknowledgement lost"));
  vi.stubGlobal("fetch", fetcher);
  render(<ImageReplacementReview runId="run" operationId="old" onSaved={async () => true} />);
  fireEvent.click(screen.getByText("Inspect original and prepare review"));
  await screen.findByText(/Original unknown liability/);
  fireEvent.change(screen.getByLabelText("New total USD allowance"), { target: { value: "6" } });
  fireEvent.change(screen.getByLabelText("Operator approval reference"), { target: { value: "chat exact terms" } });
  expect(screen.getByText("Approve exact allowance and one replacement")).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByText("Approve exact allowance and one replacement"));
  await screen.findByText("Acknowledgement lost");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ action: "image_replacement", operationId: "old",
    acknowledgeUnknownCharge: true, totals: { ...totals, maxMicrodollars: 6_000_000 } });
  expect(screen.getByText("Reconcile exact approval")).toBeVisible();
});
it("renders retained provider HTML as text and reads only a selected diagnostic page", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { page: 0, hasMore: true,
    operations: [{ errors: [{ message: "<img src=x onerror=alert(1)>", truncated: true }] }] } }));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<ExternalErrorDetails runId="run" />);
  fireEvent.click(screen.getByText("Technical details and external call errors"));
  await waitFor(() => expect(view.container.querySelector("pre")?.textContent).toContain("<img src=x onerror=alert(1)>"));
  expect(view.container.querySelector("img")).toBeNull();
  expect(fetcher.mock.calls[0][0]).toContain("/run/diagnostics?page=0");
});
