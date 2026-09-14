import { getServerEnv } from "@/lib/config/env";

const env = getServerEnv();
if (!env.ACCESS_GATE_PASSWORD || !process.env.APP_HOSTNAME) throw new Error("Readiness requires deployment hostname and access password.");
const response = await fetch(`https://${process.env.APP_HOSTNAME}/api/health/ready`, {
  headers: { Authorization: `Basic ${Buffer.from(`booklet:${env.ACCESS_GATE_PASSWORD}`).toString("base64")}` },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Readiness failed with HTTP ${response.status}.`);
const body = await response.json() as { status?: string };
if (body.status !== "ready") throw new Error("Application is not ready.");
console.log(JSON.stringify({ ready: true, environment: env.DEPLOYMENT_ENV, paidProviderCalls: 0 }));
