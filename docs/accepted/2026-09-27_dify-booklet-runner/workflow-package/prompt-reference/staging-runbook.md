# Unitale staging workflow handoff

## A. Start here and source access

Use this runbook to design, build, document, publish and integrate **Unitale's seven-workflow suite in staging**. It describes future implementation. This documentation task changed no live workflow, application runtime, provider binding or infrastructure. Production promotion is a separate task and approval.

### Source order and pinned reading list

1. Unitale requirements and accepted decisions define the target.
2. Unitale code defines current interfaces.
3. The experiment package provides creative material and verified lessons.
4. Historical operations evidence identifies tested control paths and their limits.

The package baseline below is the verified Real-only reference at `bf03a67ac2dbee8a202cf4f7654096e1adba02a0`. Unitale was inspected at `f269357d302eff53702c8c51d3a26cce900e43f8`. Re-read current Unitale instructions and code before editing; pinned evidence does not override later changes. The implementation issue must link to the published commit containing **this runbook**. Relative links to new fixtures resolve at that same commit.

| Need | Read |
| --- | --- |
| Inventory and provenance | [Package README](https://github.com/karpishe-experiments/agentic-poc/blob/bf03a67ac2dbee8a202cf4f7654096e1adba02a0/docs/accepted/2026-09-27_dify-booklet-runner/workflow-package/README.md) and [manifest](https://github.com/karpishe-experiments/agentic-poc/blob/bf03a67ac2dbee8a202cf4f7654096e1adba02a0/docs/accepted/2026-09-27_dify-booklet-runner/workflow-package/manifest.json) |
| Exact instructions/output schemas | [Prompt index](https://github.com/karpishe-experiments/agentic-poc/blob/bf03a67ac2dbee8a202cf4f7654096e1adba02a0/docs/accepted/2026-09-27_dify-booklet-runner/workflow-package/prompt-reference/README.md) and [catalog](https://github.com/karpishe-experiments/agentic-poc/blob/bf03a67ac2dbee8a202cf4f7654096e1adba02a0/docs/accepted/2026-09-27_dify-booklet-runner/workflow-package/prompt-reference/catalog.json) |
| Data and prompt construction | [Context/contracts](https://github.com/karpishe-experiments/agentic-poc/blob/bf03a67ac2dbee8a202cf4f7654096e1adba02a0/docs/accepted/2026-09-27_dify-booklet-runner/workflow-package/prompt-reference/context-and-contracts.md) and [image assembly](https://github.com/karpishe-experiments/agentic-poc/blob/bf03a67ac2dbee8a202cf4f7654096e1adba02a0/docs/accepted/2026-09-27_dify-booklet-runner/workflow-package/prompt-reference/image-requests.md) |
| Agreed target | [Migration requirements](unitale-migration.md), plus the Unitale implementation issue |
| Unitale scope and checkpoints | [PRD](https://github.com/Uniwares-LTD/unitale/blob/f269357d302eff53702c8c51d3a26cce900e43f8/docs/features/booklet-generation/prd.md) and [delivery plan](https://github.com/Uniwares-LTD/unitale/blob/f269357d302eff53702c8c51d3a26cce900e43f8/docs/features/booklet-generation/implementation-plan.md) |
| Unitale wire/artifact contracts | [Workflow contracts](https://github.com/Uniwares-LTD/unitale/blob/f269357d302eff53702c8c51d3a26cce900e43f8/src/project/booklets/workflow-contracts.ts), [artifact schemas](https://github.com/Uniwares-LTD/unitale/blob/f269357d302eff53702c8c51d3a26cce900e43f8/src/project/booklets/contracts.ts) and [contract guide](https://github.com/Uniwares-LTD/unitale/blob/f269357d302eff53702c8c51d3a26cce900e43f8/docs/features/booklet-generation/contracts.md) |
| Environment-owned Manager | [MCP environment ownership](https://github.com/Uniwares-LTD/unitale/blob/f269357d302eff53702c8c51d3a26cce900e43f8/docs/mcp.md#environment-owned-dify-apps) and [registration checks](https://github.com/Uniwares-LTD/unitale/blob/f269357d302eff53702c8c51d3a26cce900e43f8/src/lib/server/runs/environment-binding.ts) |
| Actual booklet tools | [T17 MCP catalog](https://github.com/Uniwares-LTD/unitale/blob/f269357d302eff53702c8c51d3a26cce900e43f8/docs/mcp.md#unitale-booklet-catalog-t17) and [tool handlers/reviewer binding](https://github.com/Uniwares-LTD/unitale/blob/f269357d302eff53702c8c51d3a26cce900e43f8/src/lib/server/booklets/mcp-tools.ts) |
| Offline versus live proof | [Dify compatibility harness](https://github.com/Uniwares-LTD/unitale/blob/f269357d302eff53702c8c51d3a26cce900e43f8/docs/features/booklet-generation/dify-compatibility.md) |
| Administrative operation | [Community runbook](https://github.com/karpishe-experiments/agentic-poc/blob/bf03a67ac2dbee8a202cf4f7654096e1adba02a0/docs/deployment/dify-community.md#checkpoint-4--developer-control) and [developer setup/authentication](https://github.com/karpishe-experiments/agentic-poc/blob/bf03a67ac2dbee8a202cf4f7654096e1adba02a0/docs/dify-getting-started.md#community-instance-issue-69) |
| Historical control evidence | [M0 publication/composition evidence](https://github.com/karpishe-experiments/agentic-poc/blob/bf03a67ac2dbee8a202cf4f7654096e1adba02a0/docs/accepted/2026-09-27_dify-booklet-runner/M0-readiness.md) and [child-binding lesson](https://github.com/karpishe-experiments/agentic-poc/blob/bf03a67ac2dbee8a202cf4f7654096e1adba02a0/docs/accepted/2026-09-27_dify-booklet-runner/LESSONS-LEARNED.md#published-callers-do-not-pin-child-workflow-tool-bindings) |
| Reconstruct control tooling | [Issue #65 bridge patch](https://github.com/karpishe-experiments/agentic-poc/blob/bf03a67ac2dbee8a202cf4f7654096e1adba02a0/docs/accepted/2026-09-27_dify-booklet-runner/fixtures/dify-mcp-issue65.patch), [regression fixture](https://github.com/karpishe-experiments/agentic-poc/blob/bf03a67ac2dbee8a202cf4f7654096e1adba02a0/docs/accepted/2026-09-27_dify-booklet-runner/fixtures/issue65-compat.test.ts.txt), [Community token patch](fixtures/community-device-token.patch), [device-login fixture](fixtures/community-device-login.test.ts.txt) |

For a fresh session, verify repository access through the configured GitHub connector or Git/gh before relying on these links. Both repositories may require private access. Verify the Community connector is available in that session. Missing repository/workspace access goes to the owning administrator; share credentials only through the approved private channel. A link or a previous agent's login does not grant access.

## B. Tooling and authentication

Use the registered Community local-stdio MCP first. Inspect current schemas. The official `difyctl` CLI is the inspected fallback; inspect `difyctl help -o json --compact` and the selected command descriptor before use. Check the existing installation before installing anything. Follow the pinned developer guide for registration, separate CLI/MCP logins and private cookie handling. Browser control requires its own session authorization.

Start with `auth_status`, `workspace_list`, targeted `app_list`/`app_get` and `plugin_list`. Retain only non-secret host/workspace/resource identities and outcomes, not returned token fragments or credential payloads. Reuse working authentication; do not request login merely because an older guide describes it.

| Credential category | Owner / protected binding | Verification |
| --- | --- | --- |
| Administrative console/management | Workspace operator; private local CLI/MCP state | Correct Community inventory; not a runtime credential |
| Manager workflow execution | Unitale app operator; environment-owned protected Dify connection | Correct owned Manager publication/registration; never reuse a Booklet app key |
| Model/image provider | Workspace provider owner; private Dify binding | Metadata, allowed models and selected adapter capability; paid execution separately approved |
| Unitale MCP | Unitale operator; configured Run client and managed staging MCP provider | Authenticated Unitale connection identity and actual booklet catalog |
| Private Run capability | Automatically injected by Unitale runtime | Parent-only `runContext`; not an operator-managed secret or specialist input |

### Reproducible disposable control-client check

The historical Community runbook mentions an ignored `.tools/dify-mcp-issue65` directory. That path is **not required**. Reconstruct its documented graph-save compatibility from tracked material in a new disposable checkout. A separate small patch covers the historical Community device response's `token` alias and rejects an unusable token instead of reporting `stored=true`.

The verified reconstruction uses upstream `alexjiaguo/dify-mcp` commit `f2e6c7590a44e5b5dbeab358bf8f14b5b9cfef2a`, Node 24.21.0 and its unchanged lockfile SHA-256 `62fbd9c0cc890a055a815a66065d8fa7bd577b4c61f6df91697a1f6ce7b88803`. This is a reconstruction of the named historical compatibility surface, not a claim that every currently advertised connector capability exists in that pinned bridge. The [original security assessment](https://github.com/karpishe-experiments/agentic-poc/blob/bf03a67ac2dbee8a202cf4f7654096e1adba02a0/docs/accepted/2026-09-26_codex-dify-access/runbook.md#security-assessment) remains applicable; do not upgrade dependencies or run audit fixes as part of this recipe.

From a source-reference repository checkout at the runbook commit linked by the issue, run this **credential-free** PowerShell verification. It installs locked dependencies only in the new disposable checkout. It neither registers a connector nor changes an operational installation. Inspect the source and patch before any later operational use.

```powershell
$referenceRoot = (Resolve-Path '.').Path
$referencePackage = Join-Path $referenceRoot 'docs/accepted/2026-09-27_dify-booklet-runner/workflow-package'
$legacyFixtures = Join-Path $referenceRoot 'docs/accepted/2026-09-27_dify-booklet-runner/fixtures'
$trialRoot = Join-Path ([IO.Path]::GetTempPath()) ('unitale-dify-check-' + [guid]::NewGuid().ToString('N'))
$trialBridge = Join-Path $trialRoot 'bridge'
$bridgePin = 'f2e6c7590a44e5b5dbeab358bf8f14b5b9cfef2a'
New-Item -ItemType Directory -Path $trialRoot | Out-Null
git clone --no-checkout https://github.com/alexjiaguo/dify-mcp.git $trialBridge
if ($LASTEXITCODE -ne 0) { throw 'Clone failed; inspect the disposable directory.' }
git -C $trialBridge checkout --detach $bridgePin
if ($LASTEXITCODE -ne 0) { throw 'Pinned checkout failed.' }
$lockHash = (Get-FileHash (Join-Path $trialBridge 'package-lock.json') -Algorithm SHA256).Hash.ToLowerInvariant()
if ($lockHash -ne '62fbd9c0cc890a055a815a66065d8fa7bd577b4c61f6df91697a1f6ce7b88803') { throw 'Lockfile mismatch.' }
$graphPatch = Join-Path $legacyFixtures 'dify-mcp-issue65.patch'
$tokenPatch = Join-Path $referencePackage 'prompt-reference/fixtures/community-device-token.patch'
foreach ($patchFile in @($graphPatch, $tokenPatch)) {
  git -C $trialBridge apply --check $patchFile
  if ($LASTEXITCODE -ne 0) { throw 'Patch check failed; do not force it.' }
  git -C $trialBridge apply $patchFile
  if ($LASTEXITCODE -ne 0) { throw 'Patch application failed.' }
}
Copy-Item -LiteralPath (Join-Path $legacyFixtures 'issue65-compat.test.ts.txt') -Destination (Join-Path $trialBridge 'test/issue65-compat.test.ts')
Copy-Item -LiteralPath (Join-Path $referencePackage 'prompt-reference/fixtures/community-device-login.test.ts.txt') -Destination (Join-Path $trialBridge 'test/community-device-login.test.ts')
npm.cmd --prefix $trialBridge ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Locked dependency install failed.' }
$previousVerificationHome = $env:DIFYWF_HOME
try {
  $env:DIFYWF_HOME = Join-Path $trialRoot 'empty-state'
  New-Item -ItemType Directory -Path $env:DIFYWF_HOME | Out-Null
  npm.cmd --prefix $trialBridge run typecheck
  if ($LASTEXITCODE -ne 0) { throw 'Bridge typecheck failed.' }
  npm.cmd --prefix $trialBridge test
  if ($LASTEXITCODE -ne 0) { throw 'Credential-free bridge tests failed.' }
} finally {
  if ($null -eq $previousVerificationHome) { Remove-Item Env:DIFYWF_HOME -ErrorAction SilentlyContinue }
  else { $env:DIFYWF_HOME = $previousVerificationHome }
}
```

Verified on 2026-11-08 in a fresh pinned checkout: both patches apply, typecheck passes and **124 tests pass**, including six mocked device-login cases. The tests do not authenticate to Dify or establish write access. Keep the disposable source for inspection; no deletion or operational installation is part of the recipe. Do not redirect this client to another person's credential store.

For actual graph saves, prefer the current registered MCP when its inspected schema and target-specific validation work. Read the fresh draft/hash; use a dry-run where supported. The historical patch omits inherited environment fields during graph edits and preserves feature/conversation metadata. Its offline tests do not prove compatibility with another server release. Use verified CLI descriptors if needed; never guess Console endpoints.

## C. Unitale runtime prerequisites

Read-only inventory on 2026-11-08 identified Community host `https://dify.uniwares.co.uk`, workspace `ffac910f-2786-490e-90d8-07243d49741b`, and existing `Unitale [staging]` app `f2cc8045-0814-4ed5-8302-b09ecb3d0ebe`. These identify observations, not a selected replacement target or proof of runtime ownership. Preserve the existing app unless the implementation explicitly selects an authorized change.

Before Manager registration, verify Unitale's actual staging project/environment/origin and the supported environment-owned creation/import journal. Match the recorded app identity, environment name/tag and managed MCP provider; names/tags alone do not confer ownership. Follow Unitale's environment-owned app procedure rather than creating an unrelated console app and assuming registration can adopt it.

The Manager's Unitale MCP client needs `extension:booklets:read` and `extension:booklets:write`. The setup identity probe additionally requires `server:read`. Confirm authenticated `get_connection_info_v1` identity, the intended staging endpoint and all required T17 `booklet_*_v1` tools. Generic demo/read-only MCP tools are insufficient. Keep `runContext` injected only into the active owned Manager Run. Children receive explicit creative context and results, never private capability or app credentials.

Provision the server-owned `bookletWorkflowPolicies` reviewer binding for the execution-profile revision and Manager configuration revision. Verify trusted reviewer publication and execution measurements; `record_evidence` diagnostics cannot manufacture measurement or quality authority. Follow the current handlers/contracts if they change during implementation.

Child app IDs, publication IDs, Workflow Tool IDs and effective bindings belong in the suite manifest. Unitale does not directly register children in the app dispatcher; do not invent per-child application import-journal requirements. Credential values and protected originals stay outside Git. Missing prerequisites identify an owner and block only their dependent work.

## D. Provider and adapter compatibility gate

**Installed experiment plugins are reference dependencies, not verified Unitale adapters.** Read-only inventory found text `langgenius/openai:1.0.7-dev7` and image `langgenius/openai_tool:0.2.2-dev3` with the exact identities in the existing manifest. Installation does not prove model entitlement, target compatibility or spending authority.

The [image dev3 source](https://github.com/karpishe-experiments/agentic-poc/blob/bf03a67ac2dbee8a202cf4f7654096e1adba02a0/docs/accepted/2026-09-27_dify-booklet-runner/dify/m5-openai-image-bounded.py) hardcodes `BOOKLET_CALLBACK_ORIGIN=https://booklet-staging.uniwares.co.uk` and calls Booklet's image-evidence/upload endpoints. The [text adapter source](https://github.com/karpishe-experiments/agentic-poc/blob/bf03a67ac2dbee8a202cf4f7654096e1adba02a0/docs/accepted/2026-09-27_dify-booklet-runner/dify/m5-openai-bounded.py) consumes Booklet prepared-request carriers. Do not import either unchanged as the Unitale execution contract or modify the installed shared packages as an implicit part of suite authoring.

At the design checkpoint, select a supported Dify provider/tool path or, only if required, a narrow Unitale-compatible adapter. Record its identity, contract and proof in Unitale's implementation plan. It must construct creative requests in Dify, return original file/image evidence through Manager, support bounded execution/trusted measurements and make no hidden specialist-to-app calls. It must not depend on Booklet callbacks, app-owned creative prompts or child access to private Run context. Prefer existing capabilities that satisfy these requirements; do not introduce a general provider framework.

## E. Build and staging publication sequence

The following are future implementation steps, subject to the Unitale session's explicit publication/live-test authority:

1. Reconcile current Unitale contracts with the seven-role target and select the compatible provider path.
2. Inspect defaults/schemas and prove required child invocation, structured outputs, native files, Human Input and bounded control flow.
3. Build specialists, Image Executor Prepare/Generate and independent Reviewer. Keep all app interaction in Manager.
4. Validate and publish each selected staging child; read back its publication ID and graph/configuration.
5. Create/refresh Workflow Tools where used; verify synchronization and effective child publication bindings.
6. Compose and publish Manager against those bindings. Record the exact dependency set.
7. Register the environment-owned Manager using Unitale's supported process, then verify its runtime/profile/reviewer/provider bindings.
8. Export secret-free published snapshots and compare them to publications; native export may represent a draft.
9. Update Unitale's manifest, READMEs, operating instructions and focused verification evidence.
10. Run bounded staging acceptance only after approval of the exact provider configuration and finite spending cap.

**Pinning Manager does not transitively pin child Workflow Tools.** Synchronizing a child can change an already published caller's effective behavior. Recheck the affected Manager and record the actual child/tool bindings after updates. Preserve old accepted/in-flight identities; plan publication at an appropriate idle boundary rather than assuming version isolation. Do not build a new deployment framework.

## F. Verification and recovery

| Gate | Required evidence | Does not prove |
| --- | --- | --- |
| Offline reference/contracts | Graph parity, prompt/schema hashes, links and focused Unitale compatibility tests | Dify engine behavior |
| Administrative read | Correct host/workspace, app/publication and plugin metadata | Write permission or runtime ownership |
| Safe import/save/publish | Target-specific dry-run/readback, exact app/version and tool-sync result | Nested execution or paid success |
| Runtime registration | Unitale environment/import journal, authenticated managed MCP identity, parent permissions and trusted reviewer binding | End-to-end quality |
| Composition | Actual child calls, same-parent Human Input resume, native file ordering, bounded termination and measured identities | Unseen scenarios or total suite quality |
| Paid staging acceptance | Approved finite budget plus creation, revision, preflight/output/whole-book checks and attributable measurements | Production readiness |

Unitale's offline command is `npm.cmd run test:booklet-compat`; follow its compatibility guide for scope and current expected results. Add focused tests for the implementation changes, not credentials to make an offline test pass. Keep the package's recorded 18-graph/48-selector validations separate from the new seven-workflow proofs.

| Situation | Resume rule |
| --- | --- |
| Missing source/connector access | Report the repository/workspace owner and required access; continue independent design work |
| Missing/foreign runtime binding | Repair through the owning Unitale setup procedure; do not bypass ownership checks |
| Stale child tool | Inspect publication and sync state, then update only the authorized binding and reverify the affected Manager |
| Unknown import/save/publish response | Inspect actual app/draft/version/journal before retry; do not create duplicates |
| Human Input or transport interruption | Inspect existing parent Run and decision identity; resume the same work where supported |
| Unknown paid outcome | Reconcile recorded operation/provider evidence; do not blindly regenerate |
| Storage failure after generation | Reuse retained original bytes and idempotent persistence steps |
| Unresolved quality or exhausted corrections | Pause with findings and resolution path; preserve accepted sources and outputs |

Production promotion, infrastructure changes, credential rotation and broad recovery exercises are outside this staging handoff. No access or authority transfers automatically between sessions.

### Copyable Unitale-agent handoff prompt

```text
Work in the canonical Uniwares-LTD/unitale repository on the approved Dify-suite issue supplied with this handoff. Read the issue and its commit-pinned staging runbook/reference package before planning changes.

Read your own AGENTS.md, Handbook baseline and current canonical booklet PRD, implementation plan, contracts, MCP/environment ownership guidance and compatibility guide. Compare current code with the pinned evidence; preserve later changes.

Verify access to both private repositories and the intended Community connector through read-only checks. Treat the existing staging app as inventory evidence until Unitale ownership/setup proves the actual target. Use the runbook's reproducible source/tool routes; do not depend on the previous agent's ignored files or credentials.

Produce a bounded implementation design before editing. Reconcile the existing T18-T20 work and seven agreed roles. Select a Unitale-compatible provider path: the Booklet adapters are not drop-ins. All creative templates/request construction belong in Dify specialists; all app communication, including plugin-internal callbacks, must pass through Manager. Unitale keeps persistence, authenticated human decisions, product guards and trusted measurements.

Preserve independent quality review, mandatory exact-request image preflight, targeted corrections and Dify-configurable defaults of three LLM corrections and one image correction. Keep serial bounded orchestration and minimal runtime integration; defer the listed optional capabilities.

Continue through authorized checkpoints with focused checks and required read-only reviews. Publish/read back children and tools before Manager, verify effective child bindings and register only the environment-owned staging Manager. Export/document the actual published suite and record evidence.

Stop only dependent work for missing access, unresolved compatibility or an approval gate; name the owner, next action and evidence needed. Obtain session authority for Dify writes/publication and exact provider configuration/finite spending before live work. Do not infer production, deployment or paid-call authority from this prompt or prior-session access.
```
