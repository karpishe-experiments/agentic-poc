# Deployment contracts and verification

## Ownership

Terraform owns Cloudflare resources. `scripts/deploy/vps-deployment.sh` is the only deployment shell entrypoint; the installed copy provides the restricted SSH dispatcher and detached host lifecycle. Root owns `/opt/kids-booklet`, `/etc/kids-booklet`, and `/var/lib/kids-booklet`. The deployment account has no general sudo or Docker-group membership.

Compose merges base, environment overlay, root-only secret JSON, and image override in that order. JSON is valid Compose YAML; secret dollar signs are doubled to suppress interpolation. Resolved Compose output is consumed by validation and never logged. Missing secret values block maintenance admission. Application containers use 1 CPU/2 GiB, localhost-only ports, read-only root filesystems, and temporary scratch space.

## Variables and secrets

| Names | Storage and purpose |
| --- | --- |
| `APP_HOSTNAME`, `ASSETS_BUCKET`, `DIAGNOSTICS_BUCKET`, `RECOVERY_BUCKET` | Reviewed JSON, selected per environment, passed through Compose |
| `DEPLOYMENT_ENV`, `MONGODB_DATABASE`, `AWS_REGION`, `OBJECT_STORE_ENDPOINT` | Compose identity, fixed databases, R2 region/endpoint |
| `MODEL_RUNTIME`, `IMAGE_PROVIDER_MODE` | Compose sets both to `real` |
| `OPENAI_API_KEY`, `MONGODB_URI`, `ACCESS_GATE_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Root-only `/etc/kids-booklet/<environment>/secrets.json` |
| `DEPLOY_SSH_PRIVATE_KEY`, `DEPLOY_SSH_HOST_KEY` | GitHub repository secrets for restricted, pinned SSH |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | GitHub repository secrets for noninteractive Tunnel SSH |
| `CLOUDFLARE_API_TOKEN`, `R2_TERRAFORM_ACCESS_KEY_ID`, `R2_TERRAFORM_SECRET_ACCESS_KEY` | GitHub infrastructure credentials, never application container credentials |

Tunnel and Access tokens are sensitive Terraform outputs and are present in protected remote state. Before and after each apply, the script writes a separately keyed state snapshot, verifies its bytes, and protects the `snapshots/` prefix with a 30-day R2 lock. If an interrupted first apply created one of the six exact application R2 buckets but did not record it in application state, preview reports it and apply snapshots then adopts that exact bucket before creating a new plan. It never adopts any other resource. Do not publish Terraform state, full outputs, saved plans, or snapshots. Application secrets never enter Terraform.

## Lifecycle

Build and anonymous digest pull precede maintenance. Existing writers drain for up to 15 minutes before service stop and backup. Initialization runs with the runner disabled. Readiness failure stops the candidate before starting the previous version. Resume checks the recorded service and maintenance containers, then retries the exact operation; it does not clear a failed data restore automatically.

Backups reserve an ID before writes, upload objects conditionally, verify downloaded checksums, and publish a completion marker last. The operation journal records the backup ID, release digest, non-secret configuration hash, and prior release. Restore validates the marker, manifest, archive, and every asset before target writes. Partial backup IDs stay reserved and a resumed failed backup receives a new ID. Recovery credentials must permit reads from source assets and create-only writes to recovery; restore additionally requires asset writes.

The project-wide Actions concurrency group serializes workflows. Host operations use flock plus a non-expiring journal. Terraform applies from Actions acquire the same host journal. Setup takes the host flock. Infra-unlock is an administrator recovery command used only after confirming the prior workflow stopped and the exact request ID matches the retained infrastructure journal. Infrastructure summaries expose that request ID. Deployment also requires the target branch to contain current `master` and requires a successful Infrastructure run for that exact master commit.

## Verification and accepted baseline

CI selects checks from the pull-request diff. Application changes run typecheck, lint, application and deployment tests, agent fixtures, the production build, and a container build. Deployment workflow contracts run the isolated deployment tests without the application builds. Terraform, workflow, Compose, and deployment-shell changes run their matching validation suites. Manual Validate dispatches always run the complete suite.

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
