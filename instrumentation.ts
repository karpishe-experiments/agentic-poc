export async function register() {
  // Next does not set NEXT_RUNTIME in every Node production bootstrap. Treat an
  // unset value as Node so queued reference/page jobs are not left pending.
  if (process.env.NEXT_RUNTIME !== "edge") {
    const { resetActiveMutationsForSingleTaskStartup } = await import("./lib/application/deployment-control");
    await resetActiveMutationsForSingleTaskStartup();
    const { ensureRunnerStarted } = await import("./lib/jobs/runner-bootstrap");
    if (process.env.RUNNER_ENABLED !== "false") ensureRunnerStarted();
  }
}
