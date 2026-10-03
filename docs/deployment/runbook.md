# VPS deployment runbook

This runbook operates the deployed Kids Booklet environments. Complete one operation at a time. Use the workflow summary as the primary result, and inspect the host journal after an interruption.

PR Validate runs [selected non-build checks](../../scripts/ci/README.md). For a manual
run, choose `full`, or choose `affected` and supply a resolvable `base_ref`.
Production and container builds occur only in Deploy, before VPS mutation. A green
Validate result does not prove the release build or browser smoke test succeeded.
Missing operational configuration fails before tool installation or image building;
the error names the missing setting without printing its value.

## Current deployment status

Live acceptance completed on 2026-09-15.

| Checkpoint | Verified state |
| --- | --- |
| Infrastructure | Cloudflare infrastructure applied successfully for `master` commit `fc81f4e272a3fba2086a1c24b40d7cc15d291c73` |
| Staging | Deploy and Check deployment passed; `https://booklet-staging.uniwares.co.uk` is operational |
| Production | Deploy and Check deployment passed for `_prod` commit `2ab3889f67f5e664d2a883cba4358c58ed94bc28`; `https://booklet.uniwares.co.uk` is operational |
| Recovery | Staging backup and restore rehearsal passed |
| Restart | Docker, Cloudflare Tunnel, and both healthy application containers recovered after a VPS restart; staging and production checks passed afterward |

This table records the accepted baseline. Use current workflow summaries and host state for later releases.

## Configuration and access

| Value | Current value |
| --- | --- |
| Repository | `karpishe-experiments/agentic-poc` |
| Cloudflare zone | `uniwares.co.uk` |
| Staging hostname | `booklet-staging.uniwares.co.uk` |
| Production hostname | `booklet.uniwares.co.uk` |
| Deployment hostname | `srv1-deploy.uniwares.co.uk` |
| Dify hostname | `dify.uniwares.co.uk` (public bootstrap explicitly approved; create the first administrator immediately after activation) |
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

| Need | Action |
| --- | --- |
| Verify an environment | Run **Check deployment** on its environment branch |
| Change Cloudflare or installed host configuration | Merge the reviewed change to `master`; inspect the Infrastructure preview; explicitly run **Infrastructure** with `apply=true`; then release each affected environment |
| Create a backup | Run **Maintenance** with `action=backup`; retain the exact `backupId` from the summary |
| Restore | Run **Maintenance** with `action=restore`, the exact `backup_id`, and confirmation `kids_booklet` or `kids_booklet_prod` |
| Roll back application code | Run **Maintenance** with `action=rollback`; this restores the prior digest and matching non-secret configuration, not the database |
| Resume an interrupted operation | Inspect host status, then run **Maintenance** with `action=resume` for the recorded environment |
| Rotate one host secret | Run `bash scripts/deploy/vps-deployment.sh --action rotate-secrets --environment <target> --secret-name <name> --config infra/config/vps.json --apply` |
| Install a temporary staging Dify key without local Cloudflare credentials | Store `DIFY_TOOL_KEY` or `DIFY_API_KEY` as a protected repository secret, then run **Dify staging key** on `master` and select that key; remove the repository secret after success |
| Configure the Community staging probe | Follow [Community checkpoint 5](dify-community.md#checkpoint-5--deterministic-booklet-round-trip); select `DIFY_COMMUNITY_PROBE` in **Dify staging key** after the reviewed host dispatcher and staging routes are installed |
| Rotate all host secrets | Use the same command without `--secret-name`; each value is validated immediately and earlier valid entries are retained |
| Generate an access password | Add `--secret-name ACCESS_GATE_PASSWORD --generate-password`; the interactive command displays it once |
| Reset staging | Run **Reset staging** on `_staging` and confirm `kids_booklet`; production reset is rejected |

Temporary Dify trial support: the master-installed host bundle accepts optional `DIFY_API_KEY`, `DIFY_TOOL_KEY`, and `DIFY_IMAGE_OPENAI_API_KEY` secrets. Staging Compose selects real Dify mode and enables the image path; production stays in fake mode with images disabled. The application still controls staging availability and requires a current approved story before an image call. Do not start a real turn until the Dify app and tool keys are installed. Do not approve a paid image call until the separate image key is installed and spending is authorized. Rotate each key by name using the serialized command above. When the platform trial decision is recorded, remove this host support if Dify is rejected or replace it with the approved long-term design if Dify is adopted. See the [experiment configuration](../accepted/2026-09-16_agent-platform-decision/configuration.md).

Release and restore operations enable maintenance, drain active mutations for at most 15 minutes, and keep the environment closed until readiness succeeds. A failed candidate restores the prior application and configuration while maintenance remains active. Database restoration is always explicit.

## Interruption and recovery

Inspect the journal first:

```bash
sudo /opt/kids-booklet/vps-deployment.sh --action status
```

| Observed state | Safe response |
| --- | --- |
| `{"step":"idle"}` | No operation is retained; start the intended workflow |
| Active detached service | Let it finish; do not start a competing workflow |
| Failed application operation | Read its workflow summary and host service log, correct the cause, then use **Maintenance → resume** for the same environment |
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

Backups contain the MongoDB archive, collection inventory, checksums, and referenced assets. Restore accepts only a completed backup marker for the matching environment and database. Partial backup IDs remain reserved. Recovery objects expire after 30 days; current assets do not expire.

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
