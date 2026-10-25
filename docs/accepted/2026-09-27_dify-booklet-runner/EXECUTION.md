# Shared milestone execution procedure

## Supported recovery scope amendment - 2026-10-18

The user authorized implementing supported staging recovery before further paid
M4 work. This narrowly adds candidate-image reconciliation and expired-deployment
recovery through the existing protected workflow and dispatcher. It supersedes
the no-new-host-action restriction for these two actions only. It does not add
automatic provider retries, paid probes, infrastructure campaigns or production
changes. Preserve all original deadlines, failures, assets and campaign charges.
The [M4 recovery record](M4-balanced.md#supported-recovery-follow-up---2026-10-18)
owns current implementation and verification status.

Applies to M0–M6. [PRD.md](PRD.md) is the product contract; [PLAN.md](PLAN.md)
is the roadmap. Read this file and the selected milestone, not a second competing
implementation plan. Target staging only; no production promotion.

## Status and change surface

### Efficiency follow-up ? 2026-10-13

The operator approved the bounded execution cleanup before Balanced: preserve
manager/specialist roles and J01?J13; reduce repeated scheduling/history reads,
assembly, delegation decisions and reference-byte reads. Preserve current grants,
source/approval checks, reservations, deadlines, uncertain outcomes and saved data.
The [efficiency record](M4-balanced.md#execution-efficiency-follow-up--2026-10-13)
owns measurements and validation. Existing reviewed staging delivery is authorized.
After publication/deployment, the operator additionally requested one new Simulated
Kid performance run: verify completion and compare it with the saved Kid baseline.
This supersedes the no-new-persona-run restriction only for that comparison run;
it does not reopen M3 acceptance or authorize Balanced/Real calls.


### M3 experiment-only scope

The operator approved this scope correction on 2026-10-13. It supersedes earlier
M3 infrastructure-probe requirements throughout this package.

M3 validates Booklet application behavior and controlled Dify workflow logic.
Infrastructure resilience, forced container restarts, deployment fault injection,
backup/restore rehearsal and host-controller automation are outside its acceptance
scope. Do not add these as prerequisites. A proposed correction or test must
identify the Booklet/persona behavior it protects and use the smallest sufficient
verification. An observed external dependency failure is a blocker to report,
not authorization to expand this experiment into infrastructure engineering.

M3 completed on 2026-10-13: reuse its deployed release, restored eighteen bindings
and saved Kid, Parent 3/3 and Creator initial acceptance. The stopped probe is
resolved; do not repeat reconciliation, binding restoration or persona runs.
The unstarted deadline probe and additional live restart-during-cancellation
requirement are cancelled. The [current M3 exit record](M3-completion.md#persona-exit-evidence)
is authoritative. That M3 handoff authorized M4 readiness planning only. The later
M4 continuation below authorizes non-billable implementation; paid execution remains
unapproved.
Keep existing recovery code, historical evidence, data, source/approval checks,
request limits and zero-payable-call requirements. Timing is diagnostic.

For documentation, check consistency, links and whitespace. For an application or
Dify correction, run relevant units and only necessary focused integration or
workflow fixtures; reuse unchanged passes. Keep timeout/stop/interruption boundary
checks local with fake dependencies and injected clocks. Required lean CI and
publication reviews still apply to changed candidates. Do not repeat broad suites,
infrastructure shell suites or container builds for unchanged infrastructure.
Do not redeploy unchanged application code or introduce another manual script.

This package governs implementation and records verified milestone outcomes.
Expected changes are the new Dify suite, normal Booklet contracts and
services, a small runner UI, focused tests and operating evidence. Keep the
existing MongoDB, asset store, deployment system and access gate. No PDF, new
queue service, custom agent editor, account system or infrastructure platform.

Inspected baseline on 2026-09-27:

- Issue branch: `agent/issue-65-dify-booklet-runner`, tracking its exact origin
  counterpart; draft PR #68 targets `master`.
- Remote master: `3e16b41f9f7ceb47b0df6fc67ee7c814e57a17f8`.
- Remote staging: `612297bcbb695b7189ad2824d98493a8c4bcf333`; it contains trial
  changes absent from master. Do not assume staging equals master.
- CLI inventory confirms owner access to workspace
  `98c18fae-e555-47f7-9869-5d602a3dca04`. After private cookie import, MCP
  `app.list` succeeded and returned `booklet_illustrator` and `story_writer`.
  MCP `workspace.list` also verified the intended Sandbox workspace; `snippet.list`
  succeeded with no existing snippets. `workspace.get` returned HTTP 404; use the
  working list operation. This was the planning baseline; subsequent deterministic
  write/publication/restoration results are recorded in [M0](M0-readiness.md).
  Authentication does not prove capacity, runtime recovery or provider access.
- Current code has eight artifact types, local runtime-agent seeds, and a
  sequential in-process job runner. These are transition work, not new-suite proof.
- The staging reset script deletes the entire configured staging asset bucket,
  not just experiment objects. Its exact target must be approved before use.

Recheck these facts at entry. Never copy credential values into this file.

Current target after issue #69: Community at `https://dify.uniwares.co.uk`,
workspace `ffac910f-2786-490e-90d8-07243d49741b`, with separate MCP/CLI sessions.
The Cloud facts above remain historical. Use [M0](M0-readiness.md) for current
probe identifiers and the [Community runbook](../../deployment/dify-community.md)
for access limitations and platform readiness. Community adoption does not grant
paid execution, staging deployment, resets or deletion of Cloud resources.

## A. Entry gate — revise before implementing

Track three readiness states separately:

- **Local implementation:** sufficient contracts and fixtures for the slice.
- **Unattended staging verification:** required access, bindings, release authority
  and setup are verified.
- **Paid acceptance:** models, accounting, limits and finite campaign authority
  are verified in addition to the staging prerequisites.

A later readiness state is not a prerequisite for independent earlier work.

1. Read current PRD, selected milestone, predecessor exit evidence and actual
   code. Fetch remote refs; inspect branch/upstream, worktree and open PRs.
   Preserve unrelated work. Keep all issue corrections on the same issue branch.
2. Compare planned interfaces and Dify bindings with the completed predecessor.
   Revise this milestone's file now: record reused code, changed assumptions,
   tests and release scope. Do not silently change product requirements.
3. Identify every dependency needed for this milestone's exit. Verify each before
   its dependent operation, not before unrelated local implementation. Record
   `verified`, `not needed`, or `handoff required`, with dated evidence.
4. Resolve discoverable IDs/settings through repository, MCP or inspected CLI
   descriptors. Record manual actions only in the readiness register in B; milestone
   files retain technical evidence and link to that register. Send one consolidated handoff listing
   exact target, reason, private-entry location, requested authorization and
   how Codex will verify success. Never ask for secrets in chat.
5. If an essential handoff remains, pause the dependent operation. Independent
   implementation and simulated tests within existing authority may continue.
   Do not claim the milestone ready for unattended completion or promise an unattended
   milestone with an unresolved login, provider, reset or release gate.
6. Record the ready contract: code baseline, Dify publication IDs, target database
   and storage, test cases, authorized operations and bounds. Then execute through
   the exit without routine operator clicks. Reopen the gate only for changed
   scope, revoked/expired access or a newly discovered external blocker.

## Sol Low execution packages

Use GPT-6 Astra/high to resolve consequential unknowns and prepare the next
bounded slice. Use GPT-6 Sol/low for implementation and straightforward fixes.
Prepare each package inside its existing milestone file after the required
predecessor evidence is available; do not create another plan hierarchy.

Each runnable slice uses this compact format:

| Field | Required content |
| --- | --- |
| Goal and components | One observable result, exact affected components and existing services to reuse |
| Contract and examples | Concrete input/output fixtures, persisted before/after states and relevant error outcomes |
| Ordered edits | Implementation order with a runnable verification point; resolve consequential choices before handoff |
| Verification | Exact focused commands, required setup and expected results |
| Completion and escalation | Evidence needed to finish; unresolved dependencies and conditions requiring design review |

Link shared requirements instead of copying the PRD. Mark an unverified binding
or capability pending; do not invent it to make a package appear complete.
Prepare detailed M1 slices from M0 results. Independent local slices can proceed
with explicit fixtures while their staging bindings remain pending.

Sol/low runs the focused checks and corrects straightforward failures. Escalate
to Sol/medium when diagnosis remains unclear after a focused reproduction and
one evidence-based correction. Use Astra/high when a fix changes a contract or
architecture, or a required Dify capability is unavailable. Record the resolved
decision in the same package before dependent implementation continues.
Use Astra/high for the two independent reviews required by section C. Model
selection does not change operation authority, request limits or acceptance.

## B. Authorization register

This is the canonical **readiness and manual-handoff register** for M0–M6.
Technical access is not authority. Record verification and permission separately;
never infer a grant from a working login. These are the latest recorded results,
not fresh live checks. Recheck the required row before dependent execution.

**Current M4 execution authority - 2026-10-22:** The user approved PR #224 at
`0025c1ee86de8fbd9bea8f9531953d05fa19794f` and PR #225 at
`6c985bb6805f3ed1a806d5d201cd17630efd3afc`, with staging merge/deployment only
after the exact retained count failure is safely recovered. PR #224 merged at
`277abc3ce3fa0c77c4dd1870b2b523ee315deb8e`. The existing
maintenance command is the necessary private operator checkpoint to quiesce
observation before preview. It closes admission only; the supported recovery
workflow still owns backup, exact reconciliation and separate delivery. No new
host entrypoint, saved-output repair or provider replay is authorized. **Maintenance
handoff verified:** the operator invoked the existing
`scripts/deployment-control.ts enable recovery` through the selected staging
container under the host lock. Inspection `39744110026` verified closed admission,
zero active/interrupted owners and only the exact target blockers. Two application
readbacks retained revision 2967. Provider dev3 installation still requires
its bounded signature window and restoration before Kid continuation.
Recovery preview `39744440897` then stopped before apply at
`snapshot.experiment_operations` with `OperationBudgetExpired`; admission remains
closed at that checkpoint. Package reassessment identified the inherited full-history
snapshot as outside the target-only recovery contract. The scoped correction was
verified and reviewed before the subsequent preview; no timeout increase or replay.
**Recovery completed:** reviewed PR #226 merged at
`ea484d3d74d8821a71588b439db87e7f2ea3ddd4`; source/staging CI and both pairs of
reviews passed. Supported preview `39751711628` and apply `39752108906` completed
the exact count-failure closure with verified backup
`staging-recovery-issue65-kid-count-recovery-20261022-v2`. Readback is revision 2968,
active operation null, failed operation resolved and counters/history preserved.
Only then did guarded PR #225 merge at `4236375426466d9e4c3419cdde9ef9d8384f8259`.
Normal Deploy `39753524655` reached its observer wait limit; status `39754842442`
verified the original host request complete and archived without replay. Release
`4236375426466d9e4c3419cdde9ef9d8384f8259` uses image
`sha256:43d9e5c7676d3bc5e898b14d315445f31ab501a72df50ce94e3771fdaf69eef5`.
Read-only Check `39755106127` passed. The provider's existing signature-window
handoff is ready and awaiting the operator; no host operation remains running.
Use the existing reviewed `issue65_m4_signature_policy` function for preview and
apply to false, install the exact reviewed dev3 package with action-time
confirmation, then restore true. Do not repeat the completed Booklet maintenance
command. No paid work may resume before restored verification and application
preflight. No new secret, credential copy or OpenAI-key transfer is needed.

**Retained M4 execution authority - 2026-10-20:** The user approved the conditional
USD 5 campaign and its delivery, then exact same-run continuations and supported
recovery. The latest exact grant covers Kid manager operation
`bf1c9dd8-781c-4307-868b-45d566b7b58e`, retained execution
`97422092-2627-46e2-bb7f-9d4b26dbb270`, through reviewed preview/apply, normal staging
delivery and explicit Resume. It permits no provider replay, output edit, new run,
successor or budget increase. J11 is already saved and must not be reconciled again.
The [current M4 record](M4-balanced.md#current-execution-record---2026-10-21)
owns progress and remaining gates. Existing protected credentials are reused.

**Original M4 decision status - 2026-10-13 (superseded for execution authority):** The user selected Luna for manager,
specialists and testers, Sol for the independent judge, and a USD 5 incremental
text-campaign ceiling. The [M4 contract](M4-balanced.md#selected-policy-and-implementation-contract---2026-10-13)
owns exact reasoning, tokens, prices, accounting and three-run/no-successor limits.
The later continuation authorizes non-billable Balanced implementation and
reviewed publication. Paid execution still needs a later instruction. Final paid
execution requires explicit approval after technical readiness, without reopening
unchanged model/budget preferences. The user reports the OpenAI key entered in
Community Dify; provider/model metadata is observed, not paid execution proof.
No key retrieval, copy or re-entry is needed. The exact-package audit on 2026-10-14
verified source identity and reproduced SDK retries/default timeouts; corrections
and provider-usage provenance remain technical gates. See M4's audit. No new
credential path is introduced. The separately approved dev1 installation and
signature restoration are complete; an updated package needs its own bounded
installation checkpoint.
M5 targets Image 2.5 Sunburst, with separate settings/permissions/spending readiness.

Current M3 recovery status is in [M3 current progress](M3-completion.md#current-progress-and-blockers--2026-10-13).
Existing eighteen bindings and encrypted private setup remain valid; do not ask
for their keys again. Dispatcher synchronization and legacy bootstrap for request
`38149230374-1` are complete; do not repeat them. On 2026-10-13 the operator approved
one delivery exception: execute PR #186's reviewed reconciliation code once for
run `69e23447-d75f-4444-8263-91eb8c269dff`, operation
`b0b0829d-b1ef-43e5-9543-5c33502f2cc7`, after a verified backup and fresh terminal,
deadline, stop-intent and callback-claim checks. Retain reservations and history.
This permits a temporary operator execution, not a permanent host action or repair
script. The restricted dispatcher has no action for this exact code execution;
the private VPS root-terminal execution completed with verified backup
`staging-stopped-probe-20261013T090710Z-2622181`. Diagnostics `38374753642` confirms
the operation failed definitively, lifecycle resolved, active pointer cleared and
accounting retained. Do not repeat the exception. PR #187 merge and its staging
deployment were explicitly approved; browser control of Booklet staging for
preflight and remaining persona acceptance was also approved in this chat.
No new credential or
spending approval is needed for the authorized model-free scope.

The approved persona sequence was Parent 3/3 only, then Creator after Parent
success, with at most three Creator runs. Parent and Creator initial acceptance
both passed; no further persona run is needed. Subsequent instructions authorize
M4 readiness work, the local non-billable provider correction and, through the latest
continuation, the accepted non-billable application implementation slices. The local
policy/campaign foundation does not enable Balanced execution. The bounded Dify
browser grant covers policy/consumer inspection and reviewed installation. The
user subsequently selected the existing plugin path and permitted an experiment
signature exception. The reviewed package is installed, stored-key presence is
preserved, and signature verification is restored. The
[current provider delivery checkpoint](M4-balanced.md#current-delivery-record---2026-10-15)
records the earlier provider delivery. The current [M4 checkpoint](M4-balanced.md#current-creator-admission-checkpoint) records verified dev4 installation, restored signature verification, eighteen bindings and staging readiness. The user granted the conditional USD 5 campaign on 2026-10-16 with an assumed count fee and unresolved entitlement disclosure; this remains an allowance bound, not an invoice guarantee. Kid and Parent now retain completed generation/accounting with failed advisory evaluation. The initial Creator was admitted under the approved 60-second creation budget and new-key permission, then stopped at J09. The reviewed repair and exact continuation passed on 2026-10-25. Creator continued past the retained first-J12 input-limit failure after the authorized compact-reviewer repair, independent reviews and staging checks. Four Page Bibles are approved. A new J12 preparation failure stopped the campaign; the exact operation `26606176-6380-4dab-ac59-c903e90bf3f7` grant passed reviews, CI and staging readiness. Normal continuation was acknowledged once at 10:03:03 UTC; a new J12 preparation failure then stopped it again, without dispatch or reservation. No new continuation has been sent. Preserve all cumulative limits, original evidence and failed reports. No automatic retry, replacement persona, budget reset or M5 execution is granted.

Parent campaign deployment readiness was verified on 2026-10-11: staging release
`5cf84ecc263847a8583c1e3623153151149306e8`, Deploy `38135107485` and Check
`38135733238` passed. The [M3 amendment](M3-completion.md#parent-campaign-amendment--2026-10-11)
records the reviewed candidate and confirmed Parent contract. Reuse this entry
evidence unless its relevant release/configuration inputs change.

| Dependency / exact target | Technical status and evidence | Private reference / location (no values) | Required action / authority | Blocks / verification |
| --- | --- | --- | --- | --- |
| Community control: `https://dify.uniwares.co.uk`, workspace `ffac910f-2786-490e-90d8-07243d49741b` | MCP/CLI inventory and deterministic control passed; [M0](M0-readiness.md) | Separate Community CLI profile and local `DifyWf-Community-Codex` state; [access guide](../../dify-getting-started.md) | Private login only for an expired/failing interface. New `issue65-` model-free writes/publication/restoration granted in this chat on 2026-09-27; preserve existing Booklet resources, credentials and plan | Dependent Dify control; verify exact workspace with inventory, publication/read-back and applicable tool sync |
| Runner app/callback bindings: issue #65 Community apps and Booklet staging | Eighteen active publication IDs and graph hashes were read back on 2026-10-06. Corrected staging activation [37490374204](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37490374204) passed with backup `staging-20261006T154826Z-b370e46222477157`; full-suite acceptance remains pending | Prepared `issue65-m3-j13-bindings.dpapi.xml` and protected `DIFY_BOOKLET_RUNNER_SETTINGS_JSON`; existing callback secret `BOOKLET_TOOL_KEY` in Dify | Private preparation and activation are complete. Do not repeat key entry. Preserve prior encrypted settings and failed runs | Full-suite acceptance; verify authenticated runtime/callback behavior, exact active publication IDs and saved outputs. None of the eighteen active publications has a Workflow Tool binding |
| Image transport/accounting: selected Community image workflow | Local ordered transport/recovery candidate exists; live runtime ownership, size and provider reference/accounting proof pending; [M3 entry gate](M3-completion.md#entry-gate) | Existing image app binding; provider credentials inside Dify only | Resolve model-free capabilities first; privately configure only missing approved provider binding | Dependent final-page/Real execution; verify order/digests, runtime access, output recovery, retries and pre-call reservations |
| Data/assets: staging `kids_booklet` and `kids-booklet-staging-assets` | Saved M1/M2 artifacts and byte retrieval passed; [M1](M1-runner.md), [M2](M2-references.md) | Existing protected staging DB/storage configuration | Reuse access; private repair only if required checks fail. No production data or credentials | Dependent persistence/storage; verify current readiness and original-byte retrieval without destructive changes |
| GitHub/release: issue branch → `master`, reviewed staging delivery | Prior release/CI/deploy/check evidence in [M1](M1-runner.md), [M2](M2-references.md); candidate checks still required | Existing GitHub CLI/MCP session and protected deployment access | Runner merge/staging deployment granted on 2026-10-04 in this chat after required review/CI. Preserve Cloud/production; exclude resets, paid calls, credential entry and existing Dify-resource changes | Release only; verify exact PR SHA/checks, required human reviews, deploy digest and staging Check |
| Staging delivery exception: `agent/issue-65-community-probe-staging` | Selective delivery used; [M1](M1-runner.md), [M2](M2-references.md) | Same GitHub/deployment access | Granted on 2026-10-04 for selective reviewed runner commits; main implementation/corrections stay on issue branch; no unrelated imports | Staging delivery; inspect complete release diff and required CI/reviews |
| Browser control: read-only Dify capacity/New Agent inspection and runner UI | Prior browser evidence in [M0](M0-readiness.md), [M1](M1-runner.md) | Private browser login; no cookie values in evidence | Runner UI verification granted on 2026-10-04 in this chat. Dify edits/credential entry require their separate authority; authorization does not carry to another chat | Browser verification only; inspect allowed UI flows and retain sanitized evidence |
| Reset: staging `kids_booklet` and entire `kids-booklet-staging-assets` bucket | Granted/executed 2026-10-04; Reset `37216104737`, Check `37216248316`; backup/targets in [M1](M1-runner.md#current-staging-transition-evidence) | Protected staging configuration and retained private backup | No further reset needed merely for a milestone. A new reset needs exact-target authorization, backup and evidence preservation; local/prod/Dify resources excluded | Only a necessary clean-baseline transition; verify inventory, backup, target isolation and post-reset Check |
| Historical staging reconciliation: operations `1625178b…`, `419fc51a…`, `8e4c482c…`, `0213da53…`; item `9ab7d95a…`, job `575b5f2e…` | Exact IDs and evidence in [M3](M3-completion.md). Approved repair passed on 2026-10-07 with verified backup `staging-approved-reconciliation-20261007T083649Z-4008958`, 56 assets, normal maintenance-idle check and healthy restart. Retained deployment resume `37595520504` and Check `37596067024` passed | Existing protected staging runtime credentials and recovery bucket; no new keys | Exact bounded reconciliation and retained deployment resume approved in this chat; both complete. Preserve failed runs/results/assets, Cloud and production; no reset or replay | No remaining manual action for this repair. Prevention release and linked successor acceptance remain separate M3 checkpoints |
| Simulated latency and async correction: issue #65 staging runner | [Current M3 evidence](M3-completion.md#automated-diagnostic-candidate): Kid `fd21423e…` completed generation/evaluation without repair, with 47 text calls, 9 images and zero payable calls. Same-operation restart recovery passed after 43.809 seconds. Diagnostics `38132946615` missed the earlier timing gate; retain these measurements | Existing eighteen protected bindings and callback key; encrypted normal settings and probe credentials remain in the existing private Windows profile. No new keys needed | On 2026-10-11 the user made timing targets diagnostic, authorized proceeding to simulated Parent after reviewed deployment/health verification and limited this campaign to three Parent runs. See the [M3 amendment](M3-completion.md#parent-campaign-amendment--2026-10-11). Existing no-reset, no-paid-call, Cloud/production isolation and backup-protected exact-record no-replay boundaries remain | Reuse completed Kid evidence. Check shared fixes and Parent contracts, then run Parent with focused monitoring. Stop after three unsuccessful Parent runs and explain the causes; no fourth run. After success, proceed to Creator and audit retained outputs/reports |
| Balanced campaign: three persona runs on staging | Dev4 installation, restored signature checks, eighteen publications and creation-only 60-second staging delivery are verified. Kid and Parent retain completed generation/accounting with incomplete advisory evaluation. Initial Creator `47894c71-7991-4b15-8dc2-810395ec3f01` continued past its first J12 input-limit failure; [current M4 evidence](M4-balanced.md#current-creator-admission-checkpoint) | Existing Dify-only provider key and callback/binding storage remain unchanged; no credential was retrieved/copied | Existing conditional USD 5 campaign, 500 text requests, persona ceilings 120/160/220 and zero paid images. User approved a new key for the initial Creator after the original pending key was lost. User authorized bounded repair and continuation past exact failed operation `865ca52b-36d1-460e-bc18-e2249c87b5a7` on 2026-10-25, after no-dispatch and ownership proof | Latest stopped-campaign checkpoint: 162/500 requests, USD 0.172040 reserved, USD 0.187143 settled upper bound and USD 4.640817 remaining. Preserve all three runs, history and allowances. The J09/Pause repair and exact continuation passed. Compact review inputs were delivered and the exact tester continuation passed; the exact J12 continuation passed after reviewed delivery and normal proof, but new operation `928cb32d-daf7-4703-b005-fdaf076d6cb6` failed during preparation. Further continuation requires its own authority after diagnosis; no automatic retry, successor, reset or M5 execution |
| Automated host/run diagnostics and sandbox memory: existing shared VPS | Endpoint/workflow deployed. Sandbox verified at 1024 MiB. Scheduler repair `38139804937` passed; diagnostics `38141274006` verified 1536 MiB, zero restarts/OOM counters and authenticated public API HTTP 200. Kid completed without repair; earlier timing targets were missed. [M3 evidence](M3-completion.md#parent-attempt-2-and-authorization-coordination--2026-10-11) | Existing protected deployment SSH/Cloudflare access and staging Basic gate; no new keys or local credential copy | User authorized automated diagnostics and selective memory increase in this session. Preserve other limits, data, Cloud and production; require idle work and live capacity guard | Parent attempt 1 reconciled with verified backup; attempt 2 passed J12 but failed at J13 authorization. Finish reviewed authorization coordination and deploy before the final allowed Parent attempt. Timing is diagnostic. No routine root-terminal handoff is needed |
| Real campaign: ordered 3/5/8-page staging runs, each plus cover | M4 completion and image-provider readiness pending; [M5](M5-real.md) | Text/image provider credentials inside Dify; approved model/binding references | Not granted. Default three initial runs, zero successors, ≤500 LLM and 46 real image requests; any additional allowance explicit | Paid Real calls; verify M4 successes, reference support, accounting, settings and approved finite campaign |
| Probe cleanup: explicitly listed disposable IDs only | Retained probes documented in [M0](M0-readiness.md) | Existing Community control profile | Not granted; retaining probes is acceptable; no prefix-wide deletion | Cleanup only; verify exact IDs and confirmation before removal |

The bounded-operation candidate is deployed at staging `5374ec4` on 2026-10-12.
Bootstrap `38288136389` verified the backup and reconciled only the approved stale
Parent item/job. Original request `38149230374-1` is archived unchanged; deployment
`38287424389`, attempt 2, passed. These transition actions are complete.

| Remaining dependency | Technical verification | Private reference | Required action | Exit |
| --- | --- | --- | --- | --- |
| M3 exit / M4 readiness | M3 Simulated acceptance complete: retained Kid, Parent 3/3 and Creator initial run passed with zero payable calls; [current exit evidence](M3-completion.md#persona-exit-evidence). M4 is now in progress under its retained campaign | Existing protected access and eighteen bindings; no new credential setup is authorized | Reuse completed M3 evidence; its completion does not authorize a reset or a new spending allowance | Follow the [current M4 record](M4-balanced.md#current-creator-admission-checkpoint). M4 remains incomplete and M5 execution remains on hold |

Preserve all saved data and failed-run evidence. Do not repeat completed private
setup, bootstrap or deployment. No paid execution, reset, production or Cloud
change is authorized by this checkpoint.

The latency/async row's installed-binding, idle-state and collaboration read-back
handoff passed in the operator's root output on 2026-10-08; see the
[current M3 correction evidence](M3-completion.md#current-correction-checkpoint--2026-10-07).
Do not repeat key preparation or request that same output again. Earlier failed
probe/controller attempts remain evidence in M3, not pending manual actions.
The root restart recovery handoff passed for run
`9b8766bd-3253-4ffc-84d8-3252323fd3de`: same operation, saved result, one reservation,
unchanged deadline and zero payable calls. Normal-binding restoration
`37761873704` passed with a verified backup and unchanged image. Remaining work is
uninterrupted persona acceptance with callback timings and reports. Runtime
normal-binding readback passed and Chrome control works after the operator reopened
the page. Kid successor `88a58434-be3f-4936-8f09-dd02efa29c9a` reached J12,
then blocked on a J13 response-summary schema mismatch. The focused correction
required reviewed application deployment and a linked successor. This historical
pending statement is superseded by the current lifecycle checkpoint above. Recheck
host guards immediately before submission; the prior observation is not a lock
or permission to bypass changed state. Restore and read back normal bindings only
if a future authorized probe changes them again.

Update a row when evidence or scope changes, including its date and link. Milestone
files keep observed results and detailed setup procedures, not a second manual
action queue. If a required dependency is missing, add its exact target and private
reference here before the consolidated handoff; do not invent a credential name.
Ask again only for new resources, changed scope, expired/revoked access or exhausted
campaign authority. An unresolved row blocks only its dependent operation.

Codex may select and record the simplest verified layout: independent modules
first, small focused groups when necessary, never one all-role workflow. Verify
capacity before creating the full suite. Ask again only for a change to scope,
cost, workspace plan or preservation requirements. Packaging does not expand
the operation grants above.

Ask for all grants required for the selected milestone together at entry. Existing
grants can cover later milestones within the same scope. Browser authorization
does not carry into another chat. Do not create a new key if an applicable one
already exists. A new Dify app normally needs its own app execution credential;
do not assume the old manager key can execute a different app.

Paid campaign approvals must bound the number of runs as well as requests per
run. Default request for M4/M5 is one run per persona; repairs do not silently
grant paid successors. The operator may preauthorize a finite successor allowance
at entry to permit unattended repair-and-rerun. Simulated development runs have
no campaign-count cap, but each run has a bounded loop.

For Community publication read-back, obtain the active workflow ID from MCP
`app_get` (`workflow.id`), then retrieve that exact version and compare its graph
with the reviewed candidate. Do not bind the first `workflow_list_versions` item:
on Dify 1.17.1, a history entry can have the same graph hash but a different ID
from the active workflow returned by application-key execution. Keep that history
ID only as history evidence. A publication-identity mismatch must stop the run;
correct the bindings and use a linked successor, not an in-place acceptance repair.

## C. Implementation and two clean reviews

Use one working branch and sequential integration. Delegate bounded read-only
investigation, tests or reviews where useful; do not let reviewers edit the diff.
Use the validation levels below. Do not start paid calls to debug basic schemas.

### Validation levels and result reuse

| Level | When | Required checks |
| --- | --- | --- |
| Implementation loop | After a bounded slice or correction | Smallest relevant test files or named cases, focused lint and independent review of changed behavior. Immediately check persistence, authorization, recovery and provider-accounting regressions when those boundaries change. |
| Local checkpoint | Before a work-in-progress commit or push | Run relevant unit tests locally before pushing code; reuse unchanged passes. Inspect the entire proposed commit, secrets/unexpected files, whitespace and affected documentation. Obtain review for newly included behavior; run focused integration tests only when changed behavior needs that proof. No automatic broad-suite rerun. Label unfinished acceptance explicitly. |
| Publication checkpoint | Frozen candidate before code/configuration publication | Typecheck, lint, plan/CI-selected affected suites, required agent checks and applicable browser/contracts checks; two consecutive clean independent reviews of the exact candidate and evidence. Required CI still runs. |

For M0–M6, these levels govern when milestone verification commands run. Lists of
broad checks in slice packages are publication sets, not instructions to repeat
all checks after every edit or local commit. Historical test results remain evidence,
not a requirement to repeat their commands.

Record commands, test scope, result, source/configuration input identity and test
environment assumptions in the existing milestone evidence. Reuse passing results
only while relevant inputs are unchanged. Corrections invalidate affected results,
not unrelated suites. Use clean validation inputs when stale generated files or
old output copies contaminate a checkout; do not label a scoped substitute as a
passing standard typecheck.

Check test prerequisites before expensive campaigns. Use non-secret test fixtures
and isolated resources, never paid execution or live data to satisfy test setup.
After a failure, inspect the failed step and run a focused reproduction first.
Do not repeat an unchanged deterministic failure or hide it with test retries.
Do not run duplicate broad commands concurrently; keep MongoDB integration files
serial. Run one broad local set per frozen candidate, not per small edit. Repeat
broad checks when shared behavior, suite assumptions or other relevant inputs
change; otherwise rerun affected checks only. Routine PR CI runs unit tests and
selected contracts, not MongoDB integration or persona campaigns. Manual `affected`
runs explicitly changed integration files; use local named regressions for other
affected paths. See the [CI policy](../../../scripts/ci/README.md).
Use Validate's existing `full` mode for all simulated journeys at a release
checkpoint when their behavior changed and equivalent current evidence is absent.
Required status checks and host suites remain unchanged.
Live acceptance follows deployment; mocks or browser discovery alone
cannot replace it.

Before publishing the candidate configuration/code:

1. Freeze the candidate diff and complete publication-level validation, reusing
   still-valid results. Record commands/results and relevant input identities.
2. Independent read-only review A checks the complete milestone diff and acceptance
   available evidence, including Dify configuration and release compatibility.
   Live acceptance of an unpublished release is not a prerequisite for this review.
3. Fix every actionable blocker; rerun affected checks. Any relevant edit resets
   the clean-review count to zero.
4. Review again until one clean review is obtained, then perform a second separate
   read-only review of the same candidate and evidence. Prefer a fresh reviewer
   context. Two views of the same review are not two reviews.
5. Only two consecutive clean reviews permit publication. Optional quality/polish
   suggestions are not blockers. Do not expand scope to satisfy them.

Apply the [repeated blocking review rule](../../../AGENTS.md#repeated-blocking-reviews).
After more than three consecutive reviews with new defects or blockers, stop
individual corrections and inspect the whole package and the review/correction
failure pattern. If the pattern continues in both of the next two reviews, report
the details and recommendation, then wait for user instructions. This rule
governs these milestones instead of the generic skill's correction-cycle default.

After deployment, record live acceptance evidence. A discovered defect requires
affected validation and two clean reviews of the correction before publication.
Recording successful evidence alone does not require another application deployment.

### Suite publication safety

Before changing a published suite, stop new dispatch and inspect active operations.
Pause alone does not establish that in-flight work has stopped. Let it finish or
reconcile uncertain outcomes before publishing to bindings it may still use.
If an outcome cannot be established, block that dependent change; do not repeat
the paid call. Publish, synchronize applicable Workflow Tools and read back their
bindings. Successor runs record the new configuration. Claim version isolation
only when the selected Dify interface has demonstrated it.

Community M0 proved unpublished-child-draft isolation but **not** transitive
version pinning: refreshing a child Workflow Tool changed later executions of
the same pinned published caller. Freeze and record the effective child bindings
as well as the caller configuration; drain before their synchronization. See
[M0 binding evidence](M0-readiness.md#binding-change-and-restoration-evidence).

### Execution readiness dependencies

Section B owns all manual actions, permissions and private credential references.
The table below is a technical evidence index, not another handoff queue.

| Dependency | Required proof/handoff | Blocks |
| --- | --- | --- |
| Modular capacity/invocation | Separate invocation and explicit lineage transport passed. Community app-quota behavior and installed-host preflight checked on 2026-10-04; see M0. Actual suite bindings, workload measurements and Booklet lineage persistence remain pending | Full-workload readiness and dependent M1 integration; not independent local or deterministic slices |
| Publication/sync/restoration | Deterministic cycle and binding restoration passed in M0; verify each later candidate | Publication of later suite configurations |
| Runtime credentials/callbacks | Diagnostic round trip/runtime lookup passed on 2026-10-03; callback-based interrupted-response recovery passed on 2026-10-04; full-runner bindings and no-ID recovery remain unresolved | Dependent runner integration; unknown outcomes without retained IDs |
| Image transport/accounting | Reference inputs, output transfer, retries and reservations | Real image execution; fixture transfer also precedes simulated image work |
| GitHub/staging delivery | Checks/reviews, merge/deploy access and compatible release path | Unattended release |
| Reset | Exact-target inventory, backup/summary and authorization | Clean-baseline transition |
| Paid campaigns | Models/settings and finite run/successor allowances | Balanced and Real execution |

Codex resolves discoverable facts and bundles only remaining private setup and
authorization handoffs. Do not add services, upgrade the workspace, delete existing
Dify resources or increase limits to bypass a blocker.

## D. PR, CI, merge and staging loop

Run only with the corresponding grant in B. Use GitHub MCP where available and
`gh` for missing operations. Use Git for local changes. Do not bypass protection,
force-push, auto-approve as another reviewer, or delete the issue branch.

1. Inspect the final file list for secrets/unexpected artifacts. Commit the reviewed
   files, push the same-named remote, and create/update the issue PR to master.
   Keep #68 draft until its documentation scope is complete and reviewed.
2. Record head SHA. Observe required checks for that exact head/merge result.
   Poll every 15–30 seconds and provide concise progress. A timed-out observation
   is not a failed run: inspect the same Actions run ID before retrying anything.
3. For a failed check, inspect its failed step, fix narrowly on the issue branch,
   rerun affected local checks and the two-review sequence, push, and wait for the
   new exact SHA. Do not rerun a deterministic failure unchanged.
4. When required checks and required human reviews are satisfied, merge using a
   merge commit and the observed head SHA. Do not use an admin override. Verify
   actual merged state and merge SHA. Missing mandatory human review is a handoff.
5. Fetch master and fast-forward the same issue branch to the merge commit where
   possible. For subsequent milestones, open a follow-up PR from that branch.
   Never create a second issue implementation branch. Preserve its origin upstream.
6. Documentation-only milestones need no deployment. For runtime milestones, open
   a release PR from the reviewed issue branch to `_staging`. Inspect its complete
   merge diff against staging, including trial-only code. Test the merge result
   in an isolated local worktree if needed. Do not merge staging into the issue
   branch or import all trial code solely to resolve a release conflict.
7. Resolve any release conflict or compatibility defect on the issue branch;
   repeat validation/reviews and master publication before release. If this cannot
   be done without importing unrelated work or changing branch policy, pause for
   a bounded release decision. Do not silently overwrite staging history.
8. Require release-PR CI, then merge to `_staging`. Capture the resulting commit
   and its automatically triggered `deploy.yml` run ID. Do not dispatch a second
   deploy while it is active. Validate contains no production/container build;
   Deploy builds or reuses the immutable image and verifies it before host mutation.
9. Wait for that Deploy run to finish. Require success and matching commit/digest.
   Dispatch `check-deployment.yml` with ref `_staging`, input `environment=staging`;
   capture and wait for its exact run. Inspect readiness and the milestone smoke
   flow at `https://booklet-staging.uniwares.co.uk` using authorized authenticated
   access. A green CI or liveness endpoint alone is not deployment verification.
10. If deployment fails, inspect summary and retained host-operation state before
    another mutation. Follow [deployment recovery](../../deployment/runbook.md).
    Keep host operations serialized. Do not cancel an active host operation or
    automatically restore a database. Prepare corrective code on the issue branch.
11. Record code SHA/digest, PRs, CI/deploy/check IDs, Dify published/tool bindings,
    smoke run IDs and results in the milestone exit evidence. Update issue #65
    evidence, without closing it unless separately requested.

Minimal CLI observation examples (after resolving the actual numbers/IDs):

```text
gh pr checks <pr-number> --required
gh run view <run-id> --json status,conclusion,headSha,jobs
gh workflow run check-deployment.yml --ref _staging -f environment=staging
```

Inspect existing runs before selecting the run from a dispatch. Match workflow,
branch, SHA and creation time; do not use an unrelated latest run as evidence.

## E. Milestone exit record

Append one compact current record to the milestone file: entry baseline and plan
revision; authorization references; implemented files/contracts; local tests;
review A/B identities and results; PR/CI/release IDs; Dify publication/tool version;
acceptance run/booklet IDs; failures and successor links; next-milestone deltas.
Do not retain secrets, raw auth headers or credential-bearing exports in Git.
Keep traces/assets in their existing private storage and link sanitized evidence.

No milestone is complete on document creation alone. Unverified live capability
must remain labeled unverified, even when local tests pass.
