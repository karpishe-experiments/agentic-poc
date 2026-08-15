// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardRegistry } from "@/components/cards/card-registry";
import type { GenUICard } from "@/lib/contracts/cards";

const id = "00000000-0000-4000-8000-000000000101";
const assetId = "00000000-0000-4000-8000-000000000102";
const base = { schemaVersion: "1" as const, cardId: id, status: "active" as const };

const cards = [
  { ...base, family: "question", variant: "free_text", title: "Free text", allowedActions: ["submit"], payload: { prompt: "Tell us more" } },
  { ...base, family: "question", variant: "single_select", title: "One choice", allowedActions: ["select"], payload: { prompt: "Choose one", choices: [{ id: "one", label: "One" }, { id: "two", label: "Two" }] } },
  { ...base, family: "question", variant: "multi_select", title: "Many choices", allowedActions: ["select"], payload: { prompt: "Choose more", choices: [{ id: "one", label: "One" }, { id: "two", label: "Two" }] } },
  { ...base, family: "artifact_review", variant: "summary", title: "Summary review", allowedActions: ["approve_and_continue"], payload: { artifactType: "audience_profile", versionId: null, summary: [{ label: "Age", value: "6–8" }] } },
  { ...base, family: "artifact_review", variant: "editable_form", title: "Editable review", allowedActions: ["approve_and_continue"], payload: { artifactType: "story_plan", versionId: null, fields: [{ key: "title", label: "Title", value: "Moon boat", multiline: false }] } },
  { ...base, family: "artifact_review", variant: "visual_gallery", title: "Gallery review", allowedActions: ["approve_and_continue"], payload: { artifactType: "visual_bible", versionId: null, items: [{ assetId, label: "Watercolor", selected: true }] } },
  { ...base, family: "progress", variant: "artifact_generation", title: "Artifact progress", allowedActions: [], payload: { completed: 1, total: 2 } },
  { ...base, family: "progress", variant: "page_batch", title: "Page progress", allowedActions: [], payload: { completed: 1, total: 3 } },
  { ...base, family: "progress", variant: "export", title: "Export progress", allowedActions: [], payload: { completed: 1, total: 1 } },
  { ...base, family: "issue", variant: "quality", title: "Quality issue", allowedActions: ["retry"], payload: { code: "quality", summary: "Review this", details: [] } },
  { ...base, family: "issue", variant: "generation_failure", title: "Generation issue", allowedActions: ["retry"], payload: { code: "generation", summary: "Try again", details: [] } },
  { ...base, family: "issue", variant: "validation_failure", title: "Validation issue", allowedActions: ["retry"], payload: { code: "validation", summary: "Correct this", details: [] } },
  { ...base, family: "issue", variant: "recovery", title: "Recovery issue", allowedActions: ["continue"], payload: { code: "recovery", summary: "Continue saved work", details: [] } },
] satisfies GenUICard[];

