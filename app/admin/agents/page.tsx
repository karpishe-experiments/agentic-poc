import { getAgentManagementService } from "@/lib/application/agent-management-service";
import { AgentAdmin } from "@/components/admin/agents/agent-admin";
import type { AgentAdminViewModel, SlotKey } from "@/components/admin/agents/agent-admin-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ target?: string; agent?: string; version?: string }> }) {
  const selection = await searchParams;
  const snapshot = await getAgentManagementService().getAdminSnapshot();
  const viewModel: AgentAdminViewModel = {
    coverage: snapshot.coverage,
    definitions: snapshot.definitions,
    versions: snapshot.versions,
    skillChoices: snapshot.skillChoices,
  };
  return <AgentAdmin snapshot={viewModel} initialSelection={{ slotKey: selection.target as SlotKey | undefined, agentId: selection.agent ?? null, versionId: selection.version ?? null }} />;
}
