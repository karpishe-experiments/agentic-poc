import type { ExperimentOperationDocument, ExperimentRunDocument } from "@/db/documents";
import { executionPolicySnapshot, type ExecutionPolicy } from "@/lib/experiment-runner/execution-policy";
import { m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import { savedConfigurationSchema } from "@/lib/experiment-runner/config";

export type ExecutionAmendment = { id: string; baseProfileHash: string; profileHash: string; profileJson: string;
  configurationJson: string; reference: string; approvedAtMs: number };
const canonical = m4CanonicalJson;
function semanticProfile(policy: ExecutionPolicy) {
  const copy = structuredClone(policy);
  copy.pluginIdentity = "diagnostic-adapter";
  if (copy.realImage) { copy.realImage.pluginIdentity = "diagnostic-adapter"; copy.realImage.packageSha256 = "diagnostic-package"; }
  if (copy.realReport) copy.realReport.packageSha256 = "diagnostic-package";
  for (const binding of copy.publications) if (binding.role === "image") binding.publishedWorkflowId = "diagnostic-image-publication";
  return canonical(copy);
}

/** Only adapter diagnostics and the image result handler may change mid-run.
 * Frozen requests, models, prices and historical accounting keep their original policy. */
export function diagnosticExecutionAmendment(run: ExperimentRunDocument, policy: ExecutionPolicy,
  configurationJson: string, reference: string, nowMs: number): ExecutionAmendment | null {
  if (!run.execution || run.mode !== "real") throw Error("Execution amendment requires a Real execution run.");
  const original = executionPolicySnapshot(JSON.parse(run.execution.profileJson));
  const next = executionPolicySnapshot(policy);
  if (original.hash === next.hash && run.configurationJson === configurationJson) return null;
  if (original.hash !== run.execution.profileHash || semanticProfile(original.policy) !== semanticProfile(next.policy)) {
    throw Error("Execution amendment changes more than adapter diagnostics or image outcome handling.");
  }
  const expected = next.policy.publications.filter(p => p.persona === null || p.persona === run.persona)
    .map(({ persona: _persona, ...p }) => { void _persona; return p; });
  if (canonical(savedConfigurationSchema.parse(JSON.parse(configurationJson))) !== canonical(expected)) throw Error("Amended publications differ from their reviewed profile.");
  const id = m4Hash(canonical({ baseProfileHash: original.hash, profileHash: next.hash, configurationJson }));
  return { id, baseProfileHash: original.hash, profileHash: next.hash, profileJson: next.json, configurationJson, reference, approvedAtMs: nowMs };
}

export function operationConfiguration(run: ExperimentRunDocument, operation: Pick<ExperimentOperationDocument, "executionAmendmentId">) {
  if (!operation.executionAmendmentId) return savedConfigurationSchema.parse(JSON.parse(run.configurationJson));
  const saved = run.executionAmendments?.find(a => a.id === operation.executionAmendmentId);
  if (!saved) throw Error("Operation execution amendment is missing.");
  const verified = diagnosticExecutionAmendment(run, executionPolicySnapshot(JSON.parse(saved.profileJson)).policy,
    saved.configurationJson, saved.reference, saved.approvedAtMs);
  if (!verified || verified.id !== saved.id || verified.profileHash !== saved.profileHash || verified.baseProfileHash !== saved.baseProfileHash) throw Error("Operation execution amendment differs from its approval.");
  return savedConfigurationSchema.parse(JSON.parse(saved.configurationJson));
}
