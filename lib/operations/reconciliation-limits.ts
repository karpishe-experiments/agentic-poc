// Observation and materialization of existing work only. These windows never
// change a persisted provider deadline or permit another provider dispatch.
export const RECONCILIATION_WORK_MS = 120_000;
export const RECONCILIATION_REQUEST_MS = RECONCILIATION_WORK_MS + 10_000;
export const RECONCILIATION_CLIENT_MS = RECONCILIATION_REQUEST_MS + 5_000;
