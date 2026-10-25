import { describe, expect, it, vi } from "vitest";
import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";
import type { ConfigState } from "@/lib/experiment-runner/config";
import * as repositoryModule from "@/db/experiment-repository";
import * as contextModule from "@/lib/experiment-runner/context";
import * as completionModule from "@/db/experiment-completion";
import type { Database } from "@/db/client";
import type { AssetStore } from "@/lib/assets/asset-store";
import { assertOperationBudget, operationBudgetRemainingMs, withOperationBudget } from "@/lib/operations/budget";

const disabled: ConfigState = { enabled: false, reason: "disabled" };
const invalid: ConfigState = { enabled: false, reason: "invalid" };
const enabled: ConfigState = { enabled: true, config: { enabled: true, baseUrl: "https://dify.example.test", publicOrigin: "http://localhost:3000", callbackKey: "x".repeat(32), bindings: [] } };
const request = (headers: Record<string, string> = {}, body = "{}") => new Request("http://localhost:3000/api/experiments/booklet-tools/authorize", { method: "POST", headers, body });
const imageUrl = "http://localhost:3000/api/experiments/booklet-tools/image?runId=00000000-0000-4000-8000-000000000001&operationId=00000000-0000-4000-8000-000000000002&workflowRunId=00000000-0000-4000-8000-000000000003&inputFingerprint=" + "a".repeat(64);

