# M0 — Access, configuration and executable control

**State:** In progress. Authenticated inventory and the deterministic workflow
failure/repair/publication/tool-synchronization/restoration cycle passed.
Community workflow-to-workflow invocation passed in draft and published callers.
Draft isolation and synchronized binding restoration also passed. Full-suite
capacity remains unverified. Callback-based interrupted-response recovery passed
on 2026-10-04; the no-ID outcome remains unknown and must not be replayed. Explicit
parent/child envelopes passed in the model-free lineage probe below; full-runner
persistence is still M1 work. The operator's deployed Booklet round trip, authenticated callback and
runtime-key saved-result lookup passed on 2026-10-03.
**Coverage:** AC08, AC13 and first-slice readiness.
**Read first:** [EXECUTION.md](EXECUTION.md), [PRD.md](PRD.md),
[Dify access runbook](../2026-09-26_codex-dify-access/runbook.md).

## Execution checklist

Run these checkpoints in order. The sections below supply the constraints and
probe details; do not maintain a second checklist. Keep provider calls disabled.
Record each result in this table with a dated evidence reference and the exact
dependent operation blocked by any unresolved item. Checkpoint 3 passed for the
bounded deterministic probe; other checkpoints remain open.

| Action | Expected result | Evidence | Unresolved blocker |
| --- | --- | --- | --- |
| 1. Access and capacity: confirm workspace, authenticated interfaces, live quota and module types | Working control path and enough verified capacity for the candidate probe | 2026-10-03: Community MCP workspace check and CLI inventory pass; three new probe workflows imported | Complete-suite capacity; host workload measurements |
| 2. Modular execution: run deterministic manager → Concept specialist → tester | Selected layout, exact invocation examples and stable module/caller IDs; no provider calls | Separate invocation, binding restoration and explicit lineage-envelope probe passed; see below | Full-suite capacity; M1 persistence of role lineage |
| 3. Publication and recovery: fail, repair, publish, synchronize, change and restore the probe; separately retrieve a lost response using Booklet runtime credentials | Original result restored; published binding read back; saved result recovered without another execution | Deterministic cycle and binding restoration passed; deployed callback/runtime lookup passed on 2026-10-03; callback-based interrupted-response recovery passed on 2026-10-04, below | No blocker for this diagnostic; no-ID outcomes remain unknown, not replayable |
| 4. M1 handoff: consolidate verified bindings and prepare the first runnable slice | Concrete Sol/Low package; local and staging readiness stated separately | Local contract preparation can proceed; diagnostic probe bindings verified | First-slice role/key map, persisted contracts and bounded execution package |

