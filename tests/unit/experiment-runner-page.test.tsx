import { m4TestPolicy } from "@/tests/helpers/m4-policy";
import { m4PolicySnapshot, m4TokenPolicySnapshot } from "@/lib/experiment-runner/m4-policy";
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
    expect(BookletRunsPage().props).toEqual({ balancedEnabled: state === "granted", realEnabled: false, m4State: state });
  });
  it("passes Real readiness without sending provider configuration or credentials to the client", () => {
    vi.mocked(readM4RunnerConfig).mockReturnValue({ enabled: true, config: { enabled: true,
      baseUrl: "https://dify.invalid", publicOrigin: "https://booklet.invalid", callbackKey: "private-key", bindings: [],
      real: { state: "ready", bindings: [], textPluginIdentity: "private-provider-metadata",
        textPackageSha256: "a".repeat(64), imagePluginIdentity: "private-image-metadata",
        imagePackageSha256: "b".repeat(64), sourcePolicy: m4TestPolicy(), tokenPolicy: m4TokenPolicySnapshot({ version: "m4_context_policy_v2",
        basePolicyHash: m4PolicySnapshot(m4TestPolicy()).hash, warningInputTokens: 32000, maxInputTokens: 128000,
        requiredProviderAdapterIdentity: `langgenius/openai:1.0.7-dev5@${"a".repeat(64)}`,
        requiredProviderPackageSha256: "b".repeat(64), reference: "nonbillable-unit-fixture" }), nativeFileFormat: "base64" },
    } });
    expect(BookletRunsPage().props).toEqual({ balancedEnabled: false, realEnabled: true, m4State: "disabled" });
  });
});
