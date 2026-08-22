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

Use only documentation relationships, catalogs, or context maps named by the
adapter. Keep them synchronized when their cataloged interface changes. Detect and
correct stale local links, duplicated authority, undocumented generated-artifact
ownership, and temporary guidance that lacks a removal condition. Do not invent new
catalogs or governance layers for repositories that do not configure them.

When the repository provides a learning-capture skill, invoke it for durable,
verified lessons. Keep current-state documentation separate from chronological
lessons, and do not record assumptions as facts.

For issue-backed work, re-fetch the issue immediately before commenting. Prepare one
concise comment containing the adapter's stable evidence marker, outcome, validation,
documentation impact, learning impact, reviewed commit SHA, and PR link. Search the
current issue comments for that marker and reviewed SHA; do not post a duplicate.
Posting the unchanged comment is allowed after the PR exists. Never rewrite the issue
body, close the issue, change labels, assignment, or milestone, or mutate GitHub
Project fields unless separately requested.
