// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { BookletRunner } from "@/components/experiments/booklet-runner";

const run = { runId: "00000000-0000-4000-8000-000000000001", persona: "playful_kid", mode: "simulated", brief: "Kite story", status: "queued", revision: 2, pauseRequested: false, activeOperationId: "operation-1", activeDelegation: { id: "grant-1", taskIds: ["J01", "J02"], subjectKind: "book", subjectId: "book-1", testerDecisionId: "decision-1" }, creatorMessages: [{ id: "decision-1", sequence: 1, content: { action: "approve", versionIds: ["version"] }, createdAtMs: 1 }], operationHistory: [{ id: "operation-1", role: "specialist", taskId: "J02", state: "started", workflowRunId: "workflow-1", parentWorkflowRunId: "parent-1", reservationCount: 1, safeFailure: null, createdAtMs: 1, updatedAtMs: 2 }], counters: { logicalText: 1, logicalImage: 0, payableText: 0, payableImage: 0, steps: 1 }, limits: { text: 120, image: 12, steps: 300 }, nextNarrativeTask: "J02", pendingDecision: { kind: "question", question: "Which kite?" }, currentArtifacts: [{ id: "artifact", taskId: "J01", state: "approved", currentVersionId: "version", versions: [{ id: "version", number: 1, content: { title: "Kite Rescue" }, warnings: [{ field: "title", message: "Needs review." }], approval: { origin: "explicit" }, dependencyVersionIds: [] }] }] };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [run] }), { status: 200 })); vi.stubGlobal("fetch", fetchMock); vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("00000000-0000-4000-8000-000000000010") }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("booklet runner inspector", () => {
  it.each([false, true])("saves selected page order without resuming or replaying after uncertain response=%s", async (lost) => {
    const pageSelection = { schemaVersion: "2", runId: run.runId, configurationHash: "a".repeat(64), layoutVersionId: "layout",
      pages: [{ pageId: "page-1", pageIndex: 1, pageBibleVersionId: "bible-1", previousPageVersionId: null },
        { pageId: "page-3", pageIndex: 3, pageBibleVersionId: "bible-3", previousPageVersionId: null }] };
    const paused = { ...run, status: "paused", pauseRequested: true, activeOperationId: null, pendingDecision: null, pageSelection };
    fetchMock.mockImplementation(async (_url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        if (lost) throw new Error("lost");
        return new Response(JSON.stringify({ data: { jobId: "job", reused: false } }));
      }
      return new Response(JSON.stringify({ data: [paused] }));
    });
    render(<BookletRunner />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Page 3" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Page 1" }));
    expect(screen.getByText("Selected order: Page 3 → Page 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save page order" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save page order" }).hasAttribute("disabled")).toBe(false));
    const writes = fetchMock.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe(`/api/experiments/booklet-runs/${run.runId}/pages`);
    expect(JSON.parse(writes[0][1].body)).toMatchObject({ expectedRevision: 2, batch: { selection: "selected_batch",
      pages: [{ pageId: "page-3", pageBibleVersionId: "bible-3" }, { pageId: "page-1", pageBibleVersionId: "bible-1" }] } });
    if (lost) expect(screen.getByRole("alert").textContent).toContain("No automatic retry");
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
  });
  it("shows generation separately from blocked evaluation and keeps advisory reports inspectable", async () => {
    const report = { role: "tester", mode: "simulated", summary: "Deterministic feedback; creative quality not assessed." };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ ...run, bookletId: "saved-book", status: "blocked",
      generationStatus: "complete", evaluationStatus: "running", reports: [{ operationId: "feedback-1", workflowRunId: "run-1",
        verifiedWorkflowId: "published-1", matchesCurrentVersions: true, report },
      { operationId: "judge-1", workflowRunId: "run-2", verifiedWorkflowId: "published-2", matchesCurrentVersions: false,
        report: { ...report, role: "judge", summary: "Historical judge assessment." } }] }] }), { status: 200 }));
    render(<BookletRunner />);
    expect(await screen.findByText("Generation: complete · Evaluation: running")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open saved booklet" }).getAttribute("href")).toBe("/booklets/saved-book");
    expect(screen.getByText("Tester feedback · simulated")).toBeTruthy();
    expect(screen.getByText("Independent judge assessment · simulated")).toBeTruthy();
    expect(screen.getByText("Current artifact versions: do not match; report is historical")).toBeTruthy();
    expect(fetchMock.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
  });
  it("reads current state and retries a definite control conflict once", async () => {
    let writes = 0;
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        writes += 1;
        return writes === 1
          ? new Response(JSON.stringify({ error: { code: "conflict", message: "Saved state conflicts with the request." } }), { status: 409 })
          : new Response(JSON.stringify({ data: { ...run, revision: 5, pauseRequested: true, status: "paused" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: url.endsWith(run.runId) ? { ...run, revision: 4 } : [run] }), { status: 200 });
    });
    render(<BookletRunner />);
    await screen.findByText("Kite Rescue", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(writes).toBe(2));
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST").map(([, options]) => JSON.parse(options.body).expectedRevision)).toEqual([2, 4]);
    expect(fetchMock.mock.calls.some(([url, options]) => url.endsWith(run.runId) && options?.cache === "no-store")).toBe(true);
  });
  it("does not repeat a control already applied in the read-back state", async () => {
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => options?.method === "POST"
      ? new Response(JSON.stringify({ error: { code: "conflict", message: "Saved state conflicts with the request." } }), { status: 409 })
      : new Response(JSON.stringify({ data: url.endsWith(run.runId) ? { ...run, revision: 4, pauseRequested: true, status: "paused" } : [run] }), { status: 200 }));
    render(<BookletRunner />);
    await screen.findByText("Kite Rescue", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith(run.runId))).toBe(true));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start selected" }).hasAttribute("disabled")).toBe(false));
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });
  it.each(["lost response", "repeat conflict"])("bounds control retry after %s", async (failure) => {
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        if (failure === "lost response") throw new Error("Response lost");
        return new Response(JSON.stringify({ error: { code: "conflict", message: "Saved state conflicts with the request." } }), { status: 409 });
      }
      return new Response(JSON.stringify({ data: url.endsWith(run.runId) ? { ...run, revision: 4 } : [run] }), { status: 200 });
    });
    render(<BookletRunner />);
    await screen.findByText("Kite Rescue", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await screen.findByRole("alert");
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(failure === "lost response" ? 1 : 2);
  });
  it("does not resume a run that became blocked during read-back", async () => {
    const paused = { ...run, status: "paused", pauseRequested: true };
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => options?.method === "POST"
      ? new Response(JSON.stringify({ error: { code: "conflict", message: "Saved state conflicts with the request." } }), { status: 409 })
      : new Response(JSON.stringify({ data: url.endsWith(run.runId) ? { ...paused, revision: 4, status: "blocked" } : [paused] }), { status: 200 }));
    render(<BookletRunner />);
    await screen.findByRole("button", { name: "Resume" });
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Inspect its saved status");
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });
  it("creates a linked simulated successor and retains its identity on explicit retry", async () => {
    const failed = { ...run, status: "blocked", predecessorRunId: "prior-run", activeOperationId: null };
    fetchMock.mockImplementation(async (_url: string, options?: RequestInit) => options?.method === "POST" ? Promise.reject(new Error("Response lost")) : new Response(JSON.stringify({ data: [failed] }), { status: 200 }));
    render(<BookletRunner />);
    expect(await screen.findByText("Predecessor run: prior-run")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start linked successor" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry pending creation" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(2));
    for (const [, options] of fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")) {
      expect(options.headers["Idempotency-Key"]).toBe("00000000-0000-4000-8000-000000000010");
      expect(JSON.parse(options.body)).toEqual({ persona: "playful_kid", mode: "simulated", predecessorRunId: run.runId });
    }
  });
  it("shows saved artifacts, decisions, limits and a bounded narrative slice", async () => {
    render(<BookletRunner />);
    expect(await screen.findByText("Kite Rescue", { exact: false })).toBeTruthy();
    expect(screen.getByText("Approved (explicit)", { exact: false })).toBeTruthy();
    expect(screen.getByText("title: Needs review.")).toBeTruthy();
    expect(screen.getByText("Text calls 1/120", { exact: false })).toBeTruthy();
    expect(screen.getByText("Balanced and Real modes are unavailable.")).toBeTruthy();
    expect(screen.getByText("Shorter suites stop at their slice boundary; full suites record generation and evaluation separately.", { exact: false })).toBeTruthy();
    expect(screen.getByText("Pending decision")).toBeTruthy();
    expect(screen.getByText("Active operation: specialist J02", { exact: false })).toBeTruthy();
    expect(screen.getByText("Active tester grant: J01, J02", { exact: false })).toBeTruthy();
    expect(screen.getByText("Saved tester decisions (1)")).toBeTruthy();
    expect(screen.getByText("Operation trace (1)")).toBeTruthy();
    expect(screen.getByText("Workflow workflow-1 · Parent parent-1")).toBeTruthy();
  });
  it("posts selected simulated creation with one retained replay key and revision controls", async () => {
    fetchMock.mockImplementation(async (_url: string, options?: RequestInit) => new Response(JSON.stringify({ data: options?.method === "POST" ? run : [run] }), { status: 200 }));
    render(<BookletRunner />);
    await screen.findByText("Kite Rescue", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "Start selected" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => url === "/api/experiments/booklet-runs" && options?.method === "POST" && options?.headers?.["Idempotency-Key"] === "00000000-0000-4000-8000-000000000010" && options?.body === JSON.stringify({ persona: "playful_kid", mode: "simulated" }))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith("/pause") && options?.body === JSON.stringify({ expectedRevision: 2 }))).toBe(true));
  });
  it("keeps failed creation for explicit retry and stops polling on unmount", async () => {
    fetchMock.mockImplementation(async (_url: string, options?: RequestInit) => options?.method === "POST" ? Promise.reject(new Error("Connection lost")) : new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const view = render(<BookletRunner />);
    await screen.findByText("No runs yet.");
    fireEvent.click(screen.getByRole("button", { name: "Start selected" }));
    expect(await screen.findByRole("button", { name: "Retry pending creation" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("The run could not be created.");
    expect(screen.getByRole("alert").textContent).not.toContain("Connection lost");
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, options]) => options?.method !== "POST").length).toBeGreaterThan(1), { timeout: 3500 });
    expect(screen.getByRole("alert").textContent).toContain("Retry will use the same request key.");
    view.unmount();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method !== "POST").length).toBeGreaterThan(0);
  });
});
