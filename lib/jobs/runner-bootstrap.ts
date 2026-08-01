let started = false;

export function ensureRunnerStarted(): boolean {
  if (started) return false;
  started = true;
  return true;
}
