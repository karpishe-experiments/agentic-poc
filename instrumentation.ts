export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureRunnerStarted } = await import("./lib/jobs/runner-bootstrap");
    ensureRunnerStarted();
  }
}
