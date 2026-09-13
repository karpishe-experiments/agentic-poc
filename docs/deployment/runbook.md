# VPS deployment runbook

For agent-assisted execution, start with the [operator handoff](operator-handoff.md). It defines the checkpoint record and failure procedure. Execute the checkpoints below in order; a command exiting successfully is evidence only for that command.

## Required inputs

Use an x86_64 Ubuntu VPS with at least 2 CPU cores, 6 GiB RAM, and 10 GiB free disk. Before starting, install Docker Engine with Compose v2, Git, GitHub CLI, sudo, jq, Python 3, curl, tar, unzip, OpenSSL and OpenSSH server. Verify `docker compose version`, `gh --version`, and provider-console access. Setup requires systemd and a sudo-capable administrator. Preview downloads missing pinned tools into a temporary workspace; apply installs Terraform 1.11.4, GitHub CLI 2.78.0 and cloudflared 2025.8.1 after checksum verification.

Supply a Cloudflare account/zone, three DNS names, an Atlas project and cluster, five application secrets per environment, scoped R2 bucket credentials, and temporary Cloudflare, R2, and Atlas administrator credentials. Keep credentials outside Git. Public GHCR images expose the built application and seeds.

Complete Cloudflare DNS activation, R2 enrollment and billing consent first. Use three distinct lowercase hostnames in that zone. The deployment needs unused cache/rate-limit entrypoints; inspect [the zone-wide rule boundary](../../infra/terraform/README.md) before choosing the zone. Cloudflare credentials must manage R2 buckets, Tunnel, DNS, Access and rules. R2 Terraform credentials must read/write state and snapshots and create/delete backend lock objects. Atlas API credentials must manage database users and the IP access list and permit API access from the VPS. GitHub login needs repository administration and organization billing administration. Confirm these permissions before running setup.

The collector creates `infra/config/vps.json` from provider discovery. It uses read-only Cloudflare and Atlas API requests, validates the VPS, and never prints entered credentials. Supply a lowercase Cloudflare zone name; the default hostnames are `staging.<zone>`, `booklet.<zone>`, and `deploy.<zone>`. Override those names only when required. The collector lists Atlas projects and clusters when a selection is needed. It keeps the six application bucket names unchanged because Terraform creates those exact names.

## Recorded target values

| Value | Recorded value |
| --- | --- |
| Cloudflare zone | `uniwares.co.uk` |
| Staging hostname | `booklet-staging.uniwares.co.uk` |
| Production hostname | `booklet.uniwares.co.uk` |
| Deployment hostname | `srv1-deploy.uniwares.co.uk` |
| Atlas project ID | `6a869d84e65675f845fa22eb` |
| Atlas cluster | `kids-booklet` in Ireland (`eu-west-1`) |
| Staging database | `kids_booklet` |
| Production database | `kids_booklet_prod` |

The current staging database contains application collections and indexes. The production database contains a `temp` collection. Select a preservation or clean-start procedure before activation; neither database is treated as empty by this runbook. Cloudflare account and zone IDs remain discovery outputs and are added only to the reviewed `infra/config/vps.json`.

## One-time setup

Open an administrator session on the VPS and check out the reviewed commit. First collect the non-secret configuration. This preview prompts silently for the temporary Cloudflare token and Atlas API keys, reports current provider state, and prints the candidate file without writing it:

```bash
bash scripts/deploy/vps-deployment.sh --action discover-config --zone example.com --write-config infra/config/vps.json
```

Inspect the candidate and run the same command with `--apply` to write the non-secret configuration locally:

```bash
bash scripts/deploy/vps-deployment.sh --action discover-config --zone example.com --write-config infra/config/vps.json --apply
```