describe("booklet runner HTTP boundary", () => {
  const controlRunId = "00000000-0000-4000-8000-000000000001";
  const savedControl = { _id: controlRunId, revision: 8, status: "paused", pauseRequested: true,
    generationCompletedAtMs: null, evaluationStatus: "pending", updatedAtMs: 2000,
    safeFailure: null, activeOperationId: null, preparation: null, configurationJson: "private" };
  const receiptFor = (saved: Omit<typeof savedControl, "generationCompletedAtMs"> & { generationCompletedAtMs: number | null }) => ({ runId: saved._id, revision: saved.revision,
    status: saved.status, pauseRequested: saved.pauseRequested,
    generationStatus: saved.generationCompletedAtMs == null ? "in_progress" : "complete",
    evaluationStatus: saved.evaluationStatus, updatedAtMs: saved.updatedAtMs,
    safeFailure: saved.safeFailure, activeOperationId: saved.activeOperationId, preparation: saved.preparation });

  it.each([false, true])("allows creation and its full detail read beyond 30 seconds (existing=%s)", async existing => {
    let now = 1_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const saved = { _id: controlRunId, persona: "playful_kid", mode: "simulated", predecessorRunId: null };
    const createRun = vi.fn(async () => { now += 31_000; assertOperationBudget(); return saved; });
    const getRun = vi.fn(async () => {
      expect(operationBudgetRemainingMs()).toBe(60_000);
      if (existing) now += 31_000;
      return existing ? saved : null;
    });
    const repository = vi.spyOn(repositoryModule, "createExperimentRepository").mockReturnValue({ getRun, createRun } as unknown as ReturnType<typeof repositoryModule.createExperimentRepository>);
    const getRunView = vi.fn(async () => { expect(operationBudgetRemainingMs()).toBe(29_000); assertOperationBudget(); return { runId: controlRunId }; });
    const context = vi.spyOn(contextModule, "createExperimentContextService").mockReturnValue({ getRunView } as unknown as ReturnType<typeof contextModule.createExperimentContextService>);
    try {
      const http = createBookletRunnerHttp({ config: () => enabled, database: () => ({} as Database), store: () => ({} as AssetStore), mutate: action => action() });
      const response = await http.create(request({ origin: enabled.config.publicOrigin, "idempotency-key": controlRunId }, JSON.stringify({ persona: "playful_kid", mode: "simulated" })));
      expect(response.status).toBe(existing ? 200 : 201);
      expect(await response.json()).toEqual({ data: { runId: controlRunId } });
      expect(createRun).toHaveBeenCalledTimes(existing ? 0 : 1);
    } finally { clock.mockRestore(); repository.mockRestore(); context.mockRestore(); }
  });

  it.each([false, true])("does not renew creation's deadline or a shorter inherited deadline (nested=%s)", async nested => {
    let now = 1_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const createRun = vi.fn();
    const repository = vi.spyOn(repositoryModule, "createExperimentRepository").mockReturnValue({ getRun: async () => null, createRun } as unknown as ReturnType<typeof repositoryModule.createExperimentRepository>);
    const context = vi.spyOn(contextModule, "createExperimentContextService").mockReturnValue({ getRunView: vi.fn() } as unknown as ReturnType<typeof contextModule.createExperimentContextService>);
    try {
      const http = createBookletRunnerHttp({ config: () => enabled, database: () => ({} as Database), store: () => ({} as AssetStore), mutate: async action => {
        expect(operationBudgetRemainingMs()).toBe(nested ? 20_000 : 60_000);
        now += nested ? 21_000 : 61_000; assertOperationBudget(); return action();
      } });
      const create = () => http.create(request({ origin: enabled.config.publicOrigin, "idempotency-key": controlRunId }, JSON.stringify({ persona: "playful_kid", mode: "simulated" })));
      if (nested) await expect(withOperationBudget(now + 20_000, create)).rejects.toThrow("budget expired");
      else expect((await create()).status).toBe(503);
      expect(createRun).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); repository.mockRestore(); context.mockRestore(); }
  });

  it.each(["detail", "pause"] as const)("keeps %s on its original 30-second deadline", async endpoint => {
    let now = 1_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const work = vi.fn(async () => { expect(operationBudgetRemainingMs()).toBe(30_000); now += 31_000; assertOperationBudget(); });
    const repository = vi.spyOn(repositoryModule, "createExperimentRepository").mockReturnValue({ getRun: async () => savedControl, pause: work } as unknown as ReturnType<typeof repositoryModule.createExperimentRepository>);
    const context = vi.spyOn(contextModule, "createExperimentContextService").mockReturnValue({ getRunView: work } as unknown as ReturnType<typeof contextModule.createExperimentContextService>);
    try {
      const http = createBookletRunnerHttp({ config: () => enabled, database: () => ({} as Database), store: () => ({} as AssetStore), mutate: action => action() });
      const response = endpoint === "detail" ? await http.detail(new Request("http://localhost:3000"), controlRunId)
        : await http.control(request({ origin: enabled.config.publicOrigin }, '{"expectedRevision":8,"responseMode":"receipt"}'), controlRunId, "pause");
      expect(response.status).toBe(503); expect(work).toHaveBeenCalledTimes(1);
    } finally { clock.mockRestore(); repository.mockRestore(); context.mockRestore(); }
  });

  it.each(["pause", "resume"] as const)("acknowledges %s without loading the full run", async (action) => {
    const saved = { ...savedControl, status: action === "pause" ? "paused" : "running", pauseRequested: action === "pause" };
    const save = vi.fn().mockResolvedValue(saved);
    const getRunView = vi.fn().mockRejectedValue(new Error("Detail read unavailable"));
    const repository = vi.spyOn(repositoryModule, "createExperimentRepository").mockReturnValue({
      getRun: async () => ({ ...savedControl, revision: 7 }), [action]: save,
    } as unknown as ReturnType<typeof repositoryModule.createExperimentRepository>);
    const context = vi.spyOn(contextModule, "createExperimentContextService").mockReturnValue({ getRunView } as unknown as ReturnType<typeof contextModule.createExperimentContextService>);
    try {
      const ownership = vi.fn();
      const http = createBookletRunnerHttp({ config: () => enabled, database: () => ({ collections: {} } as Database),
        store: () => ({} as AssetStore), mutate: async (operation, options) => { ownership(options); return operation(); } });
      const response = await http.control(request({ origin: "http://localhost:3000" }, JSON.stringify({ expectedRevision: 7, responseMode: "receipt" })), controlRunId, action);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: receiptFor(saved) });
      expect(save).toHaveBeenCalledWith({ runId: controlRunId, expectedRevision: 7, nowMs: expect.any(Number) });
      expect(ownership).toHaveBeenCalledWith({ runId: controlRunId });
      expect(getRunView).not.toHaveBeenCalled();
    } finally { repository.mockRestore(); context.mockRestore(); }
  });

  it("returns a finalization receipt only after tracked mutation cleanup succeeds", async () => {
    const saved = { ...savedControl, status: "completed", pauseRequested: false, generationCompletedAtMs: 1000, evaluationStatus: "failed" };
    const completeAdvisoryFailure = vi.fn().mockResolvedValue(saved);
    const resume = vi.fn();
    const getRunView = vi.fn().mockRejectedValue(new Error("Detail read unavailable"));
    const repository = vi.spyOn(repositoryModule, "createExperimentRepository").mockReturnValue({
      getRun: async () => ({ ...saved, status: "blocked", revision: 7 }), resume,
    } as unknown as ReturnType<typeof repositoryModule.createExperimentRepository>);
    const context = vi.spyOn(contextModule, "createExperimentContextService").mockReturnValue({ getRunView } as unknown as ReturnType<typeof contextModule.createExperimentContextService>);
    const completion = vi.spyOn(completionModule, "createExperimentCompletionService").mockReturnValue({ completeAdvisoryFailure } as unknown as ReturnType<typeof completionModule.createExperimentCompletionService>);
    try {
      for (const cleanupFails of [false, true]) {
        const http = createBookletRunnerHttp({ config: () => enabled, database: () => ({ collections: {} } as Database),
          store: () => ({} as AssetStore), mutate: async (operation) => { const result = await operation(); if (cleanupFails) throw new Error("Claim cleanup failed"); return result; } });
        const response = await http.control(request({ origin: "http://localhost:3000" }, JSON.stringify({ expectedRevision: 7, responseMode: "receipt" })), controlRunId, "resume");
        expect(response.status).toBe(cleanupFails ? 503 : 200);
        expect(await response.json()).toEqual(cleanupFails ? { error: { code: "unavailable", message: "Runner is temporarily unavailable." } } : { data: receiptFor(saved) });
      }
      expect(resume).not.toHaveBeenCalled();
      expect(getRunView).not.toHaveBeenCalled();
      expect(completeAdvisoryFailure).toHaveBeenCalledWith({ runId: controlRunId, expectedRevision: 7, nowMs: expect.any(Number) });
    } finally { repository.mockRestore(); context.mockRestore(); completion.mockRestore(); }
  });

  it("keeps the default control and detail response contracts", async () => {
    const view = { runId: controlRunId, artifacts: [{ artifactId: "retained" }] };
    const getRunView = vi.fn().mockResolvedValue(view);
    const repository = vi.spyOn(repositoryModule, "createExperimentRepository").mockReturnValue({
      getRun: async () => savedControl, pause: async () => savedControl,
    } as unknown as ReturnType<typeof repositoryModule.createExperimentRepository>);
    const context = vi.spyOn(contextModule, "createExperimentContextService").mockReturnValue({ getRunView } as unknown as ReturnType<typeof contextModule.createExperimentContextService>);
    try {
      const http = createBookletRunnerHttp({ config: () => enabled, database: () => ({ collections: {} } as Database), store: () => ({} as AssetStore), mutate: (operation) => operation() });
      const response = await http.control(request({ origin: "http://localhost:3000" }, JSON.stringify({ expectedRevision: 7 })), controlRunId, "pause");
      expect(await response.json()).toEqual({ data: view });
      expect(await (await http.detail(new Request("http://localhost:3000/api/experiments/booklet-runs/" + controlRunId), controlRunId)).json()).toEqual({ data: view });
      expect(getRunView).toHaveBeenCalledTimes(2);
    } finally { repository.mockRestore(); context.mockRestore(); }
  });

  it.each([["invalid_result", 422], ["invalid_state", 409], ["stale_revision", 409]] as const)("does not acknowledge a rejected %s mutation", async (code, status) => {
    const pause = vi.fn().mockRejectedValue(new repositoryModule.ExperimentRepositoryError(code, "Rejected fixture"));
    const getRunView = vi.fn();
    const repository = vi.spyOn(repositoryModule, "createExperimentRepository").mockReturnValue({
      getRun: async () => savedControl, pause,
    } as unknown as ReturnType<typeof repositoryModule.createExperimentRepository>);
    const context = vi.spyOn(contextModule, "createExperimentContextService").mockReturnValue({ getRunView } as unknown as ReturnType<typeof contextModule.createExperimentContextService>);
    try {
      const http = createBookletRunnerHttp({ config: () => enabled, database: () => ({ collections: {} } as Database),
        store: () => ({} as AssetStore), mutate: (operation) => operation() });
      const response = await http.control(request({ origin: "http://localhost:3000" }, JSON.stringify({ expectedRevision: 7, responseMode: "receipt" })), controlRunId, "pause");
      expect(response.status).toBe(status);
      const rejected = await response.json();
      expect(rejected).not.toHaveProperty("data");
      expect(rejected.error.code).toBe(code === "stale_revision" ? "stale_revision" : code === "invalid_state" ? "conflict" : "invalid_result");
      const legacy = await http.control(request({ origin: "http://localhost:3000" }, JSON.stringify({ expectedRevision: 7 })), controlRunId, "pause");
      expect((await legacy.json()).error.code).toBe(code === "invalid_result" ? "invalid_result" : "conflict");
      expect(getRunView).not.toHaveBeenCalled();
    } finally { repository.mockRestore(); context.mockRestore(); }
  });

  it("projects compact control state without constructing storage or full detail views", async () => {
    const findOne = vi.fn().mockResolvedValue(savedControl);
    const store = vi.fn(() => { throw new Error("Control reads must not construct storage"); });
    const context = vi.spyOn(contextModule, "createExperimentContextService");
    try {
      const http = createBookletRunnerHttp({ config: () => enabled,
        database: () => ({ collections: { experiment_runs: { findOne } } } as unknown as Database), store });
      const url = "http://localhost:3000/api/experiments/booklet-runs/" + controlRunId + "?view=control";
      const response = await http.detail(new Request(url), controlRunId);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: receiptFor(savedControl) });
      expect(findOne.mock.calls[0][0]).toEqual({ _id: controlRunId });
      expect(findOne.mock.calls[0][1].projection).toEqual({ _id: 1, revision: 1, status: 1, pauseRequested: 1,
        generationCompletedAtMs: 1, evaluationStatus: 1, updatedAtMs: 1, safeFailure: 1, activeOperationId: 1, preparation: 1 });
      expect(store).not.toHaveBeenCalled();
      expect(context).not.toHaveBeenCalled();
      findOne.mockResolvedValueOnce(null);
      expect((await http.detail(new Request(url), controlRunId)).status).toBe(404);
    } finally { context.mockRestore(); }
  });

  it("validates receipt controls and authenticates compact reads before database access", async () => {
    const database = vi.fn(() => { throw new Error("Unexpected database access"); });
    const http = createBookletRunnerHttp({ config: () => enabled, database });
    for (const action of ["pause", "resume"] as const) {
      expect((await http.control(request({ origin: "http://localhost:3001" }, JSON.stringify({ expectedRevision: 7, responseMode: "receipt" })), controlRunId, action)).status).toBe(403);
      for (const body of [{ expectedRevision: -1, responseMode: "receipt" }, { expectedRevision: 7, responseMode: "unknown" }, { responseMode: "receipt" }]) {
        expect((await http.control(request({ origin: "http://localhost:3000" }, JSON.stringify(body)), controlRunId, action)).status).toBe(400);
      }
    }
    vi.stubEnv("DEPLOYMENT_ENV", "_staging");
    vi.stubEnv("ACCESS_GATE_PASSWORD", "fixture-password-long-enough");
    try {
      expect((await http.detail(new Request("http://localhost:3000/api/experiments/booklet-runs/" + controlRunId + "?view=control"), controlRunId)).status).toBe(401);
      expect((await http.control(request({ origin: "http://localhost:3000" }, JSON.stringify({ expectedRevision: 7, responseMode: "receipt" })), controlRunId, "resume")).status).toBe(401);
    } finally { vi.unstubAllEnvs(); }
    expect(database).not.toHaveBeenCalled();
  });
  it("retains exact mutation ownership for a failure callback", async () => {
    const runId = "00000000-0000-4000-8000-000000000001";
    const operationId = "00000000-0000-4000-8000-000000000002";
    const failOperation = vi.fn().mockResolvedValue({ state: "failed" });
    const factory = vi.spyOn(repositoryModule, "createExperimentRepository").mockReturnValue({
      getRun: async () => ({ mode: "simulated" }), failOperation,
    } as unknown as ReturnType<typeof repositoryModule.createExperimentRepository>);
    const ownership = vi.fn();
    const mutate: typeof import("@/lib/application/deployment-control").runTrackedMutation = async (operation, options) => {
      ownership(options); return operation();
    };
    try {
      const http = createBookletRunnerHttp({ config: () => enabled, database: () => ({ collections: {} } as Database),
        store: () => ({} as AssetStore), mutate });
      const response = await http.tool(request({ "x-booklet-tool-key": "x".repeat(32) }, JSON.stringify({ runId, operationId,
        workflowRunId: "00000000-0000-4000-8000-000000000003", parentWorkflowRunId: null, category: "definite_failure" })), "failure");
      expect(response.status).toBe(200);
      expect(ownership).toHaveBeenCalledWith({ admitted: true, runId, operationId });
    } finally { factory.mockRestore(); }
  });
  it("pages summary metadata without constructing artifact or storage views", async () => {
    const rows = [{ _id: "run-1", bookletId: "book-1", brief: "Fallback title", persona: "playful_kid", status: "completed", createdAtMs: 1000, updatedAtMs: 2000, counters: {}, limits: {}, configurationJson: "private" },
      { _id: "run-2" }];
    const cursor = { sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue(rows) };
    const find = vi.fn().mockReturnValue(cursor);
    const findBooklets = vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ _id: "book-1", workingTitle: "Saved booklet title" }]) });
    const store = vi.fn(() => { throw new Error("Summary must not read bytes"); });
    const http = createBookletRunnerHttp({ config: () => enabled,
      database: () => ({ collections: { experiment_runs: { find }, booklets: { find: findBooklets } } } as unknown as Database), store });
    const response = await http.list(new Request("http://localhost:3000/api/experiments/booklet-runs?view=summary&page=2&limit=1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { page: 2, hasMore: true, runs: [{ runId: "run-1", title: "Saved booklet title", createdAtMs: 1000, updatedAtMs: 2000 }] } });
    expect(cursor.skip).toHaveBeenCalledWith(2);
    expect(cursor.limit).toHaveBeenCalledWith(2);
    expect(find.mock.calls[0][1].projection.configurationJson).toBeUndefined();
    expect(find.mock.calls[0][1].projection).toMatchObject({ createdAtMs: 1, updatedAtMs: 1 });
    expect(findBooklets).toHaveBeenCalledWith({ _id: { $in: ["book-1"] } }, { projection: { _id: 1, workingTitle: 1 } });
    expect(store).not.toHaveBeenCalled();
    expect((await http.list(new Request("http://localhost:3000/api/experiments/booklet-runs?view=summary&limit=1000"))).status).toBe(400);
    const legacy = await http.summaries(new Request("http://localhost:3000/api/experiments/booklet-runs/summaries?page=2&limit=1"));
    expect((await legacy.json()).data.runs[0].title).toBe("Saved booklet title");
    expect(find).toHaveBeenCalledTimes(2);
  });
  it("protects inspect and stop before reading operation state", async () => {
    const database = vi.fn(() => { throw new Error("unexpected database access"); });
    const http = createBookletRunnerHttp({ config: () => enabled, database });
    const runId = "00000000-0000-4000-8000-000000000001";
    for (const action of ["inspect", "stop"] as const) {
      expect((await http.operationControl(request({ origin: "http://localhost:3001" }), runId, action)).status).toBe(403);
      expect((await http.operationControl(request({ origin: "http://localhost:3000" }), runId, action)).status).toBe(400);
      vi.stubEnv("DEPLOYMENT_ENV", "_staging");
      vi.stubEnv("ACCESS_GATE_PASSWORD", "fixture-password-long-enough");
      try {
        expect((await http.operationControl(request({ origin: "http://localhost:3000" }), runId, action)).status).toBe(401);
      } finally { vi.unstubAllEnvs(); }
    }
    expect(database).not.toHaveBeenCalled();
  });
  it("acknowledges saved J13 manager delegation and duplicate completion", async () => {
    const runId = "00000000-0000-4000-8000-000000000001";
    const operationId = "00000000-0000-4000-8000-000000000002";
    const workflowRunId = "00000000-0000-4000-8000-000000000003";
    const completeOperation = vi.fn().mockResolvedValueOnce({ reused: false, operation: {
      state: "succeeded", materializationJson: JSON.stringify({ delegatedTaskId: "J13", privateField: "not-returned" }),
    } }).mockResolvedValueOnce({ reused: true, operation: {
      state: "succeeded", materializationJson: JSON.stringify({ delegatedTaskId: "J13" }),
    } });
    const factory = vi.spyOn(repositoryModule, "createExperimentRepository").mockReturnValue({
      getRun: async () => ({ mode: "simulated" }), completeOperation,
    } as unknown as ReturnType<typeof repositoryModule.createExperimentRepository>);
    try {
      const http = createBookletRunnerHttp({ config: () => enabled,
        database: () => ({ collections: {} } as Database), store: () => ({} as AssetStore),
        mutate: (operation) => operation() });
      const payload = { runId, operationId, workflowRunId, parentWorkflowRunId: null,
        inputFingerprint: "a".repeat(64), result: { kind: "delegate", payload: { taskId: "J13", subjectKind: "page", subjectId: runId } } };
      for (const reused of [false, true]) {
        const response = await http.tool(request({ "x-booklet-tool-key": "x".repeat(32) }, JSON.stringify(payload)), "result");
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ data: { reused, state: "succeeded", materialization: { delegatedTaskId: "J13" } } });
      }
      expect(completeOperation).toHaveBeenCalledTimes(2);
    } finally { factory.mockRestore(); }
  });
  it("returns bounded disabled and invalid setup responses without connecting to MongoDB", async () => {
    const off = createBookletRunnerHttp({ config: () => disabled, database: () => { throw new Error("unexpected database access"); } });
    expect((await off.tool(request(), "authorize")).status).toBe(404);
    const bad = createBookletRunnerHttp({ config: () => invalid, database: () => { throw new Error("unexpected database access"); } });
    expect((await bad.tool(request(), "authorize")).status).toBe(503);
  });
  it("checks the callback key before parsing or database access", async () => {
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); } });
    const response = await http.tool(request({}, "not-json"), "authorize");
    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(JSON.stringify(payload)).not.toContain("not-json");
    expect(payload).toEqual({ error: { code: "unauthorized", message: "Authentication is required." } });
  });
  it("treats invalid UTF-8 as malformed JSON after authentication", async () => {
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); } });
    const response = await http.tool(new Request("http://localhost:3000", { method: "POST", headers: { "x-booklet-tool-key": "x".repeat(32) }, body: new Uint8Array([0xff]) }), "authorize");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "invalid_request", message: "Request is invalid." } });
  });
  it("requires exact browser origin and a UUID replay key", async () => {
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); } });
    expect((await http.create(request({ origin: "http://localhost:3001" }))).status).toBe(403);
    expect((await http.create(request({ origin: "http://localhost:3000" }))).status).toBe(400);
  });
  it("validates page selection origin, identity and body before database access", async () => {
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); } });
    const runId = "00000000-0000-4000-8000-000000000001";
    expect((await http.selectPages(request({ origin: "http://localhost:3001" }), runId)).status).toBe(403);
    expect((await http.selectPages(request({ origin: "http://localhost:3000" }), runId)).status).toBe(400);
    const headers = { origin: "http://localhost:3000", "idempotency-key": runId };
    expect((await http.selectPages(request(headers, "not-json"), runId)).status).toBe(400);
    const batch = { schemaVersion: "2", runId, configurationHash: "a".repeat(64), layoutVersionId: runId,
      selection: "single", pages: [{ pageId: runId, pageBibleVersionId: runId, previousPageVersionId: null }] };
    expect((await http.selectPages(request(headers, JSON.stringify({ expectedRevision: 0, batch })),
      "00000000-0000-4000-8000-000000000002")).status).toBe(400);
    const blocked = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); },
      mutate: async () => { throw new Error("maintenance"); } });
    expect((await blocked.selectPages(request(headers, JSON.stringify({ expectedRevision: 0, batch })), runId)).status).toBe(503);
    const off = createBookletRunnerHttp({ config: () => disabled, database: () => { throw new Error("unexpected database access"); } });
    expect((await off.selectPages(request(headers), runId)).status).toBe(404);
  });
  it("requires staging browser authentication for page selection", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "staging");
    vi.stubEnv("ACCESS_GATE_PASSWORD", "test-only-password-long-enough");
    try {
      const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); } });
      expect((await http.selectPages(request({ origin: "http://localhost:3000" }),
        "00000000-0000-4000-8000-000000000001")).status).toBe(401);
    } finally { vi.unstubAllEnvs(); }
  });
  it("keeps image callbacks closed when disabled or in production", async () => {
    for (const state of [disabled, { enabled: false, reason: "production" } as ConfigState]) {
      const http = createBookletRunnerHttp({ config: () => state, database: () => { throw new Error("unexpected database access"); } });
      expect((await http.imageFixture(new Request(imageUrl))).status).toBe(404);
      expect((await http.imageComplete(new Request(imageUrl, { method: "POST", body: "bad" }))).status).toBe(404);
    }
  });
  it("authenticates before parsing image query or reading the body", async () => {
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); } });
    expect((await http.imageFixture(new Request(imageUrl + "&extra=1"))).status).toBe(401);
    expect((await http.imageComplete(new Request(imageUrl + "&extra=1", { method: "POST", body: "bad" }))).status).toBe(401);
    const key = { "x-booklet-tool-key": "x".repeat(32) };
    for (const suffix of ["&extra=1", "&runId=00000000-0000-4000-8000-000000000001", "&workflowRunId=bad"]) {
      expect((await http.imageFixture(new Request(imageUrl + suffix, { headers: key }))).status).toBe(400);
    }
    for (const suffix of ["&parentWorkflowRunId=bad", "&inputFingerprint=bad"]) {
      expect((await http.imageFixture(new Request(imageUrl + suffix, { headers: key }))).status).toBe(400);
    }
    const oversized = await http.imageComplete(new Request(imageUrl, { method: "POST", headers: { ...key, "content-length": String(20 * 1024 * 1024 + 1) }, body: "x" }));
    expect(oversized.status).toBe(413);
  });
  it("applies maintenance admission before fixture database access", async () => {
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); }, admit: async () => { throw new Error("maintenance"); } });
    expect((await http.imageFixture(new Request(imageUrl, { headers: { "x-booklet-tool-key": "x".repeat(32) } }))).status).toBe(503);
  });

  it("bounds streamed image bytes even without Content-Length", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(20 * 1024 * 1024 + 1)); },
      cancel() { cancelled = true; },
    });
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); } });
    const response = await http.imageComplete(new Request(imageUrl, { method: "POST", headers: { "x-booklet-tool-key": "x".repeat(32) }, body: stream, duplex: "half" } as RequestInit & { duplex: "half" }));
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
  });

  it("keeps image completion closed during maintenance", async () => {
    const http = createBookletRunnerHttp({ config: () => enabled, database: () => { throw new Error("unexpected database access"); }, mutate: async () => { throw new Error("maintenance"); } });
    expect((await http.imageComplete(new Request(imageUrl, { method: "POST", headers: { "x-booklet-tool-key": "x".repeat(32) }, body: new Uint8Array([1, 2, 3]) }))).status).toBe(503);
  });
});
