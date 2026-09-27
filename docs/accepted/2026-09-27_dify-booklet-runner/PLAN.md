# Dify booklet experiment — implementation and validation roadmap

**Status:** Accepted roadmap; documentation delivered, runtime milestones not yet verified.
**Product contract:** [PRD.md](PRD.md)
**Tracking:** [Issue #65](https://github.com/karpishe-experiments/agentic-poc/issues/65)

## Milestone execution plans

Read [the shared execution procedure](EXECUTION.md) before starting a milestone.
These detailed plans are preparation, not evidence that access, spending or a
release has been authorized. Each starts by reconciling the previous milestone.
Their proposed implementation details do not override the PRD. Finalize a slice's
technical choices using predecessor evidence before changing its runtime contracts.

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
| Codex → Dify administration | Local MCP/CLI session, intended Cloud workspace; authorized browser fallback if needed | Verify identity, permissions, capacity and needed configuration/publication operations. Private login handoff only for the failing interface. |
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

- Implement pagination, Page Bible and final images, including native text and persona-specific multi-panel cases.
- Support page-by-page and ordered selected batches while retaining per-page inspection and explicit/delegated approval records; grouped acceptance does not erase individual page identity.
- Add bounded safe recovery, uncertain-outcome inspection, request-limit enforcement and warning-bearing completion.
- Add tester feedback and independent judge reporting; keep evaluation status separate from generation success.
- Extend existing viewers and provide the simple runner controls/history/evidence UI; no manual takeover or agent editor.

**Tests:** exact prompt text propagation, relevant references only, one physical-page image, missing/corrupt outputs, duplicate/conflicting/concurrent completion, stale results, exhausted limits and saved-success preservation after judge failure.

Also verify that usable image geometry/format-label differences, preferred-length overruns and harmless extra content fields do not fail the flow. Keep required content, decoding, storage and identity checks, and retain warnings instead of silently discarding deviations.

**Exit:** all Simulated booklets finish, including multi-panel layouts and failure/recovery scenarios.

## Milestone 4 — Simulation hardening, then Balanced acceptance

**Coverage:** AC01–AC03, AC05–AC08, AC10–AC12.

- Complete all three simulated acceptance cases and failure scenarios before enabling real LLMs.
- Exercise low-interaction kid/parent flows and detailed creator control, grouped reviews, changed delegation and material-conflict escalation. Assert that quality warnings cannot force an unbounded approval/revision loop.
- Run focused unit/integration contracts, typecheck, lint, routing fixtures and fake browser checks.
- Verify zero provider execution in simulation and zero real image execution in Balanced mode, including failure branches.
- Obtain paid-test authorization separately. Complete all three Balanced cases within the PRD's limits, including testers and judge.
- Inspect Dify traces, request reservations and usage together; record missing evidence honestly.
- Independently review application changes and sanitized Dify configuration. Publish reviewed versions and read back both workflow publication and Workflow Tool synchronization.

**Exit:** no known technical completion blockers, all Balanced cases complete, and configuration/accounting evidence is current. This does not prove image quality or Real acceptance.

## Milestone 5 — Clean staging transition and Real acceptance

**Coverage:** AC04–AC13.

- Confirm exact local/staging database names, asset roots and storage prefixes. Verify they cannot target production or unrelated files. Preserve a sanitized summary of the previous trial.
- Perform required clean-baseline setup only at the verified, explicitly authorized checkpoint. If local reset is needed earlier for implementation, apply the same checkpoint then; do not delay basic local setup until Real testing.
- Use existing staging deployment procedures with explicit authorization. No new secrets or infrastructure unless a demonstrated requirement is separately approved.
- Deploy and verify application/Dify configuration compatibility before acceptance runs. Balanced testing may use an earlier authorized staging deployment if needed; no implicit deployment authority follows from milestone order.
- Obtain explicit paid-execution authorization within the agreed call limits.
- Complete the 3-page Real case first. Resolve technical blockers, rerun affected Simulated/Balanced checks after corrections, and retain a clean successor before advancing.
- Then complete the 5-page case, followed by the 8-page case. Stop progression on a technical failure; do not automatically raise budgets.
- Keep all failed predecessors, successful successors, assets, prompts/configuration evidence and reports. Acceptance runs have no manual repair during execution.

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
- Exact model/token/retry settings remain a milestone-0 technical output, not invented defaults. Record and test them before paid execution.
- The clean reset removes the need for legacy migration but does not permit broad filesystem deletion or production data changes.
- Application and Dify changes must be verified together; publishing a workflow alone does not prove its attached tool uses that version.
