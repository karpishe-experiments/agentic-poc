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

Tunnel and Access tokens are sensitive Terraform outputs and are present in protected remote state. Before and after each apply, the script writes a separately keyed state snapshot, verifies its bytes, and protects the `snapshots/` prefix with a 30-day R2 lock. Do not publish Terraform state, full outputs, saved plans, or snapshots. Application secrets never enter Terraform.

## Lifecycle

Build and anonymous digest pull precede maintenance. Existing writers drain for up to 15 minutes before service stop and backup. Initialization runs with the runner disabled. Readiness failure stops the candidate before starting the previous version. Resume checks the recorded service and maintenance containers, then retries the exact operation; it does not clear a failed data restore automatically.

Backups reserve an ID before writes, upload objects conditionally, verify downloaded checksums, and publish a completion marker last. The operation journal records the backup ID, release digest, non-secret configuration hash, and prior release. Restore validates the marker, manifest, archive, and every asset before target writes. Partial backup IDs stay reserved and a resumed failed backup receives a new ID. Recovery credentials must permit reads from source assets and create-only writes to recovery; restore additionally requires asset writes.

The project-wide Actions concurrency group serializes workflows. Host operations use flock plus a non-expiring journal. Terraform applies from Actions acquire the same host journal. Setup takes the host flock. Infra-unlock is an administrator recovery command used only after confirming the prior workflow stopped.

## Verification

CI must run CLI rejection and preview tests, SSH dispatch, host lifecycle ordering, failed-readiness recovery, secret serialization, plan deletion and Access guards, recovery checksum tests, and mocked Terraform contracts. It also runs typecheck, lint, the application tests, agent fixtures, the production build, a container build, ShellCheck, actionlint, and both Terraform roots.

Live acceptance must verify provider scopes and quotas, public GHCR pulls, Tunnel and Access connectivity, closed public origin ports, Atlas transactions, streamed transport, host restart recovery, and a staging backup/restore rehearsal. Local checks cannot prove these properties.

Setup discovers provider and host state, configures exact Atlas users and the VPS allowlist, creates the configuration PR, uploads restricted deployment credentials, and configures a zero-dollar GitHub Actions overage budget. Finalize creates absent environment branches from the reviewed configured commit and applies protection where supported. The first image workflow makes its GHCR package public and verifies anonymous access before contacting the host. Secret rotation stages a root-only override through pinned Tunnel SSH and runs through the serialized Maintenance workflow. Successful infrastructure workflows install the reviewed script, Compose files, and non-secret configuration under the infrastructure journal before releasing its lock. Bootstrap security changes and infrastructure lock recovery remain administrator operations.

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
