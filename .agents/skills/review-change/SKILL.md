---
name: review-change
description: Perform an independent read-only review of a proposed code or documentation change. Use after implementation or when explicitly asked to review a diff; do not edit, publish, or manage issue state.
---

# Review Change

Read the repository adapter, task contract, plan, complete diff against the intended
base, relevant code and tests, live issue acceptance criteria when applicable, and
validation evidence. Follow `.agents/agents/reviewer.md`.

Prioritize correctness, regressions, unsafe behavior, missing acceptance criteria,
public or persisted contract compatibility, production/test/documentation gaps,
and unnecessary parallel abstractions where a suitable existing surface should be
extended. Identify validation that is missing or stale because relevant inputs
changed, and require affected checks after every correction. Leave documentation
reconciliation to `sync-docs-issues`.

Return only actionable defects, ordered by severity, with stable IDs, precise
evidence, affected paths, and bounded corrections. Keep style preferences and
optional improvements as non-blocking notes. Return `Pass` when no blocking issue
remains.

When a change-surface forecast exists, the change is risky or cross-cutting, the
plan materially changed, or the user requests it, finish with a compact
`Final comparison`. Compare forecast or plan with the actual reviewed diff for
changed and unchanged surfaces, acceptance-criteria coverage, validation,
documentation impact, material divergence, and residual risk. Mark each relevant
category `Matched` or `Diverged`. Harmless variance is a non-blocking note.
Missing or stale validation is blocking, as is divergence that exposes an actionable
defect, missing required documentation, or a task-contract or material-risk gap.
A localized low-risk change may omit this comparison.

Stay read-only: never correct the diff, commit, push, publish, merge, close issues,
or change project metadata.
