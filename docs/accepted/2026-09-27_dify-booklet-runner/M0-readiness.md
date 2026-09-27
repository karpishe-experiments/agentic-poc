# M0 — Access, configuration and executable control

**State:** Planned; CLI inventory and MCP app/workspace/snippet listing are verified.
Configuration/publication/recovery probes remain unverified.
**Coverage:** AC08, AC13 and first-slice readiness.
**Read first:** [EXECUTION.md](EXECUTION.md), [PRD.md](PRD.md),
[Dify access runbook](../2026-09-26_codex-dify-access/runbook.md).

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
Do not upgrade, self-host, delete existing apps or hide an all-role router in a
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
   M0's initial proof can use a disposable deterministic endpoint; it must not
   claim the later Booklet callback has already passed.
   Test binary and base64-response forwarding with fixture bytes up to the planned
   limit. Record Dify Cloud's actual request/response/file limits. Do not assume
   Code-node outputs or HTTP responses can carry 20 MiB just because Booklet can.
   An insufficient Cloud limit needs a verified transfer alternative before M2;
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
  enabled local/staging runner. Existing master has no Dify runtime env schema.
  Do not require an OpenAI host key for the new execution path.
- Non-secret binding metadata belongs in a small configuration manifest; it is
  evidence/deployment configuration, not an editable agent registry.
- Use staging for Cloud callbacks. Local unit tests use transport fixtures; local
  app-to-Cloud calls can run, but Cloud cannot reach localhost without separately
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
