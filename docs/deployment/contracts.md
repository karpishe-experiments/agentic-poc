# Deployment contracts and verification

## Ownership

Supported Booklet recovery is staging-only. `candidate-reconcile` runs reviewed
application recovery from an immutable image without changing the serving release.
`expired-deployment-recover` uses a separate request linked to the unchanged
original journal and deadline. Both default to preview and retain closed admission
after ambiguous mutations. No automatic restore or provider replay is permitted.
The explicit `release_expired_claim` purpose under `candidate-reconcile` uses a new
request linked to an interrupted original recovery. It requires stopped writers,
closed quiet admission, verified original backup and byte-pinned parent journal/
checkpoint. The application proves the exact expired finalization claim is the
only snapshot difference before restoring its original null/missing representation.
The child records provenance and verifies its outcome; it neither replays
reconciliation nor changes the original journal, serving release or admission.
An interrupted child can be explicitly aborted only when read-only preview matches
its saved application digest, including the exact retained claim. This marks only
the child `aborted-closed`; committed release requires outcome verification instead.
After release, original-request abort must prove unchanged state independently.

The recovery command's private checkpoint stores target identities, hashes,
phase and preservation evidence; it does not export prompts or credentials.
Preview has no business writes. Artifact acquisition may populate the Docker
cache. Candidate apply requires a verified backup, quiet ownership and compatible
schema; application initialization is not part of recovery. A different normal
deployment merge commit must have exactly the recovered candidate's Git tree.
The build verifies that tree against GitHub and records it in the immutable image
label, alongside the selected commit. Host recovery compares those identities.

Credential-inventory impact: recovery reuses existing staging runtime, Dify
application and deployment credentials in their existing protected locations.
It introduces no secret, credential copy or OpenAI-key transfer. Candidate reads
use existing Dify application credentials; provider execution remains forbidden.

Staging reset previews inventory by default. Apply requires confirmation of
`kids_booklet`, the exact `kids-booklet-staging-assets` bucket and a completed
backup covering every bucket object. With prepared runner bindings, the host
validates an enabled maintenance-only override, initializes without local-agent
seeds, and activates that override only after reset. Cloud/probe secrets remain
unchanged. An interrupted destructive phase requires inspection and explicit
recovery, not another reset through Resume.

Terraform owns Cloudflare resources. `scripts/deploy/vps-deployment.sh` is the only deployment shell entrypoint; the installed copy provides the restricted SSH dispatcher and detached host lifecycle. Root owns `/opt/kids-booklet`, `/etc/kids-booklet`, and `/var/lib/kids-booklet`. The deployment account has no general sudo or Docker-group membership.

Compose merges base, environment overlay, root-only secret JSON, and image override in that order. JSON is valid Compose YAML; secret dollar signs are doubled to suppress interpolation. Resolved Compose output is consumed by validation and never logged. Missing secret values block maintenance admission. Application containers use 1 CPU/2 GiB, localhost-only ports, read-only root filesystems, and temporary scratch space.

## Variables and secrets

This is the canonical credential inventory for Booklet deployment and the issue
#65 Dify runner. It records names and boundaries, never values. Storage below is
the implemented or documented location, not proof that a live credential exists
or works. Keep Cloud, Community, staging, production and developer credentials
separate. The host operator owns host/deployment credentials; the workspace owner
owns Dify applications/providers; each developer owns their administration session.

### Non-secret configuration

| Names | Storage and purpose |
| --- | --- |
| `APP_HOSTNAME`, `ASSETS_BUCKET`, `DIAGNOSTICS_BUCKET`, `RECOVERY_BUCKET` | Reviewed JSON, selected per environment, passed through Compose |
| `DEPLOYMENT_ENV`, `MONGODB_DATABASE`, `AWS_REGION`, `OBJECT_STORE_ENDPOINT` | Compose identity, fixed databases, R2 region/endpoint |
| `MODEL_RUNTIME`, `IMAGE_PROVIDER_MODE` | Compose sets both to `real` |
| `DIFY_COMMUNITY_PROBE_ENABLED`, `DIFY_COMMUNITY_BASE_URL` | Staging diagnostic probe switch and Community HTTPS origin |
| `DIFY_BOOKLET_RUNNER_ENABLED`, `DIFY_BOOKLET_BASE_URL`, `DIFY_BOOKLET_PUBLIC_ORIGIN` | Runner switch, Community origin and Booklet callback origin; included in the protected five-setting bundle |