Use MCP first, inspected official CLI second, and authorized browser control last.
An unresolved staging dependency does not block independent local preparation.
For checkpoint 4, use the handoff format in [EXECUTION.md](EXECUTION.md#sol-low-execution-packages).
The Community callback routes are deployed. Compose defaults keep the probe off;
protected staging configuration enables it with verified private bindings.
The successful diagnostic round trip does not establish full-runner readiness.

### Current target and Community probe — 2026-10-03

Use the Community instance at `https://dify.uniwares.co.uk`, workspace
`ffac910f-2786-490e-90d8-07243d49741b`. Issue #69 delivered this target;
keep the Cloud experiment unchanged. The Cloud sections below are historical
evidence, not the current host selection or a Community capacity limit.
The [Community runbook](../../deployment/dify-community.md) owns access
compatibility and remaining platform readiness checks. PR #78 merged at
`2b41ebf7c8a3d1461140ff049db1c319dc5153ec`; this issue branch includes it.

| Probe role | App ID | Tool provider / state |
| --- | --- | --- |
| Concept | `648ee9ff-45db-4655-9b7c-6f003a6e0b7a` | `b6faa1b1-cd69-4021-b363-38442ae3b39c`; published and synchronized |
| External tester | `2a0cf2e8-26d3-4b04-9567-e04ab7c4152f` | `aba697cd-29ff-4612-8348-6b83e5e59689`; published and synchronized |
| Manager transport caller | `ec1ab490-1abe-4672-ac7f-090719c41dfd` | `899c1dee-e893-41c8-b42b-bd9214eff4d6`; published and synchronized |

The retained fixtures are [Concept](fixtures/community-concept.yml),
[tester](fixtures/community-tester.yml), and [caller](fixtures/community-manager.yml).
Input `{"marker":"issue65"}` to the caller returned
`{"result":"issue65|manager|concept|tester"}` in run
`7c70636a-bae9-4401-b894-0456d8880b9f`. Tool nodes invoke separate workflows;
their graphs are not embedded in the caller. Child runs are independently
retrievable: Concept `0fb19acb-20fb-4b1c-abd0-3de858e6a4a8`, tester
`9f2aa004-82c8-4fcc-93a8-2bc2310d850c`. These original traces do not establish
parent linkage; matching timestamps alone are not proof. The separate
explicit-envelope probe below verifies a usable path.

All three graph validations returned zero errors/warnings. Standalone draft
runs passed, and tester run `3306b2bc-9cf8-4fa9-8bd7-6ed6db5148d5` rejected
an input without the Concept marker. All observed runs reported zero tokens.
Two independent clean reviews preceded each configuration publication. The caller
is a transport-only probe: it does not grant the production manager tester
authority, fabricate approvals, or implement creative responsibilities.

Prefer separate role workflows for the suite, subject to remaining capacity,
accounting and recovery checks. Published caller version
`dae1aabe-3fa3-4cf5-8507-3f91fe1d5757` was read back and executed through the
inspected CLI fallback with HTTP retries disabled. Run
`e42f79d0-bd29-4000-92af-17de5b5e2fac` returned the same expected result and zero
tokens using [the retained input](fixtures/community-probe-input.json).
Do not infer a five-app Cloud quota from the
Community workspace response's `sandbox` label. Three successful imports prove
capacity for this probe only, not the full suite. The deployed Booklet round trip
and callback-based interrupted-response recovery now pass. Next persist explicit lineage;
independent local M1 contract preparation can proceed.

#### Binding change and restoration evidence

The [changed Concept fixture](fixtures/community-concept-changed.yml) changes only
the Code output to `marker + "|changed|concept"`. Its graph validation and MCP
dry-run passed. Actual MCP draft synchronization still returns HTTP 400 because
it includes the unsupported `environment_variables` field; the inspected CLI
same-app import is the verified fallback. A private original-version DSL backup
was retained outside Git before the change. Two clean reviews preceded publication.
Read-only running-run queries for the owned Concept/caller probes returned no runs
before changing the published binding; this is not a workspace-wide drain proof.

| Check | Run / version | Observed result |
| --- | --- | --- |
| Changed draft | `7b364f9e-d44d-4bb4-908c-fc06fe60d61c` | `issue65|changed|concept` |
| Caller while only draft changed | `203a417e-4b9c-43d4-9cc3-85b6695628dc` | Original caller result |
| Changed Concept published, tool not refreshed | Version `de99b1d4-68f5-4368-b381-8b5d305cad37`; caller `3af92ffc-85d4-412f-9e81-7aca192caa51` | Tool reports `synced=false`; caller still returns original |
| Changed tool synchronized | Caller `a383fb0b-160a-4f9c-b94d-31b8a5f54787` | `issue65|manager|changed|concept|tester` |
| Original restored, republished and synchronized | Version `fb00aa3b-9a26-4046-a191-54db0c793ada`; caller `1ffa1a98-2674-4c79-96db-2bb693c7b62f` | Original caller result; original draft hash matched |

All runs reported zero tokens. The caller version
`dae1aabe-3fa3-4cf5-8507-3f91fe1d5757` and Concept provider ID stayed unchanged.
The first refresh attempt did not confirm success; read-back still showed
`synced=false`, and the subsequent refresh verified `synced=true`. Do not count
caller run `055cfccd-a073-43cf-8c13-08dcf5fc224a`, which returned the original
result after that unsuccessful attempt, as evidence of the changed binding.

Pinning the caller does **not** transitively pin its Workflow Tools: synchronizing
a child changes later runs of the same published caller. The unchanged caller
did not need rebuilding after restoration. Keep dispatch stopped and reconcile
active operations before refreshing child bindings; record effective child
publication evidence with each successor configuration. See the
[reusable lesson](LESSONS-LEARNED.md#published-callers-do-not-pin-child-workflow-tool-bindings).

### Runtime integration handoff

#### Explicit parent/child lineage proof — 2026-10-03

MCP read the original manager/child records and manager node executions. The
inspected fields expose workflow-tool provider IDs but no child run ID or parent
run link; `runs.export` returns 404. This is a limitation of the inspected paths,
not a claim that all Dify trace interfaces lack linkage.

Two new disposable model-free fixtures prove the explicit alternative:
[child](fixtures/community-trace-child.json) app
`91412556-7898-4028-bc3f-b6cda247fb4a` and
[parent](fixtures/community-trace-parent.json) app
`d5936f3e-1036-4547-8179-d5ff3e75bd6b`. The child was independently reviewed twice
before publication; Workflow Tool `8baf2c44-0b27-4b8f-bd47-ef427c72f755` was read
back synchronized with published workflow `bd796ef9-032e-4818-8961-f6a3d095568e`.
The parent draft invokes that published child twice, for
Concept and tester transport roles; this does not replace their creative modules.

Parent run `fbff27e2-634f-45fa-8558-e8ea981e99a5` returned Concept child
`c4646525-5917-40ee-8ca2-5232ae45d444` and tester child
`a7f17e83-7525-4c96-9807-7e0f908b808d`. Independent MCP reads of both children
confirmed `correlation_id=issue65-lineage-20261003-v1`, the exact parent ID,
correct role, distinct own `sys.workflow_run_id` and operation IDs ending
`:concept` / `:tester`. All three saved runs succeeded and reported zero tokens.
The parent verifies these identities before returning its result.

This proves explicit lineage transport and retained Dify records, not native
parent tracing or Booklet runner persistence. M1 must retain the envelope with
the application-owned operation and validate it against the dispatched role.
The parent is a draft probe, not a published-suite acceptance run.

#### Booklet runtime evidence

On 2026-10-03, the operator ran the private application-key smoke test against
`issue65_probe_manager_20261003`. The script verified the application name,
executed once, retained run ID `dca57c92-bc08-4cb1-aa6e-ab21abe89b90`, discarded
the initial output and retrieved the expected saved result with the same
application key. The operator reported `PASS` and zero tokens. This verifies
direct service-API execution and result retrieval after discarding the output;
it does not simulate loss before receiving a run ID or exercise Booklet's
deployed callback/persistence path. The key was handled privately, not supplied
to Codex or installed in staging.

The selective staging port adds `app/api/integrations/dify-community` and the
Community env schema while retaining the Cloud tool-auth exceptions. The issue
branch cannot be promoted wholesale just to obtain this probe: its staging
comparison includes unrelated infrastructure, documentation and other master changes.

The selective runtime port contains the three Community route handlers,
`lib/dify-community/probe.ts`, additive Community env/proxy contracts and tests,
and the disabled-by-default Compose flag. Preserve all existing Cloud env fields
and callback exceptions; compare both host and environment-branch settings instead
of replacing staging overlays wholesale. A PR from this master-based issue branch
would include unrelated changes and remove Cloud trial files. A short-lived
staging-based delivery branch therefore requires an explicit exception to the
one-issue-branch rule; implementation ownership remains on this issue branch.

On 2026-10-03, the operator authorized that delivery exception, reviewed master
setup, dispatcher synchronization, and staging deployment after CI. PR #68 merged
the setup at `9d1fdd6a02d1c4b5ae248c25a6aa8f78d2465d3a`; Infrastructure run
`37129311382` succeeded with zero Terraform resource changes and synchronized
the host dispatcher. PR #79 contains the isolated port from
`agent/issue-65-community-probe-staging`, tracking its same-named origin branch.
Two independent reviews, typecheck, lint, 32 focused deployment/probe tests,
31 existing Cloud unit tests, and CI `37129997901` passed. The staging merge is
`6b54dfc533c1e858fddbb2f78a32062b29250188`. Deploy run `37130264852` and staging
Check deployment `37130673585` passed. PR #80 corrected the master-owned host
Compose defaults to match staging's preserved Cloud settings; CI `37131141600`
passed and host sync `37131368907` succeeded with zero Terraform resource changes.
PR #81 added the default regression and corrected runbook guidance. CI
`37131423028` passed, and its new immutable staging snapshot
`c909a8ce0d487d1dbe4f1aecbf6e3dc90e2013e1` deployed successfully in
`37131641941`. Final staging Check deployment `37132062489` passed.
That release phase made no provider calls, key replacement or reset. The following
private binding step enabled live callback acceptance without another app release.

Required private bindings are an application API key for the exact model-free
target and the separate callback key for `issue69_booklet_round_trip`
(`5e79d21c-d80c-46e6-ba52-a3632f5c30fe`). The staging-only
`DIFY_COMMUNITY_PROBE` bundle configures the two keys, fixed origin and enable flag
through the existing protected key workflow or interactive rotation. Reviewed
publication and host synchronization passed. Protected key rotation
`37138234168` installed the operator-supplied bindings and enabled staging without
changing its immutable application image. See
[Community checkpoint 5](../../deployment/dify-community.md#checkpoint-5--deterministic-booklet-round-trip).
Codex did not retrieve the key values. The operator then executed one deterministic
Booklet start request and a separate saved-result lookup on 2026-10-03:

| Field | Verified operator result |
| --- | --- |
| Correlation | `d3b7d5b0-04f3-4bca-8e90-37c2432f7316` |
| Dify run | `18381193-b811-4809-a673-4784bf2d572f` |
| Published workflow | `35acdf94-5bb4-47ac-a1b8-20f0f57a37cd` |
| Outcome | `succeeded`; callback received; no error category |

This proves the public Booklet → Dify → Booklet callback and runtime-key result
lookup. The workflow has no model, agent or image-provider nodes. The operator
did not deliberately interrupt that initial response. The separate 2026-10-04
fault check below now proves callback-based recovery. A live outcome without a
saved ID remains unresolved. Do not replay an uncertain execution automatically.

#### Next bounded M0 work and M1 handoff

Record the first slice's role-to-runtime-key map and persist its explicit lineage.
Prepare the Concept/Outline persistence contracts and fixtures locally in parallel
with those checks. Full-suite capacity, image transport/accounting and campaign
authorization remain separate gates for the work that needs them. Platform backup
and restore readiness remains owned by the Community runbook. M0 is not complete;
do not start paid acceptance or claim an unattended full booklet on this evidence.

The deployed [staging fault procedure](../../deployment/dify-community.md#deployed-interrupted-response-probe)
discards the start response before parsing its IDs. Ten focused probe tests pass,
including callback-ID recovery and the no-ID/no-replay case. Typecheck and lint
pass in an isolated source snapshot; 38 deployment contracts pass after normalizing
only that snapshot's Compose line endings to LF. The normal Windows checkout has
stale generated files and a CRLF-sensitive baseline assertion; those were not
changed. The selective release passed on 2026-10-04: PR #85, staging commit
`0be0edf889c3657953d9fec4e65bf6d730ec2254`, Validate `37184262878`,
Deploy `37184450953` and Check deployment `37184782644`. The staging candidate
also passed all ten probe tests, typecheck, lint and two independent reviews.
The operator's single fault POST and saved-result GET passed on 2026-10-04:
correlation `3d5bcc06-dab0-4bd3-93c1-105f54b499ad`, run
`eb586ddf-243d-40a5-8a45-27935cf9d653`, publication
`35acdf94-5bb4-47ac-a1b8-20f0f57a37cd`. The discarded start returned `unknown`;
GET recovered `succeeded` with a stored callback. Independent MCP retrieval
confirmed matching inputs/outputs, acknowledgement and zero tokens. No new keys,
configuration changes or replacement execution were requested. See the runbook
for the scope and run-list limitation; this does not prove process-crash recovery
or recovery before any run ID is retained.

CI for commit `56adbe96a6783040cc2ed147cf2d1978112729c2` passed in run
`37118227169`, including selected application, agent, shell and Terraform checks.
That result does not establish live staging readiness.
CI for the binding-recovery evidence commit
`b56e10ee156336c6d9f70c507028d14adb332205` also passed in run `37119401426`.

### Current execution evidence

Plan preparation was committed as `7b84525`. At M0 entry on 2026-09-27,
MCP `workspace.list`, `app.list` and `snippet.list` each returned `AUTH_EXPIRED`
(HTTP 401). Earlier successful authentication remains historical evidence.
Official CLI workspace/app inventory succeeds: owner in the intended workspace,
two workflows, and no additional result pages. Its inspected command sitemap
does not expose snippet administration, quota inspection or workflow publication.
No probe resource was created and no provider call was made. After the operator
reimported cookies, MCP workspace listing succeeded. An explicit call to the
bridge's existing refresh function succeeded, rotated the refresh token and
persisted the new cookies. Subsequent MCP workspace and snippet listing succeeded;
the snippet list remains empty. No credential values were emitted. This proves
renewal and reuse of persisted credentials, not long-term session independence or
concurrent refresh safety. Authentication no longer blocks checkpoint 1; live
quota and module capability checks remain pending. CLI needs no new login.

### Deterministic probe results — 2026-09-27

- Created only `issue65-probe-concept-20260927` snippet
  `01a0e2ca-9b30-7849-b94b-624d78ef0ff7` and
  `issue65-probe-control-20260927` app `c8ccbe34-1925-4304-a6d6-929054cf4ab8`.
  Existing Booklet resources were not changed. Both probes are retained.
- Cloud rejected snippet type `workflow` with 422; type `group` succeeded.
  Cloud rejects Start nodes inside snippets, but the pinned bridge's offline
  validator requires a Start/trigger node. The isolated compatibility patch below
  permits snippet execution; this does not establish callable modularity or quota.
- The ordinary workflow uses the sanitized
  [control fixture](fixtures/m0-control-probe.json). Initial draft synchronization
  and execution passed. Draft run `b5342793-b61a-4b7c-a4f0-84468bff7bbf`
  returned `issue65-original`, with three steps and zero tokens.
- A subsequent draft update failed because the bridge automatically includes
  `environment_variables`, which Cloud rejects as an extra field. The follow-up
  run `bdd41f2e-996d-4e6b-8a5b-ae993474ce1a` still returned the original marker;
  it is not evidence of controlled failure or repair.
- MCP publication created version `dd0fe954-4edd-4eab-87ad-2ef0e6da0a9c`.
  Workflow Tool creation returned provider `aa53c887-d037-47a3-9328-55c46e2dcf98`
  with `synced=true`; version listing read back the original graph.
- MCP published execution returned HTTP 405. Official CLI 1.17.1 fallback,
  pinned to that version with HTTP retries disabled, succeeded: run
  `4c76baab-5ca1-492c-9868-3eee9b4fe98a`, marker `issue65-original`, three steps,
  zero tokens. No graph contains a model or image provider node.

### Compatibility correction and recovery proof

The isolated bridge copy uses the original pinned dependencies plus the retained
[patch](fixtures/dify-mcp-issue65.patch) and
[regression tests](fixtures/issue65-compat.test.ts.txt). It omits inherited legacy
`environment_variables` during graph synchronization and validates snippet roots
without requiring a forbidden Start node. Explicit environment edits are not
implemented by this patch. The original installation and registered MCP process
remain unchanged; the probe used a fresh local-stdio MCP subprocess.

Typecheck, 118/118 bridge tests and the stdio smoke test passed. Two independent
reviews of that patch passed before live use. Tests used isolated state, not the
operational credential store.

| Check | Verified evidence (2026-09-27) |
| --- | --- |
| Controlled failure | Run `22aa8686-d06a-40d4-8e3f-3b46c6753775` failed in Code with the deliberate `issue65-controlled-failure` error |
| Repair | Run `b557c1c2-0588-4be2-ba03-2ee76cb1b3eb` returned `issue65-original` |
| Changed publication | Version `9c3098f8-2ae4-4641-860f-fb8a6ee77c2f`; CLI run `e01df149-64ca-4c59-839b-22b044a3911e` returned `issue65-changed` |
| Same-app restoration | MCP restored original version to draft, then published `066d72ca-bad6-4a07-8829-d4bf4f777f4a`; CLI run `0ca02556-0092-46ad-aa6f-b420207cf4c7` returned `issue65-original` |
| Tool synchronization | After each publication, refresh observed `synced=false` before and `synced=true` after; provider ID stayed unchanged |
| Snippet execution | Run `97a30ce1-9bd4-424a-9173-7454ba6ff4bf` returned `issue65-original`; publication succeeded |

All these runs reported zero tokens and used only deterministic nodes. Published
execution used the inspected CLI fallback; MCP published execution still returns
405. The snippet run tool has a separate envelope/SSE defect: normal input returned
422; nested input executed but returned null. Read-only run retrieval proved the
result without rerunning. Do not treat null as failed execution or use this
workaround for provider-bearing runs.

The official [snippet insertion implementation](https://github.com/langgenius/dify/blob/main/web/app/components/workflow/block-selector/snippets/use-insert-snippet.ts)
fetches the published graph, remaps IDs and inserts its nodes into the caller.
This is source evidence of copy-based reuse, not proof of an independently callable
Cloud module. Do not select snippets as runtime specialists on this evidence.

### Read-only Cloud capacity and New Agent inspection

The operator authorized Chrome read-only inspection in this chat. On 2026-09-27,
the intended Sandbox workspace showed Build Apps **3/5**: the two existing workflows
and our control probe. Two slots remain; the existing New Agent manager and snippet
coexist with that meter. No separate New Agent quota was displayed. Do not infer
unlimited agents from this observation. No settings changed or model runs started.

The existing manager exposes separate configuration, version history, API access
and workflow-node references. Its model settings expose a token limit, but no
model-request-count control was found in the inspected configuration/advanced
settings. This does not prove that no other supported control exists.

Official [Agent API documentation](https://docs.dify.ai/en/api-reference/guides/agent)
states a 500-model-request cap per agent run. That bound alone does not satisfy our
120/160/220-request booklet ceilings or per-request reservations. Do not select
New Agents for paid execution until a lower enforceable bound/accounting path is
verified; prompt instructions and post-run usage are insufficient.

Official [Agent node documentation](https://docs.dify.ai/en/cloud/use-dify/nodes/agent)
states that published agent changes reach workflows that invite it, and task-variable
text is truncated at 2,000 characters. Longer context needs file transport. Preserve
the drain-before-publication rule; do not claim pinned-version isolation or pass
full manuscripts through truncated task variables.

This Cloud inspection left layout and runtime bindings unresolved. The Community
evidence above supersedes that target: its diagnostic runtime lookup now passes.
Callback-based interrupted-response recovery also passes. Full-suite
capacity/accounting and full-runner bindings remain pending.
M0 is not complete.

## Entry and consolidated handoff

Apply EXECUTION A. Recheck branch, workspace and current suite capacity. Bounded
non-billable writes to new `issue65-` resources are authorized; see EXECUTION B.
Obtain current-session browser authority if needed, repository publication
authority, and private credential setup together. No paid
probe is needed to pass the deterministic control portion. Provider capability
remains a separate pre-paid readiness check, never inferred from login.

On 2026-09-27, MCP `app.list` succeeded after private cookie import and returned
the existing Story Writer and illustrator. MCP `workspace.list` verifies the
intended Sandbox workspace; `snippet.list` succeeds with no existing snippets.
MCP `workspace.get` returned HTTP 404; use `workspace.list` instead. Cookie import
works; the bridge device-login client returned `unsupported_client`. Do not ask the operator
to repeat a working login because one endpoint is unsupported. Prefer MCP for
each operation, inspected CLI for a gap, and explicitly authorized Chrome control
only as the last resort. Verify each required write/publish/recovery operation;
authenticated inventory alone is insufficient. Reauthenticate only if access
expires or a current check establishes an authentication failure.

The CLI is installed at its documented local location; use the resolved executable,
`help -o json --compact`, then `help <command path> -o json`. Current descriptors
include app import/export/run, but not all Studio publication operations.

## Packaging decision to prove

Codex selects and records the concrete packaging after its capability probes.
Prefer independent modules; use small focused groups only where necessary, never
a single workflow containing all roles. Investigate a small manager, independently editable/testable specialist
modules, a separate illustration workflow, external persona testers and an
independent judge. Preserve Dify-owned instructions and identifiable responsibilities.
The app selects the caller role from persisted operation state, not from agent text.
The manager chooses the eligible task; the app validates and schedules that task.
This preserves Dify creative ownership without an opaque unbounded agent loop.

Use a single bounded workflow invocation per role/action. A provider-bearing
branch contains one provider request, no Agent node loop, and no automatic retry.
Each invocation reloads saved context through Booklet. Simulation branches before
all provider nodes; deterministic Code outputs use the same result envelope.
The three persona branches remain separate from specialist and manager branches.
The judge sees no mutable tools and cannot delegate another action.

First verify current app/module capacity and whether reusable workflow snippets
provide independent editing, invocation, publication, traces and recovery. An
advertised snippet tool is not evidence of those properties or quota treatment.
Prove manager → Concept specialist → tester with deterministic outputs before
expanding. Record the concrete module/app IDs and publication/tool bindings.

Compare separate workflows with verified reusable modules on graph size, isolation,
credentials, call accounting and available capacity. Record the chosen layout and
evidence without another design handoff within the agreed bounds. Return a change
to scope, cost, workspace plan or preservation requirements to the operator.
No workspace upgrade or existing-resource deletion.
Resolve packaging and the exact app-key/invocation map before M1. Existing
Story Writer/illustrator/manager stay unchanged.

### Packaging evidence and decision test

Read-only research on 2026-09-27 found:

- The official [Cloud plan table](https://dify.ai/pricing/dify-cloud) lists five
  apps for Sandbox. CLI inventory returned two Studio workflows. This suggests
  three free app slots if the workspace still uses that entitlement; it does not
  verify the live quota or how New Agents/customized snippets are counted.
- Seventeen new apps would be needed for one manager, thirteen specialists, one
  tester app with three personas, one judge and one illustrator. Do not promise
  that layout fits the currently observed workspace.
- The pinned local bridge source implements customized-snippet draft, test,
  publication, version, trace and restoration operations. Authenticated snippet
  listing now succeeds with no existing snippets. Source inspection
  does not prove Cloud availability or independently callable published modules.

For a candidate reusable module, test these properties with deterministic data:

1. It has its own editable instructions/graph and stable identity.
2. A small caller invokes it without copying its full graph into the caller.
3. Publication selects a known version; updating a draft does not silently change
   an in-flight run or another published caller.
4. Its run/node trace remains linked to the parent operation and reservations.
5. It can be restored without rebuilding every caller; any required rebinding is
   observable and automated.
6. Its actual quota use permits the complete suite, including retained probes.

A copy/paste template alone fails properties 2–3; do not label it an independent
callable module. If independent modules cannot fit, test small focused groups
with separate specialist instructions/tests and record their shared publication
boundary. If neither arrangement fits, ask for a bounded scope/capacity decision.
Do not upgrade the workspace, provision another host, delete existing apps or hide an all-role router in a
prompt dictionary.

## Non-billable control proof

1. Inventory existing apps, New Agents, plugins, provider credential metadata and
   quota through verified interfaces. Do not export secret environment values.
2. Create one `issue65-probe-<date>` workflow within verified capacity. Do not
   create the full suite while packaging remains open. Back up its original
   sanitized DSL and publication identity; private exports stay outside Git.
3. Fetch current Code/HTTP/IF/End defaults. Build Start → Code marker → End. Test
   `original`; inspect node output and run ID. Use distinct End output names.
4. Introduce a controlled Code failure. Capture the failed node and bounded error;
   correct it and rerun. No provider nodes may be reachable.
5. Publish; create/synchronize Workflow as Tool; read back its binding; execute
   published deterministic behavior. Change to `changed`, publish/sync and verify.
6. Restore the saved graph, publish/sync, and prove `original` again. Distinguish
   restoration under the same ID from reconstruction under a new ID.
7. Verify a harmless HTTP callback, non-secret environment binding and a file
   transfer on the intended staging path once M1 makes that path available.
   The deployed diagnostic Booklet callback now passes. It does not prove the
   later experiment-runner callback, non-secret environment edits or file transfer.
   Test binary and base64-response forwarding with fixture bytes up to the planned
   limit. Record the selected Community target's actual request/response/file limits. Do not assume
   Code-node outputs or HTTP responses can carry 20 MiB just because Booklet can.
   An insufficient transport limit needs a verified transfer alternative before M2;
   it is not permission to silently reduce the supported output or run a paid test.
8. Using the proposed Booklet runtime credentials, prove read-only retrieval of
   a deterministic run's status and saved result. Test recovery after a lost
   response using the saved execution ID, without another workflow/provider call.
   Administrative MCP access is not a runtime recovery path. Record the supported
   interface and minimum identifiers; do not assume an app key covers every role
   or endpoint. If unresolved, block dependent runtime recovery, not local fixtures.
9. Keep the resource for M1 unless exact-ID deletion is authorized. Record evidence
   and the tested fallback in the existing canonical Dify capability matrix.

## Lock deployment and runtime prerequisites

Complete the roadmap access matrix with dates/results, including these decisions:

- Use existing MongoDB repositories and AssetStore; no new service. New records
  use `schemaVersion: "2"` where the booklet/artifact contract changes.
- Reuse `DIFY_TOOL_KEY` for callbacks where applicable. Derive the execution-key
  requirements from the selected verified invocation map; do not assume one app key
  executes all apps. Any installation/change of host credentials is a separate
  private setup action, not authorized by the new-resource Dify grant. Preserve
  existing credential values and bindings.
- Add optional suite configuration to `lib/config/env.ts`; require it only for an
  enabled local/staging runner. Master has the additive Community diagnostic-probe
  env schema; it does not yet define the full runner's role bindings.
  Do not require an OpenAI host key for the new execution path.
- Non-secret binding metadata belongs in a small configuration manifest; it is
  evidence/deployment configuration, not an editable agent registry.
- Use staging for Community callbacks. Local unit tests use transport fixtures; local
  app-to-Community calls can run, but Community cannot reach localhost without separately
  approved connectivity. Do not add a tunnel to make local smoke look live.
- Verify GitHub required checks/reviews, merge rights, deployment secret presence,
  and staging Basic Auth access without retrieving unrelated secrets.
- Compare master/staging release lines and settle a tested release-PR merge path
  before a runtime milestone promises unattended deployment.

## Provider readiness before M4/M5

Record actual provider/model IDs from existing bindings, output-token parameter,
token ceiling, timeouts, retry behavior and image-reference support. Defaults to
verify: manager/tester 2,048 output tokens; specialists/judge 8,192; at most 32,000
input text tokens after explicit context selection; no silent truncation of exact
lettering or required references. If the binding cannot enforce a bound, select
a verified bounded invocation before paid execution, with any model change approved.

Image target remains `gpt-image-2`, medium, one PNG, 1536×1536. The existing
illustrator metadata explicitly reports hidden plugin retries; do not reuse it
as proof of one-request accounting. Inspect the pinned plugin. Prefer a verified
zero-retry binding; if unavailable, plan a direct Dify HTTP request with retries
disabled and a private Dify-only provider credential. No direct app provider call.
That fallback requires private credential handoff and a non-billable transport
fixture before paid use. Do not silently add a custom plugin or swap image models.

Official references establish possible interfaces, not workspace readiness:
[Dify HTTP node](https://docs.dify.ai/en/cloud/use-dify/nodes/http-request),
[LLM node](https://docs.dify.ai/en/cloud/use-dify/nodes/llm),
[GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2).

## Deliverables and exit

Deliver sanitized suite skeleton, tested operation matrix, exact deployment/binding
references, first-slice route/schema contract from M1, and a completed access
matrix for M1's next operations. Leave later paid capability checks named and bounded, not falsely
passed. Update later milestone plans with actual identities and tested constraints.

Run document links/whitespace checks, deterministic probe checks and secret scan.
Complete EXECUTION C's two clean reviews, then its authorized documentation PR
cycle. No app deployment just for M0 docs. M0 passes only when the unattended
configuration/repair/publication/restoration path is proved and the runtime recovery
path is verified. Record M1 local, staging and paid readiness separately; missing
staging or paid access does not block independent local preparation.
