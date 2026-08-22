# Guideline — Generating a Visual Style Package

**Artifact guideline:** 04  
**Status:** Approved reusable guideline — 8 August 2026

## Objective

Create and visually validate a reusable art direction before designing final characters or pages. The package has two authoring sources: a human-readable Style Definition and a machine-ready Style Prompt Module. It also records 2–4 diagnostic validation samples and the exact assembled prompt used for each.

## Required Inputs

- Approved Concept Brief, including mandatory audience age or age range;
- approved Story Outline and Character List;
- user-selected style direction, references, or a request for compact options;
- non-negotiable representation, safety, licensing, and technical constraints;
- desired output format or ratio if known.

## Agent Workflow

1. Extract only the reusable visual implications from the approved story without designing a final protagonist, costume, page, setting, or scene time.
2. If style direction is open, propose 2–4 short, meaningfully distinct directions. Ask the user to choose or combine them.
3. Draft the human-readable Style Definition using the controlled template below.
4. Draft a separate Style Prompt Module, preferably structured JSON. It must contain only shared visual instructions, not scene-specific content. It must not prescribe a time of day, location, weather, or story event.
5. Design 2–4 diagnostic sample scenes that collectively test emotion, environment, action, and a key visual effect or prop. Deliberately vary location and time of day across the set. Make them non-final and avoid locking character identity.
6. For each sample, create a compact test-scene module, assemble it with the unchanged Style Prompt Module, save the exact assembled prompt, and generate the image.
7. Present the samples with their test purpose. Ask for explicit approval or focused comments.
8. Revise only the affected definition/module elements and regenerate only the samples needed to settle feedback. Replace a revised sample in place; do not retain superseded image generations.
9. Mark the package approved only after explicit user approval; preserve approved samples as visual references.

## Controlled Style Definition Template

```markdown
# Visual Style Definition — [Book Title]

**Artifact:** 04A — Visual Style Definition  
**Status:** Draft awaiting approval  
**Audience:** [age or age range]  
**Based on:** [approved predecessor artifacts]

## Purpose
## Chosen Direction
## Visual Language
| Dimension | Direction |
| --- | --- |
| Medium | |
| Drawing / form language | |
| Shape and proportion | |
| Composition | |
| Colour | |
| Lighting | |
| Texture | |
| Special visual effects or motifs | |
| Emotional tone | |
## Readability and Representation Rules
## Exclusions
## Validation Criteria
## Deferred Decisions
```

## Prompt-Module Rules

- The prompt module is canonical and is injected unchanged into character-sheet and page-illustration generations.
- It must include the medium, drawing/form language, palette, lighting, texture, tone, global constraints, and any project-wide representation rule.
- It must not include a specific character’s appearance, wardrobe, action, layout, or text-safe area.
- It must not include a specific location, time of day, weather condition, or story beat.
- Use a page- or character-specific module for those local details. Save the assembled prompt as a build record rather than duplicating the style in downstream authoring prompts.

## Sample Set Design

| Test type | What it validates |
| --- | --- |
| Emotional close scene | Expression, line sensitivity, warmth, and age suitability. |
| Environmental wide scene | Palette, lighting, scale, and world atmosphere. |
| Action/effect scene | Motion clarity, focal hierarchy, and the special visual effect. |
| Optional prop/detail study | Material rendering, recurring motif, or an unusual requirement. |

Name validation images only by workflow step and sequence, for example `04_Visual_Style_Sample_01.png`. Do not name them after their subject or scene.

## Quality Checks

- The chosen look is legible at the target age and supports the story’s emotional tone.
- Samples look like one coherent book, not four unrelated styles.
- No prohibited franchise cues, unsafe imagery, embedded text, or watermark.
- The Style Definition and Prompt Module agree, while staying separated from scene and character decisions.
- Each generated sample has a saved prompt record and clear test purpose.

## Common Failures

- Treating prose alone as style approval; always validate with images.
- Repeating the full style description manually inside every downstream prompt.
- Accidentally locking the protagonist’s final appearance during a style test.
- Choosing samples that all test the same visual dimension.
- Using a style that makes emotion or action difficult for a child to read.
