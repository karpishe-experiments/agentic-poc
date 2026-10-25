// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { BookletRunner } from "@/components/experiments/booklet-runner";

const run = { generationStatus: "in_progress", evaluationStatus: "pending", safeFailure: null, preparation: null, createdAtMs: Date.parse("2026-10-22T08:00:00Z"), updatedAtMs: Date.parse("2026-10-22T09:15:00Z"), runId: "00000000-0000-4000-8000-000000000001", persona: "playful_kid", mode: "simulated", brief: "Kite story", status: "queued", revision: 2, pauseRequested: false, activeOperationId: "operation-1", activeDelegation: { id: "grant-1", taskIds: ["J01", "J02"], subjectKind: "book", subjectId: "book-1", testerDecisionId: "decision-1" }, creatorMessages: [{ id: "decision-1", sequence: 1, content: { action: "approve", versionIds: ["version"] }, createdAtMs: 1 }], operationHistory: [{ id: "operation-1", role: "specialist", taskId: "J02", state: "started", workflowRunId: "workflow-1", parentWorkflowRunId: "parent-1", reservationCount: 1, safeFailure: null, createdAtMs: 1, updatedAtMs: 2 }], counters: { logicalText: 1, logicalImage: 0, payableText: 0, payableImage: 0, steps: 1 }, limits: { text: 120, image: 12, steps: 300 }, nextNarrativeTask: "J02", pendingDecision: { kind: "question", question: "Which kite?" }, currentArtifacts: [{ id: "artifact", taskId: "J01", state: "approved", currentVersionId: "version", versions: [{ id: "version", number: 1, content: { title: "Kite Rescue" }, warnings: [{ field: "title", message: "Needs review." }], approval: { origin: "explicit" }, dependencyVersionIds: [] }] }] };
let fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [run] }), { status: 200 }));
  vi.stubGlobal("fetch", async (url: string, options?: RequestInit) => {
    const response = await fetchMock(url, options) as Response;
    if (!url.includes("?view=summary")) return response;
    const body = await response.clone().json();
    return Array.isArray(body.data) ? new Response(JSON.stringify({ data: { runs: body.data, hasMore: false } }), { status: response.status }) : response;
  });
  vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("00000000-0000-4000-8000-000000000010") });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("booklet runner inspector", () => {
  it("shows saved context warnings without treating estimates as provider counts or disabling controls", async () => {
    const diagnostics = { version: "context_diagnostics_v1", projectionVersion: "role_v1", requestDigest: "a".repeat(64),
      contextBytes: 82000, systemPromptBytes: 1200, schemaBytes: 400, requestBytes: 85000,
      estimatedInputTokens: 21250, estimator: "utf8_bytes_div4_v1", authoritativeInputTokens: null,
      sectionBytes: { brief: 10, currentTarget: 50, approvedSources: 100, creatorMessages: 60000,
        questionAnswers: 25, currentArtifacts: 500, operationHistory: 300, feedback: 0, layout: 0, evidenceScope: 0, other: 40 },
      currentCount: 2, historyCount: 4, read: { returnedJsonBytes: 90000, elapsedMs: 11000 },
      warnings: [{ code: "read_elapsed_high", projectionVersion: "role_v1" }] };
    fetchMock.mockResolvedValue(Response.json({ data: { ...run, operationHistory: [{ ...run.operationHistory[0],
      state: "failed", contextDiagnostics: diagnostics }] } }));
    render(<BookletRunner focusedRunId={run.runId} />);
    const measurements = await screen.findByRole("region", { name: "Saved context measurements" });
    expect(measurements.textContent).toContain("Large context — preparation continued.");
    expect(measurements.textContent).toContain("Context 82000 bytes");
    expect(measurements.textContent).toContain("System prompt 1200 bytes");
    expect(measurements.textContent).toContain("Schema 400 bytes");
    expect(measurements.textContent).toContain("Request 85000 bytes");
    expect(measurements.textContent).toContain("Heuristic input estimate 21250 tokens");
    expect(measurements.textContent).toContain("authoritative input count unavailable");
    expect(measurements.textContent).toContain("creatorMessages 60000 bytes · currentArtifacts 500 bytes · operationHistory 300 bytes");
    expect(measurements.textContent).toContain("Warning codes: read_elapsed_high");
    expect(measurements.textContent).not.toContain("execution continued");
    expect((screen.getByRole("button", { name: "Pause" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("marks successful saved execution and distinguishes an authoritative count", async () => {
    const diagnostics = { version: "context_diagnostics_v1", projectionVersion: "role_v1", requestDigest: "a".repeat(64),
      contextBytes: 100, systemPromptBytes: 200, schemaBytes: 300, requestBytes: 700,
      estimatedInputTokens: 175, estimator: "utf8_bytes_div4_v1", authoritativeInputTokens: 222,
      sectionBytes: { brief: 100, currentTarget: 0, approvedSources: 0, creatorMessages: 0, questionAnswers: 0,
        currentArtifacts: 0, operationHistory: 0, feedback: 0, layout: 0, evidenceScope: 0, other: 0 },
      read: { returnedJsonBytes: null, elapsedMs: null }, warnings: [{ code: "counted_input_tokens_high", projectionVersion: "role_v1" }] };
    fetchMock.mockResolvedValue(Response.json({ data: { ...run, operationHistory: [{ ...run.operationHistory[0],
      state: "succeeded", contextDiagnostics: diagnostics }] } }));
    render(<BookletRunner focusedRunId={run.runId} />);
    const measurements = await screen.findByRole("region", { name: "Saved context measurements" });
    expect(measurements.textContent).toContain("Large context — execution continued.");
    expect(measurements.textContent).toContain("Heuristic input estimate 175 tokens");
    expect(measurements.textContent).toContain("authoritative input count 222");
  });

  it("keeps historical operations and list rows usable without measurements", async () => {
    render(<BookletRunner />);
    expect(await screen.findByText("Context measurement unavailable.")).toBeTruthy();
    expect(screen.queryByText(/Context measurements:/)).toBeNull();
    expect((screen.getByRole("button", { name: "Pause" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("renders a compact list row and opens full detail through its run link", async () => {
    const summary = { runId: run.runId, bookletId: "book-1", title: "Saved booklet title", persona: run.persona,
      mode: run.mode, status: "running", revision: 3, pauseRequested: false, activeOperationId: null,
      generationStatus: "in_progress", evaluationStatus: "pending", counters: run.counters, limits: run.limits,
      contextWarningSummary: { measuredOperations: 3, warningCount: 2 },
      createdAtMs: run.createdAtMs, updatedAtMs: run.updatedAtMs };
    fetchMock.mockResolvedValue(Response.json({ data: { runs: [summary], hasMore: false } }));
    render(<BookletRunner />);
    expect(await screen.findByText("Saved booklet title")).toBeTruthy();
    expect(screen.getByText("Context measurements: 3 operations · 2 warnings")).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Open run:/ }).getAttribute("href")).toBe(`/experiments/booklet-runs/${run.runId}`);
    expect(screen.queryByText("Operation trace (1)")).toBeNull();
    expect(fetchMock.mock.calls.every(([url]) => url.includes("?view=summary"))).toBe(true);
  });
  it("keeps completed advisory failures terminal and does not infer a missing tester from summary data", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ ...run, status: "completed", evaluationStatus: "failed", generationStatus: "complete", activeOperationId: null }] })));
    render(<BookletRunner />);
    expect(await screen.findByText("Completed — evaluation incomplete")).toBeTruthy();
    expect(screen.getByText(/Open the run for the retained evaluation failure/)).toBeTruthy();
    expect(screen.queryByText(/judge was not run/)).toBeNull();
    expect((screen.getByRole("button", { name: "Pause" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    expect(fetchMock.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
  });
  it("explains tester failure and dependent judge omission in saved detail", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ ...run, status: "completed", evaluationStatus: "failed", generationStatus: "complete", activeOperationId: null, reports: [] }] })));
    render(<BookletRunner />);
    expect(await screen.findByText(/The judge was not run because tester evaluation failed/)).toBeTruthy();
    expect(fetchMock.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
  });
  it("shows local report rejection separately from provider counts and charges", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ ...run, status: "completed", evaluationStatus: "failed", generationStatus: "complete", activeOperationId: null,
      operationHistory: [{ ...run.operationHistory[0], role: "tester", taskId: null, state: "failed", reservationCount: 0,
        localReportFailure: { code: "report_request_too_large", scope: "request", requestBytes: 131073, byteLimit: 131072 } }] }] })));
    render(<BookletRunner />);
    expect(await screen.findByText(/131073\/131072 bytes\. No provider request was sent or reserved/)).toBeTruthy();
    expect(fetchMock.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
  });
  it("does not claim uncertain remote work has stopped", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ ...run, status: "blocked", safeFailure: "unknown_outcome" }] })));
    render(<BookletRunner />);
    expect(await screen.findByText("Run blocked. Inspect the saved details before continuing; unresolved work may still finish.")).toBeTruthy();
    expect(screen.queryByText(/Execution stopped/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue inspected run" })).toBeNull();
    expect(fetchMock.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
  });
  it("shows recorded UTC times and a direct open link even without a booklet ID", async () => {
    render(<BookletRunner />);
    const started = await screen.findByText("22 Oct 2026, 08:00:00 UTC");
    expect(started.getAttribute("datetime")).toBe("2026-10-22T08:00:00.000Z");
    expect(screen.getByText("22 Oct 2026, 09:15:00 UTC").getAttribute("datetime")).toBe("2026-10-22T09:15:00.000Z");
    expect(screen.getByRole("link", { name: /^Open run:/ }).getAttribute("href")).toBe(`/experiments/booklet-runs/${run.runId}`);
    expect(fetchMock.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ ...run, updatedAtMs: Date.parse("2026-10-22T09:20:00Z") }] })));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("22 Oct 2026, 09:20:00 UTC")).toBeTruthy();
    expect(screen.getByText("22 Oct 2026, 08:00:00 UTC")).toBeTruthy();
  });
  it("does not invent timestamps for historical records", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ ...run, createdAtMs: undefined, updatedAtMs: undefined }] })));
    render(<BookletRunner />);
    expect(await screen.findAllByText("Unavailable", { exact: true })).toHaveLength(2);
    expect(screen.getByText("Started")).toBeTruthy();
    expect(screen.getByText("Latest update")).toBeTruthy();
  });

  it("shows retained Balanced allowance separately from invoice cost", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ ...run, mode: "balanced", m4Accounting: {
      campaignId: "campaign-safe-id", state: "active", requests: 7, maxRequests: 500, runRequests: 7, runMaxRequests: 120,
      reservedMicrodollars: 6300, settledMicrodollars: 1000, remainingMicrodollars: 4992700, maxMicrodollars: 5000000,
      countChargeStatus: "assumed", invoiceCostAvailable: false,
    } }] })));
    render(<BookletRunner />);
    const accounting = await screen.findByRole("region", { name: "Balanced campaign accounting" });
    expect(accounting.textContent).toContain("Campaign requests 7/500");
    expect(accounting.textContent).toContain("Run requests 7/120");
    expect(accounting.textContent).toContain("Reserved $0.006300");
    expect(accounting.textContent).toContain("Settled upper bound $0.001000");
    expect(accounting.textContent).toContain("Remaining $4.992700 of $5.000000");
    expect(accounting.textContent).toContain("assumed; allowance retained");
    expect(accounting.textContent).toContain("Invoice cost unavailable");
  });
  it.each(["disabled", "invalid", "ready"] as const)("keeps Balanced creation closed when readiness is %s", async (m4State) => {
    render(<BookletRunner balancedEnabled={false} m4State={m4State} />);
    await screen.findByText("Kite Rescue", { exact: false });
    expect((screen.getByRole("combobox", { name: "Mode" }) as HTMLSelectElement).value).toBe("simulated");
    expect((screen.getByRole("option", { name: /^Balanced$/ }) as HTMLOptionElement).disabled).toBe(true);
    expect((screen.getByRole("option", { name: "Real (unavailable)" }) as HTMLOptionElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "Mode" }), { target: { value: "balanced" } });
    expect((screen.getByRole("combobox", { name: "Mode" }) as HTMLSelectElement).value).toBe("simulated");
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
  });
  it("retains the selected Balanced mode and key for explicit retry and hides bulk creation", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockImplementation(async (_url, options) => options?.method === "POST" ? Promise.reject(new Error("lost")) :
      new Response(JSON.stringify({ data: [] })));
    const view = render(<BookletRunner balancedEnabled m4State="granted" />);
    await screen.findByText("No runs yet.");
    fireEvent.change(screen.getByRole("combobox", { name: "Mode" }), { target: { value: "balanced" } });
    expect(screen.queryByRole("button", { name: "Start all three" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start selected" }));
    await screen.findByRole("alert");
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
    fireEvent.change(screen.getByRole("combobox", { name: "Mode" }), { target: { value: "simulated" } });
    view.rerender(<BookletRunner m4State="ready" />);
    expect((screen.getByRole("button", { name: "Retry pending creation" }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<BookletRunner balancedEnabled m4State="granted" />);
    fireEvent.click(screen.getByRole("button", { name: "Retry pending creation" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(2));
    const writes = fetchMock.mock.calls.filter(([, options]) => options?.method === "POST");
    for (const [, options] of writes) {
      expect(JSON.parse(String(options?.body))).toEqual({ persona: "playful_kid", mode: "balanced" });
      expect(new Headers(options?.headers).get("Idempotency-Key")).toBe("00000000-0000-4000-8000-000000000010");
    }
    expect(timeout.mock.calls.filter(([milliseconds]) => milliseconds === 60_000)).toHaveLength(2);
    timeout.mockRestore();
  });
  it("labels saved Balanced images simulated and offers no linked successor", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ ...run, mode: "balanced", status: "blocked", activeOperationId: null,
      currentArtifacts: [{ ...run.currentArtifacts[0], taskId: "J13", versions: [{ ...run.currentArtifacts[0].versions[0],
        content: { pageIndex: 0, assetId: "00000000-0000-4000-8000-000000000020" } }] }] }] })));
    render(<BookletRunner />);
    expect(await screen.findByText(/Cover image.*Simulated fixture/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start linked successor" })).toBeNull();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
  });
  it("polls unresolved blocked summaries and stops after terminal recovery", async () => {
    vi.useFakeTimers();
    let active = true;
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ data: [{ ...run, status: "blocked",
      activeOperationId: active ? "operation-1" : null }] })));
    render(<BookletRunner />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const initial = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(initial);
    active = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    const terminal = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(fetchMock.mock.calls).toHaveLength(terminal);
    expect(fetchMock.mock.calls.every(([url]) => url.includes("?view=summary"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(terminal);
  });
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
    expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({ expectedRevision: 2, batch: { selection: "selected_batch",
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
    expect(await screen.findByText("Booklet generation")).toBeTruthy();
    expect(screen.getByText("Complete", { exact: true })).toBeTruthy();
    expect(screen.getByText("Running", { exact: true })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Open run:/ }).getAttribute("href")).toBe(`/experiments/booklet-runs/${run.runId}`);
    expect(screen.getByText("Tester feedback · simulated")).toBeTruthy();
    expect(screen.getByText("Independent judge assessment · simulated")).toBeTruthy();
    expect(screen.getByText("Current artifact versions: do not match; report is historical")).toBeTruthy();
    expect(fetchMock.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
  });
  it("shows unavailable duration for a terminal historical operation without an end timestamp", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ ...run, status: "completed",
      operationHistory: [{ ...run.operationHistory[0], state: "succeeded", elapsedMs: null }] }] })));
    render(<BookletRunner />);
    expect(await screen.findByText(/Elapsed: unavailable/)).toBeTruthy();
  });
  it("loads a saved runner booklet through its detail API, not the legacy workspace", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { ...run, bookletId: "saved-book", status: "blocked" } })));
    render(<BookletRunner focusedRunId={run.runId} />);
    expect(await screen.findByText("Booklet saved-book")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to all runs" }).getAttribute("href")).toBe("/experiments/booklet-runs");
    expect(screen.queryByRole("button", { name: "Start selected" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start linked successor" })).toBeNull();
    expect(fetchMock.mock.calls.every(([url, options]) => url === `/api/experiments/booklet-runs/${run.runId}` && options?.method !== "POST")).toBe(true);
  });
  it("retains a completion receipt when the full detail refresh fails", async () => {
    const blocked = { ...run, status: "blocked", activeOperationId: null, safeFailure: "definite_failure", generationStatus: "complete" };
    const completed = { ...blocked, status: "completed", safeFailure: null, evaluationStatus: "failed", revision: 3 };
    let saved = false;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") { saved = true; return Response.json({ data: completed }); }
      if (saved) throw new Error("Details unavailable");
      return Response.json({ data: blocked });
    });
    render(<BookletRunner focusedRunId={run.runId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Finalize completed booklet" }));
    expect(await screen.findByText("Change saved. Run details could not be refreshed.")).toBeTruthy();
    expect(screen.getByText(/Completed . evaluation incomplete/)).toBeTruthy();
    expect(screen.getByText(/Kite Rescue/)).toBeTruthy();
    expect(screen.getByText("Saved details are awaiting refresh.")).toBeTruthy();
    expect(screen.queryByText("The run could not be updated.")).toBeNull();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });
  it.each(["lost", "malformed", "missing", "server"])("reconciles a %s response with one compact read and no write replay", async failure => {
    const paused = { ...run, status: "paused", pauseRequested: true, activeOperationId: null, revision: 3 };
    let saved = false;
    fetchMock.mockImplementation(async (url, options) => {
      if (options?.method === "POST") {
        saved = true;
        if (failure === "lost") throw new Error("Lost acknowledgement");
        if (failure === "missing") return Response.json({});
        return failure === "malformed" ? Response.json({ data: { status: "paused" } }) : Response.json({ error: { message: "Unavailable" } }, { status: 503 });
      }
      return Response.json({ data: url.endsWith("?view=control") || saved ? paused : run });
    });
    render(<BookletRunner focusedRunId={run.runId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Pause" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith("?view=control"))).toBe(true));
    expect(await screen.findByRole("button", { name: "Resume" })).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("?view=control"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
    expect(screen.queryByText("Change saved.")).toBeNull();
  });
  it("keeps mutations disabled after failed reconciliation until a successful refresh", async () => {
    const paused = { ...run, status: "paused", activeOperationId: null, pauseRequested: true };
    let attempted = false;
    let readable = false;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") { attempted = true; throw new Error("lost"); }
      if (attempted && !readable) throw new Error("read unavailable");
      return Response.json({ data: paused });
    });
    render(<BookletRunner focusedRunId={run.runId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    expect(await screen.findByText("The update could not be confirmed. Check saved status before trying again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume" }).hasAttribute("disabled")).toBe(true);
    readable = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Resume" }).hasAttribute("disabled")).toBe(false));
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });
  it("does not overwrite a receipt with an older in-flight full read", async () => {
    const initial = { ...run, status: "paused", pauseRequested: true, activeOperationId: null };
    let resolveOld!: (response: Response) => void;
    let reads = 0;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") return Response.json({ data: { ...initial, status: "completed", evaluationStatus: "failed", revision: 3 } });
      reads += 1;
      if (reads === 1) return Response.json({ data: initial });
      if (reads === 2) return new Promise<Response>(resolve => { resolveOld = resolve; });
      throw new Error("new read unavailable");
    });
    render(<BookletRunner focusedRunId={run.runId} />);
    await screen.findByRole("button", { name: "Resume" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await screen.findByText("Change saved. Run details could not be refreshed.");
    await act(async () => resolveOld(Response.json({ data: initial })));
    expect(screen.getByText(/Completed . evaluation incomplete/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume" }).hasAttribute("disabled")).toBe(true);
  });
  it("never retries a generic state rejection as a revision conflict", async () => {
    fetchMock.mockImplementation(async (_url, options) => options?.method === "POST"
      ? Response.json({ error: { code: "conflict", message: "Saved state conflicts with the request." } }, { status: 409 })
      : Response.json({ data: run }));
    render(<BookletRunner focusedRunId={run.runId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Pause" }));
    await screen.findByRole("alert");
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("?view=control"))).toHaveLength(0);
  });
  it("keeps a newer full-detail revision when an older overlapping read arrives", async () => {
    const initial = { ...run, status: "paused", pauseRequested: true, activeOperationId: null };
    const resumed = { ...initial, status: "running", pauseRequested: false, revision: 3 };
    const complete = { ...resumed, status: "completed", evaluationStatus: "failed", revision: 4 };
    const pendingReads: ((response: Response) => void)[] = [];
    let reads = 0;
    fetchMock.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") return Response.json({ data: resumed });
      if (++reads === 1) return Response.json({ data: initial });
      return new Promise<Response>(resolve => { pendingReads.push(resolve); });
    });
    render(<BookletRunner focusedRunId={run.runId} />);
    await screen.findByRole("button", { name: "Resume" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(pendingReads).toHaveLength(2));
    await act(async () => pendingReads[0](Response.json({ data: initial })));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(pendingReads).toHaveLength(3));
    await act(async () => pendingReads[2](Response.json({ data: complete })));
    expect(screen.getByText("Revision 4")).toBeTruthy();
    await act(async () => pendingReads[1](Response.json({ data: resumed })));
    expect(screen.getByText("Revision 4")).toBeTruthy();
    expect(screen.getByText(/Completed . evaluation incomplete/)).toBeTruthy();
  });
  it("reads current state and retries a definite control conflict once", async () => {
    let writes = 0;
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        writes += 1;
        return writes === 1
          ? new Response(JSON.stringify({ error: { code: "stale_revision", message: "Saved state conflicts with the request." } }), { status: 409 })
          : new Response(JSON.stringify({ data: { ...run, revision: 5, pauseRequested: true, status: "paused" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: (url.endsWith(run.runId) || url.endsWith(`${run.runId}?view=control`)) ? { ...run, revision: 4 } : [run] }), { status: 200 });
    });
    render(<BookletRunner />);
    await screen.findByText("Kite Rescue", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(writes).toBe(2));
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST").map(([, options]) => JSON.parse(String(options?.body)).expectedRevision)).toEqual([2, 4]);
    expect(fetchMock.mock.calls.some(([url, options]) => (url.endsWith(run.runId) || url.endsWith(`${run.runId}?view=control`)) && options?.cache === "no-store")).toBe(true);
  });
  it("does not repeat a control already applied in the read-back state", async () => {
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => options?.method === "POST"
      ? new Response(JSON.stringify({ error: { code: "stale_revision", message: "Saved state conflicts with the request." } }), { status: 409 })
      : new Response(JSON.stringify({ data: (url.endsWith(run.runId) || url.endsWith(`${run.runId}?view=control`)) ? { ...run, revision: 4, pauseRequested: true, status: "paused" } : [run] }), { status: 200 }));
    render(<BookletRunner />);
    await screen.findByText("Kite Rescue", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => (url.endsWith(run.runId) || url.endsWith(`${run.runId}?view=control`)))).toBe(true));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start selected" }).hasAttribute("disabled")).toBe(false));
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });
  it.each(["lost response", "repeat conflict"])("bounds control retry after %s", async (failure) => {
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        if (failure === "lost response") throw new Error("Response lost");
        return new Response(JSON.stringify({ error: { code: "stale_revision", message: "Saved state conflicts with the request." } }), { status: 409 });
      }
      return new Response(JSON.stringify({ data: (url.endsWith(run.runId) || url.endsWith(`${run.runId}?view=control`)) ? { ...run, revision: 4 } : [run] }), { status: 200 });
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
      ? new Response(JSON.stringify({ error: { code: "stale_revision", message: "Saved state conflicts with the request." } }), { status: 409 })
      : new Response(JSON.stringify({ data: (url.endsWith(run.runId) || url.endsWith(`${run.runId}?view=control`)) ? { ...paused, revision: 4, status: "blocked" } : [paused] }), { status: 200 }));
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
      expect(new Headers(options?.headers).get("Idempotency-Key")).toBe("00000000-0000-4000-8000-000000000010");
      expect(JSON.parse(String(options?.body))).toEqual({ persona: "playful_kid", mode: "simulated", predecessorRunId: run.runId });
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
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => url === "/api/experiments/booklet-runs" && options?.method === "POST" && new Headers(options?.headers).get("Idempotency-Key") === "00000000-0000-4000-8000-000000000010" && options?.body === JSON.stringify({ persona: "playful_kid", mode: "simulated" }))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith("/pause") && options?.body === JSON.stringify({ expectedRevision: 2, responseMode: "receipt" }))).toBe(true));
  });
  it("keeps failed creation for explicit retry and stops polling on unmount", async () => {
    fetchMock.mockImplementation(async (_url: string, options?: RequestInit) => options?.method === "POST" ? Promise.reject(new Error("Connection lost")) : new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const view = render(<BookletRunner />);
    await screen.findByText("No runs yet.");
    fireEvent.click(screen.getByRole("button", { name: "Start selected" }));
    expect(await screen.findByRole("button", { name: "Retry pending creation" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("The run could not be created.");
    expect(screen.getByRole("alert").textContent).not.toContain("Connection lost");
    // Empty/terminal pages do not keep polling. Manual Refresh stays available.
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, options]) => options?.method !== "POST").length).toBeGreaterThan(1));
    expect(screen.getByRole("alert").textContent).toContain("Retry will use the same request key.");
    view.unmount();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method !== "POST").length).toBeGreaterThan(0);
  });
});
