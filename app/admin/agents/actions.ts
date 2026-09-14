"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAgentManagementService, AgentManagementError } from "@/lib/application/agent-management-service";
import { agentVersionConfigurationSchema } from "@/lib/contracts/agents";
import { hasValidBasicAuthorization } from "@/lib/http/basic-auth";
import { runTrackedMutation } from "@/lib/application/deployment-control";

export type AgentActionState = { kind: "idle" | "success" | "validation_error" | "conflict" | "failure"; message: string; fieldErrors?: Record<string, string> };

function string(formData: FormData, key: string) { return String(formData.get(key) ?? ""); }
function nullable(formData: FormData, key: string) { const value = string(formData, key); return value ? value : null; }
function number(formData: FormData, key: string) { return Number(string(formData, key)); }
function configuration(formData: FormData) {
  const role = string(formData, "role");
  return { displayName: string(formData, "displayName"), purpose: string(formData, "purpose"), role, skillId: nullable(formData, "skillId"), imageTarget: nullable(formData, "imageTarget"), instructions: string(formData, "instructions") || null, provider: string(formData, "provider") || "openai", modelId: string(formData, "modelId"), reasoningEffort: nullable(formData, "reasoningEffort"), maxTurns: string(formData, "maxTurns") ? number(formData, "maxTurns") : null, profileId: nullable(formData, "profileId") ?? (role === "specialist" ? "openai-specialist" : null), profileVersion: string(formData, "profileVersion") ? number(formData, "profileVersion") : role === "specialist" ? 1 : null, imageQuality: nullable(formData, "imageQuality"), imageResolution: nullable(formData, "imageResolution") };
}

function validateConfiguration(formData: FormData): AgentActionState | null {
  const parsed = agentVersionConfigurationSchema.safeParse(configuration(formData));
  if (parsed.success) return null;
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "configuration");
    fieldErrors[field] ??= issue.message;
  }
  return { kind: "validation_error", message: "Correct the highlighted fields and try again.", fieldErrors };
}

async function run(operation: () => Promise<unknown>, successMessage: string): Promise<AgentActionState> {
  try {
    if (!hasValidBasicAuthorization((await headers()).get("authorization"))) return { kind: "failure", message: "Authentication required." };
    await runTrackedMutation(operation); revalidatePath("/admin/agents"); return { kind: "success", message: successMessage };
  }
  catch (error) {
    if (error instanceof AgentManagementError) {
      const kind = error.code === "agent_invalid_configuration" ? "validation_error" : error.code === "agent_conflict" || error.code === "agent_coverage_conflict" || error.code === "agent_delete_blocked" ? "conflict" : "failure";
      return { kind, message: error.message };
    }
    return { kind: "failure", message: "The requested agent change could not be completed. Reload and try again." };
  }
}

export async function createAgent(_: AgentActionState, formData: FormData) {
  return validateConfiguration(formData) ?? run(() => getAgentManagementService().create(configuration(formData) as never), "Draft created.");
}
export async function saveAgentDraft(_: AgentActionState, formData: FormData) {
  return validateConfiguration(formData) ?? run(() => getAgentManagementService().updateDraft({ ...configuration(formData), id: string(formData, "id"), expectedRevision: number(formData, "expectedRevision") } as never), "Draft saved.");
}
export async function forkAgent(_: AgentActionState, formData: FormData) { return run(() => getAgentManagementService().fork({ id: string(formData, "id"), expectedRevision: number(formData, "expectedRevision") }), "Draft forked."); }
export async function confirmAgent(_: AgentActionState, formData: FormData) { return run(() => getAgentManagementService().confirm({ id: string(formData, "id"), expectedRevision: number(formData, "expectedRevision") }), "Draft confirmed."); }
export async function activateAgent(_: AgentActionState, formData: FormData) { return run(() => getAgentManagementService().activate({ id: string(formData, "id"), expectedRevision: number(formData, "expectedRevision"), observedSlotVersionId: nullable(formData, "observedSlotVersionId"), observedLogicalActiveVersionId: nullable(formData, "observedLogicalActiveVersionId") }), "Agent activated."); }
export async function deactivateAgent(_: AgentActionState, formData: FormData) { return run(() => getAgentManagementService().deactivate({ id: string(formData, "id"), expectedRevision: number(formData, "expectedRevision") }), "Candidate deactivated."); }
export async function retireAgent(_: AgentActionState, formData: FormData) { return run(() => getAgentManagementService().retire({ id: string(formData, "id"), expectedRevision: number(formData, "expectedRevision") }), "Version retired."); }
export async function deleteAgentDraft(_: AgentActionState, formData: FormData) { return run(() => getAgentManagementService().deleteDraft({ id: string(formData, "id"), expectedRevision: number(formData, "expectedRevision") }), "Eligible draft deleted."); }
