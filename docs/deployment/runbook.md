# VPS deployment runbook

Flat secret-input validation evaluates required and allowed keys on the original
object before serialization. A validator expression failure is a delivery error;
it does not establish invalid credentials. Keep the existing secret rules and
use fake-input shell checks before requesting an operator to re-enter values.

This runbook operates the deployed Kids Booklet environments. Complete one operation at a time. Use the workflow summary as the primary result, and inspect the host journal after an interruption.

PR Validate runs [selected non-build checks](../../scripts/ci/README.md). For a manual
run, choose `full`, or choose `affected` and supply a resolvable `base_ref`.
Production and container builds occur only in Deploy, before VPS mutation. A green
Validate result does not prove the release build or browser smoke test succeeded.
Missing operational configuration fails before tool installation or image building;
the error names the missing setting without printing its value.

The staging delivery branch preserves the isolated Cloud trial, its tool routes,
credentials and fake-mode defaults. Community runner changes must not replace
those resources or production configuration.

## Current deployment status

### Supported recovery candidate

The M5 candidate advertises `execution-text-failure-closure` for the exact retained
Real Kid manager failure recorded in the [M5 checkpoint](../accepted/2026-09-27_dify-booklet-runner/M5-real.md#current-kid-attempt---2026-10-29).
Use the existing `candidate-reconcile` preview/apply flow with its run, operation
and revision, without `original_request_id`. The candidate reads the saved
publication using the existing matching app credential. Preview pins the terminal
provider evidence and target metadata. Apply requires closed admission and no
other work, then verifies accounting inside the closure transaction. Verification
preserves the campaign, reservations, creative records, deadline and stop receipt.
Its result is `failure_closed`; the run remains blocked and paused. The existing
checkpoint reconciles a lost acknowledgement by verification. Normal deployment
must use the same reviewed candidate source tree before admission is reopened.
The exact M5 recovery completed through protected apply `41198840942`; the
[M5 record](../accepted/2026-09-27_dify-booklet-runner/M5-real.md#protected-recovery-checkpoint---2026-10-31)
owns its receipt and normal deployment status. Do not repeat the historical apply.

The issue #65 recovery dispatcher is installed and retained J11 completion has
been verified through supported controls. Installation and live execution remain
separate evidence; the commands below require matching dispatcher capabilities
and application images. See the current [M4 record](../accepted/2026-09-27_dify-booklet-runner/M4-balanced.md)
for the completed normal delivery, retained manager blocker and next checkpoint.

The count-failure correction uses the same `candidate-reconcile` action and
preview/apply inputs. Its candidate must advertise `granted-legacy-count-failure`.
New count-failure checkpoints pin `pre-generation-target-v1`: exact affected
records, current sources/approvals and projected campaign exposure. They exclude
unrelated historical payloads. Older checkpoints retain their original proof;
unknown scopes or changed evidence stop without mutation. Snapshot read diagnostics
contain fixed operation names, row/byte counts and budget timings only.
An exact manifest grant pins the failed execution, dev2 adapter/source and retained
node receipt; preview also requires fresh authenticated execution readback.
Successful apply reports `failure_closed`, preserves the entire reservation,
original deadline and history, and leaves the campaign stopped with the run
blocked and Pause requested. This result is a completed recovery action, not a
successful generation. Repeated verification reads its saved provenance. Normal
deployment and preflight must precede the separately granted continuation.
No dispatcher replacement or custom host script is required for this outcome.
The exact legacy proof can retain an acknowledged deadline Stop; it cannot accept
a manual or uncertain Stop. Before preview, confirm a stable target revision. If
the serving image keeps changing that revision through observation, stop here:
the existing workflow does not expose a separate observation-quiesce action.
Use the issue's separately approved maintenance checkpoint, or return the precise
blocker. Do not invoke the unrelated historical bootstrap repair or bypass revision
checks.
Install the reviewed dev3 provider only through its bounded signature window;
restore verification and read back the exact package identity before continuation.

Routine initialization checks required setup, metadata and seed availability;
retained history is excluded. Use the explicit `npm run db:verify` diagnostic for
the comprehensive audit; it retains projected 100-row pages and all corruption
checks. Maintenance emits sanitized phase/operation timings; a failed audit read
also reports `experiment_integrity_read`, collection and an allowlisted error kind.
No saved contents or connection details are reported. Preserve the
failed deployment journal and backup; a read timeout does not establish invalid
data or authorize replay, data restoration or a deadline increase.

When the expired deployment followed candidate recovery, its completed handoff is
also pinned in preview. Supported restoration archives that exact handoff with the
failed deployment after compatibility/readiness pass. This permits a separate
reviewed corrective deployment without adopting another candidate's recovery
evidence. Changed or unverified handoff provenance keeps admission closed.

New image compatibility uses the declared `booklet-data-v1` contract with no
initialization or migration requirement. The current legacy pair has one exact
reviewed bridge for optional recovery metadata. Restoration compares the selected
target, dependencies, approvals and accounting before/after startup instead of
repeating a full historical audit. Reuse a verified backup only within the same
closed, protected mutation window. Starting the prior app needs no new backup;
changed or unproven writer exclusion requires fresh proof before mutation.

Use **VPS operation control** with `candidate-reconcile` for a granted retained
completion, or `expired-deployment-recover` for a stopped expired deployment.
Preview first, retain its digest, then apply the same exact target. The protected
workflow exposes structured blocker IDs and phases. Inspection failure is not a
clear work inventory. Use bounded blocker pages instead of copying private logs.
An invalid recovery response also reports application-output byte sizes and JSON
value/object/verified-result counts. Malformed JSON reports no shape. These
measurements contain no response or stderr content and do not relax validation.
Without a valid preview digest, do not apply recovery or infer that it succeeded.
Recovery output may include known read diagnostics before or after its receipt.
The host validates their exact fields, numeric measurements and successful
outcomes; callback diagnostics also match the selected run and operation. It then
requires exactly one verified receipt and passes only that receipt to proof
checks. Unknown or conflicting records fail. Diagnostic labels alone cannot make
a record safe to discard.

For an exact retained manager completion, first verify that the reviewed image
advertises `granted-j12-manager-completion` and the protected manifest grants that
run/operation identity. Only an authenticated retained `delegate` result for J12
with a page subject is supported. Use the same preview/apply inputs below; do not
create another dispatcher action or replay the provider. Source and approval
checks remain required. Verification must prove the J12 delegation summary,
unchanged artifacts, versions, dependencies, approvals and booklets, and preserved
accounting and attempt history. The recovered run remains paused until explicit
Resume after normal delivery and preflight. Existing J11 recovery is unchanged.

For candidate preview, the workflow's `recovery` input is a JSON object containing
string fields `run_id`, `operation_id` and `expected_revision`. Supply a new
`request_id`, reviewed candidate `commit` and immutable `image_digest`. Apply adds
`preview_digest`, sets `apply=true` and confirms `kids_booklet`. For diagnosis
only, use `{"inspection_only":"true","page":"0","limit":"5"}` without target
fields. Pages are zero-based; limit is at most 50. Expired-deployment recovery uses
`original_request_id` instead of run/operation fields and pins the selected prior
commit/image. Preview does not create a durable recovery journal; retain its digest
from the workflow summary. Apply does create one. Use `operation-status` with its
exact request ID after interruption.
Read-only `operation-status` runs independently of the same request's mutation
queue. It reports the retained phase without stopping, replaying or acquiring the
mutation lock. A phase is not proof that the application result committed.

For an explicitly granted exhausted J13 tester decision, the candidate must
advertise `granted-decision-rejection` and preview must return
`decision-rejection-target-v1`. Use the existing candidate-reconcile flow with the
exact run/operation/revision. When the failed deployment stopped in `draining`
before any backup, pass that exact deployment as `original_request_id`. The host
must prove a stopped process, no owned containers, unchanged serving release and
unchanged journal bytes. Apply archives the original journal without changing its
phase, then uses the normal protected close/stop/backup/reconcile sequence.
Recovery leaves the run blocked and paused, its campaign stopped and all charges
retained. It neither consumes continuation nor starts a reviewer. Repeat only
verification after an uncertain acknowledgement. Deliver the exact recovered
source tree normally, verify readiness, then use the separately authorized
Continue control. A later deployment phase or unknown process is unsupported;
do not bypass the drain or edit records directly. Matching installed host and
candidate capabilities are required before this path is used.

If candidate recovery stopped before committing business changes, use the same
target and preview digest with `abort_recovery="true"` in the recovery JSON and
`apply=true`. This requires no active maintenance container. Pre-write phases
must have no application checkpoint. A `reconciling` phase additionally requires
the candidate's read-only `verify-unapplied` proof: unchanged business snapshot
and grant, eligible target and no claims. It restores the prior
service with admission closed and retains the failed phase as `aborted-closed`.
Then inspect the cause and preview a new recovery request. It does not reopen
paid execution or retry a failed backup automatically.

If inspection establishes that an interrupted request retained only an expired
finalization claim, use a new reviewed candidate and request ID with
`release_expired_claim="true"`, `original_request_id` and the exact original
run/operation/revision in the recovery JSON. Preview first; apply adds its digest
and confirmation normally. The action requires the original verified backup,
unchanged original journal/checkpoint, stopped writers and no unrelated work.
Only full snapshot equality after removing that exact claim permits release.
It leaves admission closed and the app stopped. A repeated child request verifies
only. After successful release, invoke the original request's supported abort;
diagnose the original failure before a separate reconciliation preview. Claim
expiry alone never authorizes release, and this is not a general record editor.
For an interrupted child that has not released its claim, explicitly add
`abort_recovery="true"` to that child's apply request. Read-only preview must match
the saved application digest before the child can become `aborted-closed`.
It does not restore the service, reopen admission or change parent evidence.
Changed claims or committed release reject abort; inspect or verify the outcome.
Repeated terminal child requests return a historical receipt even after the
parent advances. This proves the saved recovery outcome, not current admission or
database state. Check current status separately before another action.

For a stopped, expired staging deployment whose retained phase is `backup`, the
reviewed `expired-deployment-recover` action also accepts
`backup_helper_image` and `backup_helper_commit` in its recovery JSON. The usual
`commit` and `image_digest` identify the selected prior release. The helper pair
identifies a separately reviewed build-only candidate; it must declare compatible
data and backup contracts. Supply a distinct recovery request ID and the exact
`original_request_id`; omit `backup_id` because the dispatcher resolves it.
Preview verifies the completed decision-recovery target and inspects the original
backup. Only a missing completion marker permits a fresh immutable backup ID.
Apply requires the exact preview digest and normal `kids_booklet` confirmation.

Checkpoints are `prepared`, `backing-up`, `backup-verified`,
`prior-service-ready-closed` and `complete`. A retained `backing-up` checkpoint
allows verification of a completed backup, never another backup invocation. The
recovery deadline is retained across reentry. On failure, inspect its exact journal
and fixed storage diagnostics; do not replay the backup or overwrite partial
objects. Successful recovery archives the original failed deployment and decision
handoff unchanged, restores prior-service readiness with admission closed, and
pins a helper handoff. Normal staging deployment must match its source tree and
use the helper for its own backup. It retires the handoff only after success.
The protected dispatcher must support this helper pair before use; prepare a
reviewed checksum handoff if the installed version lacks it.

Mutating reentry requires unchanged host configuration fingerprints. For an old
candidate journal, the dispatcher reconstructs its original digest with bounded
backup-ID candidates. If the original preview used a custom backup ID later
replaced by the actual recovery backup, supply that original non-secret value
through the existing `backup_id` input. A mismatch returns
`legacy_preview_fingerprint_unverified`; retain the evidence and inspect the
original invocation. Do not adopt new configuration or edit the journal.
Expired recovery can continue from `prepared` only after repeating its original
process, container, journal, backup and compatibility checks.

Build a recovery artifact through **Deploy**, selecting the reviewed staging
delivery branch, `environment=staging` and `recovery_candidate=true`. This only
builds the immutable image; it does not contact the VPS or update the environment
alias. Candidate recovery pins this commit/image and rejects migrations. After
verified completion, deploy the same source tree through the normal reviewed
staging process. Keep the recovered persona paused until application preflight.

If an action is interrupted, inspect its exact recovery request. A saved completion
can be verified without replay. Do not repeat an uncertain application mutation,
clear a blocker or extend an expired original deadline. Expired-deployment recovery
requires the exact prior release, verified backup and compatibility evidence; it
does not restore data. Unsupported initializer drift stays blocked.

The issue #65 recovery dispatcher is installed; new candidate capabilities require
separate verification. Its current work and remaining gates are in
[M4 supported recovery](../accepted/2026-09-27_dify-booklet-runner/M4-balanced.md#supported-recovery-follow-up---2026-10-18).
The historical status below does not supersede that section.

### Candidate recovery controls

Use the canonical deployment entrypoint and the reviewed **VPS operation control**
workflow. `operation-status` and `operation-stop` require the exact request ID and
environment. Stop inspects phase outputs first; process exit alone is not an
output verdict. `backup-verify` is read-only and requires the exact backup ID,
selected commit and image digest. It verifies the completion marker, manifest,
archive and retained asset bytes without restoring data; its bound is 30 minutes.

`staging-bootstrap-reconcile` is an explicit compatibility transition for retained
request `38149230374-1`, not a fallback for arbitrary old releases. Preview checks
the exact old image, failed service, journal, stale page item/job and owning failed
operation. Apply closes admission and rechecks for races, stops only staging,
creates and verifies a matched backup, and repairs only the approved bookkeeping.
It archives the original journal unchanged and retains maintenance for a separately
identified reviewed deployment. The new commit/image must match the bootstrap
checkpoint. An interruption after repair starts retains maintenance and requires
inspection; do not replay repair or restore automatically. Production and Cloud
are not part of this transition.

The installed dispatcher must support these actions before workflow use. A merge
does not prove synchronization. Check dispatcher identity, application image and
capabilities together. Use existing protected access; request a root handoff only
if the restricted interface cannot install the reviewed dispatcher safely.

Initial live acceptance completed on 2026-09-15. The latest staging transition
passed on 2026-10-05. Sixteen model-free bindings are active through J11.
All three persona simulations reached approved pagination with zero payable
calls. J12/J13, final images and full-booklet simulation remain pending; see
[M3 evidence](../accepted/2026-09-27_dify-booklet-runner/M3-completion.md#current-live-pagination-evidence--2026-10-05).

| Checkpoint | Verified state |
| --- | --- |
| Infrastructure | Run `38139657415` synchronized reviewed `master` merge `3b017f839d60e56b4f7d4ef5e7c77aea91263e44`; Terraform changed no resources. Scheduler repair `38139804937` passed; diagnostics `38140083268` verified 1536 MiB, zero restarts and zero OOM counters. See the [Community runbook](https://github.com/karpishe-experiments/agentic-poc/blob/master/docs/deployment/dify-community.md#automated-diagnostics-and-sandbox-memory). |
| Staging | Release `0fb4c3d0d0996b38e7a8c03ffebf81793ddf1fe0`; Deploy `37356864220` and Check `37357833756` passed. Sixteen model-free bindings activated through `37348239296` with backup `staging-20261005T172539Z-9163268c683d14ee`. Index retirement `37307366249` passed with verified pre-change backup `staging-20261005T120906Z-4bf0d3b2d7950104`, preserving data/assets and release pointers. The authorized prior reset backup remains `staging-20261004T161608Z-54752b58ec7bc071`; no further reset is authorized. |
| Production | Deploy and Check deployment passed for `_prod` commit `2ab3889f67f5e664d2a883cba4358c58ed94bc28`; `https://booklet.uniwares.co.uk` is operational |
| Recovery | Staging backup and restore rehearsal passed |
| Restart | Docker, Cloudflare Tunnel, and both healthy application containers recovered after a VPS restart; staging and production checks passed afterward |

For Dify scheduler OOM recovery, use the targeted repair and
verification checkpoint in the [Community runbook](https://github.com/karpishe-experiments/agentic-poc/blob/master/docs/deployment/dify-community.md#automated-diagnostics-and-sandbox-memory)
after reviewed host synchronization. The latest scheduler recovery is verified.

This table records the accepted baseline. Use current workflow summaries and host state for later releases.

## Configuration and access

| Value | Current value |
| --- | --- |
| Repository | `karpishe-experiments/agentic-poc` |
| Cloudflare zone | `uniwares.co.uk` |
| Staging hostname | `booklet-staging.uniwares.co.uk` |
| Production hostname | `booklet.uniwares.co.uk` |
| Deployment hostname | `srv1-deploy.uniwares.co.uk` |
| Dify hostname | `dify.uniwares.co.uk`; current administration state is in the [Community runbook](https://github.com/karpishe-experiments/agentic-poc/blob/master/docs/deployment/dify-community.md#enable-the-community-admin-api) |
| Atlas project | `6a869d84e65675f845fa22eb` |
| Atlas cluster | `kids-booklet`, Ireland (`eu-west-1`) |
| Staging database | `kids_booklet` |
| Production database | `kids_booklet_prod` |

Sign in with username `booklet` and that environment's `ACCESS_GATE_PASSWORD`. Host secrets are root-owned files under `/etc/kids-booklet/<environment>/secrets.json`. Do not print, commit, or upload resolved Compose configuration.

The VPS is a read-only Git consumer. Do not commit, create or switch branches, rewrite history, or push from it. Runtime state belongs under `/opt/kids-booklet`, `/etc/kids-booklet`, and `/var/lib/kids-booklet`.

## Routine release

1. Select the reviewed commit or branch for the target environment.
2. Open and merge it into `_staging` or `_prod`. The merge starts Deploy for that environment.
3. Require Deploy and Check deployment to pass. Verify the browser flow when user behavior changed.
4. Promote the same reviewed change to the other environment only when that environment must receive it.

`_staging` and `_prod` are independent reviewed release lines and may diverge from `master` and from each other. Deploy verifies that the selected environment matches the target branch and that the remote branch still points to the workflow commit. It does not require `master` ancestry or a successful Infrastructure run. It publishes `staging-<full-sha>` or `prod-<full-sha>`, verifies anonymous GHCR access, and deploys the immutable digest. The short environment tag advances only after success.

Infrastructure remains master-owned. Merge Cloudflare, Terraform, installed host configuration, or deployment-bootstrap changes into `master`. A push runs Infrastructure in preview mode; after reviewing the plan, run it manually with `apply=true` and require that apply to pass before relying on those infrastructure changes. An Infrastructure result does not control whether an environment branch can deploy its own application release.

After the independent-deployment workflow first merges to `master`, promote that reviewed commit once to `_staging` and `_prod`. Each environment uses the workflow stored on its own branch, so this one-time promotion activates the new behavior there. Later releases do not need to contain the current `master` commit.

For a manual environment workflow, open **Actions → workflow name → Run workflow**, select `_staging` or `_prod`, and select the matching environment. For a manual Infrastructure run, select `master` and set `apply=true`. Never start another mutating workflow while one is active. Every workflow summary reports its target, outcome, revision, and required next identifier.

## Routine operations

Use the [canonical credential inventory](contracts.md#variables-and-secrets) for
names, protected locations, consumers and purposes. Follow its
[maintenance procedure](contracts.md#maintaining-the-inventory) when implementation
or credential setup changes. Verify provision privately; the inventory contains
no values and does not prove live access.

| Need | Action |
| --- | --- |
| Verify an environment | Run **Check deployment** on its environment branch |
| Inspect Dify host state and staging runner timings | Run **Dify operations** with `action=diagnostics`, Apply off, and an optional staging run UUID; see [diagnostics and sandbox repair](https://github.com/karpishe-experiments/agentic-poc/blob/master/docs/deployment/dify-community.md#automated-diagnostics-and-sandbox-memory) |
| Change Cloudflare or installed host configuration | Merge the reviewed change to `master`; inspect the Infrastructure preview; explicitly run **Infrastructure** with `apply=true`; then release each affected environment |
| Create a backup | Run **Maintenance** with `action=backup`; retain the exact `backupId` from the summary |
| Restore | Run **Maintenance** with `action=restore`, the exact `backup_id`, and confirmation `kids_booklet` or `kids_booklet_prod` |
| Roll back application code | Run **Maintenance** with `action=rollback`; this restores the prior digest and matching non-secret configuration, not the database |
| Resume an interrupted operation | Inspect host status, then run **Maintenance** with `action=resume` for the recorded environment |
| Rotate one host secret | Run `bash scripts/deploy/vps-deployment.sh --action rotate-secrets --environment <target> --secret-name <name> --config infra/config/vps.json --apply` |
| Install a temporary staging Dify key without local Cloudflare credentials | Store `DIFY_TOOL_KEY` or `DIFY_API_KEY` as a protected repository secret, then run **Dify staging key** on `master` and select that key; remove the repository secret after success |
| Configure the Community staging probe | Follow [Community checkpoint 5](https://github.com/karpishe-experiments/agentic-poc/blob/master/docs/deployment/dify-community.md#checkpoint-5--deterministic-booklet-round-trip); select `DIFY_COMMUNITY_PROBE` in **Dify staging key** after the reviewed host dispatcher and staging routes are installed |
| Stage issue #65 runner bindings | Follow [M1 private setup](../accepted/2026-09-27_dify-booklet-runner/M1-runner.md#s4d-protected-staging-runner-bindings); store `DIFY_BOOKLET_RUNNER_SETTINGS_JSON` privately, initially disabled, then select `DIFY_BOOKLET_RUNNER` in **Dify staging key** on reviewed `master` |
| Prepare J11 pagination bindings | Follow [M3 preparation](../accepted/2026-09-27_dify-booklet-runner/M3-completion.md#j11-dify-preparation-package). Sixteen slots add J11 and use new manager/tester apps. Private setup, reviewed host validator, staging release and drained activation are separate checkpoints; no reset or paid call. |
| Prepare J12 Page Bible bindings | Follow [M3 J12 preparation](../accepted/2026-09-27_dify-booklet-runner/M3-completion.md#independent-local-preparation-j12-page-bible-slice). `scripts/prepare-dify-booklet-j12-keys.ps1` reuses sixteen bindings and privately adds only J12. Use `scripts/upload-dify-booklet-m3-settings.ps1 -Profile m3-j12` with the verified seventeen-publication manifest. Separate encrypted files preserve M3. Reviewed dispatcher installation, manager publication/read-back, staging release and drained activation remain separate gates; no reset or paid call. |
| Prepare final-page/evaluation bindings | Follow [M3 final binding preparation](../accepted/2026-09-27_dify-booklet-runner/M3-completion.md#final-binding-preparation-candidate). Use the same preparation helper with `-Profile m3-j13`; it reuses sixteen bindings, or the prepared seventeen-binding file, and collects only missing J12/judge keys. The uploader's `m3-j13` profile requires eighteen verified publications and marks only the image binding for final-page execution. Review, drain, published readback, staging release and protected activation remain separate gates. No reset or paid call. |
| Expand narrative bindings | Follow [M2 S3](../accepted/2026-09-27_dify-booklet-runner/M2-references.md#s3-binding-and-publication-package); use the complete eleven-slot bundle after reviewed dispatcher installation, closed admission, reconciliation and published read-back. Preserve old run evidence; do not repeat the staging reset. |
| Enable style/image bindings | Follow [M2 scheduling](../accepted/2026-09-27_dify-booklet-runner/M2-references.md#s5-automatic-style-sample-dispatch); thirteen slots add J08 and one model-free image workflow. Verify Python/DSL parity, private bindings and live binary transfer before activation. Host dispatcher installation remains a separate authorized checkpoint; no new reset. |
| Enable sheet bindings | Fifteen slots add independent J09/J10 specialists. Verify complete local reference journeys, private publications and binary transfer first. Sheet admission requires the subject-aware index and absence of the retained old restriction. Index removal and host synchronization require their separate maintenance checkpoints; configuration validation does not authorize them. |
| Retire the staging artifact restriction | Run **Maintenance** on `_staging` with `action=retire-staging-artifact-index`, `environment=staging`, and default `apply=false`. Inspect its real catalog/ledger and rollback preview. After exact-target authorization, use `apply=true`, confirmation `kids_booklet`, and no supplied backup ID. The action creates and verifies its own pre-change backup, removes only `artifacts_booklet_type_unique`, and preserves data/assets and release pointers. The authorized staging transition passed; do not repeat it as setup. |
| Rotate all host secrets | Use the same command without `--secret-name`; each value is validated immediately and earlier valid entries are retained |
| Generate an access password | Add `--secret-name ACCESS_GATE_PASSWORD --generate-password`; the interactive command displays it once |
| Reset staging | Run **Reset staging** on `_staging`, confirm `kids_booklet`, and use default `apply=false` for inventory. Set `apply=true` only after exact-target approval. A valid prepared Dify bundle activates after reset; production reset is rejected |
| Recover interrupted reset | Do not Resume a `resetting` or `reset-verifying` journal. Inspect status, then obtain restore authorization and run **Maintenance** on `_staging` with `action=restore`, the journal's exact backup ID and confirmation `kids_booklet`. The host requires the prior service/maintenance containers stopped, preserves the failed journal and restores without repeating reset |

The Cloud trial defaults remain enabled in staging, with fake mode and images disabled. Preserve existing `DIFY_API_KEY` and `DIFY_TOOL_KEY` values and explicit protected overrides. Dify holds its image-provider credential; optional `DIFY_IMAGE_OPENAI_API_KEY` host support remains inert. Real turns and image calls require separate authorization. Production keeps the experiment disabled. Community uses independent keys; do not replace the Cloud keys. See the [experiment configuration](../accepted/2026-09-16_agent-platform-decision/configuration.md).

Infrastructure sync installs master-owned Compose files on the host; `prepare_release` captures them in each immutable release snapshot. Compare those defaults with the selected environment branch before release. Synchronizing host files does not rewrite an existing release; a configuration correction requires a new release commit. See the [verified lesson](../accepted/2026-09-27_dify-booklet-runner/LESSONS-LEARNED.md#vps-releases-snapshot-master-owned-compose-files).

The bounded-operation candidate changes release and restore to two-stage admission:
draining rejects new work but permits admitted callbacks, observation and stop;
maintenance starts only after work and mutations are resolved. Drain is bounded
to five minutes. Uncertain identities and interrupted mutation ownership remain
blockers. A failed candidate restores the prior application and configuration while
maintenance remains active. Database restoration is always explicit.

Candidate host limits are 30 seconds for status, 60 seconds for container stop,
three minutes for readiness, 30 minutes for pull/backup, 60 minutes for restore,
and 45 minutes for deployment overall. Each stage shares its remaining host
budget. The client returns the retained request ID after five minutes; it does
not imply that the detached operation stopped. The **VPS operation control**
workflow on reviewed `master` inspects or stops one exact request and environment.
Stop defaults to preview. Preserve its journal and inspect outputs before Resume;
an interrupted restore must not restart automatically. These controls require a
reviewed dispatcher and compatible application image before live use. The current
legacy deployment transition is tracked in [M3](../accepted/2026-09-27_dify-booklet-runner/M3-completion.md).

Index retirement first rejects unresolved experiment work while callbacks remain
available. It checks again after closing admission and draining, before stopping
the app. If that check fails, it reopens admission with the original app running;
reconcile the saved work before Resume. After stop, it verifies the ledger again,
the complete backup bytes, the selected image and a pinned compatible rollback
SHA/digest pair. An unknown rollback pair needs a reviewed table update, not an
older deployment or a rewritten release pointer.

After removal, Resume retains the pre-change backup and verifies an already-absent
index without making another backup. The `index-finalizing` checkpoint resumes
readiness and admission reopening without stopping the app or repeating removal.
Inspect the journal and service state first. Failed verification retains the
journal; database restore still needs separate exact-backup authorization.

## Interruption and recovery

Inspect the journal first:

```bash
sudo /opt/kids-booklet/vps-deployment.sh --action status
```

| Observed state | Safe response |
| --- | --- |
| `{"step":"idle"}` | No operation is retained; start the intended workflow |
| Active detached service | Let it finish; do not start a competing workflow |
| Failed application operation | Read its workflow summary and host service log, correct the cause, then use **Maintenance → resume** for the same environment, except a destructive reset: use the exact-backup recovery row above |
| Drain timeout | The old application remains selected; wait for active work to finish before resume |
| Failed readiness | Inspect the candidate and prior-release checks; the database was not restored automatically |
| Infrastructure journal retained after its Actions run stopped | Match its request ID and commit to the workflow summary, inspect Terraform state and the failed phase, then use guarded `infra-unlock` |
| Tunnel unavailable | Use provider-console access and inspect `kids-booklet-tunnel.service` and its protected token file |

Release a stopped infrastructure operation only after the request ID and commit match:

```bash
bash scripts/deploy/vps-deployment.sh \
  --action infra-unlock \
  --request-id <recorded-id> \
  --vps-host srv1-deploy.uniwares.co.uk \
  --apply
```

Rerun Infrastructure once and require its summary to report the same commit and success before promotion. Never delete a lock or edit the journal manually.

Backups contain the MongoDB archive, collection inventory, checksums, and referenced assets. The staging reset backup also includes every object in the staging asset bucket, including unreferenced objects. Restore accepts only a completed backup marker for the matching environment and database. Partial backup IDs remain reserved. Recovery objects expire after 30 days; current assets do not expire.

## Provider credential session

Provider administration is needed only for infrastructure repair, credential rotation, or rebuilding setup. Load temporary credentials into the current SSH login, verify all providers, perform one operation, and clear them:

```bash
source scripts/deploy/vps-deployment.sh --action credential-session
bash scripts/deploy/vps-deployment.sh --action access-check --config infra/config/vps.json
# Run the required preview and apply command.
source scripts/deploy/vps-deployment.sh --action clear-credential-session
```

`access-check` verifies Cloudflare, R2 Terraform state, Atlas Project Owner, and GitHub administration access without mutation. The R2 Terraform Access Key ID and Secret Access Key are S3-compatible credentials; they are separate from the Cloudflare API token.

## Rebuild setup

Use this section only to rebuild or reconcile the deployment. The canonical entrypoint is `scripts/deploy/vps-deployment.sh`; all actions preview unless `--apply` is present.

Required host tools are Docker Engine with Compose v2, Git, sudo, jq, Python 3, curl, tar, OpenSSL, OpenSSH, and systemd. Use an x86_64 Ubuntu host with at least 2 CPU cores, 6 GiB RAM, and 10 GiB free disk. Complete Cloudflare DNS, R2, and Zero Trust Free-plan enrollment and billing consent before setup.

1. Run `discover-config` in preview with the zone and three hostnames. Repeat with `--apply` only after reviewing the generated non-secret configuration.
2. Source `credential-session`, then require `access-check` to pass.
3. Run setup preview, resolve drift, and repeat with `--apply`.
4. Require exact Atlas users and VPS allowlist, protected R2 state, Cloudflare resources, root-owned dispatcher and secret overrides, active Tunnel, GitHub credentials and variables, and the zero-dollar Actions overage budget.
5. Run finalize preview and apply. It creates missing environment branches and applies protection where the GitHub plan supports it.
6. Clear the credential session, then follow the routine release sequence.

Setup is additive and resumable. It does not delete resources, copy production data, or roll back automatically. Terraform runs from a private workspace outside the checkout and must not rewrite tracked files.

See [deployment contracts](contracts.md) for ownership, secrets, security boundaries, cost limits, and validation requirements.