App IDs, publication IDs, graph hashes, workspace IDs and bucket names are not
secrets. `DIFY_BOOKLET_BINDINGS_JSON` is secret-bearing because it includes keys.

### Booklet application credentials

The deployed store is root-only `/etc/kids-booklet/<environment>/secrets.json`,
where `<environment>` is `staging` or `prod`. Compose injects its app environment
fields into application and maintenance containers. Local execution can receive
credentials through private process environment or untracked `.env.local`; do not
infer their presence from `.env.example`.

| Name / variable | Storage | Current consumer and purpose |
| --- | --- | --- |
| `MONGODB_URI` | Protected host override; corresponding Atlas application user | MongoDB connection, including database password, for durable Booklet data and recovery; environment-scoped user |
| `ACCESS_GATE_PASSWORD` | Protected host override | Booklet Basic HTTP gate, including staging diagnostic logs, with fixed username `booklet`; at least 16 characters; the host diagnostic candidate consumes the existing staging container value in memory for a bounded public API check (live use pending); no additional storage or transfer copy; dedicated Dify tool routes use their own key |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Protected host override | S3-compatible R2 access for assets, diagnostics and Booklet backup/restore; separate from Terraform-state and Dify-backup keys |
| `OPENAI_API_KEY` | Protected host override | Legacy application model/image execution; enabled Dify runner does not require it in the app schema, but deployment still requires a nonempty value |
| `GEMINI_API_KEY` | Optional private local environment; no managed deployment provision path | Gemini image provider sends `x-goog-api-key`; conditional on selecting that provider, not required for simulated Dify workflows |
| `BFL_API_KEY` | Optional private local environment; no managed deployment provision path | FLUX provider checks credential availability; submission remains disabled in this POC |

### Issue #65 runner credentials

| Name / field | Storage | Current consumer and purpose |
| --- | --- | --- |
| Manager application key: `DIFY_BOOKLET_BINDINGS_JSON[].apiKey`, role `manager` | Dify app API-key store; staging host override and private preparation copies below | Booklet submits the manager workflow and retrieves its existing run/result with Bearer authentication; the bounded-operation candidate also stops the exact persisted task using this same application key |
| Twelve specialist application keys: same field, role `specialist`, `taskId` `J01` through `J12` | Same stores; one independent key per app | Execute/recover specialist workflows |
| Three tester application keys: same field, role `tester`, personas `playful_kid`, `enthusiast_parent`, `professional_creator` | Same stores; one independent key per tester app | Execute/recover external creator-persona workflows |
| Image application key: same field, role `image` | Same stores | Execute/recover the generic image workflow, including J13 final-page illustrations; J13 has no separate specialist key |
| Judge application key: same field, role `judge` | Same stores | Execute/recover independent advisory evaluation |
| Shared callback/tool key: Booklet `DIFY_BOOKLET_TOOL_KEY`; Dify secret variable `BOOKLET_TOOL_KEY` | Staging host override; Dify workflow secret variables; private preparation copies | Dify sends `x-booklet-tool-key` to Booklet authorization, callback and image-transfer routes; independent of Cloud and diagnostic probe keys |
| Transfer bundle: `DIFY_BOOKLET_RUNNER_SETTINGS_JSON` | GitHub Actions repository secret; private encrypted settings file | `dify-tool-key.yml` passes the five-setting JSON bundle to `rotate-protected-dify-key`; contains the callback key and binding keys, not a new authentication key |

The full final/evaluation profile has 18 application keys plus one shared callback
key. Earlier profiles have 6, 11, 13, 15, 16 or 17 bindings. Do not create separate
environment-variable names for individual keys: identify each by role/task/persona
in the binding array. Booklet's saved run-configuration schema omits `apiKey`.

