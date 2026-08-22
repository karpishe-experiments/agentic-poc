# Writing rules

Use this reference when the input needs detailed sentence-level analysis.

## Structural rules

- Prefer active voice when the actor is known and relevant.
- Put one instruction or independently testable claim in each sentence.
- Keep instructions near 20 words and descriptions near 25 words when precision
  permits. Split long sentences instead of deleting qualifiers.
- Avoid semicolons and long chains of subordinate clauses.
- Keep noun groups to three stacked words when possible.
- Keep subjects, verbs, and articles explicit when omission could create ambiguity.
- Use numbered or bulleted lists for three or more steps or conditions.
- Keep one topic per paragraph.

## Meaning-preservation rules

- Keep modality and confidence: `may fail` is not `fails`.
- Keep conditions, exceptions, quantities, units, and scope boundaries.
- Do not infer a cause, frequency, actor, or mechanism that the source does not state.
- Keep necessary technical terms. Define an uncommon term once when the audience
  needs the definition.
- Use the same term for the same entity or action throughout one artifact.

## Lexical guidance

Prefer direct verbs over action nouns: `analyze` instead of `perform an analysis`.
Prefer one-word verbs over ambiguous phrasal verbs. Remove stacked hedges and
unmeasured promotional adjectives. These are clarity rules, not official approved
word checks.

## Modes

The package default is STE-flavored mode. It applies structural and
meaning-preservation rules but treats lexical guidance as advisory. Use strict mode
only when the user explicitly requests it or when writing a tool contract, error,
procedure, or safety instruction whose ambiguity has material cost.

The official ASD-STE100 dictionary is not included. Do not claim certified
compliance.
