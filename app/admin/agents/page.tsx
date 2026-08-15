import { getAgentManagementService } from "@/lib/application/agent-management-service";
import { AgentAdmin } from "@/components/admin/agents/agent-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const snapshot = await getAgentManagementService().getAdminSnapshot();
  return <AgentAdmin snapshot={snapshot} />;
}
