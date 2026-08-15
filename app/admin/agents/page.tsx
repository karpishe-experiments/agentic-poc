import { getAgentManagementService } from "@/lib/application/agent-management-service";
import { AgentAdmin } from "@/components/admin/agents/agent-admin";
import type { AgentAdminViewModel } from "@/components/admin/agents/agent-admin-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const snapshot = await getAgentManagementService().getAdminSnapshot();
  const viewModel: AgentAdminViewModel = {
    coverage: snapshot.coverage,
    definitions: snapshot.definitions,
    versions: snapshot.versions,
    skillChoices: snapshot.skillChoices,
  };
  return <AgentAdmin snapshot={viewModel} />;
}
