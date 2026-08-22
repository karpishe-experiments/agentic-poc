---
name: sync-docs-issues
description: Reconcile canonical documentation and GitHub issue evidence with a verified final diff. Use after implementation and review, or when asked to check whether code, docs, and an associated issue remain aligned; do not close issues or manage project fields.
---

# Sync Docs and Issues

Read the repository adapter, final diff, validation evidence, and canonical docs.
Update the nearest canonical source when verified behavior, setup, architecture,
interfaces, constraints, or developer workflow changed. Revise stale guidance and
link instead of duplicating. If no documentation change is needed, record a concise
evidence-based rationale.

When the repository provides a learning-capture skill, invoke it for durable,
verified lessons. Do not turn current-state documentation into a work log and do not
record assumptions as facts.

For issue-backed work, prepare one concise evidence comment containing the outcome,
validation, documentation impact, learning impact, and PR link. Posting that comment
is allowed after the PR exists. Never close the issue, change labels or milestones,
or mutate GitHub Project fields unless separately requested.
