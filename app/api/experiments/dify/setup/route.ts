import { getServerEnv } from "@/lib/config/env";
import { isDifyExperimentAvailable } from "@/lib/dify-experiment/availability";

export const runtime = "nodejs";

export async function GET() {
  const env = getServerEnv();
  const available = isDifyExperimentAvailable(env);
  if (!available) return Response.json({ error: { code: "experiment_unavailable", message: "The Dify experiment is not enabled here." } }, { status: 404 });
  return Response.json({ data: { enabled: true, mode: env.DIFY_EXPERIMENT_MODE, image_enabled: env.DIFY_IMAGE_ENABLED, project_id: "booklet-dify-trial", has_dify_api_key: Boolean(env.DIFY_API_KEY), has_tool_key: Boolean(env.DIFY_TOOL_KEY), has_image_api_key: Boolean(env.DIFY_IMAGE_OPENAI_API_KEY) } });
}
