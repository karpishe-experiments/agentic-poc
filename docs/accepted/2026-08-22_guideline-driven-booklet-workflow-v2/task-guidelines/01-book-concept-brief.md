# Guideline: Generating a Children's Book Concept Brief

## Purpose

Create a concise, coherent concept brief that turns a user's raw book idea into a reliable creative anchor for later story, character, manuscript, and illustration work.

This is **not** the full plot, manuscript, or character bible. It defines what the book is fundamentally about and sets constraints that later artifacts must inherit.

## Required Inputs

| Input | Rule |
| --- | --- |
| User's initial prompt | Accept it in free form. Do not force a template. |
| Target age | Mandatory in the finished brief. If absent, ask for it before drafting. |
| Core idea and desired feeling | Extract from the prompt. Ask only when a missing detail would materially change the concept. |
| Representation or sensitivity constraints | Treat user-provided identity, disability, family, culture, or emotional constraints as story-shaping requirements, not decorative details. |

## Working Method

### 1. Receive and preserve the user's intent

Summarize the idea internally in one sentence. Separate:

- **Hard requirements:** facts and constraints the concept must honour.
- **Soft references:** tonal or emotional inspiration that must not be copied literally.
- **Open creative territory:** elements the agent can propose.

Never turn a soft reference into an unnecessary literal constraint. For example, a child liking a famous superhero can indicate the desired energy and genre, not a requirement for that hero's powers or imagery.

### 2. Collect only essential missing information

The target age is always required. Ask for it if it is missing.

Ask one concise question at a time only when the answer changes the story's central direction. Otherwise, make a clearly bounded creative proposal. Do not interrogate the user for details that belong to later artifacts, such as costume design, page count, or exact character names.

### 3. Offer options when the story direction is open

If the user has not selected a premise, propose **three** options by default.

Each option should be 2–4 skimmable sentences or about 35–70 words. It must include:

1. a protagonist at a meaningful emotional starting point;
2. a clear inciting event;
3. one central challenge or antagonist;
4. a plausible first resolution or transformation.

Make the options genuinely distinct in story engine, not merely in names or scenery. Do not give abstract fragments such as “a magical adventure.”

### 4. Stress-test coherence before presenting a concept

Check that the concept has a causal sequence:

> starting emotional situation → disrupting event → new possibility/problem → first meaningful test → emotional change

Verify that the challenge arises naturally from the setting or inciting event. The first villain or obstacle should be proportionate to a young hero's first adventure and allow an active, age-appropriate solution.

### 5. Draft the concept brief

Once a direction is selected or clearly supplied by the user, write the brief using the template below. Keep it concise, specific, and usable.

The first version is always a **draft**. Present it for review and revise it from the user's feedback. Do not label it approved, treat its choices as locked, or advance to the next artifact until the user explicitly approves it.

### 6. Validate against the audience and constraints

Before finalizing, test the brief against the intended age and the user's non-negotiables. State unresolved decisions as deferred rather than inventing them.

## Required Brief Template

```md
# Book Concept Brief — *Working Title*

## Status

**Draft — awaiting user approval**

> Change this status to **Approved** only after the user explicitly approves the brief. Record any approval note or decision that materially affected the final version.

## Source Prompt

> [Short faithful restatement of the user's request]

## Audience

- **Primary reader:** [age or range]
- **Reading experience:** [independent / shared read-aloud / both]
- **Story expectations:** [age-calibrated sentence]

## Core Premise

[One or two short paragraphs covering setup, inciting event, central challenge, and first resolution.]

## Narrative and Emotional Arc

| Story phase | Protagonist's inner state | Narrative shift |
| --- | --- | --- |
| Beginning | | |
| Inciting event | | |
| First test | | |
| Resolution | | |

## Character and Representation Requirements

- [Character-defining facts, relationships, representation requirements, or sensitivity guardrails required by the prompt.]
- [Omit this section only when there are genuinely no such requirements.]

## Creative Direction and Tone

- [Genre, energy, and emotional atmosphere.]
- [IP-inspired references translated into non-copying tonal guidance, where applicable.]

## Story Dynamics

- **Catalyst:**
- **New story possibility:**
- **Central opposition or challenge:**
- **Decisive action or turning point:**
- **Scope of stakes:**

## Intended Takeaway

[One clear, child-appropriate idea.]

## Guardrails for Later Artifacts

- [Age and safety requirements.]
- [Causality and representation requirements.]
- [Important intentionally deferred decisions.]
```

## Approval Gate

Do not save the draft as a completed output or create its reusable generation guideline until the user has explicitly approved the brief. Keep the draft in the working area while it is under review.

Once approved, update the status to **Approved**, save the finished concept brief to outputs, and then create or finalize the reusable guideline.

## Quality Checklist

Approve only if every answer is yes:

- Is the target age explicitly stated?
- Does the premise preserve the user's actual idea and constraints?
- Can a child understand why the story starts, what changes, and why the hero acts?
- Does each major story beat cause the next one?
- Is the emotional journey as clear as the external action?
- Is disability or other representation handled as a lived part of the character rather than a defect, cure, or shortcut to inspiration?
- Are all creative references transformed into original, non-infringing story choices?
- Is the central challenge age-appropriate and resolved without graphic violence?
- Are later decisions deferred instead of prematurely invented?
- Is the status still clearly marked as draft unless the user has explicitly approved it?

## Anti-Patterns

- Asking for every detail before offering a useful direction.
- Making three options that differ only cosmetically.
- Reducing a disability to a problem the story must solve.
- Treating a fan preference as permission to copy a known character or franchise mechanics.
- Writing a mood board instead of a causal story premise.
- Making the first villain too dark, violent, or world-ending for the reader's age.
- Locking names, visual style, page count, or subplot details before the relevant artifact.
