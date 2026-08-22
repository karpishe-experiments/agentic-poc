---
name: review-change
description: Perform an independent read-only review of a proposed code or documentation change. Use after implementation or when explicitly asked to review a diff; do not edit, publish, or manage issue state.
---

# Review Change

Read the repository adapter, task contract, plan, complete diff, relevant code and
tests, and validation evidence. Follow `.agents/agents/reviewer.md`.

Prioritize correctness, regressions, unsafe behavior, missing acceptance criteria,
public or persisted contract compatibility, and insufficient validation. Confirm
that documentation candidates were identified, but leave reconciliation to
`sync-docs-issues`.

Return blocking findings first with stable IDs and precise evidence. Return `Pass`
when no blocking issue remains. Stay read-only: never correct the diff, commit,
push, publish, merge, close issues, or change project metadata.
