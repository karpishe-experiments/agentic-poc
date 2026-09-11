export async function register() {
  if (process.env.SPECIALTY_MOCKUP_ONLY === "1") return;
  // Next does not set NEXT_RUNTIME in every Node production bootstrap. Treat an
  // unset value as Node so queued reference/page jobs are not left pending.
  if (process.env.NEXT_RUNTIME !== "edge") {
    const { ensureRunnerStarted } = await import("./lib/jobs/runner-bootstrap");
    ensureRunnerStarted();
  }
}