The configuration must contain three distinct hostnames in the selected zone. Use an Atlas cluster where `kids_booklet` and `kids_booklet_prod` are fresh deployment databases, and keep local development in a separate database. After configuration collection, authenticate GitHub CLI as that administrator (`gh auth login`), then set `GH_TOKEN` without copying it into shell history: `export GH_TOKEN="$(gh auth token)"`. Supply `CLOUDFLARE_API_TOKEN`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` through the session environment. The script prompts silently for the temporary Atlas API keys and application secrets. For multiline values, set `DEPLOYMENT_SECRETS_DIR` to a mode-700 directory containing mode-600 `staging.json` and `prod.json` objects with the five required secret names; the serializer preserves newlines, quotes, and dollar signs. Never put values in command arguments or shell history.

```bash
set +x
umask 077
read -rsp 'Cloudflare API token: ' CLOUDFLARE_API_TOKEN; printf '\n'
read -rsp 'R2 Terraform access key ID: ' AWS_ACCESS_KEY_ID; printf '\n'
read -rsp 'R2 Terraform secret access key: ' AWS_SECRET_ACCESS_KEY; printf '\n'
export CLOUDFLARE_API_TOKEN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
bash scripts/deploy/vps-deployment.sh --action setup --config infra/config/vps.json
```

Inspect the preview and resolve any reported failure. Run apply as a separate command:

```bash
sudo --preserve-env=CLOUDFLARE_API_TOKEN,AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY,GH_TOKEN,DEPLOYMENT_SECRETS_DIR bash scripts/deploy/vps-deployment.sh --action setup --config infra/config/vps.json --apply
```

Run preview first and inspect its result before executing the apply line. At application-secret prompts, supply OpenAI, an access password of at least 16 characters, and separate R2 credentials restricted to that environment's three buckets. Setup generates the MongoDB URI when it creates the Atlas user. If interrupted after bucket creation, create the environment-scoped R2 credentials in Cloudflare and rerun the same apply; completed resources are reused. For an existing Atlas user, supply its matching URI when prompted.

GitHub authentication must also be available to root for apply. Preview discovers Atlas, Cloudflare, R2, host, and Terraform state and produces non-mutating plans. Apply can install pinned auxiliary tools after host and credential preflight. Setup retains bootstrap state and any newly generated Atlas URI checkpoint under `/var/lib/kids-booklet` until remote state and the root-only Compose override are verified. Repeat setup after interruption; do not delete those files.

Successful checkpoints: exact Atlas users and VPS allowlist entry verified; protected R2 state verified; Cloudflare resources applied; root-owned dispatcher and secret overrides installed; Tunnel active; deployment credentials and variables uploaded; zero-dollar Actions overage budget configured; configuration PR opened. Both application services remain stopped. Setup preserves the VPS firewall: verify tunneled SSH and provider-console access before closing public SSH.

Review and merge the generated configuration PR. Then run `bash scripts/deploy/vps-deployment.sh --action finalize --config infra/config/vps.json` for preview and repeat with `--apply`. Finalize verifies that local configuration equals `master`, creates absent `_staging` and `_prod` branches at that commit, and applies branch protection where the GitHub plan supports it. The repository stays private and workflows do not depend on paid environment protection.

Wait for the configuration merge's Infrastructure workflow to succeed before finalize. Branch creation does not deploy either environment. Retain the checkout at the reviewed kit commit through setup; after the configuration merge, update it to the configured `master` commit before routine operations. Unset administrator credentials when setup is complete: `unset CLOUDFLARE_API_TOKEN AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY GH_TOKEN`.

## First activation

1. After finalize, merge a release to `_staging` or dispatch Deploy on that branch. Initialization creates the database defaults and required seed assets directly in R2. The workflow makes the GHCR package public, then proves an anonymous digest pull before it contacts the VPS.
2. Run Check deployment on `_staging`. Rehearse backup and restore using Maintenance before activating production.
3. Release `_prod` and run Check deployment on `_prod`.

For every manual workflow, select **Actions → workflow → Run workflow**, choose `_staging` or `_prod` as the branch, and select the matching environment. Wait for each run to finish before the next step. Sign in at the configured HTTPS hostname with username `booklet` and that environment's access password; confirm unauthenticated pages and assets are blocked. Confirm streamed requests, Atlas transactions, R2 access and host restart recovery in staging before production.

For the restore rehearsal, run Maintenance with `action=backup`, then read its completed journal on the VPS: `sudo jq '{requestId,action,environment,backupId,step}' /var/lib/kids-booklet/operations/<run-id>-<attempt>.json`. Obtain the run ID from the Actions URL and the attempt number from that run. Run Maintenance with `action=restore`, the exact `backup_id`, and `confirmation=kids_booklet`; finish with Check deployment. Do not activate production until this succeeds.

## Routine workflows

| Need | Workflow and inputs |
| --- | --- |
| Application release | Deploy on `_staging` or `_prod`; matching target |
| Cloudflare or host configuration | Infrastructure on `master`; preview by manual dispatch, apply by merge or explicit input. Successful apply installs the reviewed script, Compose files, and non-secret configuration under the same host lock. Deploy each affected environment branch afterward to apply changed Compose values to its running container |
| Read-only readiness | Check deployment on the environment branch |
| Backup | Maintenance → backup |
| Restore | Maintenance → restore; exact backup ID and `kids_booklet` or `kids_booklet_prod` |
| Previous release | Maintenance → rollback |
| Interrupted application operation | Maintenance → resume; original environment |
| Rotate host secrets | Run `bash scripts/deploy/vps-deployment.sh --action rotate-secrets --environment <target> --config infra/config/vps.json --apply`; it stages values over pinned Tunnel SSH and queues Maintenance |
| Reset staging | Reset staging on `_staging`; type `kids_booklet` |

Images use `staging-<full-sha>` or `prod-<full-sha>`. Deployment uses the digest. The short environment alias advances only after success. Host operations run in detached systemd services and retain a journal on failure. Do not remove a lock just because a workflow disconnected.

## Recovery

| Failure | Safe action |
| --- | --- |
| Drain timeout | Old application continues; inspect active work, then resume after it completes |
| New readiness fails | Previous image starts and is checked; database is not automatically restored |
| Interrupted restore | Keep maintenance enabled; resume retries the recorded backup and confirmation |
| Failed backup ID | Use a new ID; reserved/partial IDs cannot be reused |
| Infrastructure apply fails | Verify its Actions run stopped and inspect Terraform state; an administrator may release its exact journal with `--action infra-unlock --request-id <recorded-id> --vps-host <deploy-host> --apply` before a new plan |
| Lost Tunnel | Use provider console; inspect `kids-booklet-tunnel.service` and protected token file |

Recovery backups contain verified database and asset snapshots. Every operation journal records its image digest, configuration hash, prior release, current backup ID, and prior-attempt backup history. Recovery objects are locked for 30 days; assets have no expiry. Each resumed non-restore attempt uses a new reserved backup ID while retaining earlier recovery points. Resume never treats a partially restored database as safe merely because an old image starts.

See [deployment contracts](contracts.md) for ownership, secrets, validation, and current limitations. No live Cloudflare, Atlas, or VPS deployment has been verified by repository tests.
