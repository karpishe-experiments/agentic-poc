import { getDatabase } from "@/db/client";
import { getServerEnv } from "@/lib/config/env";
import { readDeploymentControl, setMaintenanceMode } from "@/lib/application/deployment-control";

if (process.env.RUNNER_ENABLED !== "false") throw new Error("Deployment control requires RUNNER_ENABLED=false.");
const action = process.argv[2];
getServerEnv();
try {
  if (action === "enable") await setMaintenanceMode(true, process.argv.slice(3).join(" ") || "deployment operation");
  else if (action === "disable") await setMaintenanceMode(false, null);
  else if (action !== "status") throw new Error("Usage: deployment-control.ts enable [reason]|disable|status");
  console.log(JSON.stringify(await readDeploymentControl()));
} finally { await getDatabase().close(); }