The bounded-operation candidate uses each role's existing application key for
exact-task cancellation and subsequent run lookup. It does not use the Dify
administration credential for runtime stop. Inspect/stop browser and CLI actions
use the existing Booklet Basic gate. The new VPS operation-control workflow uses
the existing pinned deployment SSH and Cloudflare Access credentials. No new
credential or storage directory is introduced. Private preparation adds the
encrypted partial copies described below. Live stop use remains
unverified until the model-free staging probes pass.

Preparation scripts retain DPAPI-encrypted files under
`%LOCALAPPDATA%\DifyWf-Community-Codex`, outside Git. The final profile uses
`issue65-m3-j13-bindings.dpapi.xml` and `issue65-m3-j13-settings.dpapi.xml`;
earlier M1/M2/M3/J12 files may retain previous keys. DPAPI copies depend on the
Windows user/machine context; do not treat them as portable recovery copies.
M4 activation reuses these eighteen keys. The reviewed local helper updates only
publication IDs in memory and uploads to the existing Actions settings secret;
it creates no additional credential file. The retained M3 DPAPI source remains
unchanged and contains historical publication IDs, not the active M4 versions.
The approved M4 graph publication also retains private before/reviewed DSL files
under `issue65-m4-before-publication-20261015` in this protected directory. These
files contain existing Dify `BOOKLET_TOOL_KEY` variables so CLI import preserves
them; they do not contain the OpenAI provider key. The local operator owns these
conditional publication/recovery copies. Do not print, commit or upload them to
GitHub. Retain them privately for publication verification/recovery; any later
removal follows the normal explicit deletion policy.
The local Windows operator owns conditional preparation checkpoints
`issue65-m3-j12-bindings.partial.dpapi.xml` and
`issue65-m3-j13-bindings.partial.dpapi.xml` in that same protected directory.
`prepare-dify-booklet-j12-keys.ps1` saves validated bindings incrementally and
resumes only a matching profile, source and application identity. It removes the
partial copy after saving the complete profile; an interrupted preparation retains
it privately for resume. These copies are implemented, not verified live provision
of new credentials, and are never uploaded or committed.
The disposable async recovery probe retains its API key in
`issue65-async-probe-key.dpapi.xml`. Separate versioned
`issue65-async-probe-settings-v*.dpapi.xml` transfer copies reuse the callback key
and replace only the manager binding. Keep the normal final-profile file unchanged;
these temporary copies do not establish successful live recovery.
Maintain independent private recovery copies in the team's password manager.
Host rotation retains protected `secrets.pending.json` and `secrets.previous.json`
until successful completion/recovery; staging reset can retain
`secrets.reset.json` and `secrets.reset.previous.json`. Treat every copy as secret.

Implementation: [binding and saved configuration schemas](../../lib/experiment-runner/config.ts),
[execution/recovery transport](../../lib/experiment-runner/transport.ts),
[reference upload](../../lib/experiment-runner/reference-transport.ts),
[tool authentication](../../lib/experiment-runner/http.ts),
[preparation](../../scripts/prepare-dify-booklet-j12-keys.ps1),
[settings upload](../../scripts/upload-dify-booklet-m3-settings.ps1).

### Separate Cloud trial and Community diagnostic probe

These credentials are separate from runner bindings. Legacy Cloud behavior is
documented in the [Cloud configuration](../accepted/2026-09-16_agent-platform-decision/configuration.md)
and [staging runbook](runbook.md); the current issue branch's app schema does not
consume the three Cloud names. Do not infer their removal from staging.

| Name / variable | Storage | Consumer and purpose |
| --- | --- | --- |
| `DIFY_API_KEY` | Optional staging host override; temporary GitHub repository transfer secret | Earlier Cloud manager execution |
| `DIFY_TOOL_KEY` | Optional staging host override; Dify tool configuration; temporary GitHub transfer secret | Earlier Cloud-to-Booklet tool authentication |
| `DIFY_IMAGE_OPENAI_API_KEY` | Optional staging host override | Legacy host support is inert; Dify holds its image-provider credential |
| `DIFY_COMMUNITY_WORKFLOW_API_KEY` | Dify probe app; staging host override; GitHub transfer secret | Diagnostic probe workflow execution and runtime-key result lookup |
| `DIFY_COMMUNITY_CALLBACK_KEY` | Dify probe secret variable; staging host override; GitHub transfer secret | Authenticate the model-free probe callback; not the runner tool key |

