# Guideline — Generating an Individual Character Package

**Artifact guideline:** 05  
**Status:** Approved reusable guideline — 8 August 2026

## Objective

Create one approved, reproducible visual source for a single character. The package must distinguish character-specific authorship from the shared Visual Style Prompt Module, then validate the written design through an image generated from the recorded assembled prompt.

## Required Inputs

- Approved Concept Brief, Story Outline, and Character List;
- approved Visual Style Definition and Visual Style Prompt Module;
- target character’s story role and representation requirements;
- user-selected character direction, or a request for compact design directions;
- project-wide image naming and replacement rules.

## Required Outputs

1. **Character Design Profile** — human-readable and character-specific.
2. **Character-Sheet Prompt Module** — machine-ready and character-specific only, preferably JSON.
3. **Assembled Character-Sheet Prompt Record** — records the unchanged approved style module, the character module, applicable reference images, and any render settings.
4. **Character Sheet Image** — generated from that exact assembled prompt.
5. **Approval / Version Record** — the package is approved only when the user approves both the profile and sheet.

## Agent Workflow

1. Read approved predecessor artifacts and extract only decisions relevant to this character.
2. Make a **cast contrast pass** before proposing any design. Compare the target against every approved character sheet and profile, then reserve distinct choices of silhouette, outerwear/formality, carrying method, footwear, palette emphasis, prop logic, posture, and movement language. Do not reuse a feature from another character merely because it is a generic genre shorthand.
3. If character direction is open, propose 2–4 short, visibly distinct design directions. Each option must state its silhouette, clothing logic, and signature prop or action. Do not generate an image until the user selects or clearly directs one.
4. Draft the Character Design Profile with the controlled template below. Mark it **Draft awaiting approval**.
5. Draft the separate Character-Sheet Prompt Module. It must include only character identity, body, wardrobe, mannerisms, views, poses, expressions, accessories, and character-specific restrictions.
6. Add a mandatory **Do Not Resemble Existing Cast** section to both the profile and the character module. List concrete prohibited overlaps with each approved character, especially clothing categories, bags/carry systems, palettes, props, and signature poses.
7. Do not restate the Visual Style Prompt Module inside the character module. At generation time, inject the approved style module unchanged.
8. Ask for review of the written profile and prompt module. Revise them until the user approves the direction.
9. Assemble and save the exact character-sheet generation prompt. Generate a professional character sheet using the approved style module plus the approved character module.
10. Name the generated image only by workflow step and sequence, for example `05_Character_Sheet_01.png`; never name it after the character, subject, setting, or story.
11. Ask for explicit approval of the generated sheet. If revisions are requested, replace the current numbered sheet and its prompt record in place. Do not retain superseded image versions.
12. On explicit approval, save the completed package as the canonical version. Later illustrations reference the approved sheet rather than reinterpreting the character from prose alone.

## Controlled Character Design Profile Template

```markdown
# Character Design Profile — [Character Identifier]

**Artifact:** 05A — Individual Character Package [sequence]
**Status:** Draft awaiting approval
**Audience:** [age or age range]
**Based on:** [approved predecessor artifacts]

## Character Purpose
## Chosen Design Direction
## Proposed Identity
| Element | Draft decision |
| --- | --- |
| Working name | |
| Age / life stage | |
| Build and proportions | |
| Physical identifiers | |
| Accessibility / representation requirements | |
| Recurring visual motifs | |
## Wardrobe and Accessories
## Do Not Resemble Existing Cast
## Mannerisms and Acting Notes
## Expression Set
## Continuity Rules
## Character-Sheet Requirements
## Open Decisions for Review
```

## Prompt Composition Rules

- The **Visual Style Prompt Module** is injected unchanged. Do not duplicate or paraphrase it in the character module.
- The **Character-Sheet Prompt Module** must not prescribe a story location, time of day, page layout, plot event, or shared art style.
- The assembled prompt is a build record. Save the inputs and their versions, but do not turn it into another authoring source.
- If reference images are supported, provide the approved style-validation samples and the latest approved character sheet only where they improve continuity. State their purpose in the build record.

## Quality Checks

- The character is instantly distinguishable from every other planned character.
- The cast contrast pass is explicit and passes: silhouette, wardrobe category, carry system, props, palette emphasis, and movement language do not accidentally duplicate an approved character.
- Design choices support the character’s role and the target reader’s age.
- Physical characteristics and accessibility requirements are consistent, respectful, and not reduced to a visual gimmick.
- The sheet has enough views, acting, and accessory information for later page art.
- Generated images have no text, watermark, franchise identifiers, or unintended extra limbs.
- Only one current numbered generated image exists for the step; replacement is in place after feedback.

## Common Failures

- Generating the sheet before the written design is approved.
- Copying the style description into the character-specific module.
- Making every pose action-heavy and failing to show ordinary body language.
- Reusing the protagonist's generic hero shorthand—such as a casual jacket, cross-body sling, utility pouch, or similar footwear—for another character without a deliberate story reason and explicit differentiation.
- Using labels or callout text in the generated image despite the no-text requirement.
- Treating an absent limb, mobility aid, or other representation attribute as a magical device, visual shorthand for trauma, or sole character trait.
- Keeping superseded image generations that could confuse later agents.
