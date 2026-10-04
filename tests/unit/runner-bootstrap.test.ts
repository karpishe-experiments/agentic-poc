import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureRunnerStarted } from "@/lib/jobs/runner-bootstrap";

const runnerState = Symbol.for("kids-booklet-poc.job-runner");

afterEach(() => {
  delete (globalThis as typeof globalThis & { [runnerState]?: unknown })[runnerState];
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.doUnmock("@/db/client");
  vi.doUnmock("@/lib/experiment-runner/config");
  vi.doUnmock("@/lib/experiment-runner/dispatch");
  vi.doUnmock("@/lib/application/deployment-control");
});

describe("runner bootstrap", () => {
  it("starts at most one local runner per process", () => {
    expect(ensureRunnerStarted()).toBe(true);
    expect(ensureRunnerStarted()).toBe(false);
  });

  it("publishes state before the enabled experiment loop initializes", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITEST", "");
    const cycle = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/db/client", () => ({ getDatabase: vi.fn().mockReturnValue({}) }));
    vi.doMock("@/lib/experiment-runner/config", () => ({ readBookletRunnerConfig: () => ({ enabled: true, config: {} }) }));
    vi.doMock("@/lib/experiment-runner/dispatch", () => ({ createExperimentDispatcher: () => ({ cycle }) }));
    vi.doMock("@/lib/application/deployment-control", () => ({ readDeploymentControl: async () => ({ maintenance: false }) }));
    vi.resetModules();
    const { ensureRunnerStarted: start, getRunnerStatus } = await import("@/lib/jobs/runner-bootstrap");

    expect(start()).toBe(true);
    expect(getRunnerStatus()).toMatchObject({ started: true, initialized: true, recovered: true, fatalError: null });
    await vi.waitFor(() => expect(cycle).toHaveBeenCalledOnce());
  });

  it("retries after a transient deployment-control read failure", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITEST", "");
    const cycle = vi.fn().mockResolvedValue(undefined);
    const readDeploymentControl = vi.fn().mockRejectedValueOnce(new Error("temporary read failure"))
      .mockResolvedValue({ maintenance: false });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("@/db/client", () => ({ getDatabase: vi.fn().mockReturnValue({}) }));
    vi.doMock("@/lib/experiment-runner/config", () => ({ readBookletRunnerConfig: () => ({ enabled: true, config: {} }) }));
    vi.doMock("@/lib/experiment-runner/dispatch", () => ({ createExperimentDispatcher: () => ({ cycle }) }));
    vi.doMock("@/lib/application/deployment-control", () => ({ readDeploymentControl }));
    vi.resetModules();
    const { ensureRunnerStarted: start, getRunnerStatus } = await import("@/lib/jobs/runner-bootstrap");

    expect(start()).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(readDeploymentControl).toHaveBeenCalledTimes(2);
    expect(cycle).toHaveBeenCalledOnce();
    expect(getRunnerStatus()).toMatchObject({ initialized: true, recovered: true, fatalError: null });
    expect(error).toHaveBeenCalledTimes(1);
  });
});
