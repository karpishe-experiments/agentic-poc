---
name: work-on-task
description: Validate, plan, implement, review, verify, and publish repository work. Use for requested fixes, features, refactors, or implementation tasks; route rough ideas needing a specification to compile-feature-spec and use repository issue thresholds before editing.
---

# Work on Task

Deliver one bounded engineering task using the consumer's
`.agents/repository-adapter.md` as repository policy.

## Establish the contract

1. Read `AGENTS.md`, the repository adapter, relevant code and tests, and applicable
   domain skills.
2. Decide whether the adapter requires an existing issue or accepted feature spec.
   Localized fixes may use the user's request as the task contract. Do not invent an
   issue requirement beyond the adapter.
3. Resolve discoverable facts from the repository. Ask only for consequential
   product or implementation decisions that cannot be discovered.
4. Write a proportional plan. Small fixes need affected behavior, files, and tests;
   risky or cross-cutting work needs acceptance criteria, interfaces, risks,
   documentation impact, and rollback or compatibility considerations.

## Implement and review

Use `.agents/agents/implementation.md` for the editing pass. When implementation is
complete and the affected validation is current, use `review-change` with the
read-only reviewer contract. A blocking in-scope finding may return for one bounded
correction and re-review. Return to planning when a finding changes scope or the
task contract. Stop after two unsuccessful correction cycles and ask for direction.

## Complete and publish

After Review returns `Pass`, use `sync-docs-issues`. Re-run validation invalidated by
the final documentation or code changes. The agent may then create the adapter's
branch, commit, push, open a PR, and add one evidence comment to an associated issue.

Never merge, deploy, release the consumer application, close an issue, or change a
GitHub Project field without a separate explicit request. Report the PR, validation,
documentation impact, and residual risks.