The workflow selector names `DIFY_COMMUNITY_PROBE` and `DIFY_BOOKLET_RUNNER` are
bundle selectors, not secret variables. Remove temporary Cloud/probe repository
transfer copies after verified success as the operating runbook directs; retain
necessary host/Dify values and private recovery copies.

### Dify Community internal credentials

The installer generates these once in root-owned, mode-600
`/etc/kids-booklet/dify/runtime.env`. The pinned upstream Compose file loads them
into the relevant services. Preserve existing values on update; regenerating
internal keys can break encrypted data. Derived aliases are copies of an existing
credential, not additional independently generated keys.

| Variable | Consumer and purpose |
| --- | --- |
| `SECRET_KEY` | Dify application security and encrypted-data protection |
| `DB_PASSWORD` | Dify PostgreSQL authentication |
| `REDIS_PASSWORD` | Redis authentication; also embedded in `CELERY_BROKER_URL` for Celery |
| `WEAVIATE_API_KEY` | Dify-to-Weaviate authentication; copied to `WEAVIATE_AUTHENTICATION_APIKEY_ALLOWED_KEYS` |
| `CODE_EXECUTION_API_KEY` | Dify-to-code-sandbox authentication; copied to `SANDBOX_API_KEY` |
| `PLUGIN_DAEMON_KEY` | Authentication to the plugin daemon |
| `PLUGIN_DIFY_INNER_API_KEY` | Plugin daemon authentication back to Dify |
| `DIFY_AGENT_API_TOKEN` | Internal Dify Agent API authentication |
| `DIFY_AGENT_LOCAL_SANDBOX_AUTH_TOKEN` | Agent local-sandbox authentication |
| `DIFY_AGENT_SERVER_SECRET_KEY` | Agent server cryptographic secret |
| `ADMIN_API_KEY_ENABLE`, `ADMIN_API_KEY` | Active Community console administration, owned by the host operator. `dify-enable-admin-api` stores a separately generated key in protected `runtime.env`; `runtime.env.admin-api-before-enable` retains a protected pre-change copy. The operator must retain a private password-manager copy for developer machines and approved VPS consumers; that copy has not been independently verified. Dify API uses bearer authentication with this key. It has no alias and is distinct from app API keys and `DIFY_AGENT_API_TOKEN`. The host-local action does not place it in GitHub Actions secrets or Booklet containers. On 2026-10-11, the VPS setting and one developer-machine Bearer read were verified; no VPS service consumer is recorded as provisioned or verified. |

