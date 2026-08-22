---
name: compile-feature-spec
description: Turn a rough repository feature or experimental idea into a concise implementation-ready specification. Use before engineering when behavior, acceptance criteria, interfaces, or boundaries are not yet decision-complete; do not implement or mutate GitHub state.
---

# Compile Feature Spec

Inspect the repository adapter, current architecture, relevant code, existing
specifications, and tests before asking questions. Produce a specification that is
proportional to the experiment and contains:

- problem, intended outcome, and audience;
- in-scope behavior and explicit exclusions;
- affected boundaries and minimum interface or data changes;
- observable acceptance criteria;
- validation scenarios and documentation impact;
- material risks, compatibility constraints, and resolved assumptions.

Prefer the smallest experiment that tests the stated hypothesis. Do not add
production hardening or project-management machinery unless requested. Save the
spec only when the user asked for a durable artifact. Do not implement, create or
update issues, or publish changes as part of this skill.
