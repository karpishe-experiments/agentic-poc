import type { Database } from "@/db/client";
import { m4PolicySnapshot } from "@/lib/experiment-runner/m4-policy";
import { m4CanonicalJson, m4Hash } from "@/lib/experiment-runner/m4-request";
import { m4TestId, m4TestPolicy } from "@/tests/helpers/m4-policy";

/** Synthetic retained image evidence in an isolated test DB. Never runtime repair. */
export async function retainM4ImageTestPolicy(database: Database, runId: string, policy = m4TestPolicy()) {
  const run = await database.collections.experiment_runs.findOne({ _id: runId });
  if (!run) throw new Error("Missing image test run");
  const snapshot = m4PolicySnapshot(policy);
  const configuration = snapshot.policy.publications.filter((item) => item.persona === null || item.persona === run.persona)
    .map(({ role, taskId, appId, publishedWorkflowId, toolProviderId, finalPageIllustration }) => ({
      role, taskId, appId, publishedWorkflowId, toolProviderId, ...(finalPageIllustration ? { finalPageIllustration } : {}),
    }));
  const configurationJson = m4CanonicalJson(configuration);
  await database.collections.experiment_runs.updateOne({ _id: runId }, { $set: {
    mode: "balanced", configurationJson, configurationHash: m4Hash(configurationJson),
    m4: { campaignId: m4TestId(900), policyHash: snapshot.hash, policyJson: snapshot.json },
  } });
  for (const operation of await database.collections.experiment_operations.find({ runId }).toArray()) {
    const binding = configuration.find((item) => item.role === operation.role && item.taskId === (operation.role === "image" ? null : operation.taskId));
    await database.collections.experiment_operations.updateOne({ _id: operation._id }, { $set: {
      mode: "balanced", ...(operation.state === "succeeded" && binding ? { verifiedWorkflowId: binding.publishedWorkflowId } : {}),
    } });
  }
  return (await database.collections.experiment_runs.findOne({ _id: runId }))!;
}