Source: [installer](../../scripts/deploy/vps-deployment.sh) and
[Community credential/setup guidance](dify-community.md#credential-inventory).

### Dify accounts, provider bindings and developer sessions

| Credential | Variable / identifier | Storage | Consumer and purpose |
| --- | --- | --- | --- |
| Human Dify account passwords | No Booklet variable | Dify account store; private user custody | Workspace owner/developer login and administration; distinct accounts |
| Dify model/image provider keys | Provider-specific Dify binding fields; no runner variable | Private Dify workspace provider bindings | Real model/image calls; Simulated execution does not call a paid provider. Installed OpenAI dev2 and eighteen published Booklet graphs conditionally reuse the same Dify-held key for input counting and Responses; Booklet requires a separate paid grant. Other workflows retain existing routes. Count permission/billing and paid readiness are unverified. No new provider secret name, storage or transfer copy |
| MCP device tokens and console cookies | `__Host-access_token`, `__Host-refresh_token`, `__Host-csrf_token`; `DIFYWF_HOME` identifies the store, not a secret | Plaintext `hosts.json` protected by Windows ACLs under `%LOCALAPPDATA%\DifyWf-Community-Codex`; Cloud uses separate `%LOCALAPPDATA%\DifyWf-Codex` | Local-stdio MCP administration; credential file ACL must limit access to the user, SYSTEM and Administrators |
| Official CLI session tokens | Separate Community/Cloud `difyctl` profiles; no Booklet variable | CLI-managed local credential state; exact file path must be checked for the installed CLI | CLI fallback administration; CLI login does not authenticate MCP |
| Dedicated Dify backup R2 credentials and restic password | Names/provision path not yet established | Intended root-owned host files and independent password-manager recovery copies | Deferred, not active: Dify backup setup and restore/upgrade rehearsal remain incomplete |

Follow the [developer login guide](../dify-getting-started.md),
[MCP storage and recovery guide](../accepted/2026-09-26_codex-dify-access/runbook.md#security-assessment)
and [Community runbook](dify-community.md). Do not retrieve provider key values
to verify a binding. A local session file or discoverable tool is not proof of
authenticated access; use read-only workspace checks.

### Shared deployment and administrator credentials

| Name / variable mapping | Storage | Consumer and purpose |
| --- | --- | --- |
| `DEPLOY_SSH_PRIVATE_KEY` | GitHub repository secret; bootstrap copy `/var/lib/kids-booklet/deploy-key` | Actions SSH to restricted VPS deployment account, including read-only Dify host/run diagnostics |
| `DEPLOY_SSH_HOST_KEY` | GitHub repository secret; source is VPS public host key | Pin VPS identity; public trust material, not a private key |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`; mapped to `TUNNEL_SERVICE_TOKEN_ID`, `TUNNEL_SERVICE_TOKEN_SECRET` | GitHub repository secrets; sensitive Terraform state; temporary operator environment | Cloudflare Access authorization for Tunnel SSH |
| `CLOUDFLARE_API_TOKEN`; Terraform alias `TF_VAR_cloudflare_api_token` | GitHub repository secret; temporary operator credential session | Cloudflare discovery and infrastructure management; never app container credentials |
| `R2_TERRAFORM_ACCESS_KEY_ID`, `R2_TERRAFORM_SECRET_ACCESS_KEY`; mapped to `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` during infrastructure execution | GitHub repository secrets; temporary operator credential session | Terraform-state and state-snapshot R2 access; distinct from application R2 credentials despite matching runtime variable names |
| Terraform output `tunnel_token` | Root-only `/etc/kids-booklet/tunnel.token`; sensitive Terraform state | `kids-booklet-tunnel.service` connects the VPS to Cloudflare |
| `ATLAS_PUBLIC_KEY`, `ATLAS_PRIVATE_KEY`; aliases `ATLAS_ADMIN_PUBLIC_KEY`, `ATLAS_ADMIN_PRIVATE_KEY` | Temporary operator SSH-shell credential session | Atlas Project Owner setup, scoped application-user reconciliation and exact VPS allowlist checks |
| `GITHUB_ADMIN_TOKEN`; mapped to `GH_TOKEN` | Temporary operator SSH-shell credential session | Bootstrap repository secrets, variables and branch protection |
| `${{ github.token }}`; exposed as `GH_TOKEN` | GitHub-generated job credential | Workflow repository freshness/API checks; no manually maintained token |

Source: [Infrastructure workflow](../../.github/workflows/infrastructure.yml),
[Dify-key transfer workflow](../../.github/workflows/dify-tool-key.yml),
[canonical deployment script](../../scripts/deploy/vps-deployment.sh).
Clear temporary operator credentials with the documented credential-session
procedure or SSH logout. Routine deployment does not require Atlas/GitHub admin keys.

### Maintaining the inventory

For every implementation slice that adds, renames, removes, rotates or changes a
credential consumer/storage boundary:

1. Update the applicable rows here in the same change. Record the exact name and
   aliases, owner, environment/profile scope, protected storage and transfer copies,
   consumer/purpose, and status: required, conditional, legacy/inert or deferred.
2. Inspect the affected schema, provider, Dify graph, preparation helper, workflow
   and host dispatcher. Update applicable examples and operating-guide links.
   Document missing provision paths instead of assuming a secret is deployed.
3. Keep active and older binding profiles distinguishable. Update the key count
   and role/task/persona mapping when the suite expands. Preserve saved run evidence
   and follow existing drain/reconciliation gates before replacing live settings.
4. For rotation/removal, identify all consumers and retained copies, the authorized
   installation/revocation path and non-secret verification. Record live verification
   only after it occurs. Do not erase recovery copies or revoke keys as a docs task.
5. Review the inventory against the final diff before publication. Report inventory
   impact and verification in the task/PR evidence; if no row changes, state why.

Never record values, token fragments, credential-bearing URIs, rendered Compose,
private exports or session files in Git, issue comments, PRs, logs or screenshots.
This maintenance rule grants no authority to rotate, deploy, spend or delete.

### Terraform state and integration boundaries

Tunnel and Access tokens are sensitive Terraform outputs and are present in protected remote state. Before and after each apply, the script writes a separately keyed state snapshot, verifies its bytes, and protects the `snapshots/` prefix with a 30-day R2 lock. If an interrupted apply created one of the six exact Booklet R2 buckets or the dedicated Dify backup bucket but did not record it in application state, preview reports it and apply snapshots then adopts only that exact bucket before creating a new plan. It never adopts another resource. The Dify backup bucket has no object-age lifecycle rule: restic retention and pruning must own its objects. Do not publish Terraform state, full outputs, saved plans, or snapshots. Application secrets never enter Terraform.

The Dify hostname is a separate Tunnel and DNS target. Its route stays on
`http_status:503` through installation readiness. After that checkpoint,
`dify_public_enabled` can change only through reviewed configuration and an
explicit operator decision. The operator can enable a bounded public
first-administrator window or wait until private setup is complete. When
enabled, the route points only to `localhost:3300`. Dify responses bypass
caching. The Booklet API rate rule remains scoped to the Booklet hostnames.
The `host_observation` in `infra/config/vps.json` is a dated, non-secret
capacity snapshot, not a live installation pass.

The collaboration service has a 1536 MiB limit and HTTP healthcheck. Community
readiness requires an Engine.IO open packet through the local proxy, not just
running containers. `dify-repair-collaboration` is preview-by-default; apply checks
headroom and idle records, uses the shared lock/journal, and recreates only
`api_websocket`. It preserves credentials, data and Booklet releases.

The Dify operations workflow's read-only `diagnostics` action uses the existing
restricted SSH account and deployment credentials. An optional staging run UUID
selects saved run/operation state and callback timing summaries. Output includes
host memory/disk, container limits/health/restarts, sandbox cgroup memory counters
where available, and counts of recognized sandbox errors, not raw logs.
`dify-repair-sandbox` previews a 1024 MiB Python sandbox limit. Apply requires
idle Dify work and at least 2816 MiB available memory, then uses the shared
lock/journal to recreate only `sandbox`. Other limits, data and releases remain
unchanged. A killed process alone does not prove an OOM event.

`GET /api/diagnostics/logs` reuses `ACCESS_GATE_PASSWORD` with the ordinary Basic
gate and is available only in `_staging`. It retains at most 5000 structured
callback phase events in process memory; responses contain at most 500 events
and use `Cache-Control: no-store`. Optional `runId` and `limit` select records.
Restart clears the buffer. The host diagnostic action can read bounded retained
container timing logs after restart. The host diagnostic candidate also checks
the public staging API using the existing container credential, without returning
headers or response content. It reports only success/event count or `unverified`;
live verification remains pending. Scheduler diagnostics count fixed exception
and startup categories, not arbitrary log messages. Saved operation diagnostics
return result/materialization presence booleans, never their content.
This adds consumers of existing credentials,
not new secrets, storage or transfer copies. Live provision/use remains pending
until the reviewed candidate is deployed and checked.

The pinned Community release and override are in `deploy/dify/`. They are a
candidate until resolved Compose, image pulls, startup, and restoration pass
on the host. The deterministic staging probe uses only the exact
`/api/integrations/dify-community/callback` Basic-gate exception, authenticated
with its dedicated key. Start and result routes retain the ordinary Booklet
gate. It records correlation/run IDs and callback status without creating or
approving a booklet. Disabled staging and all production routes reject it.

The protected Dify-key workflow also accepts the staging-only
`DIFY_COMMUNITY_PROBE` bundle. It stages exactly the two Community keys, the fixed
`https://dify.uniwares.co.uk` origin and `DIFY_COMMUNITY_PROBE_ENABLED=true`.
The host rejects extra fields and merges these four settings into the existing
protected override, preserving Cloud and other application secrets. The existing
serialized rotation performs drain and readiness checks. Missing credentials,
production targets and superseded master workflow commits fail before mutation.
The workflow does not create Dify keys or configure its callback variable.

The same workflow accepts `DIFY_BOOKLET_RUNNER` using the protected repository
secret `DIFY_BOOKLET_RUNNER_SETTINGS_JSON`. Its exact five-field JSON object
stores the binding array as a JSON string. The host validates exactly the six M1
slots, eleven narrative slots (manager, J01–J07 and three persona testers), or
thirteen style/image slots (add J08 and one generic image workflow with null
task/persona), fifteen sheet slots (add independent J09/J10 specialists), or
sixteen pagination slots (add J11), seventeen Page Bible slots (add J12), or
eighteen final/evaluation slots (add an independent judge),
UUIDs, unique apps, private keys and origins even when the flag is `false`.
Only the image binding in a complete seventeen-/eighteen-slot profile can carry
`finalPageIllustration: true`. Eighteen slots require this flag. Older profiles
remain valid without it; false values and flags on other roles are rejected.
It escapes Compose dollar signs and merges only these fields; existing Cloud,
Community probe and application secrets stay unchanged. Inputs are limited to
48 KiB and staged patches to 64 KiB. Production targets reject runner settings.
Initial setup must use `false`. Applying `true` requires the issue #65 private
binding and exact reset checkpoint; the selector grants no such authorization.
An expanded binding bundle does not require another reset. Stop admission and
reconcile active work before replacing publications or settings. Preserve saved
run configurations; changed bindings require successors for unfinished work.

## Lifecycle

Build and anonymous digest pull precede maintenance. Existing writers drain for up to 15 minutes before service stop and backup. Initialization runs with the runner disabled. Readiness failure stops the candidate before starting the previous version. Resume checks the recorded service and maintenance containers, then retries the exact operation; it does not clear a failed data restore automatically.

Backups reserve an ID before writes, upload objects conditionally, verify downloaded checksums, and publish a completion marker last. The operation journal records the backup ID, release digest, non-secret configuration hash, and prior release. Restore validates the marker, manifest, archive, and every asset before target writes. Partial backup IDs stay reserved and a resumed failed backup receives a new ID. Recovery credentials must permit reads from source assets and create-only writes to recovery; restore additionally requires asset writes.

The staging-only `retire-staging-artifact-index` action defaults to real read-only
preview. Apply requires the exact deployed commit and `kids_booklet` confirmation.
It rejects unresolved experiment run pointers, prepared/started/unknown operations,
image claims and unverified dispatched successes before maintenance. It repeats
the ledger check after drain and before stop; failure reopens admission so callbacks
can reconcile. Post-stop checks require an existing staging maintenance record and
exactly zero active mutations. Missing or negative counters are not idle evidence.

The action verifies ordered keys and index options, all ordinary required indexes,
completed backup marker/manifest/archive/assets and the selected immutable image.
Only the exact legacy index is removed. A pinned reviewed rollback SHA/digest pair,
manifest and image label must match; unknown pairs fail without pointer changes.
The journal retains this pair and the backup. Once `backup-verified` is recorded,
Resume never creates a replacement backup. `index-finalizing` covers both sides of
admission reopening and does not replay stop/removal. Startup initialization remains
additive and never drops the legacy index. Live installation and removal remain
separate authorization checkpoints; focused local tests do not prove live success.

The project-wide Actions concurrency group serializes workflows. Host operations use flock plus a non-expiring journal. Terraform applies from Actions acquire the same host journal. Setup takes the host flock. Infra-unlock is an administrator recovery command used only after confirming the prior workflow stopped and the exact request ID matches the retained infrastructure journal. Infrastructure summaries expose that request ID. `_staging` and `_prod` are independent reviewed release lines. Deployment requires the selected environment to match its target branch and requires the remote branch to remain at the workflow commit before build and release. Deployment does not require `master` ancestry or a successful Infrastructure run.

Infrastructure pushes to `master` now preview only. An operator reviews the
plan and explicitly dispatches `apply=true`; a passing preview does not mean
the Dify hostname or backup bucket exists yet.

Infrastructure loads the Dify Terraform variables from the reviewed JSON.
Host synchronization first uses the original five-file protocol to upgrade
the dispatcher, then sends the Dify artifacts. Both transfers use the same
infrastructure request; a failed transfer retains its recovery journal.

## Verification and accepted baseline

CI selects checks from the combined pull-request diff using the [validation policy](../../scripts/ci/README.md). Isolated changes run focused suites; shared changes retain broad coverage. Tests stop after the first failure without retries. Validation performs no production or container builds; Deploy builds the immutable release image. Manual Validate supports `full` non-build checks or `affected` checks with an explicit base ref. Superseded PR checks are cancelled; host operations remain serialized and non-cancelling. Operational workflows reject missing configuration before installation, builds, or remote access.

The initial live acceptance completed on 2026-09-15. It verified provider access, successful Infrastructure and immutable-digest deployments, staging backup/restore, staging and production readiness, and automatic recovery of Docker, Cloudflare Tunnel, and both application containers after a VPS restart. The post-restart Check deployment workflow passed for both environments. Current workflow results and host state remain authoritative for later releases; local checks cannot prove live properties.

Setup discovers provider and host state, configures database-scoped Atlas users and the exact VPS allowlist, uploads restricted deployment credentials, and configures a zero-dollar GitHub Actions overage budget. `access-check` verifies Cloudflare, Access, R2 state, Atlas, and GitHub administration scopes without mutation and reports all independent failures before returning nonzero. `credential-session` keeps temporary administrator credentials only in the current SSH login until logout or explicit clearing. Finalize creates absent environment branches from the reviewed configuration commit and applies protection where the GitHub plan supports it. Successful Infrastructure workflows install the reviewed script, Compose files, and non-secret configuration under the infrastructure journal. Bootstrap security changes and infrastructure lock recovery remain administrator operations.

The temporary Atlas API key must have Project Owner access to the configured project. The account-owned Cloudflare token needs Account API Tokens Read and the account and zone permissions documented by `vps-deployment.sh --help`. `access-check` verifies both before provider mutation.

## Cost boundary

| Service | Expected monthly cost for the experimental workload | Limit or overage exposure |
| --- | --- | --- |
| Existing VPS | $0 incremental | The owner continues to pay its existing VPS charge |
| Cloudflare Tunnel, CDN and WAF | $0 on the selected Free plan | Free-plan feature and rule limits apply |
| R2 Standard | $0 while within 10 GB-month, 1 million Class A operations, and 10 million Class B operations | Above the allowance: $0.015/GB-month, $4.50/million Class A, and $0.36/million Class B; Internet egress is free. See [R2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| GitHub-hosted Actions | $0 while within the repository owner's included private-repository allowance | GitHub Free for organizations includes 2,000 Actions minutes per month. The setup applies a zero-dollar Actions overage budget. See [included usage](https://docs.github.com/en/billing/reference/product-usage-included) |
| Public GHCR image | $0 | GitHub Packages usage is free for public packages. See [Packages billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages) |
| Existing Atlas Free cluster | $0 | The hard storage limit is 0.5 GB across data and indexes. See [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) |

R2's free allowance is usage-based, not a hard spending cap. Thirty days of complete asset snapshots can exceed it. Track storage and request usage; no automatic deletion of current assets is allowed. Public-repository conversion requires an explicit history, secrets, and license review.
