# Guideline — Generating a Location Definition Package

**Artifact guideline:** 08  
**Status:** Draft awaiting approval

## Objective

Create one stable, reusable visual source for a single story location without turning the location package into a page illustration brief.

## Required outputs, in mandatory order

1. **Location Definition Profile** — human-readable, stable location facts only.
2. **Location-Sheet Prompt Module** — machine-ready, location-specific only.
3. **Assembled Location-Sheet Build Record** — records the unchanged approved Visual Style Prompt Module plus the location module.
4. **Location Sheet Image** — generated from that assembled build.
5. **Approval / Version Record** — complete only after user approval of both the definition and sheet.

## Rules

- Do not generate a location sheet until its profile and prompt module are approved, unless the user explicitly requests a combined visual-review draft.
- Inject the approved Visual Style Prompt Module unchanged. Never copy or paraphrase its shared art direction into the location module.
- A location module may define architecture, scale, spatial anchors, material character, recurring fixtures, navigation landmarks, and stable atmosphere. It must not define time of day, weather, lighting, page action, character placement, composition, text-safe space, or page text.
- A location sheet must be a clear production reference: wide establishing view plus two to four detail or alternate-angle studies, with no labels, captions, text, watermark, logos, or characters unless scale figures are explicitly required.
- Generated image filenames are workflow-only: `08_Location_Sheet_01.png`, then sequentially. Never put the location, story, subject, or scene in the generated image filename.
- Revisions replace the current numbered image and its build record in place. Do not keep superseded sheet generations.

## Quality checks

- The location is recognisable across future page art from its stable anchors.
- It can accommodate every approved manuscript beat assigned to it without pre-composing a page.
- It is visually distinguishable from other story locations.
- The resulting image demonstrably uses the approved shared visual style plus only local setting direction.

## Common failures

- Creating a generic “city” rather than a specific reusable place.
- Fixing dawn, rain, or a plot event into the setting definition.
- Generating an image before recording the location-specific prompt module.
- Adding text labels or crowd characters that later lock unwanted page-level facts.
