import { describe, expect, it, vi } from "vitest";
import type { Repositories } from "@/db/repositories";
import { ExecutionService } from "@/lib/application/execution-service";
import type { AgentVersion } from "@/lib/contracts/agents";
import type { ExecutionBatch, ExecutionItem } from "@/lib/contracts/execution";

const id = "00000000-0000-4000-8000-000000000901";
const agent = { id, agentId: id } as AgentVersion;
const batch = { id, canonicalInput: { subject: "test" } } as ExecutionBatch;
const item = {
  id,
  batchId: id,
  agentVersionId: id,
  status: "queued",
} as ExecutionItem;

describe("ExecutionService operation budget", () => {
  it("uses the persisted claim start time instead of restarting an expired candidate budget", async () => {
    const claimed = {
      ...item,
      status: "running",
      startedAt: new Date(Date.now() - 300_000).toISOString(),
    } as ExecutionItem;
    const failItem = vi.fn(async () => undefined);
    const repositories = {
      execution: {
        getBatch: vi.fn(async () => batch),
        getItems: vi.fn(async () => [item]),
        claimQueued: vi.fn(async () => claimed),
        failItem,
        finishItem: vi.fn(async () => undefined),
      },
      agents: { getVersion: vi.fn(async () => agent) },
    } as unknown as Repositories;
    const executor = vi.fn(async () => ({ result: { generated: true }, summary: "Generated" }));
    const service = new ExecutionService(repositories, {} as never);

    await service.run(id, executor);

    expect(executor).not.toHaveBeenCalled();
    expect(failItem).toHaveBeenCalledWith(expect.objectContaining({
      batchId: id,
      itemId: id,
      kind: "unknown",
      message: "The candidate timed out before its outcome could be confirmed. Inspect saved output before retrying.",
    }));
  });

  it("retains a result saved during deadline reconciliation", async () => {
    const claimed = {
      ...item,
      status: "running",
      startedAt: new Date(Date.now() - 300_000).toISOString(),
    } as ExecutionItem;
    const saved = { ...claimed, status: "succeeded", canonicalResult: { saved: true } } as ExecutionItem;
    const failItem = vi.fn(async () => undefined);
    const repositories = {
      execution: {
        getBatch: vi.fn(async () => batch),
        getItems: vi.fn().mockResolvedValueOnce([item]).mockResolvedValueOnce([saved]),
        claimQueued: vi.fn(async () => claimed),
        failItem,
        finishItem: vi.fn(async () => undefined),
      },
      agents: { getVersion: vi.fn(async () => agent) },
    } as unknown as Repositories;
    const executor = vi.fn(async () => ({ result: { generated: true }, summary: "Generated" }));
    const service = new ExecutionService(repositories, {} as never);

    await service.run(id, executor);

    expect(executor).not.toHaveBeenCalled();
    expect(failItem).not.toHaveBeenCalled();
  });
});
