---
name: capture-project-learnings
description: Capture verified implementation knowledge as accurate project documentation and concise lessons that can be promoted into a main project's docs or agent skills. Use after completing, debugging, or evaluating an experiment; when behavior or setup has changed; when an agent discovers a reusable workflow, constraint, failure mode, or decision; or when preparing playground findings for transfer to another repository.
---

# Capture Project Learnings

Turn completed work into durable, evidence-based guidance without creating documentation noise.

## Workflow

1. Inspect the implementation, tests, existing documentation, and relevant diff. Do not document assumptions as facts.
2. Identify what changed and which observations are transferable beyond the current experiment.
3. Update the nearest canonical documentation when behavior, setup, architecture, or constraints changed. Prefer editing an existing document over adding a competing source of truth.
4. Record only reusable lessons in the project's lessons file. If none exists, create it from `assets/lessons-learned-template.md`.
5. Mark promotion candidates that would benefit the main project as either:
   - **Documentation** for product behavior, setup, architecture, or operational guidance.
   - **Agent instruction** for durable repository-wide rules.
   - **Agent skill** for a repeatable, multi-step workflow that needs specialized guidance or reusable resources.
6. Verify every updated path, command, link, and behavioral claim against the repository.
7. Summarize updated docs, captured lessons, promotion candidates, and anything intentionally left undocumented.

## Documentation rules

- Write for the next contributor or agent performing the task.
- Capture current behavior and rationale; omit a chronological work log.
- Keep repository-specific details in project docs and broadly reusable procedure in skills.
- Preserve the established structure, terminology, and level of detail.
- Remove or revise stale guidance made incorrect by the change.
- Link to canonical sources instead of copying large sections.
- Include commands only when they were verified or are clearly labeled as unverified.
- Never include secrets, credentials, private data, transient logs, or unsupported conclusions.

## Lesson quality bar

Record a lesson only when it is supported by code, tests, observed behavior, or a reproducible failure. Each lesson must state:

- the context in which it applies;
- the verified observation;
- the recommended reusable guidance;
- the supporting evidence;
- the intended promotion target, if any.

Merge duplicates and revise contradicted lessons instead of appending another entry. Keep experiment-only trivia out of the durable record.

## Promotion criteria

Promote a lesson only when it is repeatable, useful outside the experiment, and unlikely to encode a temporary workaround.

- Choose **documentation** when humans and agents both need stable project knowledge.
- Choose **agent instruction** when the rule should apply to most work in the target repository.
- Choose **agent skill** when the knowledge forms a triggerable workflow with meaningful procedural guidance.
- Keep the item as a candidate when evidence is incomplete or the main project's conventions are unknown.

When preparing a promotion, make the content self-contained, remove playground-specific paths and names, and identify assumptions that must be revalidated in the target repository.
