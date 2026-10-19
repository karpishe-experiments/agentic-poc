import { open, readFile, rename, lstat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { getServerEnv } from "@/lib/config/env";
import { readM4RunnerConfig } from "@/lib/experiment-runner/m4-config";
import { readBookletRunnerConfig } from "@/lib/experiment-runner/config";
import { verifyMongoStructure } from "@/db/setup";
import { verifyExperimentData, verifyMongoData } from "@/db/verify";
import { withOperationBudget } from "@/lib/operations/budget";
import { inspectRecoveryWork } from "@/lib/operations/recovery-inspection";
import { BOOKLET_RECOVERY_CONTRACT, BookletRecoveryError, createBookletRecovery, recoveryDigest,
  type RecoverySnapshot } from "@/lib/operations/booklet-recovery";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const inputSchema = z.strictObject({
  phase: z.enum(["capabilities", "preview", "verify-closed", "apply", "verify-completed", "verify-unapplied", "inspect-blockers", "verify-prior-compatible",
    "preview-claim-release", "apply-claim-release", "verify-claim-release"]),
  "run-id": id.optional(), "operation-id": id.optional(), "expected-revision": z.coerce.number().int().nonnegative().optional(),
  "evidence-dir": z.literal("/recovery").optional(), "preview-digest": sha.optional(),
  page: z.coerce.number().int().min(0).max(10000).optional(), limit: z.coerce.number().int().min(1).max(50).optional(),
});
const checkpointSchema = z.strictObject({ contract: z.literal(BOOKLET_RECOVERY_CONTRACT), phase: z.enum(["started", "completed"]),
  target: z.strictObject({ runId: id, operationId: id, expectedRevision: z.number().int().nonnegative() }),
  previewDigest: sha, snapshotDigest: sha, snapshot: z.custom<RecoverySnapshot>(value => !!value && typeof value === "object"),
});
let phase = "arguments";
let database: ReturnType<typeof getDatabase> | undefined;
const emit = (value: unknown) => console.log(JSON.stringify(value));
async function saveCheckpoint(path: string, value: unknown, exclusive: boolean) {
  const destination = exclusive ? path : `${path}.next`;
  const file = await open(destination, exclusive ? "wx" : "w", 0o600);
  try { await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); }
  if (!exclusive) await rename(destination, path);
  const directory = await open("/recovery", "r");
  try { await directory.sync(); } finally { await directory.close(); }
}
async function main() {
  const args: Record<string, unknown> = { phase: process.argv[2] };
  for (let index = 3; index < process.argv.length; index += 2) {
    const name = process.argv[index]; const value = process.argv[index + 1];
    if (!name.startsWith("--") || !value || value.startsWith("--") || name.slice(2) in args) throw new BookletRecoveryError("invalid_arguments");
    args[name.slice(2)] = value;
  }
  const input = inputSchema.parse(args); phase = input.phase;
  if (input.phase === "capabilities") {
    emit({ contract: BOOKLET_RECOVERY_CONTRACT, environment: "_staging", schemaVersion: "1", initializationRequired: false,
      supported: ["granted-j11-completion", "inspect-blockers", "verify-prior-compatible", "expired-finalization-claim-release"], providerPosts: 0 }); return;
  }
  const env = getServerEnv();
  if (env.RUNNER_ENABLED !== "false" || env.DEPLOYMENT_ENV !== "_staging" || env.MONGODB_DATABASE !== "kids_booklet" ||
    env.ASSETS_BUCKET !== "kids-booklet-staging-assets") throw new BookletRecoveryError("wrong_environment");
  database = getDatabase();
  if (input.phase === "inspect-blockers" || input.phase === "verify-prior-compatible") {
    const report = await inspectRecoveryWork(database, { environment: "_staging", page: input.page, limit: input.limit });
    if (input.phase === "inspect-blockers") { emit(report); if (report.outcome !== "clear") process.exitCode = 1; return; }
    if (report.outcome !== "clear" || !report.admission?.maintenance || report.admission.draining) {
      emit(report); throw new BookletRecoveryError("prior_state_not_quiet");
    }
    await verifyMongoStructure(database);
    const profile = readBookletRunnerConfig();
    if (!profile.enabled && profile.reason === "invalid") throw new BookletRecoveryError("configuration_invalid");
    if (profile.enabled) await verifyExperimentData(database); else await verifyMongoData(database);
    emit({ verified: true, phase, compatible: true, admission: "closed", providerPosts: 0 }); return;
  }
  if (!input["run-id"] || !input["operation-id"] || input["expected-revision"] === undefined) throw new BookletRecoveryError("target_required");
  const target = { runId: input["run-id"], operationId: input["operation-id"], expectedRevision: input["expected-revision"] };
  const profile = readM4RunnerConfig();
  if (!profile.enabled) throw new BookletRecoveryError("configuration_invalid");
  const service = createBookletRecovery({ database, config: profile.config });
  if (input.phase.endsWith("-claim-release")) {
    const originalPath = "/original-recovery/application-recovery.json";
    const originalFile = await lstat(originalPath);
    if (!originalFile.isFile() || originalFile.isSymbolicLink() || (originalFile.mode & 0o077) !== 0) throw new BookletRecoveryError("checkpoint_permissions");
    const original = checkpointSchema.parse(JSON.parse(await readFile(originalPath, "utf8")));
    if (original.phase !== "started" || recoveryDigest(original.target) !== recoveryDigest(target) ||
      recoveryDigest(original.snapshot) !== original.snapshotDigest) throw new BookletRecoveryError("checkpoint_mismatch");
    const originalDigest = recoveryDigest(original);
    if (input.phase === "preview-claim-release") {
      const proof = await service.previewClaimRelease(target, original.snapshot);
      emit({ verified: true, phase, previewDigest: proof.previewDigest, providerPosts: 0 }); return;
    }
    if (!input["evidence-dir"] || !input["preview-digest"]) throw new BookletRecoveryError("evidence_required");
    const dir = await lstat(input["evidence-dir"]);
    if (!dir.isDirectory() || dir.isSymbolicLink() || (dir.mode & 0o077) !== 0) throw new BookletRecoveryError("evidence_permissions");
    const releasePath = join(input["evidence-dir"], "claim-release.json");
    let checkpoint: { originalDigest: string; previewDigest: string; target: typeof target; phase: "started" | "completed" } | undefined;
    try {
      checkpoint = z.object({ originalDigest: sha, previewDigest: sha, target: checkpointSchema.shape.target,
        phase: z.enum(["started", "completed"]) }).parse(JSON.parse(await readFile(releasePath, "utf8")));
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new BookletRecoveryError("checkpoint_invalid"); }
    if (checkpoint) {
      if (checkpoint.originalDigest !== originalDigest || checkpoint.previewDigest !== input["preview-digest"] ||
        recoveryDigest(checkpoint.target) !== recoveryDigest(target)) throw new BookletRecoveryError("checkpoint_mismatch");
      emit({ ...await service.verifyClaimRelease(target, original.snapshot), phase, repeated: true }); return;
    }
    if (input.phase !== "apply-claim-release") throw new BookletRecoveryError("checkpoint_missing");
    const checkpointBase = { originalDigest, previewDigest: input["preview-digest"], target };
    let releaseProof: unknown;
    const result = await service.applyClaimRelease(target, original.snapshot, input["preview-digest"], async proof => {
      releaseProof = proof;
      await saveCheckpoint(releasePath, { ...checkpointBase, phase: "started", proof }, true);
    });
    await saveCheckpoint(releasePath, { ...checkpointBase, phase: "completed", proof: releaseProof }, false);
    emit({ ...result, phase, repeated: false }); return;
  }
  if (input.phase === "verify-unapplied") {
    if (!input["preview-digest"]) throw new BookletRecoveryError("preview_required");
    emit({ ...await service.verifyUnapplied(target, input["preview-digest"]), phase }); return;
  }
  if (input.phase === "preview" || input.phase === "verify-closed") {
    // A supported pre-write abort restores the prior app with admission closed.
    // A new preview may inspect that state without reopening paid execution.
    const admission = await database.collections.deployment_control.findOne({ environment: "_staging" });
    const preview = await service.preview(target, input.phase === "verify-closed" || admission?.maintenance === true);
    if (input.phase === "verify-closed" && preview.previewDigest !== input["preview-digest"]) throw new BookletRecoveryError("preview_changed");
    emit({ verified: true, phase, contract: preview.contract, previewDigest: preview.previewDigest, ...target, providerPosts: 0 }); return;
  }
  if (!input["evidence-dir"] || !input["preview-digest"]) throw new BookletRecoveryError("evidence_required");
  const dir = await lstat(input["evidence-dir"]);
  if (!dir.isDirectory() || dir.isSymbolicLink() || (dir.mode & 0o077) !== 0) throw new BookletRecoveryError("evidence_permissions");
  const checkpointPath = join(input["evidence-dir"], "application-recovery.json");
  let prior: z.infer<typeof checkpointSchema> | undefined;
  try { prior = checkpointSchema.parse(JSON.parse(await readFile(checkpointPath, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new BookletRecoveryError("checkpoint_invalid"); }
  if (prior) {
    if (recoveryDigest(prior.target) !== recoveryDigest(target) || prior.previewDigest !== input["preview-digest"] ||
      recoveryDigest(prior.snapshot) !== prior.snapshotDigest) throw new BookletRecoveryError("checkpoint_mismatch");
    // Includes a process lost after commit: inspect proof, never replay the mutation.
    const result = await service.verifyCompleted(target, prior.snapshot);
    if (prior.phase !== "completed" && input.phase === "apply") await saveCheckpoint(checkpointPath, { ...prior, phase: "completed" }, false);
    emit({ ...result, phase, repeated: true }); return;
  }
  if (input.phase !== "apply") throw new BookletRecoveryError("checkpoint_missing");
  const preview = await service.apply(target, input["preview-digest"], async proof => {
    const checkpoint = { contract: BOOKLET_RECOVERY_CONTRACT, phase: "started", target, previewDigest: proof.previewDigest,
      snapshotDigest: recoveryDigest(proof.snapshot), snapshot: proof.snapshot };
    await saveCheckpoint(checkpointPath, checkpoint, true);
  });
  const result = await service.verifyCompleted(target, preview.snapshot);
  await saveCheckpoint(checkpointPath, { contract: BOOKLET_RECOVERY_CONTRACT, phase: "completed", target, previewDigest: preview.previewDigest,
    snapshotDigest: recoveryDigest(preview.snapshot), snapshot: preview.snapshot }, false);
  emit({ ...result, phase, repeated: false });
}
// This maintenance budget is separate from persisted provider deadlines. Keep
// 30 seconds inside the host's 180-second bound for cancellation and shutdown.
await withOperationBudget(Date.now() + 150_000, main).catch(async error => {
  if (error instanceof BookletRecoveryError && error.code === "other_work" && database) {
    // No exclusions: show all identities for diagnosis, including the target.
    emit(await inspectRecoveryWork(database, { environment: "_staging" }).catch(() => ({ outcome: "inspection_error" })));
  }
  const errorKind = error instanceof BookletRecoveryError && error.errorKind ? error.errorKind
    : ["MongoOperationTimeoutError", "MongoServerError", "AbortError", "OperationBudgetExpired"].includes(error?.name) ? error.name : "Error";
  emit({ verified: false, phase, code: error instanceof BookletRecoveryError ? error.code : "inspection_or_verification_failed", errorKind,
    ...(error instanceof BookletRecoveryError && error.stage ? { stage: error.stage } : {}),
    ...(error instanceof BookletRecoveryError && error.diagnostic ? error.diagnostic : {}),
    outcome: ["apply", "verify-completed", "apply-claim-release", "verify-claim-release"].includes(phase) ? "requires_inspection" : "blocked", providerPosts: 0 });
  process.exitCode = 1;
}).finally(async () => { await database?.close(); });
