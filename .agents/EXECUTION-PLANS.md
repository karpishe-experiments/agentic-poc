# Execution plans

Use this guide and [`PLAN.template.md`](PLAN.template.md) for implementation `PLAN.md` files. The plan should be decision-complete and usable by a long-running agent without routine clarification.

## Plan design

1. Inspect the repository and resolve discoverable facts before planning.
2. Define the goal, constraints, architecture, ownership boundaries, risks, deferred scope, and measurable completion criteria.
3. Divide work into ordered vertical slices with observable outcomes and explicit dependencies.
4. Map every slice to requirements, verification, evidence, and a checkpoint commit.
5. Use current official Codex model guidance when selecting concrete models and reasoning effort.
6. Obtain user approval before implementation.

The template does not prescribe a fixed slice count. `S01` is a repeatable example: add `S02`, `S03`, and further slices whenever distinct outcomes or validation boundaries justify them. Give the final integration slice the next sequential ID; replace the template's `SNN` placeholder rather than treating it as a literal ID.

## Adaptive subagents

Classify each slice as:

- `not_necessary`: delegation would cost more than it saves. Explain why.
- `optional`: bounded delegation could help. Define candidate tasks and when to skip them; at execution, record the assignment and result or the reason it was skipped.
- `mandatory`: delegation materially improves cost, context isolation, safe parallelism, specialist validation, or independent review. Define every required assignment.

Subagents are not required merely because a plan is large. Prefer them for focused exploration, isolated implementation, tests, log analysis, artifact inspection, and defect-first review. Delegated edits must have exclusive ownership boundaries. Subagents do not commit, advance the plan, or update project management; the primary agent reviews and integrates their work.

## Model economy

For every slice, identify the primary model and reasoning effort. For optional or mandatory assignments, also identify the delegated model and reasoning effort. Record why each choice is sufficient, its cost/context advantage, its fallback, and when to escalate.

- Use the strongest suitable model for architecture, ambiguity, integration, difficult debugging, and final compliance.
- Use a balanced model for bounded implementation, exploration, tests, and most delegated work.
- Use a fast model only for narrow deterministic work protected by reliable validation.

Large plans should generally keep a strong primary agent focused on orchestration and integration while smaller models handle safe, focused assignments.

## Slice execution

Execute one slice at a time:

1. Mark the slice `active` in `PLAN.md`. Record its UTC start time, starting commit, selected primary model and reasoning effort, and every planned subagent assignment/model; for `not_necessary` or declined optional delegation, record the explicit decision.
2. Perform only its declared work and delegation.
3. Run its automated and manual validation. Analyze test coverage against the slice's changed behaviors, requirements, failure paths, and regression risks; record covered areas, uncovered gaps, and intentionally deferred tests with rationale. Include numeric coverage only when a tool reports it.
4. Review and disposition subagent results. Record each assignment's agent/model, result, verification, and primary-agent disposition; record why optional delegation was skipped when unused.
5. Update `PLAN.md` with state and concise evidence, including finish time and elapsed time. Record primary and subagent token usage only when the execution surface reports it; otherwise record `unavailable` and do not estimate it.
6. Record verified lessons or state that none were found.
7. Mark the slice `closed` in `PLAN.md` with its final evidence, intended checkpoint label, and `remote: pending`. Do not attempt to place the not-yet-created commit's SHA in that commit.
8. Create the local slice checkpoint commit, including the updated plan, before starting the next slice.
9. Attempt the project issue update and push. The checkpoint report must include the resulting checkpoint SHA, slice status and outcome, UTC start/finish, validation passed/failed/not run, test-coverage analysis, selected and actual model/delegation decisions, subagent disposition, token usage or `unavailable`, plan amendments, lessons disposition, blockers, and remote retry status.
10. Update the plan's remote state to `synced` with remote evidence, or `failed/pending retry` with the failed operation and safe error summary. This state describes synchronization of the slice checkpoint and its project report. Create a separate `[Sxx sync]` commit containing only this bookkeeping before starting another slice. Push that bookkeeping commit when practical, but its push does not recursively require another status update or sync commit. Retry failed checkpoint/report synchronization when access returns and record each later result in another slice-scoped sync commit; do not rewrite the original checkpoint.

If blocked, record the blocker, diagnostics, retained progress, recovery condition, UTC finish, available usage, and `remote: pending` in the plan. Create a local `[Sxx blocked]` checkpoint, attempt the remote update/push, and finish with the same `[Sxx sync]` status commit. Do not silently skip a slice or continue into dependent work.

Local plan state, checkpoint commits, and sync commits are the durable fallback when remote project management is unavailable. Remote reporting failures are operational blockers for synchronization, not reasons to batch slices, lose validation evidence, or omit local commits. A later slice may proceed after the predecessor's local checkpoint and sync-status commit unless the plan explicitly makes a remote action a functional dependency. A later ordinary push may carry any unpushed bookkeeping commits.

Attempt a brief project update when a slice starts, naming the slice, start time, selected primary model/reasoning, and planned subagents. If the remote update fails, record that locally and continue; include it in the retry queue alongside the completion update.

Treat `PLAN.md` as a living execution record. Append approved deviations and newly discovered constraints to its amendment log. Do not erase failed validation, completed-slice evidence, or original requirements. Material scope or architecture changes require user approval.

The final integration slice must reconcile requirements with evidence, run the complete verification suite and acceptance flow, and perform a whole-plan test-coverage analysis across requirements, user flows, integration boundaries, failure/recovery paths, and regressions. Record remaining gaps and their disposition. Review documentation and lessons, and include independent defect-first review for medium and large plans unless the plan explicitly justifies otherwise.
