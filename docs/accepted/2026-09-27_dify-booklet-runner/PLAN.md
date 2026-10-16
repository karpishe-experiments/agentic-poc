# Dify booklet experiment — implementation and validation roadmap

**Status:** M3 and efficiency acceptance remain complete. The M4 binding-order correction is delivered. The authorized initial Kid run stopped after eight paid text invocations on an incomplete manager response; Parent and Creator remain unstarted. No further paid attempt is authorized. M4 is not complete. See the [current M4 record](M4-balanced.md#current-delivery-record---2026-10-15).
**Product contract:** [PRD.md](PRD.md)
**Tracking:** [Issue #65](https://github.com/karpishe-experiments/agentic-poc/issues/65)

## Milestone execution plans

Read [the shared execution procedure](EXECUTION.md) before starting a milestone.
These detailed plans are preparation, not evidence that access, spending or a
release has been authorized. Each starts by reconciling the previous milestone.
Their proposed implementation details do not override the PRD. Finalize a slice's
technical choices using predecessor evidence before changing its runtime contracts.
Use M0's four-checkpoint checklist first, then prepare each runnable slice with
the [Sol/Low handoff format](EXECUTION.md#sol-low-execution-packages).

| Milestone | Detailed plan |
| --- | --- |
| 0 | [Access, configuration and control proof](M0-readiness.md) |
| 1 | [Persistent runner and narrative slice](M1-runner.md) |
| 2 | [Narrative and reference production](M2-references.md) |
| 3 | [Pages, UI and evaluation](M3-completion.md) |
| 4 | [Simulation and Balanced acceptance](M4-balanced.md) |
| 5 | [Staging Real acceptance](M5-real.md) |
| 6 | [Agent improvement and closeout](M6-closeout.md) |

### Requirement-to-delivery check

| Agreed requirement | Implementation and evidence |
| --- | --- |
| Codex operates the whole cycle; no routine operator clicks | M0 control proof; EXECUTION entry handoff, two clean reviews and authorized release loop |
| Simple experimental implementation, not production perfection | PRD development standard; focused checks in each milestone; warnings never become quality gates |
| Dify owns the complete modular creative suite | M0 packaging decision; M1 J01–J02, M2 J03–J10, M3 J11–J13, testers and judge |
| Persona-adaptive journey with recorded delegation | M1 approval/grant contracts; M2 grouped reviews; M4 low-interaction and detailed-control cases |
| Normal saved booklets and all run evidence | M1 persistence; M2/M3 assets and lineage; M5 retained failures and successors |
| Unlimited separate simulated development runs, bounded individual runs | M1 loop/accounting rules; M4 deployed simulation campaign; no real calls in simulation |
| Balanced first, then Real 3 → 5 → 8 pages plus cover | M4 all-persona Balanced acceptance; M5 ordered Real campaign within approved limits |
| Whole-flow tester and independent advisory judge feedback | M3 reports and separate generation/evaluation status; M6 evidence-led agent improvements |
| Pause/Resume, no manual acceptance-run repair or PDF | M1 controls; M3 completion/UI; M5 uninterrupted retained runs |
| Clean local/staging baseline, no production or existing Dify deletion | M1 setup and M5 exact-target reset procedure; no later reset of experiment evidence |

This table maps requirements, not completed results. Keep verification in the
owning milestone's exit record; do not add a separate acceptance bureaucracy.

## Baseline and execution boundaries

Use `agent/issue-65-dify-booklet-runner`, created from freshly fetched `origin/master`; publish against `master` and track only its same-named origin branch. Keep all issue work and review corrections here. Reuse prior Dify work selectively; do not merge `_staging` or PR #64 wholesale.

The first delivery is these two canonical documents. No runtime changes, Dify mutations, reset, paid calls or deployment are part of that documentation pass. The source and approved deviations are recorded in the PRD; do not treat Ali's draft as an instruction to reset anything immediately.

Current application services and persistence are reusable starting points, not the target implementation. Replace the local agent runtime/administration for the new journey. Before changing those boundaries, inspect and update [architecture.md](../../architecture.md) to reflect only implemented behavior.

Issue #66 was closed without full live-control acceptance. Carry its unresolved checks into milestone 0 using the [access runbook](../2026-09-26_codex-dify-access/runbook.md) and [getting-started guide](../../dify-getting-started.md). Installation, CLI authentication or tool discovery alone do not satisfy AC08.

### Fast experimental delivery

Follow the PRD's [experiment development standard](PRD.md#experiment-development-standard). Milestones 0–5 build and verify the experience; milestone 6 primarily improves the agent suite. Deliver small runnable slices and use automated feedback to correct them. Do not wait for polished UI, perfect creative output, exhaustive tests or production security infrastructure.

Resolve technical details just before their dependent slice, not through a complete up-front platform design. Milestone 0 proves the essential control/simulation path and first-slice contracts; it need not perfect every later specialist. Block only work that actually depends on an unresolved capability, and continue independent simulated development where possible.

Keep existing authentication, secret handling, production isolation, verified reset targets and paid-request safeguards. Reuse the current infrastructure and credential bindings. Use targeted verification for the agreed paths and failure cases; quality warnings and optional polish do not prevent milestone progress. A real technical failure, missing required output or unverified spending boundary still does.

## Milestone 0 — Baseline and executable Dify control

**Coverage:** AC08, AC13; prerequisites for AC01–AC06 and AC11–AC12.

- Pin Ali's source and inspect reusable Booklet services, schemas, jobs, asset storage and prior Dify contracts.
- Verify workspace identity/capacity, usable model bindings, reference-image inputs, output retrieval and configuration snapshots.
- Prefer existing local-stdio MCP, then verified official CLI capabilities, then explicitly authorized browser control. No custom bridge or infrastructure by default.
- Run a deterministic disposable configuration → test → controlled failure → diagnosis → repair → publish → Workflow Tool synchronization → read-back → recovery cycle.
- Prove a simulation branch through Dify that invokes no real provider, including manager/tester/judge behavior.
- Audit internal agent calls and plugin retries. Establish a practical reservation boundary for every potentially paid request. If an opaque agent loop cannot obey limits, resolve its execution design before paid tests; do not count one agent run as one LLM request.
- Produce the detailed-plan inputs below before implementing their dependent slice. Preserve thirteen identifiable specialist responsibilities even if workspace capacity affects packaging.
- Codex selects and records a verified independent-module layout, with small
  focused groups only where necessary. An all-role workflow remains excluded.
  Return only scope, cost, workspace-plan or preservation changes to the operator.

**Exit:** verified unattended control and simulation paths, tested capability matrix, and an implementation-ready first-slice contract. Unverified capabilities remain explicit blockers for their affected work, not claimed successes.

### Access-readiness matrix

For each row, record the exact environment/target, credential or session reference (never its value), check performed, dated result/evidence, and unresolved handoff/owner. Start as **unverified** until checked; earlier runbook evidence is context, not proof of current readiness. Expand rows by environment where bindings differ. Use non-billable checks first and reuse existing credentials rather than rotating them merely for this checklist.

| Dependency / purpose | Environment and reference to identify | Verification and unresolved handoff |
| --- | --- | --- |
| Codex → Dify administration | Separate Community MCP/CLI session at `https://dify.uniwares.co.uk`; authorized browser fallback if needed | Verify identity, permissions, capacity and needed configuration/publication operations. Preserve Cloud resources; see M0 for current evidence. Private login handoff only for the failing interface. |
| Booklet → Dify execution | Local/staging Dify app API credential references, app IDs and published workflow/tool bindings | Exercise a deterministic non-provider path and read back the selected publication. Record any missing app credential/binding. |
| Dify → Booklet callbacks | Local test/staging origin, callback-key reference and workflow environment binding | Verify reachability and authenticated non-mutating or disposable callback behavior. Identify any access-gate/routing gap. |
| Dify → text/image providers | Workspace provider/plugin credential IDs and selected model bindings | Verify metadata, required capabilities and reference-image support; defer a paid capability test until its execution scope is authorized. Login or plugin authorization alone does not prove model access. |
| Booklet → database/assets | Local/staging database identity, storage target and credential references | Read-only connectivity/target checks first; disposable write/read checks within authorized test scope. Record missing access without revealing connection strings. |
| Repository and staging delivery | GitHub session/workflow permissions and existing deployment credential references (including VPS/SSH/Access where consumed) | Verify repository access and sanitized existing deployment preflight; identify missing bindings before deployment. Do not initiate host mutation to test login. |
| Operator execution authority | Current-session browser topic, exact reset targets, deployment environment and paid-test scope/limits | Record existing authorization and remaining handoffs separately from technical connectivity. Honor existing grants; obtain only missing scope before its action. |

Missing access blocks only the dependent operation. Continue independent documentation, local code and simulated tests where possible. Credential entry remains private. Browser/computer-control authorization is valid only for its approved topic in the current chat session; a saved matrix entry does not carry that permission into a later session. This matrix is an operating checklist, not a new account/permission system, and does not grant deployment, reset or paid-call authority.

### Outputs for the detailed implementation plan

- **Dify suite:** app/workflow packaging, invocation paths, specialist bindings, publication/tool synchronization and recovery path.
- **Creator interaction:** persona defaults, grouped review, delegation creation/change/revocation, escalation and exact-version acceptance behavior.
- **Application/data:** concrete interfaces, run/artifact/approval/delegation records, source lineage and persistence changes; retire old agent-management dependencies.
- **Execution:** simulation branches, provider reservations/accounting, internal step bounds and uncertain-outcome recovery.
- **Models:** verified model IDs, token limits, plugin retry behavior and configured retry/deadline bounds.
- **Environment:** completed access matrix for the next slice, local/staging setup, verified reset targets and deployment sequence with outstanding handoffs.

Record these in the detailed plan as they are resolved, with evidence or explicit unresolved dependencies. Document preparation does not establish readiness. Later-slice details may be completed before that slice; they need not delay a runnable first slice.

## Milestone 1 — Persistent runner and narrative foundation

**Coverage:** J01–J02; AC01, AC05, AC06, AC09, AC11–AC12.

- Add experiment-run identity, mode, persona, brief, configuration evidence, operation reservations and predecessor linkage.
- Adapt existing booklet/artifact/version/approval records to the new graph; keep Dify configuration snapshots observational.
- Implement run creation, inspection, Pause/Resume, tester responses, saved context and validated specialist proposals through application-owned services.
- Implement Concept Brief and Story Outline Dify tasks with complete instructions and deterministic fixtures.
- Separate tester review/delegation grants from manager mutations. Record exact-version approvals through explicit review or application-validated delegation, including grouped review provenance.
- Retire old runtime dependencies as replacement paths become usable; do not build a compatibility platform.

**Tests:** contract/materializer validation, wrong role/revision, duplicate response, restart, pause with in-flight work, explicit/delegated approval evidence, narrowed/revoked delegation and escalation outside scope or against the brief.

**Exit:** a complete inspectable Simulated narrative slice, including creator clarification and approval.

## Milestone 2 — Narrative completion and reference production

**Coverage:** J03–J10; AC01, AC02, AC05, AC06.

- Implement draft lists, manuscript, final lists, style samples and character/location sheet packages.
- Preserve Ali's content boundaries, required views/expressions and unchanged shared style module.
- Add the fixed persona briefs and adaptive, persona-specific revision instructions from the PRD.
- Group creator-facing questions/reviews according to persona involvement while completing every internal task. A grant can cover routine list/sheet decisions; each accepted version still records its provenance.
- Implement sibling approval gates and targeted dependency invalidation, including stable-fact feedback from sheets to Final Lists.
- Persist image authorization, outputs, source/reference roles and warning evidence using shared asset services.

**Tests:** both sibling orders, missing/stale approvals, all sheet subjects, reference routing, unchanged-source approval behavior, bounded revisions, simulated image completion and storage failure.

**Exit:** all three Simulated cases reach approved reference packages with complete source lineage.

## Milestone 3 — Pages, runner UI and advisory evaluation

**Coverage:** J11–J13; AC01, AC02, AC05–AC07, AC10.

**State:** Complete on 2026-10-13. The [M3 exit evidence](M3-completion.md#persona-exit-evidence)
records reused Kid, successful Parent 3/3 and successful Creator initial acceptance,
all with zero payable calls. The checkpoints below describe the completed scope;
do not repeat the campaign, operator reconciliation or normal-binding restoration.

Deliver the remaining work through the three
[compact M3 checkpoints](M3-completion.md#compact-remaining-delivery):

| Checkpoint | Scope |
| --- | --- |
| 1. Restore the experiment | Reconcile the existing stopped probe through authenticated APIs, restore the prepared normal eighteen bindings, and perform one application preflight. Reuse the deployed candidate and valid recovery evidence. |
| 2. Complete personas | Reuse Kid acceptance; check existing J13 fix evidence, then run linked Parent 3/3. Stop if it fails; Creator follows success. Keep required pages/covers, approvals/assets, tester/judge reports and zero payable calls. |
| 3. Record the exit | Save release/binding identities, persona outcomes, usage and limitations in M3. Correct only application/workflow defects affecting acceptance, with focused validation and required publication review/CI. |

Apply the authoritative [experiment-only scope](EXECUTION.md#m3-experiment-only-scope).
Infrastructure is an assumed working dependency. Forced restarts, infrastructure
fault injection, backup/restore rehearsal and host automation are not M3 gates.
The unstarted deadline probe and extra live cancellation/restart proof are
cancelled. Preserve existing code and evidence; do not add a cleanup refactor.

Keep native lettering, persona-specific multi-panel layouts, exact references,
limits, durable evidence, warning-bearing completion and separate generation/
evaluation status. Use short structured reports, with simulated creative/visual
quality marked `not_assessed`; no quality score is required. Reuse shared-path
recovery proof rather than repeating the same campaign for every persona, but
retain all required scenarios and persona-specific contracts. Defer richer UI and
report polish, not required controls or inspection. No manual takeover or agent
editor is required. Keep one concise exit record in M3; do not add a plan hierarchy.

**Tests:** exact prompt text propagation, relevant references only, one physical-page image, missing/corrupt outputs, duplicate/conflicting/concurrent completion, stale results, exhausted limits and saved-success preservation after judge failure.

Also verify that usable image geometry/format-label differences, preferred-length overruns and harmless extra content fields do not fail the flow. Keep required content, decoding, storage and identity checks, and retain warnings instead of silently discarding deviations.

**Exit:** all three Simulated booklets finish through deployed Dify, including
multi-panel layouts, individual page approvals, retained tester/judge reports and
required failure/recovery evidence. Local mocks alone do not satisfy this exit.
Balanced/Real readiness, paid execution, PDF and production hardening remain
outside M3; this consolidation does not change PRD limits or acceptance criteria.

## Milestone 4 — Simulation hardening, then Balanced acceptance

**Coverage:** AC01–AC03, AC05–AC08, AC10–AC12.

M3's deployed Simulated acceptance is complete. The operator's later continuation
authorizes non-billable M4 implementation under the
[M4 contract](M4-balanced.md#incremental-implementation-slices). The local policy and
campaign foundation is implemented; Balanced execution remains closed. Use the three
[M4 checkpoints](M4-balanced.md#three-execution-checkpoints):

| Checkpoint | Work and exit |
| --- | --- |
| 1. Close readiness gaps | Reuse valid M3 simulation/recovery/browser evidence; test uncovered or changed paths. Preserve all required scenarios and persona contracts. Verify real-text/simulated-image routing, models, tokens, disabled automatic provider retries and reservations for all internal calls. Consolidate missing private setup and paid authorization into one handoff. |
| 2. Execute one Balanced campaign | Run Kid → Parent → Creator sequentially within 120/160/220 LLM requests; zero real image calls. Retain artifacts, individual approvals, short tester/judge reports, usage and timing. Quality findings remain warnings; simulated images do not prove real image-provider quality. |
| 3. Record results and prepare M5 | Keep one concise exit record in M4 with bindings, runs, failures/successors, measured usage and limitations. Pass exact evidence to M5; no new report hierarchy. |

Selected campaign policy: three initial runs, zero successors, at most 500 LLM
requests, three judge requests and USD 5 incremental model charges in total;
the final paid execution grant remains pending. Any successors need a finite
approved allowance with its additional worst-case request total. Without paid
approval, complete non-billable readiness work and stop at the paid checkpoint.

Use representative shared-mechanism recovery tests and focused persona contracts,
not repeated unchanged campaigns. Aim for one reviewed release candidate. Defects
require affected validation and two consecutive clean independent reviews before
republishing; synchronize applicable tools and read back published bindings.
Dify-only corrections do not redeploy unchanged application code. Stop dispatch
and reconcile active/uncertain work before configuration changes; do not replay
unknown outcomes automatically. Existing PRD limits and release authority remain
unchanged.

**Exit:** no known technical completion blockers, all Balanced cases complete, and configuration/accounting evidence is current. This does not prove image quality or Real acceptance.

## Milestone 5 — Clean staging transition and Real acceptance

**Coverage:** AC04–AC13.

M5 remains planned, pending M4 acceptance. Use the three
[M5 checkpoints](M5-real.md#three-execution-checkpoints):

| Checkpoint | Work and exit |
| --- | --- |
| 1. Confirm readiness once | Reconcile M4 successes, exact published bindings, actual image-reference transport, accounting and model/token/retry settings. Reuse valid evidence and the completed staging reset; run only missing or invalidated non-billable checks. Bundle private setup and finite Real campaign authorization. |
| 2. Run the ordered Real campaign | Kid 3 pages → Parent 5 pages → Creator 8 pages, each plus cover. Advance only after an uninterrupted success. Use one checklist for required assets, exact versions/per-page approvals, lettering/style/reference routing, reports, durable bytes and usage. Retain persona-specific multi-panel requirements. |
| 3. Record evidence and hand off | Keep one concise M5 exit record linking configuration, runs, assets, usage, failures and successors. Hand the retained baseline to M6; defer quality-only improvements. |

Default proposal: three initial runs, zero successors, at most 500 LLM and 46 real
image requests; explicit spending approval is still required. Per-run limits remain
120/160/220 LLM and 12/14/20 image requests; baseline outputs remain 9/11/15.
Additional paid runs, including Balanced reruns, need remaining finite authority.

Do not routinely reset or redeploy. Preserve M1–M4 evidence; any necessary new
reset needs exact-target approval and backup/preservation. Deploy only required
changes after affected validation and two consecutive clean independent reviews;
reuse unchanged simulation/Balanced proof. Preserve production and Cloud resources.
On technical failure, stop progression, retain evidence, inspect unknown outcomes
without automatic replay, and use linked successors after correction. Never call
an in-place repaired run uninterrupted or increase limits/reset counters to conceal
failure. Missing/corrupt outputs, invalid authorization and exhausted limits remain
technical blockers; creative inconsistencies remain warnings.

**Exit:** three retained uninterrupted Real completions, required saved images/approvals, reports and reconciled request evidence. Quality warnings remain visible and do not fail completion.

## Milestone 6 — Agent improvement and experiment closeout

**Coverage:** AC07, AC08, AC10 and the experiment's learning objective.

- Use tester/judge evidence to prioritize prompt, specialist, delegation and workflow improvements.
- Record any application repairs separately. Revalidate affected code before subsequent paid runs.
- Compare new outcomes with retained baseline runs; do not erase failures or infer quality from simulation.
- Reconcile the PRD, this roadmap, architecture, operating guide, tests and issue evidence.

**Exit:** evidence-backed conclusions, repeatable operating procedures and explicit remaining limitations. Issue closure remains a separate authorized action.

## Cross-cutting verification and delivery

| Surface | Required proof |
| --- | --- |
| Specialist suite | Complete prompts/contracts/fixtures; clarification, draft and revision routing for all thirteen responsibilities. |
| State | Exact-version explicit/delegated approvals, grant/change provenance, sibling gates, targeted invalidation, durable lineage and restart-safe saved outputs. |
| Adaptive journey | All internal tasks execute while persona involvement controls visible steps; grouped reviews, delegation changes and out-of-scope escalation work. |
| Access readiness | Environment-specific credential/session references, verified paths, authorization scope and unresolved handoffs recorded without secrets before dependent execution. |
| Provider boundary | Reservations before calls, bounded internal steps/retries, no accidental paid branches, separate actual/estimated/unavailable usage. |
| Recovery | Safe idempotent retries, concurrent completion, interrupted upload/storage, unknown outcome inspection and no automatic duplicate paid work. |
| UI | Mode/persona launch, progress, warnings, Pause/Resume, artifacts/images and failure/report inspection in browser tests. |
| Quality | Warnings retained through successful completion; tester/judge cannot force unlimited repair or spending. |
| Publication | Reviewed application commit, sanitized Dify configuration identity, published read-back and synchronized tool version. |
| Isolation | Verified local/staging reset scope, no production mutation, no deletion of existing Dify resources. |

Use selected CI checks; documentation-only work does not need an application build. Production/container builds remain deployment work. Each implementation milestone requires proportional verification and independent read-only review before publication. Include browser verification when UI changes; it is not replaced by API-driven persona runs.

Maintain concise milestone evidence here as work completes: reviewed identity, checks, outcomes and outstanding blockers. Link detailed traces/assets rather than duplicating a chronological log. Do not mark milestones complete based on document creation.

## Risks and readiness decisions

- Dify capacity and controllability may constrain suite packaging; verify before creating the full suite.
- A simulated path verifies contracts/orchestration, not model reasoning or visual quality. Balanced and Real remain required.
- Fixed cast/location scope controls baseline image counts, but revisions can invalidate several images. All replacement calls still consume the same run allowance.
- Dify/plugin hidden calls can defeat nominal call limits; unresolved enforcement blocks paid readiness.
- Codex owns follow-up on New Agent request limits: inspect supported controls,
  reconcile reported requests after each authorized run, and report missing usage
  or overruns before starting a successor. Track this in M0 and recheck before
  Balanced/Real execution. Monitoring is not a hard cap and does not silently
  replace the PRD's reservation/enforcement requirements. Any change to that
  contract requires an explicit decision before paid execution.
- Exact model/token/retry settings remain a milestone-0 technical output, not invented defaults. Record and test them before paid execution.
- The clean reset removes the need for legacy migration but does not permit broad filesystem deletion or production data changes.
- Application and Dify changes must be verified together; publishing a workflow alone does not prove its attached tool uses that version.
