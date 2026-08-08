// @vitest-environment jsdom

import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RUNNING_JOB_POLL_INTERVAL_MS,
  subscribeToJobStatus,
} from "@/components/workspace/job-status-poller";

describe("job status poller", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("deduplicates subscribers and polls a running job every five seconds", async () => {
    vi.useFakeTimers();
    const jobId = "00000000-0000-4000-8000-000000000301";
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      data: { id: jobId, jobType: "pages", status: "running", items: [] },
    })));
    const firstListener = vi.fn();
    const secondListener = vi.fn();

    const unsubscribeFirst = subscribeToJobStatus(jobId, firstListener);
    const unsubscribeSecond = subscribeToJobStatus(jobId, secondListener);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(RUNNING_JOB_POLL_INTERVAL_MS - 1); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    unsubscribeFirst();
    unsubscribeSecond();
  });
});
