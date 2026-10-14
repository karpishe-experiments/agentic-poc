import { personaSchema } from "@/lib/contracts/experiment-runner";
import { m4PolicySchema } from "@/lib/experiment-runner/m4-policy";

export const m4TestId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function m4TestPolicy() {
  const model = (model: string, reasoningEffort: string, maxOutputTokens: number) => ({ model, reasoningEffort, maxOutputTokens,
    inputMicrodollarsPerMillion: model === "gpt-6-luna" ? 125_000 : 2_500_000,
    outputMicrodollarsPerMillion: model === "gpt-6-luna" ? 500_000 : 10_000_000 });
  const roles = [
    { role: "manager", taskId: null, persona: null },
    ...Array.from({ length: 12 }, (_, i) => ({ role: "specialist", taskId: `J${String(i + 1).padStart(2, "0")}`, persona: null })),
    ...personaSchema.options.map((persona) => ({ role: "tester", taskId: null, persona })),
    { role: "image", taskId: null, persona: null, finalPageIllustration: true }, { role: "judge", taskId: null, persona: null },
  ];
  return m4PolicySchema.parse({ schemaVersion: "m4_v1", mode: "balanced", imageProvider: "simulated", provider: "openai", protocol: "responses", serviceTier: "default",
    pluginIdentity: `langgenius/openai:1.0.7-dev1@${"a".repeat(64)}`, requestDefinitionHash: "f".repeat(64), pricingReference: "test-fixture-not-live-price-proof",
    countChargeCeilingMicrodollars: 0, countVerificationReference: "fake-transport-zero-charge-only",
    maxInputTokens: 32000, maxRequests: 500, maxJudges: 3, maxMicrodollars: 5_000_000, retries: 0, tools: false, maxTimeoutSeconds: 120,
    models: { decision: model("gpt-6-luna", "none", 2048), specialist: model("gpt-6-luna", "low", 8192),
      testerReport: model("gpt-6-luna", "none", 8192), judge: model("gpt-6-sol", "low", 8192) },
    publications: roles.map((r, i) => ({ ...r, appId: m4TestId(100 + i), publishedWorkflowId: m4TestId(200 + i), toolProviderId: null })),
  });
}
