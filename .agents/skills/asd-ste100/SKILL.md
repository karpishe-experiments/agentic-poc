---
name: asd-ste100
description: Rewrite agent-authored technical English to reduce ambiguity while preserving facts, modality, conditions, and scope. Use for plans, reviews, explanations, status reports, documentation prose, PR text, and issue evidence; do not rewrite code, commands, identifiers, quotations, logs, user-owned wording, or creative copy unless explicitly requested.
---

# ASD-STE100-Inspired Agent Prose

Write agent-authored prose so a downstream agent or non-native English reader can
interpret it without clarification. Use STE-flavored mode by default: enforce clear
sentence structure while treating dictionary-dependent word rules as advisory.

## Rewrite

1. Read the source for meaning before editing it.
2. Preserve every fact, uncertainty marker, condition, exception, number, and scope
   boundary. Never convert `may`, `could`, or `likely` into certainty.
3. Prefer active voice, one action or claim per sentence, simple tenses, consistent
   terms, short noun groups, and lists for three or more steps or conditions.
4. Replace nominalizations, soft phrasal verbs, stacked hedges, and unsupported
   marketing adjectives with direct language.
5. Stop simplifying when further compression would reduce precision. If the input is
   already clear, keep it unchanged.

Preserve code, commands, identifiers, quotations, logs, and user-owned wording
exactly unless the user explicitly asks to rewrite that material. Do not apply this
skill to creative or persuasive copy where voice is part of the requested outcome.

Return only the rewritten text by default. If precision requires a deliberate
departure, add one `Kept as-is:` line. When the user asks for reasoning or a diff,
return a before/after table that names each applicable rule instead.

Read [references/writing-rules.md](references/writing-rules.md) when detailed rule
guidance is necessary. Read [references/examples.md](references/examples.md) when a
before/after pattern would help.

## Compliance Boundary

This skill is inspired by ASD-STE100. It does not include the official approved-word
dictionary and cannot certify ASD-STE100 compliance. Use the official standard for
regulated aerospace or defense documentation.

Adapted from `danyuchn/asd-ste100-skill` version 0.4.0 at commit
`d5ce157870cf9c41efd1d6e836706a2be3c7b9da`. See `LICENSE.upstream` and the package
`THIRD_PARTY_NOTICES.md`.
