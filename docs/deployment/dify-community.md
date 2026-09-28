# Dify Community on the shared VPS

This is the issue #69 operating runbook. It is a candidate procedure until the
live installation, integration probe, and restore rehearsal are recorded here.
It does not authorize a VPS install, public exposure, a paid provider call, or
a destructive restore. Booklet staging and production remain independent.

## Baseline and targets

- Dify 1.17.1, source commit and archive hash in
  [`deploy/dify/release.json`](../../deploy/dify/release.json). The repository
  override pins the enabled images by digest. Keep the upstream Compose file;
  do not edit the extracted release.
- Compose project `booklet-dify`; release root
  `/opt/kids-booklet/dify/releases/1.17.1`; private configuration
  `/etc/kids-booklet/dify`; persistent data `/var/lib/kids-booklet/dify`.
- Only nginx may publish a host port: `127.0.0.1:3300`. The Cloudflare Tunnel
  route is initially a 503 maintenance response. The public origin is
  `https://dify.uniwares.co.uk` only after private administrator setup.
- Existing host observation is in [`infra/config/vps.json`](../../infra/config/vps.json):
  Ubuntu 24.04 x86_64, 16 vCPU, 15,611 MiB RAM, 13,608 MiB available,
  140 GiB free disk, Docker 27.0.3, Compose 2.28.1, no listener on 3300
  (28 September 2026). This clears the provisional installation sizing gate,
  but it is one sample, not a workload-capacity proof. The operator confirmed
  the disk reduction followed `docker system prune` and that Booklet data and
  backups are intact. Recheck capacity and backup freshness before install.
- Keep the Cloud Dify experiment and its credentials unchanged. Community
  receives separate developer sessions, provider bindings, application keys,
  callback key, and backup repository.

The [Booklet deployment runbook](runbook.md) governs the shared host lock,
restricted SSH transport, journaling, branch freshness, and interruption
recovery. Use `scripts/deploy/vps-deployment.sh` as the sole deployment shell
entrypoint. Host Git checkouts are read-only consumers; never commit from the
VPS. All mutating operations need `--apply` and an approved checkpoint.

## Checkpoint 1 — host and access discovery

Execution machine: developer terminal for the preview, VPS for the host
measurement. Required access: existing deploy SSH/Cloudflare credentials;
no provider credentials. Preview (no file write):

```bash
bash scripts/deploy/vps-deployment.sh --action dify-discover --vps-host "$VPS_HOST"
```

Expected: exact host identity, CPU/RAM/swap, free disk and inodes,
Docker/Compose version, port 3300 availability, and existing container names,
memory limits, restart counts and OOM flags. Check Booklet health,
Tunnel state, current operation journal, backup freshness, OOM/restart history,
and representative memory/disk samples before an apply. If the host identity,
port, or capacity differs from the recorded observation, stop and update the
capacity decision; do not resize automatically. Installation needs at least
4 vCPU, 15,000 MiB total RAM, 8,192 MiB available RAM, and 60 GiB free disk.
The shared-host load, not just Dify's published minimum, determines readiness.

## Checkpoint 2 — infrastructure and private install

Execution machine: a reviewed `master` workflow/administrator terminal for
Terraform; VPS through the restricted dispatcher for installation. A push to
`master` runs an infrastructure preview only; select the manual Infrastructure
`apply` input at this checkpoint. Verify the Terraform plan is additive: one
Dify Tunnel hostname and one dedicated backup R2 bucket, with no Booklet
resource replacement. Leave
`dify_public_enabled=false` during initial setup. The backup bucket needs
separately scoped credentials before backups can be enabled.

Infrastructure reads the Dify hostname, backup bucket, and public-route switch
from the reviewed `infra/config/vps.json` before Terraform runs. Host
synchronization uses two transfers under the same infrastructure journal:
the original five-file bundle upgrades the dispatcher, then the expanded
bundle installs the Dify release manifest and Compose override. This also
works when the dispatcher is already upgraded. If either transfer fails,
the workflow retains the journal; inspect it and follow the infrastructure
recovery checkpoint before retrying. Do not bypass the host lock.

Preview the pinned install, then apply only at the recorded live-install
checkpoint:

```bash
bash scripts/deploy/vps-deployment.sh --action dify-install --environment dify --vps-host "$VPS_HOST"
bash scripts/deploy/vps-deployment.sh --action dify-install --environment dify --vps-host "$VPS_HOST" --request-id "$REQUEST_ID" --apply
bash scripts/deploy/vps-deployment.sh --action dify-check --environment dify --vps-host "$VPS_HOST"
bash scripts/deploy/vps-deployment.sh --action status --vps-host "$VPS_HOST"
bash scripts/deploy/vps-deployment.sh --action resume --environment dify --vps-host "$VPS_HOST" --apply
```

