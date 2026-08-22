# <Implementation plan title>

## Summary

State the goal, users, constraints, and observable completion criteria.

## Architecture and decisions

Record decision-complete interfaces, data flow, ownership boundaries, migrations, failure behavior, risks, and intentionally deferred work.

## Execution strategy

- **Complexity:** `small | medium | large`
- **Concurrency:** State what can safely run in parallel.
- **Model economy:** Explain how primary and delegated model usage will be optimized.
- **Primary model:** Name the current concrete model, reasoning effort, rationale, fallback, and escalation conditions.

## Execution progress

| Slice | State | Started (UTC) | Finished (UTC) | Checkpoint label | Checkpoint/report sync | Tokens | Evidence |
|---|---|---|---|---|---|---|---|
| S01 | pending | — | — | — | — | — | — |
| … | pending | — | — | — | — | — | — |
| SNN | pending | — | — | — | — | — | — |

Add as many sequentially numbered slices as the work requires. Update this table after validation at every slice transition.

## Amendment log

| Date | Discovery and decision | Affected slices | Approval |
|---|---|---|---|

Append validated deviations and newly discovered constraints. Do not rewrite completed history. Material scope or architecture changes require user approval.

## Slice S01 — <vertical outcome>

- **Outcome:** Describe the observable result.
- **Requirements:** List applicable requirement and acceptance IDs.
- **Dependencies:** List earlier slices or external prerequisites.
- **Scope and ownership:** Identify the subsystem and files this slice may change.
- **Primary responsibilities:** Define implementation and integration ownership.
- **Subagent mode:** `not_necessary | optional | mandatory`.
- **Subagent rationale:** Explain the coordination and cost decision.
- **Assignments:** For optional or mandatory delegation, define task, expected result, edit permission, exclusive ownership, skill, model, reasoning, verification, evidence, fallback, and escalation. For optional delegation, state when it should be skipped.
- **Model routing:** State the primary model and reasoning effort for this slice, rationale, economy benefit, fallback, and escalation conditions.
- **Start record:** At execution start, record UTC time, starting commit, actual primary model/reasoning, planned subagent assignments/models or explicit non-use, and the start-update result or local retry note.
- **Automated validation:** List exact commands and expected results.
- **Manual validation:** Describe manual or visual checks, or explain why none are needed.
- **Test-coverage analysis:** Map changed behaviors, requirements, failure paths, and regression risks to tests. At closure, record covered areas, gaps, deferred tests and rationale, plus tool-reported coverage when available; do not estimate percentages.
- **Closure evidence:** List the evidence required before advancing.
- **Delegation record:** At closure, record every actual assignment, agent/model, result, verification, and primary disposition. For unused optional delegation, record why it was skipped.
- **Timing and usage:** Record UTC finish time and elapsed time. Record primary and per-subagent token usage when reported by the execution surface; otherwise write `unavailable` without estimating.
- **Lessons checkpoint:** Record verified lessons or state that none were found.
- **Project updates:** Define start and completion updates. Before the checkpoint commit, record `remote: pending`. The completion report must include the resulting checkpoint SHA, status/outcome, UTC start/finish, validation passed/failed/not run, test-coverage analysis, selected and actual model/delegation decisions, subagent disposition, token usage or `unavailable`, amendments, lessons, blockers, and remote retry status. After attempting the checkpoint push and report, record `synced` with evidence or `failed/pending retry` with the failed operation and safe error summary in a separate `[S01 sync]` bookkeeping commit before later slice work. The status applies to the checkpoint/report; pushing the bookkeeping commit is best-effort and never requires another sync commit. Use another sync commit only for a later retry of failed checkpoint/report synchronization. Remote errors must not prevent the local checkpoint unless remote state is a functional dependency.
- **Checkpoint commit:** Record the intended label `[S01] <description>` before committing. Put the resulting SHA in the remote completion report or a later sync commit; never require a commit to contain its own SHA.
- **Blocked checkpoint:** If blocked, record diagnostics, retained progress, recovery condition, UTC finish, available usage, and `remote: pending`; commit `[S01 blocked]`, then record the remote attempt in `[S01 sync]` using the same rules.
- **Blocking and recovery:** Define diagnostics, retained progress, and conditions to resume.

Describe the implementation sequence and user flow for this slice.

Repeat the complete slice section as `S02`, `S03`, and so on for every additional implementation slice.

## Slice SNN — final integration

Replace `SNN` with the next sequential slice ID after all implementation slices. Use the same fields as S01 and include complete build, type, lint, test, acceptance, documentation, lessons, and requirement-evidence reconciliation. Perform and record a whole-plan test-coverage analysis across requirements, user flows, integration boundaries, failure/recovery paths, and regressions, including all remaining gaps and their disposition. For medium and large plans, require independent defect-first review unless the plan explicitly justifies why it is unnecessary.

## Acceptance

List final functional, technical, documentation, and evidence requirements.
