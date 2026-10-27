import { createHash } from "node:crypto";
import type { ExperimentRunDocument } from "@/db/documents";
import { m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";
import { executionPolicySnapshot } from "@/lib/experiment-runner/execution-policy";

// Retained-policy eligibility only, never a new grant, reservation or dispatch.
// Do not consult a current manifest: already-claimed work can finish after Pause
// or manifest disablement. Each caller retains its own state/recovery checks.
export function hasM4SimulatedImagePolicy(run: ExperimentRunDocument): boolean {
  if (run.mode !== "balanced" || !run.m4) return false;
  try {
    const snapshot = m4PolicySnapshot(JSON.parse(run.m4.policyJson));
    if (snapshot.hash !== run.m4.policyHash || snapshot.json !== run.m4.policyJson || snapshot.policy.imageProvider !== "simulated" ||
        createHash("sha256").update(run.configurationJson).digest("hex") !== run.configurationHash) return false;
    const expected = snapshot.policy.publications.filter((item) => item.persona === null || item.persona === run.persona);
    const actual = savedConfigurationSchema.parse(JSON.parse(run.configurationJson));
    return actual.length === expected.length && expected.every((binding) => actual.some((item) =>
      item.role === binding.role && item.taskId === binding.taskId && item.appId === binding.appId &&
      item.publishedWorkflowId === binding.publishedWorkflowId && item.toolProviderId === binding.toolProviderId &&
      item.finalPageIllustration === binding.finalPageIllustration));
  } catch { return false; }
}

export function hasExperimentSimulatedImagePolicy(run: ExperimentRunDocument): boolean {
  if (hasM4SimulatedImagePolicy(run)) return true;
  if (run.mode !== "balanced" || !run.execution) return false;
  try {
    const snapshot = executionPolicySnapshot(JSON.parse(run.execution.profileJson));
    if (snapshot.hash !== run.execution.profileHash || snapshot.json !== run.execution.profileJson ||
        snapshot.policy.mode !== "balanced" ||
        createHash("sha256").update(run.configurationJson).digest("hex") !== run.configurationHash) return false;
    const expected = snapshot.policy.publications.filter(item => item.persona === null || item.persona === run.persona);
    const actual = savedConfigurationSchema.parse(JSON.parse(run.configurationJson));
    return actual.length === expected.length && expected.every(binding => actual.some(item =>
      item.role === binding.role && item.taskId === binding.taskId && item.appId === binding.appId &&
      item.publishedWorkflowId === binding.publishedWorkflowId && item.toolProviderId === binding.toolProviderId &&
      item.finalPageIllustration === binding.finalPageIllustration));
  } catch { return false; }
}
