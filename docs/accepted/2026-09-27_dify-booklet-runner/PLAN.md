# Dify booklet experiment — implementation and validation roadmap

**Status:** Accepted roadmap; documentation delivered, runtime milestones not yet verified.
**Product contract:** [PRD.md](PRD.md)
**Tracking:** [Issue #65](https://github.com/karpishe-experiments/agentic-poc/issues/65)

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

**Coverage:** AC08; prerequisites for AC01–AC06.

- Pin Ali's source and inspect reusable Booklet services, schemas, jobs, asset storage and prior Dify contracts.
- Verify workspace identity/capacity, usable model bindings, reference-image inputs, output retrieval and configuration snapshots.
- Prefer existing local-stdio MCP, then verified official CLI capabilities, then explicitly authorized browser control. No custom bridge or infrastructure by default.
- Run a deterministic disposable configuration → test → controlled failure → diagnosis → repair → publish → Workflow Tool synchronization → read-back → recovery cycle.
- Prove a simulation branch through Dify that invokes no real provider, including manager/tester/judge behavior.
- Audit internal agent calls and plugin retries. Establish a practical reservation boundary for every potentially paid request. If an opaque agent loop cannot obey limits, resolve its execution design before paid tests; do not count one agent run as one LLM request.
- Record exact routes/contracts, persisted run fields, Dify suite layout, node bindings, loop/deadline/retry bounds, model IDs and token bounds before implementing their dependent slice. Preserve thirteen identifiable specialist responsibilities even if workspace capacity affects packaging.

**Exit:** verified unattended control and simulation paths, tested capability matrix, and an implementation-ready first-slice contract. Unverified capabilities remain explicit blockers for their affected work, not claimed successes.

## Milestone 1 — Persistent runner and narrative foundation

**Coverage:** J01–J02; AC01, AC05, AC06, AC09.

- Add experiment-run identity, mode, persona, brief, configuration evidence, operation reservations and predecessor linkage.
- Adapt existing booklet/artifact/version/approval records to the new graph; keep Dify configuration snapshots observational.
- Implement run creation, inspection, Pause/Resume, tester responses, saved context and validated specialist proposals through application-owned services.
- Implement Concept Brief and Story Outline Dify tasks with complete instructions and deterministic fixtures.
- Separate tester approvals from manager mutations; approvals target exact saved versions.
- Retire old runtime dependencies as replacement paths become usable; do not build a compatibility platform.

**Tests:** contract/materializer validation, wrong role/revision, duplicate response, restart, pause with in-flight work, and persisted evidence.

**Exit:** a complete inspectable Simulated narrative slice, including creator clarification and approval.

## Milestone 2 — Narrative completion and reference production

**Coverage:** J03–J10; AC01, AC02, AC05, AC06.

- Implement draft lists, manuscript, final lists, style samples and character/location sheet packages.
- Preserve Ali's content boundaries, required views/expressions and unchanged shared style module.
- Add the fixed persona briefs and adaptive, persona-specific revision instructions from the PRD.
- Implement sibling approval gates and targeted dependency invalidation, including stable-fact feedback from sheets to Final Lists.
- Persist image authorization, outputs, source/reference roles and warning evidence using shared asset services.

**Tests:** both sibling orders, missing/stale approvals, all sheet subjects, reference routing, unchanged-source approval behavior, bounded revisions, simulated image completion and storage failure.

**Exit:** all three Simulated cases reach approved reference packages with complete source lineage.

## Milestone 3 — Pages, runner UI and advisory evaluation

**Coverage:** J11–J13; AC01, AC02, AC05–AC07, AC10.

- Implement pagination, Page Bible and final images, including native text and persona-specific multi-panel cases.
- Support page-by-page and ordered selected batches while retaining per-page review and approval.
- Add bounded safe recovery, uncertain-outcome inspection, request-limit enforcement and warning-bearing completion.
- Add tester feedback and independent judge reporting; keep evaluation status separate from generation success.
- Extend existing viewers and provide the simple runner controls/history/evidence UI; no manual takeover or agent editor.

**Tests:** exact prompt text propagation, relevant references only, one physical-page image, missing/corrupt outputs, duplicate/conflicting/concurrent completion, stale results, exhausted limits and saved-success preservation after judge failure.

Also verify that usable image geometry/format-label differences, preferred-length overruns and harmless extra content fields do not fail the flow. Keep required content, decoding, storage and identity checks, and retain warnings instead of silently discarding deviations.

**Exit:** all Simulated booklets finish, including multi-panel layouts and failure/recovery scenarios.

## Milestone 4 — Simulation hardening, then Balanced acceptance

**Coverage:** AC01–AC03, AC05–AC08, AC10.

- Complete all three simulated acceptance cases and failure scenarios before enabling real LLMs.
- Run focused unit/integration contracts, typecheck, lint, routing fixtures and fake browser checks.
- Verify zero provider execution in simulation and zero real image execution in Balanced mode, including failure branches.
- Obtain paid-test authorization separately. Complete all three Balanced cases within the PRD's limits, including testers and judge.
- Inspect Dify traces, request reservations and usage together; record missing evidence honestly.
- Independently review application changes and sanitized Dify configuration. Publish reviewed versions and read back both workflow publication and Workflow Tool synchronization.

**Exit:** no known technical completion blockers, all Balanced cases complete, and configuration/accounting evidence is current. This does not prove image quality or Real acceptance.

## Milestone 5 — Clean staging transition and Real acceptance

**Coverage:** AC04–AC10.

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
| State | Exact-version approvals, sibling gates, targeted invalidation, durable lineage and restart-safe saved outputs. |
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
