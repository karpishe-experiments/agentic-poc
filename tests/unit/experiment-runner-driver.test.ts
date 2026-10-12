import { describe, expect, it, vi } from "vitest";
import { executeRunner, parseRunnerOptions } from "@/scripts/experiment-runner";

const id = "00000000-0000-4000-8000-000000000001";
const origin = "https://booklet-staging.uniwares.co.uk";
const projection = { runId: id, bookletId: id, persona: "playful_kid", mode: "simulated", status: "running", revision: 1, nextNarrativeTask: "J01", activeOperationId: null, safeFailure: null, pauseRequested: false,
  counters: { logicalText: 0, logicalImage: 0, payableText: 0, payableImage: 0, steps: 0 }, operationHistory: [], currentArtifacts: [], secret: "never-output", brief: "not diagnostics" };
const create = parseRunnerOptions(["--action", "create", "--origin", origin, "--persona", "playful_kid", "--request-id", id, "--apply"]);

describe("application API runner driver", () => {
  it.each(["missing-field", "wrong-identity", "unavailable"])("rejects probe preflight %s before creating a run", async failure => {
    const options = parseRunnerOptions(["--action", "create", "--origin", origin, "--persona", "playful_kid",
      "--request-id", id, "--probe-app-id", id, "--probe-publication", id, "--apply"]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: failure === "missing-field" ? { ready: true } : {
      ready: true, schemaVersion: "1", appId: "00000000-0000-4000-8000-000000000002", publication: id,
      callbackConfigured: true, idle: true, difySecretPresence: "verify_through_workspace_control",
    } }, { status: failure === "unavailable" ? 503 : 200 }));
    await expect(executeRunner(options, { password: "private-password", fetcher })).rejects.toThrow("No run was created");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain("/preflight?");
    expect(fetcher.mock.calls[0][1]?.method).toBeUndefined();
  });
  it("checks exact probe publication once before the single create POST", async () => {
    const options = parseRunnerOptions(["--action", "create", "--origin", origin, "--persona", "playful_kid",
      "--request-id", id, "--probe-app-id", id, "--probe-publication", id, "--apply"]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ data: {
      ready: true, schemaVersion: "1", appId: id, publication: id, callbackConfigured: true, idle: true,
      difySecretPresence: "verify_through_workspace_control",
    } })).mockResolvedValueOnce(Response.json({ data: projection }));
    await executeRunner(options, { password: "private-password", fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("previews mutation without reading credentials or making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await executeRunner({ ...create, apply: false }, { fetcher })).toMatchObject({ preview: true, requestId: id, mode: "simulated" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects production, arbitrary hosts, paths and ambiguous arguments", () => {
    for (const host of ["https://booklet.uniwares.co.uk", "https://evil.test", `${origin}/path`, `${origin}?key=secret`, "https://user:password@booklet-staging.uniwares.co.uk"]) {
      expect(() => parseRunnerOptions(["--action", "observe", "--origin", host])).toThrow();
    }
    for (const args of [["--action", "create"], ["--action", "resume", "--run-id", id], ["--action", "pause", "--run-id", id, "--expected-revision", "NaN"], ["--action", "observe", "--persona", "playful_kid"], ["--action", "observe", "--apply", "--apply"], ["--action", "observe", "--unknown", "x"]]) {
      expect(() => parseRunnerOptions([...args, "--origin", origin])).toThrow();
    }
    expect(parseRunnerOptions(["--action", "observe", "--origin", "http://localhost:3000"]).origin).toBe("http://localhost:3000");
  });
  it("sends one simulated create with stable request identity and strips response extras", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: projection }));
    const result = await executeRunner(create, { password: "private-password", fetcher });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${origin}/api/experiments/booklet-runs`);
    expect(init).toMatchObject({ method: "POST", redirect: "error", headers: { "Idempotency-Key": id, Origin: origin } });
    expect(JSON.parse(init!.body as string)).toEqual({ persona: "playful_kid", mode: "simulated" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("never-output");
    expect(JSON.stringify(result)).not.toContain("private-password");
    expect(JSON.stringify(result)).not.toContain("not diagnostics");
  });
  it("retains unknown mutation identity without retrying or exposing transport errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("private-password"));
    await expect(executeRunner(create, { password: "private-password", fetcher })).rejects.toThrow(`request ID ${id}`);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not retry definite conflicts or send a mutation without a private password", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private-server-error", { status: 409 }));
    await expect(executeRunner(create, { password: "private-password", fetcher })).rejects.toThrow("HTTP 409");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(executeRunner(create, { fetcher })).rejects.toThrow("BOOKLET_RUNNER_PASSWORD");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("uses GET for observation and rejects payable or mismatched evidence", async () => {
    const options = parseRunnerOptions(["--action", "observe", "--origin", origin, "--run-id", id]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: projection }));
    await executeRunner(options, { password: "private-password", fetcher });
    expect(fetcher.mock.calls[0][1]?.method).toBe("GET");
    fetcher.mockResolvedValue(Response.json({ data: { ...projection, counters: { ...projection.counters, payableImage: 1 } } }));
    await expect(executeRunner(options, { password: "private-password", fetcher })).rejects.toThrow("not a verified simulated projection");
    fetcher.mockResolvedValue(Response.json({ data: { ...projection, runId: "00000000-0000-4000-8000-000000000002" } }));
    await expect(executeRunner(options, { password: "private-password", fetcher })).rejects.toThrow("not a verified simulated projection");
  });
  it("controls one exact revision without retries", async () => {
    const options = parseRunnerOptions(["--action", "pause", "--origin", origin, "--run-id", id, "--expected-revision", "1", "--apply"]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: { ...projection, pauseRequested: true, revision: 2 } }));
    await executeRunner(options, { password: "private-password", fetcher });
    expect(fetcher.mock.calls[0][0]).toBe(`${origin}/api/experiments/booklet-runs/${id}/pause`);
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ expectedRevision: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