The reviewed `master` [Dify operations workflow](../../.github/workflows/dify-operations.yml)
offers the same read-only check, status, preview/apply installation, and
explicit resume paths. It shares
the Booklet host-operation concurrency group and rechecks the remote `master`
commit before host contact. Do not run it from this issue branch.

The installer checks the reviewed source hash and enabled image digests,
generates private internal secrets once, validates resolved Compose without
printing it, pulls images before startup, and checks the complete service set
and loopback HTTP. A failed pull must leave Booklet and a running Dify release
untouched. The installer records its installed marker only after readiness
passes. A failed initial readiness check leaves installation retryable with
the same retained data and secrets. If an operation is interrupted, inspect the persistent operation
journal and containers before `resume`; a missing response is not proof of
failure. Do not delete release/data directories to retry. Docker upgrades or
host restarts require a separate shared-host checkpoint.

The protected runtime environment is root-owned, mode 600, at
`/etc/kids-booklet/dify/runtime.env`. Never print it, `docker compose config`,
or credential-bearing logs in Actions summaries. Do not replace generated
internal keys on update: encrypted data depends on them.

## Credential inventory

| Setting | Purpose and owner | Protected location and provision method | Verification |
| --- | --- | --- | --- |
| PostgreSQL, Redis, application, sandbox, plugin and agent keys | Dify internal service authentication; host operator | Generated once into root-owned `runtime.env` during install | File ownership/mode and health only; never output values |
| Provider API keys | Dify model/image access; workspace owner | Enter privately in Dify provider binding | Inspect binding metadata; paid execution separately approved |
| Community workflow API key | Booklet runtime execution/recovery; app operator | Existing Booklet protected staging secret mechanism | Model-free workflow start and result lookup |
| Dedicated Booklet callback key | Dify to Booklet probe; app operator | Dify secret variable and Booklet protected staging secret | Wrong-key rejection then matching authenticated callback |
| R2 backup access and restic password | Dify backups; host operator | Root-owned host files plus independent password-manager recovery copies | Private repository access and restore rehearsal |
| Developer CLI and MCP sessions | Individual Dify administration; developer | Separate local Community profiles/state directories | Read-only workspace and workflow inventory from a fresh session |

Reuse the existing deploy SSH and Cloudflare access credentials. Do not reuse
Booklet database, asset-bucket, or Cloud experiment credentials.

## Checkpoint 3 — private administrator setup

Execution machine: operator browser over an existing administrator SSH
connection that permits a private localhost port forward; the public Tunnel
still returns maintenance. The restricted `kids-booklet-deploy` key has
`restrict` and cannot forward ports. Verify a separate administrator path
before installation; do not weaken the deployment key or expose Dify setup
publicly to work around this handoff. Create the owner and one second
developer in a single workspace, with separate accounts. Disable public
registration and extra workspace creation. Deliver invitation links privately;
SMTP is deferred. Verify login/logout, roles, file upload/download, workflow
editor, plugin catalogue, and New Agent configuration without a model call.
Set up password recovery privately and record the administrative command used
for this pinned release without putting a password in shell history. Only then
review the Terraform switch that enables the HTTPS Tunnel route. Check secure
cookies, streaming, WebSockets, upload/download, and no caching of dynamic
responses. If initial setup or routing fails, keep the 503 route and inspect
localhost health and Tunnel logs; do not expose setup to the public internet.

## Checkpoint 4 — developer control

Execution machine: each developer's Windows machine. Check Node, the pinned
`dify-mcp` bridge, and the checksum-verified matching `difyctl` before any
installation. Keep Cloud and Community state/config separate. Authenticate
the CLI with Community device login. Try MCP device login using the configured
`difywf` client. If its console operations need a browser session, use only
the bridge's supported private import and verify refresh behavior. Restart
Codex and prove fresh-session discovery, correct host/workspace, read-only
inventory, and workflow editing. Follow the
[Codex Dify access guide](../accepted/2026-09-26_codex-dify-access/runbook.md)
for credential handling; do not assume CLI login authenticates MCP.

On uniquely named disposable resources, perform a model-free configuration →
draft test → controlled failure → diagnosis → repair → publish → Workflow Tool
synchronization → restore cycle. Read back the published version and execute
its published behavior. Verify New Agent create/configure/publish separately;
model execution remains untested. Before an uncertain retry, inspect the
existing run/version. Preserve evidence, then clean up only named probes with
the required deletion confirmation.

## Checkpoint 5 — deterministic Booklet round trip

