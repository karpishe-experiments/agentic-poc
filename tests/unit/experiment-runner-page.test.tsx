import { describe, expect, it, vi } from "vitest";
import BookletRunsPage from "@/app/experiments/booklet-runs/page";
import { readM4RunnerConfig } from "@/lib/experiment-runner/m4-config";

vi.mock("@/lib/experiment-runner/m4-config", () => ({ readM4RunnerConfig: vi.fn() }));
vi.mock("@/components/experiments/booklet-runner", () => ({ BookletRunner: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));

describe("runner page readiness boundary", () => {
  it.each(["disabled", "invalid", "ready", "granted"] as const)("passes only safe readiness props for %s", (state) => {
    vi.mocked(readM4RunnerConfig).mockReturnValue({ enabled: true, config: { enabled: true,
      baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid", callbackKey: "private-key", bindings: [],
      m4: { state, authority: { policy: { sensitive: "private-policy" }, grant: { campaignId: "private-campaign", reference: "private-grant" } } },
    } });
    expect(BookletRunsPage().props).toEqual({ balancedEnabled: state === "granted", m4State: state });
  });
});
