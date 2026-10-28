# Dify Community on the shared VPS

This is the issue #69 operating runbook. Live installation and the deterministic
integration round trip are recorded. The operator deferred backup setup and
restore/upgrade rehearsal on 2026-10-04 to [Dify setup follow-up](https://github.com/karpishe-experiments/agentic-poc/issues/69#issuecomment-5978334871).
They are not active experiment-readiness steps and are not completed.
Host/data loss can lose saved Dify work until that follow-up is verified.
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
  route starts as a 503 maintenance response. For this installation, the
  operator accepted the short first-administrator exposure window and enabled
  `https://dify.uniwares.co.uk` before setup. Complete setup immediately after
  the route becomes live.
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
resource replacement. Keep `dify_public_enabled=false` until the operator
approves either private setup or the bounded public setup window. The backup
bucket needs separately scoped credentials before backups can be enabled.

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
bash scripts/deploy/vps-deployment.sh --action status --environment dify --vps-host "$VPS_HOST"
bash scripts/deploy/vps-deployment.sh --action resume --environment dify --vps-host "$VPS_HOST" --apply
```

The reviewed `master` [Dify operations workflow](../../.github/workflows/dify-operations.yml)
offers the same read-only check, status, preview/apply installation, and
explicit resume paths. It shares
the Booklet host-operation concurrency group and rechecks the remote `master`
commit before host contact. Do not run it from this issue branch.

For a retained Dify operation, status also reports the systemd unit state and
only the Compose service name, state, health, and exit code. It does not return
container logs, resolved configuration, environment values, or credentials.

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

Before startup, the installer copies the pinned sandbox `config.yaml` into an
empty persistent configuration directory and assigns the Agent sandbox home
and workspace to its pinned image user (`1000:1000`). It preserves an existing
regular sandbox configuration file. A symlink or non-file at that path blocks
startup.

Startup uses a bounded application readiness check after Compose starts the
services. Running services without an upstream healthcheck, such as
`worker_beat`, are accepted; configured healthchecks must report healthy, and
the `init_permissions` one-shot service must exit successfully.
Readiness also requires a valid Engine.IO open packet from the local proxy.
The collaboration API has a 1536 MiB limit and a bounded healthcheck; a running
container alone does not establish editor synchronization readiness.

If the editor remains at `Syncing data`, inspect collaboration health before
changing workflow content or credentials. A verified 384 MiB OOM kill required
the targeted `repair-collaboration` action in the reviewed Dify operations
workflow. Synchronize the reviewed dispatcher/override through Infrastructure
first, preview the repair, then apply at the authorized checkpoint. Apply checks
host headroom and idle workflow/Agent records, recreates only `api_websocket`,
and verifies health and the local socket. It preserves databases, keys,
Booklet containers and workflow content. Inspect the retained operation journal
before resume after an interruption. Verify the public WebSocket and editor
afterward; local socket readiness alone does not prove the Tunnel path.

### Automated diagnostics and sandbox memory

Execution machine: GitHub Actions, using the existing restricted VPS access.
Synchronize the reviewed dispatcher and override through Infrastructure first.
In **Dify operations**, select `diagnostics`, leave Apply off, and optionally
enter the staging run UUID. The sanitized summary contains host capacity,
container state/limits/exit codes, sandbox and scheduler memory/error counters, and saved run state and
callback timings when a run is selected. It does not expose raw application
logs, credentials or creative content. Timing coverage is bounded to 24 hours
and 20,000 container log lines; absence of records is not a performance pass.

For a memory repair, select `repair-sandbox` with Apply off for preview, then
Apply at the authorized checkpoint. The reviewed target is 1024 MiB, not an
unlimited container. Apply requires at least 2816 MiB available memory and
verified idle Dify work. It recreates only the Python sandbox and verifies its
health and exact limit. If a guard fails, inspect `diagnostics` and `status`;
do not bypass the guard or repeat a workflow POST. After interruption, inspect
the retained journal before using `resume`. This repair does not establish
that memory pressure caused a code-node timeout; compare cgroup counters and
live successor behavior. Compose serializes byte limits as decimal JSON strings;
the preflight normalizes the value before comparing the exact byte count.
Live repair `38130490623` passed on 2026-10-11 after preview `38130439691`.
Diagnostics `38130594784` read back a healthy sandbox with exactly 1073741824
bytes, zero restarts and zero OOM counters, with 11,480 MiB available host memory.
The collaboration service remained healthy at 1536 MiB. This verifies the repair,
not the cause of the earlier timeout or full Booklet acceptance. The operator's 2026-10-11 kernel log confirms memory-cgroup OOM kills of
`flask upgrade-db` in `worker_beat` at the old 256 MiB limit. A running-container
snapshot with `oomKilled=false` and zero current counters did not exclude these
kills; correlate kernel events with the exact container ID before diagnosing.

The `repair-scheduler` operation raises only `worker_beat` to 1536 MiB,
matching the other API-image services. Synchronize the reviewed dispatcher and
Compose override through Infrastructure, then select `repair-scheduler` with
Apply off in Dify operations. Apply requires an idle Dify workspace and 3328 MiB
available host RAM (1280 MiB increase plus 2 GiB headroom). It uses the shared lock
and journal and recreates only `worker_beat`. It requires a beat startup log from
the current container start, then 120 seconds with the same container ID, start
time and restart count, followed by the existing Dify readiness checks. This
proves bounded startup stability, not successful execution of every periodic task.
Inspect `status` after an interruption before `resume`. A running scheduler that
already has the reviewed limit is verified without recreation.

Live repair [38139804937](https://github.com/karpishe-experiments/agentic-poc/actions/runs/38139804937)
passed on 2026-10-11 after preview `38139756746` and Infrastructure synchronization
`38139657415` of reviewed merge `3b017f839d60e56b4f7d4ef5e7c77aea91263e44`.
Terraform changed no resources. Independent diagnostics
[38140083268](https://github.com/karpishe-experiments/agentic-poc/actions/runs/38140083268)
read back `worker_beat` running for over four minutes with exactly 1610612736
bytes, zero restarts and zero cgroup OOM counters. Its logs contain one migration
startup and one beat startup. Sampled usage was 409.3 MiB and available host memory
was 11,159 MiB. The other Dify containers retained their prior start times.
Status `38140132764` confirmed an idle host operation journal.
This establishes recovery of the startup restart loop, not verification of every
periodic task or full Booklet acceptance.
The diagnostics candidate adds bounded scheduler error-category counts and
cgroup counters. The diagnostic candidate also counts fixed startup/exception
categories and records container start/finish times. It never returns arbitrary
traceback text. A restart racing the counter read reports `unavailable`;
this is an observation gap, not a zero or a health pass. Raw log text is never returned.

For recent Booklet callback events, use the authenticated staging endpoint
`GET /api/diagnostics/logs?runId=<UUID>&limit=200`. It uses the existing Booklet
login, returns no raw exception text, and clears its bounded buffer on restart.
Use workflow diagnostics for retained container timing summaries.
With a staging run selected, the diagnostic candidate also checks this endpoint
through the public HTTPS origin from the staging container. It uses that
container's existing `ACCESS_GATE_PASSWORD` in memory, refuses redirects, bounds
the response, and returns only authentication outcome and event count. No new
secret, local `.env` copy or operator credential entry is required. A failed check
reports `unverified`; it does not establish that the endpoint is unavailable.
Infrastructure synchronization `38138324124` installed this path. Diagnostics
`38138400115` and `38141274006` verified authenticated HTTP 200. This verifies
automated endpoint access, not unrestricted log access or full M3 completion.

The protected runtime environment is root-owned, mode 600, at
`/etc/kids-booklet/dify/runtime.env`. Never print it, `docker compose config`,
or credential-bearing logs in Actions summaries. Do not replace generated
internal keys on update: encrypted data depends on them.

### Enable the Community admin API

The admin API key is a separate, powerful console bearer credential. The pinned
Dify release defaults it to disabled. The live instance is enabled as of
2026-10-11. The protected host setting, API service recreation, and Dify
readiness passed; a developer machine received HTTP 200 for an authenticated
console read, while a separate invalid-key request received HTTP 401. The host
operation journal is idle. No VPS service is recorded as configured or verified as an
admin API client. See [PR #168](https://github.com/karpishe-experiments/agentic-poc/pull/168)
and the [current infrastructure apply](https://github.com/karpishe-experiments/agentic-poc/actions/runs/38122080367)
for reviewed code and host synchronization evidence.

For a new installation or guarded recheck, use the installed host-local action from a
private interactive root terminal on the VPS after Infrastructure has synchronized
the reviewed `master` script. This action holds the shared host lock, retains a
host operation journal, checks for active Dify work, and recreates only `api` and
`api_websocket`. It does not update Booklet or Cloud Dify.

Generate a 32-byte hexadecimal key in a private terminal and retain it in the
team's password manager. Do not place the key in chat, shell command arguments,
GitHub secrets, a workflow input, or a repository file. The setup prompt hides
input; paste the key there. Do not run the apply command through Actions or the
restricted deploy SSH dispatcher because neither provides this private prompt.

```bash
sudo /opt/kids-booklet/vps-deployment.sh --action dify-enable-admin-api --environment dify
sudo /opt/kids-booklet/vps-deployment.sh --action dify-enable-admin-api --environment dify --apply
```

Preview reports `exists` or `would update` without printing the key. Apply
retains the prior protected file as
`/etc/kids-booklet/dify/runtime.env.admin-api-before-enable`, atomically updates
`runtime.env`, restarts the two API services, checks Dify readiness, and confirms
that the API container received an enabled flag and a correctly formatted key.
It does not prove a bearer request from a developer machine. Verify one scoped,
non-billable console read from each intended client privately before recording
remote access as working. Keep the password-manager copy available to approved
developer and VPS clients; do not use a Booklet runtime or Dify app key for this.

From a private Bash terminal on a client that has received the key through the
approved private handoff, run this read-only check. It passes the key to curl on
standard input, keeps it out of shell history and command arguments, and prints
only the HTTP status and content type. The workspace ID is not a secret. HTTP 200
with `application/json` confirms this client can authenticate. Check each
intended VPS service separately before recording its access as working.

```bash
read -rsp 'Dify admin key: ' dify_admin_key; echo
printf 'header = "Authorization: Bearer %s"\n' "$dify_admin_key" |
  curl --config - -sS -o /dev/null -w 'HTTP %{http_code} %{content_type}\n' \
    -H 'X-WORKSPACE-ID: ffac910f-2786-490e-90d8-07243d49741b' \
    'https://dify.uniwares.co.uk/console/api/features'
unset dify_admin_key
```

If apply stops, inspect the retained operation journal and container state
privately. Repeat the same local apply action to resume this operation. If it
stopped before configuration replacement, enter the same key again. If it
stopped after replacement, the action recreates the API services when the
running service has not loaded the setting. A different key conflicts with
the retained candidate and requires administrator inspection. The retained
pre-enable file is a recovery copy, not an instruction to replace the current
file without inspecting the failure.

## Credential inventory

The complete [canonical inventory](contracts.md#variables-and-secrets) records
Booklet runner keys, internal Dify variable names, developer sessions, deployment
credentials and deferred backup credentials. Keep it current with the
[maintenance procedure](contracts.md#maintaining-the-inventory); the table below
summarizes Community provisioning ownership.

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

## Checkpoint 3 — administrator setup

The default is an operator browser over an existing administrator SSH
connection that permits a private localhost port forward while the public
Tunnel returns maintenance. Because Dify's frontend uses its configured public
API origin, localhost browser setup requires a matching temporary origin or a
direct localhost API bootstrap. For this installation, the operator instead
accepted the low-risk public setup window. Terraform routes the final HTTPS
origin to Dify, and the operator must create the first administrator
immediately. The restricted `kids-booklet-deploy` key remains unchanged.

Create the owner and one second
developer in a single workspace, with separate accounts. Disable public
registration and extra workspace creation. Deliver invitation links privately;
SMTP is deferred. Verify login/logout, roles, file upload/download, workflow
editor, plugin catalogue, and New Agent configuration without a model call.
On 3 October 2026, the operator's Members screenshot showed two active
accounts in the Community workspace: the owner and the invited developer with
the `admin` role. The developer was no longer marked Pending. This verifies
invitation acceptance and visible membership, not the remaining editor,
plugin, or recovery checks.
If an invitation reports `invalid username-password pair or user is disabled`,
check Celery broker authentication against the configured Redis password before
retrying. The account may already have been created before queueing failed;
inspect membership first. Repair only the broker URL in the protected runtime
configuration, then recreate the API and workers so they load it. Use the
reviewed Dify operations workflow: preview `repair-broker`, apply it after the
idle check, then run `check`. The operation changes only the known default
broker URL, keeps a protected pre-repair copy, and verifies API-to-Redis
authentication. It does not resend the invitation. Do not print the URL or
password in logs or workflow summaries. An SMTP failure is a separate delivery
problem after queueing succeeds.
Set up password recovery privately and record the administrative command used
for this pinned release without putting a password in shell history. Check secure
cookies, streaming, WebSockets, upload/download, and no caching of dynamic
responses. If initial setup or routing fails before an administrator exists,
restore the 503 route and inspect localhost health and Tunnel logs.

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

On 3 October 2026, `difyctl` 1.17.1 and a freshly restarted Codex session
both authenticated to `https://dify.uniwares.co.uk` and read back the owner
account's workspace `ffac910f-2786-490e-90d8-07243d49741b`. Codex
discovered the separate `dify-community` local-stdio connection and its 172
tools; a live MCP `workspace_list` call succeeded. Cloud sessions stayed
separate. The Community credential file ACL permits only the current user,
SYSTEM, and Administrators. The bridge's device-login parser required a local
compatibility correction: Dify 1.17.1 returns `token`, while the pinned bridge
accepted only `access_token`. The local correction accepts either and fails
closed if neither exists; typecheck and 114 tests passed. Preserve or upstream
it before reinstalling the bridge. MCP `app_list` previously returned 404
`workspace not found`; on 2026-10-04 it succeeded and matched the official CLI's
seven-app inventory. Keep the CLI as the tested inventory fallback. Community cookie import also passed live
MCP `workspace_list` and `workflow_get_draft` checks on 3 October 2026. Use the
[clipboard prompts](../dify-getting-started.md#community-instance-issue-69) for
private cookie entry. The terminal's masked paste accepted control characters;
the bridge stored them without validating their contents. Cookie-name discovery
and import success alone therefore do not prove authenticated console access.
Cookie refresh/expiry behavior remains unverified.

On uniquely named disposable resources, perform a model-free configuration →
draft test → controlled failure → diagnosis → repair → publish → Workflow Tool
synchronization → restore cycle. Read back the published version and execute
its published behavior. Verify New Agent create/configure/publish separately;
model execution remains untested. Before an uncertain retry, inspect the
existing run/version. Preserve evidence, then clean up only named probes with
the required deletion confirmation.

The first disposable control workflow is `issue69_control_probe`
(`8aea979d-fdbf-4145-b7a9-f62f27b850dd`). Its reviewed, model-free source
and input fixture are [`control-probe.yml`](../../deploy/dify/control-probe.yml)
and [`control-probe-input.json`](../../deploy/dify/control-probe-input.json).
The deterministic control cycle passed on 3 October 2026. MCP validated the
graph, ran the draft, retrieved the failed trace, published versions, created
and refreshed its Workflow Tool, and restored the original published version.
The official CLI updated the existing app from DSL and executed published
versions. All observed runs reported zero tokens; the graph contains no model,
image, or HTTP nodes. The original private draft backup is retained in the
protected Community state directory outside Git. The app and tool remain
available for subsequent integration checks; no probe was deleted.

| Check | Verified evidence |
| --- | --- |
| Draft baseline | Run `ccc20e55-49a8-4c0e-86ec-3a61949cb3e6`; `issue69-original`, succeeded |
| Controlled failure and trace retrieval | Run `22b73731-cbe0-473b-a0bf-1c348a3aebb2`; code node `echo` reported `issue69-controlled-failure` |
| Repaired draft | Run `1b55b452-c0bb-4069-a742-b5b0fd7fc979`; original output, succeeded |
| Original publication | Version `11377436-a9b6-40db-a8f4-8f6567fe0514`; run `9435f1b6-7205-4d75-a8f4-771d4ca85ab1` succeeded |
| Changed publication | Version `7503d63c-d8f2-4b0f-8528-2737062ebb5f`; run `b0e93b03-d713-4f22-bf9d-9ceba06dc96b` returned `issue69-original-changed` |
| Restored publication | Version `e07f1077-a6f7-485d-8dcd-c1ba69e4e568`; run `64b6a051-6f0e-40e9-9f06-2d6c62adac35` returned `issue69-original` |
| Workflow Tool synchronization | Tool `f78ac7f2-7cba-4fd5-89c2-7fdb9b804415`; refresh detected `synced=false` after change, then verified `synced=true`; final restoration refreshed successfully |

The pinned bridge has two additional Community compatibility gaps: draft sync
sends `environment_variables`, which 1.17.1 rejects as an extra field; published
execution through console cookies returns HTTP 405. Use the inspected official
CLI `run app --inputs-file` execution fallback. On 2026-10-28, official CLI
Studio import and export returned HTTP 500. For graph-only saves, the existing
reviewed issue #65 compatibility client at `.tools/dify-mcp-issue65` omitted the
unsupported field and preserved environment variables and features on readback.
It uses the private Community state directory; it does not replace the registered
MCP process. Use MCP for current reads and publication, and save with a fresh
draft hash. Inspect uncertain saves before another mutation. Keep `--http-retry 0`
during probes. The earlier CLI import preserved the app ID; MCP restore preserved both the app ID and the
original graph hash. Tool synchronization and published app execution were
verified separately; a caller invoking the Workflow Tool remains untested.
Booklet runtime-key lookup and callback-based interrupted-response recovery passed
in checkpoint 5. New Agent configuration remains a separate capability check;
backup/restore rehearsal is deferred to the setup follow-up.

## Checkpoint 5 — deterministic Booklet round trip

Execution machine: staging Booklet and published Community workflow. Import
[`deploy/dify/booklet-probe.yml`](../../deploy/dify/booklet-probe.yml), set its
callback URL and secret variable privately, test, and publish. The local
routes and DSL passed the live happy-path check below. For a new setup, set protected staging
`DIFY_COMMUNITY_PROBE_ENABLED=true`, `DIFY_COMMUNITY_BASE_URL` to the Community
HTTPS origin, `DIFY_COMMUNITY_WORKFLOW_API_KEY` to that workflow application's
runtime key, and `DIFY_COMMUNITY_CALLBACK_KEY` to a separate 32-byte-or-longer
key. Do not overwrite Cloud experiment credentials. Production keeps the flag
false. The Dify secret variable must contain the same dedicated callback key.

The Community draft `issue69_booklet_round_trip`
(`5e79d21c-d80c-46e6-ba52-a3632f5c30fe`) was imported and read back on
3 October 2026. Server-default graph validation passed with zero issues. It
is currently published as version `35acdf94-5bb4-47ac-a1b8-20f0f57a37cd`.
The selective staging port preserves the existing Cloud callback authentication
exceptions and settings. Private staging bindings and the happy-path round trip
and callback-based interrupted-response recovery are verified.
The default Compose configuration keeps the probe disabled. Imported secret
metadata is not proof that the callback key has been entered correctly.

The setup path is **Dify staging key**, run from `master` with
`secret_name=DIFY_COMMUNITY_PROBE`. Before using it, install the reviewed host
dispatcher through the Infrastructure checkpoint and release the additive probe
routes to staging. Privately store repository secrets
`DIFY_COMMUNITY_WORKFLOW_API_KEY` for `issue69_booklet_round_trip` (not the M0
manager) and `DIFY_COMMUNITY_CALLBACK_KEY`. Set the same callback value in the
Dify workflow's `BOOKLET_PROBE_CALLBACK_KEY` variable, publish, and read back its
configuration before execution. Never supply either key in workflow text inputs.

The bundle stages only these keys, the fixed Community origin and the enable
flag. It preserves Cloud keys and all unrelated application secrets, then uses
the existing serialized rotation and readiness checks. An interactive operator
can instead use the canonical `rotate-secrets` action with
`--environment staging --secret-name DIFY_COMMUNITY_PROBE`; it silently prompts
for only the two Community keys. Preview does not prompt or stage them. Retain
the keys in the team's password manager, and remove temporary repository copies
after successful rotation. A failed rotation requires journal inspection and
Maintenance resume; do not dispatch a second rotation blindly.

The reviewed host setup is on master at
`f64b0e8eb341877f743edfaac276c1b5d79ea282` (including PR #83).
Infrastructure run `37137559467` synchronized it with zero Terraform resource
changes. Selective staging PRs #79 and #81 preserve the Cloud trial defaults:
enabled in staging, fake mode, images disabled, and two attempts.
Final staging commit `c909a8ce0d487d1dbe4f1aecbf6e3dc90e2013e1` passed CI
`37131423028` and deployed in `37131641941`, using image digest
`sha256:f9c1f4a61adf03841c39e5afa4436b819c240035f37290f9cf5f0b1826835a19`.
Final Check deployment `37132062489` passed. Protected key rotation
`37138234168` then installed the private probe bindings and enabled the probe in
staging, without replacing the application image. Compose defaults remain off;
production remains disabled. Publication alone is not evidence of installed keys.

On 2026-10-03, the operator's single start request and subsequent result lookup
reported `succeeded`, `callback_received=True` and no error category. Correlation
ID: `d3b7d5b0-04f3-4bca-8e90-37c2432f7316`; Dify run:
`18381193-b811-4809-a673-4784bf2d572f`; published workflow:
`35acdf94-5bb4-47ac-a1b8-20f0f57a37cd`. This verifies the public round trip and
saved-result retrieval through Booklet's runtime credentials, not administrative
MCP. The deterministic graph contains no provider nodes. It does not prove a
deliberately lost response, timeout, or live negative authentication cases.

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

### Deployed interrupted-response probe

The reviewed source adds `X-Booklet-Probe-Fault: discard-start-response` to the
authenticated staging start endpoint. It drops a successful Dify response before
parsing or saving its IDs; the callback can still persist the run ID. No header
means normal behavior. An unsupported value returns 400 before dispatch;
production and disabled deployments return 404.

The selective staging release passed on 2026-10-04: [PR #85](https://github.com/karpishe-experiments/agentic-poc/pull/85),
commit `0be0edf889c3657953d9fec4e65bf6d730ec2254`,
[Validate](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37184262878),
[Deploy](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37184450953)
and [Check deployment](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37184782644).
The deployed image is `ghcr.io/karpishe-experiments/agentic-poc@sha256:ec660696c2d82c7c3e5b2e2698abc41ef7fd403251e1220a6d79bc16da6766fe`.
The three-file port preserved existing Community keys, Cloud settings and production.
The bound published workflow was read back as model-free. On 2026-10-04, the
operator's one-POST/GET-only fault check passed with correlation
`3d5bcc06-dab0-4bd3-93c1-105f54b499ad` and saved Dify run
`eb586ddf-243d-40a5-8a45-27935cf9d653`. The start reported `unknown` and
`response_discarded=true`; lookup returned `succeeded` and `callback_received=True`.
Independent MCP retrieval confirmed the exact correlation, marker, publication
`35acdf94-5bb4-47ac-a1b8-20f0f57a37cd`, acknowledgement and zero tokens.
The operator reported no replay. The administrative run-list operation returned
no entries, so it does not independently establish a complete execution count.

For a separately authorized repeat check:

1. Confirm the bound workflow remains model-free and published, and the callback
   and runtime keys remain the existing diagnostic bindings.
2. Send exactly one authenticated start request with the fault header. Save the
   returned correlation ID; expect 202, `status=unknown` and
   `response_discarded=true`.
3. Use the existing result GET for that correlation. Expect `succeeded`, a saved
   callback and the same Dify run ID. Inspect that run and confirm zero tokens.
4. Verify only one start execution occurred. Do not issue another POST to recover.

This tests loss between Dify and Booklet, not loss of the Booklet response to the
operator or a process crash. If no callback ID was saved, retain `unknown` and
inspect the execution rather than replaying. The local no-ID regression verifies
that lookup does not dispatch another run. Remove this temporary fault switch
when the diagnostic probe is retired; do not copy it into paid runner routes.

Routine operations remain serialized with Booklet under
`kids-booklet-vps-operation`, with cancellation disabled. Check reachability,
container health, restart/OOM events and disk/memory pressure. Warn at 80% disk
usage; do not automatically delete assets or reset data. Inspect active work and
the operation journal before a restart or retry. A zero idle observation alone
does not authorize shutdown.

Daily encrypted off-host backups and restore/upgrade rehearsal are removed from
the active sequence. Their requirements and recovery safeguards are retained in
the [Dify setup follow-up](https://github.com/karpishe-experiments/agentic-poc/issues/69#issuecomment-5978334871).
The existing backup bucket and pinned restic manifest remain untouched. No timer,
verified backup or restore baseline is claimed. This deferral does not relax
Booklet's existing backups, exact-target reset approval, private configuration
backups or reconciliation before publication.

## Completion evidence

Record sanitized host capacity, Terraform plan, release/image pull result,
loopback and public-route checks, workspace roles, fresh-session MCP/CLI
results, deterministic published tool cycle, Booklet round trip and lost-run
recovery. Backup/restore evidence belongs to the deferred setup follow-up. Provider execution and full
#65 workload capacity remain unverified until separately authorized. Do not
close #69 based only on local tests or an installed container stack.
