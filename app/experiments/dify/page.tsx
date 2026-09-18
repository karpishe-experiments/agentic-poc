import { notFound } from "next/navigation";
import { DifyExperimentClient } from "@/components/dify-experiment/dify-experiment-client";
import { getServerEnv } from "@/lib/config/env";
import { isDifyExperimentAvailable } from "@/lib/dify-experiment/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function DifyExperimentPage() {
  const env = getServerEnv();
  if (!isDifyExperimentAvailable(env)) notFound();
  return <DifyExperimentClient mode={env.DIFY_EXPERIMENT_MODE} maxImageAttempts={env.DIFY_IMAGE_MAX_ATTEMPTS} />;
}
