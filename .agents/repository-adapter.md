# Repository adapter

This file is owned by `agentic-poc`. The vendored core package must preserve it.

## Repository

- Canonical GitHub repository: `karpishe-experiments/agentic-poc`
- Base branch: `master`
- Protected branches: `master`; update it through pull requests
- Branch convention: `agent/<short-task-slug>`

## Issue threshold

An existing issue or accepted feature specification is required for features,
migrations, persistent-data changes, public contracts, architecture changes,
security-sensitive work, and cross-subsystem work.

Localized fixes, tests, and documentation work may proceed directly unless listed
above. GitHub Project membership and status are advisory unless this adapter says
otherwise.

## Canonical context

- Architecture: `docs/architecture.md`
- Product or experiment scope: `docs/experiment-brief.md` and accepted PRDs under `docs/accepted/`
- Accepted plans and specifications: `docs/accepted/<experiment>/PLAN.md` and its PRD
- Durable lessons: the applicable `docs/accepted/<experiment>/LESSONS-LEARNED.md`
- Additional scoped instructions: the domain skills listed in `AGENTS.md`

## Validation

- Baseline: `npm run typecheck`, `npm run lint`, and focused Vitest tests
- Focused tests: select the smallest affected test files or workspace; add `npm run test:agent` for agent behavior changes
- Full affected suite: `npm test`
- Build-sensitive changes: `npm run build`
- Conditional validation: use Playwright, MongoDB verification, real-provider smoke/evals, PDF inspection, and retained booklet evaluations only when the changed surface requires them

## Publication

- Agents may create a branch, commit, push, open a PR, and add an evidence comment
  to an associated issue after review passes and validation is current.
- Agents must not merge, deploy, release the consumer application, close issues,
  or change GitHub Project fields unless the user separately and explicitly asks.