Execution machine: staging Booklet and published Community workflow. Import
[`deploy/dify/booklet-probe.yml`](../../deploy/dify/booklet-probe.yml), set its
callback URL and secret variable privately, test, and publish. The local
routes and DSL are implemented but not yet live-verified. Set protected staging
`DIFY_COMMUNITY_PROBE_ENABLED=true`, `DIFY_COMMUNITY_BASE_URL` to the Community
HTTPS origin, `DIFY_COMMUNITY_WORKFLOW_API_KEY` to that workflow application's
runtime key, and `DIFY_COMMUNITY_CALLBACK_KEY` to a separate 32-byte-or-longer
key. Do not overwrite Cloud experiment credentials. Production keeps the flag
false. The Dify secret variable must contain the same dedicated callback key.

From an authenticated Booklet staging client, `POST
/api/integrations/dify-community/runs`. Save the returned correlation ID even
when the result is `unknown`. The workflow sends it with the fixed marker and
its own run ID to `POST /api/integrations/dify-community/callback`, authenticated
by `X-Booklet-Dify-Probe-Key`. Then `GET
/api/integrations/dify-community/runs/{correlationId}` uses the Booklet runtime
key to retrieve the Dify run by ID. The result includes only sanitized IDs,
timestamps, callback presence, and outcome. Verify wrong key,
disabled/production routes, malformed input, timeout, and a deliberately lost
original response. If no run ID was received or stored by the callback,
record `unknown`; never replay automatically. If the callback and start
response name different run IDs, retain the callback's ID, report failure,
and inspect both Dify traces before any further operation.

## Maintenance and recovery gates

Routine operations are serialized with Booklet under
`kids-booklet-vps-operation`, with cancellation disabled. A daily encrypted
off-host backup is required before readiness is claimed: pin and checksum
restic 0.19.1 using the reviewed [binary manifest](../../deploy/dify/restic.json),
use the dedicated R2 bucket, retain 14 days and the latest
successful snapshot, and keep recovery credentials outside the host. A backup
must first stop new Dify work and verify that workflow and New Agent work is
idle. Allow 15 minutes for draining; if activity is still present or cannot
be verified, reopen admission and defer the backup. Stop Dify only after a
verified drain, capture data/config/release manifest, restart and health-check,
then prune. Do not use an R2 age-deletion rule for restic objects.

The pinned release stores workflow activity in PostgreSQL `workflow_runs` and
New Agent run records under `dify-agent:runs:*:record` in Redis database 2.
The Agent server exposes per-run status, not an aggregate idle endpoint. A
live, model-free probe must confirm both sources and queued-work behavior
before the automatic drain is enabled. A missing or malformed status result
means **not idle**; defer the backup instead of stopping Dify. See the pinned
[workflow model](https://github.com/langgenius/dify/blob/1.17.1/api/models/workflow.py),
[Agent Redis keys](https://github.com/langgenius/dify/blob/1.17.1/dify-agent/src/dify_agent/storage/redis_keys.py),
and [Agent run store](https://github.com/langgenius/dify/blob/1.17.1/dify-agent/src/dify_agent/storage/redis_run_store.py).

The restic manifest pins the binary but does not install it or enable backups.
The automatic drain, timer, restore rehearsal, and backup credentials remain
pending until a live model-free probe confirms admission and queue behavior.

After installation, run the read-only candidate check with
`bash scripts/deploy/vps-deployment.sh --action dify-idle --environment dify`.
It reports active workflow and New Agent record counts. Its zero result is one
observation, not permission to stop services: admission closure, queue drain,
and a second check still require live verification.

Restore is a separate destructive checkpoint requiring exact snapshot ID and
target confirmation. Rehearse into isolated directories and a separate
localhost-only Compose project, with schedules disabled and provider/callback
egress blocked. Verify a deterministic workflow, published behavior, saved
file, and configuration. If the VPS cannot host both stacks, plan Dify-only
downtime; Booklet remains up. Never downgrade an upgraded database against
older images alone. Restore the matched pre-upgrade data/configuration set.

Daily checks must report reachability, container health, restart/OOM events,
disk/memory pressure, and backup age. Warn at 80% disk usage or backup age
over 26 hours. Do not automatically delete assets or reset data. Investigate
Tunnel, callback, auth, plugin, disk, and interrupted-upgrade failures from
the operation journal before restarting or retrying.

## Completion evidence

Record sanitized host capacity, Terraform plan, release/image pull result,
loopback and public-route checks, workspace roles, fresh-session MCP/CLI
results, deterministic published tool cycle, Booklet round trip and lost-run
recovery, backup ID/age, and restore rehearsal. Provider execution and full
#65 workload capacity remain unverified until separately authorized. Do not
close #69 based only on local tests or an installed container stack.