describe("CardRegistry", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(cards)("renders the finite $family/$variant card", (card) => {
    render(<CardRegistry card={card} submitResponse={async () => {}} />);
    expect(screen.getByRole("heading", { name: card.title })).toBeTruthy();
  });

  it("uses one explicit grouped approval after every gallery item has been presented", () => {
    const gallery = cards.find((card) => card.title === "Gallery review");
    if (!gallery) throw new Error("Expected gallery fixture.");
    render(<CardRegistry card={gallery} submitResponse={async () => {}} />);

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Approve all reviewed references" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Watercolor" })).toBeTruthy();
  });

  it("previews and selectively regenerates a gallery image with an optional instruction", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event("close")); } });
    const pageId = "00000000-0000-4000-8000-000000000120";
    const jobId = "00000000-0000-4000-8000-000000000121";
    const gallery = { ...base, family: "artifact_review" as const, variant: "visual_gallery" as const, title: "Review final pages", allowedActions: ["approve_and_continue" as const], payload: { artifactType: "final_pages" as const, versionId: id, items: [{ assetId, label: "Story page 1", description: "Check composition and reader-facing text.", selected: false, regenerationTarget: { kind: "page" as const, pageId } }] } };
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { id: jobId, jobType: "pages", status: "pending", items: [] } })));
    render(<CardRegistry bookletId={id} card={gallery} submitResponse={async () => {}} />);

    expect(screen.queryByText("Check composition and reader-facing text.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview Story page 1" }));
    expect(screen.getByRole("dialog", { name: "Story page 1 preview" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close Preview" }));

    fireEvent.change(screen.getByLabelText("Optional Regeneration Instruction"), { target: { value: "Make the speech balloon larger." } });
    fireEvent.click(screen.getByRole("button", { name: "Regenerate This Page" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/booklets/${id}/images/regenerate`, expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ target: { kind: "page", pageId }, instruction: "Make the speech balloon larger." }),
    })));
    expect(await screen.findByText(/regeneration started/i)).toBeTruthy();
  });

  it("keeps a persisted progress card aligned with its live job status", async () => {
    const progress = { ...base, family: "progress" as const, variant: "page_batch" as const, title: "Generating pages", allowedActions: [], payload: { jobId: "00000000-0000-4000-8000-000000000103", completed: 0, total: 4, currentLabel: "Preparing the cover" } };
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { status: "succeeded", items: [{ status: "succeeded" }, { status: "succeeded" }, { status: "succeeded" }, { status: "succeeded" }] } })));
    const rendered = render(<CardRegistry card={progress} />);

    await waitFor(() => expect(screen.getByText("Generating: 4 of 4")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(`/api/jobs/${progress.payload.jobId}`, { cache: "no-store" });
    rendered.unmount();
  });

  it("polls an idle pending job on the slower interval", async () => {
    vi.useFakeTimers();
    const progress = { ...base, family: "progress" as const, variant: "page_batch" as const, title: "Generating pages", allowedActions: [], payload: { jobId: "00000000-0000-4000-8000-000000000104", completed: 0, total: 4, currentLabel: "Preparing the cover" } };
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { status: "pending", items: [{ status: "pending" }, { status: "pending" }, { status: "pending" }, { status: "pending" }] } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { status: "succeeded", items: [{ status: "succeeded" }, { status: "succeeded" }, { status: "pending" }, { status: "pending" }] } })));
    const rendered = render(<CardRegistry card={progress} />);

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText("Generating: 0 of 4")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(14_999); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText("Generating: 2 of 4")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    rendered.unmount();
  });

  it("shows the stopped page and retries it from the progress card", async () => {
    const progress = { ...base, family: "progress" as const, variant: "page_batch" as const, title: "Generating pages", allowedActions: [], payload: { jobId: "00000000-0000-4000-8000-000000000105", completed: 0, total: 3 } };
    let retried = false;
    const failedItems = [
      { id: "00000000-0000-4000-8000-000000000201", itemKey: "page:cover", position: 0, status: "succeeded", error: null },
      { id: "00000000-0000-4000-8000-000000000202", itemKey: "page:one", position: 1, status: "failed", error: { message: "No credits remain." } },
      { id: "00000000-0000-4000-8000-000000000203", itemKey: "page:two", position: 2, status: "pending", error: null },
    ];
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (init?.method === "POST") {
        retried = true;
        return new Response(JSON.stringify({ data: { status: "paused", items: failedItems.map((item) => item.status === "failed" ? { ...item, status: "succeeded", error: null } : item) } }));
      }
      return new Response(JSON.stringify({ data: retried
        ? { status: "paused", items: failedItems.map((item) => item.status === "failed" ? { ...item, status: "succeeded", error: null } : item) }
        : { status: "failed", items: failedItems } }));
    });
    const rendered = render(<CardRegistry card={progress} />);

    await waitFor(() => expect(screen.getByText("Stopped: 1 of 3")).toBeTruthy());
    expect(screen.getByText(/Stopped on Page 1: No credits remain/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry failed page" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/jobs/${progress.payload.jobId}/items/${failedItems[1]!.id}/retry`, { method: "POST" }));
    await waitFor(() => expect(screen.getByText("Paused: 2 of 3")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Continue generating images" })).toBeTruthy();
    rendered.unmount();
  });

  it("offers Continue when pending work is idle without a failed or running item", async () => {
    const progress = { ...base, family: "progress" as const, variant: "page_batch" as const, title: "Generating pages", allowedActions: [], payload: { jobId: "00000000-0000-4000-8000-000000000106", completed: 1, total: 2 } };
    const items = [
      { id: "00000000-0000-4000-8000-000000000211", itemKey: "page:cover", position: 0, status: "succeeded", error: null },
      { id: "00000000-0000-4000-8000-000000000212", itemKey: "page:one", position: 1, status: "pending", error: null },
    ];
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (_input, init) => new Response(JSON.stringify({ data: { status: init?.method === "POST" ? "running" : "pending", items } })));
    const rendered = render(<CardRegistry card={progress} />);

    const continueButton = await screen.findByRole("button", { name: "Continue generating images" });
    fireEvent.click(continueButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/jobs/${progress.payload.jobId}/continue`, { method: "POST" }));
    rendered.unmount();
  });
});
