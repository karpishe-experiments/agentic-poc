import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureRunnerStarted } from "@/lib/jobs/runner-bootstrap";

const runnerState = Symbol.for("kids-booklet-poc.job-runner");

afterEach(() => {
  delete (globalThis as typeof globalThis & { [runnerState]?: unknown })[runnerState];
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.doUnmock("@/db/client");
  vi.doUnmock("@/lib/experiment-runner/m4-config");
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
    vi.doMock("@/lib/experiment-runner/m4-config", () => ({ readM4RunnerConfig: () => ({ enabled: true, config: {} }) }));
    vi.doMock("@/lib/experiment-runner/dispatch", () => ({ createExperimentDispatcher: () => ({ cycle }) }));
    vi.doMock("@/lib/application/deployment-control", () => ({ readDeploymentControl: async () => ({ maintenance: false }), reconcileEndedMutations: vi.fn().mockResolvedValue(undefined) }));
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
    vi.doMock("@/lib/experiment-runner/m4-config", () => ({ readM4RunnerConfig: () => ({ enabled: true, config: {} }) }));
    vi.doMock("@/lib/experiment-runner/dispatch", () => ({ createExperimentDispatcher: () => ({ cycle }) }));
    const reconcileEndedMutations = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/application/deployment-control", () => ({ readDeploymentControl, reconcileEndedMutations }));
    vi.resetModules();
    const { ensureRunnerStarted: start, getRunnerStatus } = await import("@/lib/jobs/runner-bootstrap");

    expect(start()).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(readDeploymentControl).toHaveBeenCalledTimes(2);
    expect(reconcileEndedMutations).toHaveBeenCalledTimes(2);
    expect(cycle).toHaveBeenCalledOnce();
    expect(getRunnerStatus()).toMatchObject({ initialized: true, recovered: true, fatalError: null });
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("reconciles legacy jobs and execution batches once before launching either recovery handler", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITEST", "");
    const order: string[] = [];
    const repositories = {
      conversation: { recoverInterruptedFollowups: vi.fn(async () => { order.push("followups"); return 0; }) },
      jobs: {
        recoverInterrupted: vi.fn(async () => { order.push("jobs"); return 0; }),
        listRunnable: vi.fn(async () => []),
      },
      execution: { recoverInterrupted: vi.fn(async () => { order.push("execution"); return ["recovered-batch"]; }) },
    };
    vi.doMock("@/db/client", () => ({ getDatabase: vi.fn().mockReturnValue({}) }));
    vi.doMock("@/db/repositories", () => ({ createRepositories: vi.fn().mockReturnValue(repositories) }));
    vi.doMock("@/lib/experiment-runner/m4-config", () => ({ readM4RunnerConfig: () => ({ enabled: false, reason: "disabled" }) }));
    vi.doMock("@/lib/application/deployment-control", () => ({ readDeploymentControl: async () => ({ maintenance: false, draining: false }), reconcileEndedMutations: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock("@/lib/jobs/generation-diagnostics", () => ({ createGenerationDiagnostics: () => ({ record: vi.fn().mockResolvedValue(undefined) }), describeGenerationError: () => ({ message: "test" }) }));
    vi.doMock("@/lib/application/generation-service", () => ({ GenerationService: class {} }));
    vi.doMock("@/lib/application/agent-run-service", () => ({ AgentRunService: class { recoverInterrupted(ids: readonly string[]) { order.push(`text:${ids.join(",")}`); return Promise.resolve([]); } } }));
    vi.doMock("@/lib/application/image-agent-run-service", () => ({ ImageAgentRunService: class { recoverInterrupted(ids: readonly string[]) { order.push(`image:${ids.join(",")}`); return Promise.resolve([]); } } }));
    vi.resetModules();
    const { ensureRunnerStarted: start } = await import("@/lib/jobs/runner-bootstrap");

    expect(start()).toBe(true);
    await vi.waitFor(() => expect(order).toEqual(["followups", "execution", "jobs", "text:recovered-batch", "image:recovered-batch"]));
  });
});
