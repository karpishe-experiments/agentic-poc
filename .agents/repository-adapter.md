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

<!-- core-agent-skills:adapter-v0.2:start -->
## Core workflow safeguards

- Sensitive or contract-changing surfaces: security, persistence and schemas,
  migrations, public contracts, runtime agents and skills, workflow stages and
  jobs, providers and integrations, dependencies and build configuration, and
  architecture boundaries
- Documentation relationships: keep `AGENTS.md` and `skills-lock.json` aligned with
  installed skills; update `docs/architecture.md` for runtime ownership or boundary
  changes; update the applicable experiment brief, accepted PRD, `PLAN.md`, and
  `LESSONS-LEARNED.md` only for the scope each document owns. No additional catalog
  or context map is configured.
- Generated-document ownership: retained evaluation PDFs and manifests are owned by
  their evaluation workflow and scripts; they are evidence artifacts, not canonical
  documentation. Canonical documents listed above are authored sources.
- Validation relevant inputs: affected source, tests, configuration, dependencies,
  generated inputs, and environment assumptions; agent behavior also includes
  schemas, agent defaults, skill registry, and fixtures; persistence also includes
  schemas, repositories, seeds, migrations, and database configuration
- Issue evidence marker: `<!-- agent-change-evidence -->`
- Issue evidence policy: one idempotent post-PR comment containing outcome,
  validation, documentation and learning impact, reviewed SHA, and PR link
- Publication base: `master`
- Reviewed-diff identity: publication must use the exact reviewed commit/diff;
  later relevant changes require affected validation and review
<!-- core-agent-skills:adapter-v0.2:end -->
