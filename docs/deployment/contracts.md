# Deployment contracts and verification

## Ownership

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

| Names | Storage and purpose |
| --- | --- |
| `APP_HOSTNAME`, `ASSETS_BUCKET`, `DIAGNOSTICS_BUCKET`, `RECOVERY_BUCKET` | Reviewed JSON, selected per environment, passed through Compose |
| `DEPLOYMENT_ENV`, `MONGODB_DATABASE`, `AWS_REGION`, `OBJECT_STORE_ENDPOINT` | Compose identity, fixed databases, R2 region/endpoint |
| `MODEL_RUNTIME`, `IMAGE_PROVIDER_MODE` | Compose sets both to `real` |
| `OPENAI_API_KEY`, `MONGODB_URI`, `ACCESS_GATE_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Root-only `/etc/kids-booklet/<environment>/secrets.json` |
| Optional `DIFY_API_KEY`, `DIFY_TOOL_KEY`, `DIFY_IMAGE_OPENAI_API_KEY` for the temporary staging trial | Same root-only secret override; absent values remain valid |
| `DIFY_COMMUNITY_PROBE_ENABLED`, `DIFY_COMMUNITY_BASE_URL`, `DIFY_COMMUNITY_WORKFLOW_API_KEY`, `DIFY_COMMUNITY_CALLBACK_KEY` | Separate staging-only model-free probe switch, HTTPS origin, runtime workflow key and callback key; protected app override when enabled; production stays disabled |
| `DIFY_BOOKLET_RUNNER_ENABLED`, `DIFY_BOOKLET_BASE_URL`, `DIFY_BOOKLET_PUBLIC_ORIGIN`, `DIFY_BOOKLET_TOOL_KEY`, `DIFY_BOOKLET_BINDINGS_JSON` | Optional five-setting staging runner bundle; fixed Community/staging origins, dedicated callback key and exactly six M1, eleven narrative or thirteen style/image runtime bindings; default disabled |
| `DEPLOY_SSH_PRIVATE_KEY`, `DEPLOY_SSH_HOST_KEY` | GitHub repository secrets for restricted, pinned SSH |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | GitHub repository secrets for noninteractive Tunnel SSH |
| `CLOUDFLARE_API_TOKEN`, `R2_TERRAFORM_ACCESS_KEY_ID`, `R2_TERRAFORM_SECRET_ACCESS_KEY` | GitHub infrastructure credentials, never application container credentials |

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
task/persona),
UUIDs, unique apps, private keys and origins even when the flag is `false`.
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
