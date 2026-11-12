# Guideline — Generating a Location Sheet Package

## Purpose

Create one approved visual-reference package for every location in the Final Location List. The sheet establishes reusable spatial context for final pages without deciding a specific page's action, composition, text, time of day, or lighting.

## Required inputs

- Approved Final Location List entry for the target location.
- Approved Visual Style Package and unchanged Style Prompt Module.
- Relevant user decisions and approved location sheets where continuity requires comparison.

## Required artifact per location

```markdown
# Location Sheet Package — [Location ID]

**Status:** Draft awaiting approval
**Based on:** [Final Location List version and Visual Style Package version]

## Location Definition Profile
## Stable Environmental Anchors and Required Features
## Location-Sheet Prompt Module
## Assembled Generation Prompt and Reference Record
## Location Sheet Image
## Review, Approval, and Version Record
```

## Sheet requirements

Every Location Sheet Image must include:

1. an isometric plan or overview of the environment, whether open-air or enclosed; and
2. multiple additional views from different angles, collectively showing the surroundings and every stable area required by the Final Location List.

The sheet must make spatial relationships and recurring features understandable. It must not include readable labels, captions, watermarks, logos, or unrelated characters.

## Method and rules

1. Confirm the target location has a stable final-list entry. Ask focused questions if its description cannot support a coherent spatial reference.
2. Draft a location-specific profile and module without restating the shared style module.
3. Generate the sheet from the unchanged shared Style Prompt Module plus the location-specific module.
4. Keep story action, page composition, exact text, weather, time of day, and lighting out of the sheet unless they are stable and explicitly required location facts.
5. Present the sheet for approval. If feedback changes a stable location fact, update the Final Location List and this package together before regenerating.
6. Every final-list location receives its own approved sheet before pagination can be approved.

## Quality gate

- The isometric overview and supporting views make the full space understandable.
- All required anchors and features are present.
- The sheet supports continuity across later pages without pre-composing any one page.
