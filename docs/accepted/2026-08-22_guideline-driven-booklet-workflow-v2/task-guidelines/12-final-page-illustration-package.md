# Guideline — Generating a Final Page Illustration Package

**Applies to:** every cover, endpaper, front-matter, story, closing, and back-cover page in an illustrated children’s book.

## Purpose

Create one final, approval-ready page image from approved project sources without losing story continuity, character identity, location continuity, page rhythm, or readable in-image text.

This is not a workflow for generating generic art and adding copy afterwards. The complete page is designed before generation: art, narration, dialogue balloons, thought balloons, sound effects, titles, and diegetic text must all be part of the planned composition and generated natively in the image.

## Required inputs

Do not begin a final page until every applicable input below is available and approved.

| Input | Required content | Role in the generation |
| --- | --- | --- |
| Final Page Bible | Exact text, text form, speaker, hierarchy, and placement for this physical page; or an explicit no-text decision | Authoritative source for every readable word and where it belongs |
| Page-by-Page Manuscript | The corresponding story beat, action, characters, and setting | Authoritative source for what happens |
| Pagination & Layout Plan | Trim, aspect ratio, working pixels, safe margins, page position, and reading purpose | Controls physical-page consistency |
| Approved Visual Style Package | Style prompt module and approved validation samples | Shared visual language; inject unchanged |
| Approved Character Packages | Character-sheet images and character prompt modules for every named character present | Visual identity and anatomy continuity |
| Approved Location Packages | Location-sheet images and location prompt modules for the setting | Stable architecture, props, and spatial anchors |
| Page Composition Brief | Page-only scene plan, derived from all inputs above | Directs this unique page only |

If a required character or location has no approved reference package, stop and create or approve that package before final page generation. Do not substitute a generic invention.

## Mandatory production sequence

1. **Lock the physical canvas.** State the exact trim, orientation, aspect ratio, working pixel dimensions, bleed, and live-text safe margins. Every reading-sequence page uses that same canvas. A printer’s wraparound cover is a separate output, never a different front-cover page.
2. **Read the Page Bible first.** Copy its text verbatim. Identify every item as one of: title, narration block, speech balloon, thought balloon, sound effect, diegetic prop/screen/sign text, credit, or no text.
3. **Read the manuscript scene.** Extract only the page’s required action, characters, props, emotional beat, and setting.
4. **Write the Page Composition Brief.** Decide focal action, camera/framing, foreground/midground/background, character positions and sightlines, location anchors, visual pacing, and the quiet low-detail space required for each text item.
5. **Select reference files.** Attach the approved character-sheet image for every named character in the scene and the approved location-sheet image for the setting. Also attach any approved style validation sample that is helpful. Do not attach unrelated cast or setting sheets.
6. **Assemble the final image-generation prompt.** Include the shared style module unchanged; page-only scene/composition direction; explicit reference-image roles; all exact Page Bible text; text forms and placements; and page-specific continuity constraints.
7. **Generate one complete candidate page.** The model must render the required text natively as part of the illustration. Never generate generic art first and paste text over it later.
8. **Review against the quality gate.** If text is incorrect, illegible, misplaced, or covers important action, regenerate from a corrected composition brief. Do not patch the image with a post-production overlay.
9. **Save the build record.** Record the exact final prompt, every attached reference file, model settings if available, output filename, review results, and approval state.
10. **Obtain page approval before proceeding.** Treat an approved page as the continuity reference for later pages; do not silently regenerate it.

## Page Composition Brief template

```markdown
# Page Composition Brief — [Physical Page Number / Page Name]

## Canvas
- Trim / aspect / working pixels:
- Bleed and text-safe margins:

## Story purpose
- Manuscript page / beat:
- Emotional beat:
- Required action and cause-effect:

## Scene composition
- Camera and framing:
- Focal action:
- Character positions, gesture, gaze, and full-body/crop requirements:
- Required location anchors and props:
- Foreground / midground / background plan:
- Lighting, time, and colour emphasis:

## Text plan — exact, non-negotiable
| Text item | Exact wording | Form | Speaker | Placement | Visual treatment |
| --- | --- | --- | --- | --- | --- |

## Attached visual references
- Style validation sample(s):
- Character sheet(s):
- Location sheet(s):

## Hard constraints
- Character anatomy / wardrobe continuity:
- Prohibited additions:
- Text restrictions:
```

## Final image-generation prompt template

Use concise natural language. Do not paste whole character or location packages when their sheets are attached; identify the attachment as the visual authority and include only page-specific requirements.

```text
Create one finished [trim / aspect / pixel dimensions] illustrated book page for [book title].

Reference-image priority:
1. [Character sheet]: exact visual authority for [character].
2. [Character sheet]: exact visual authority for [character].
3. [Location sheet]: exact visual authority for the setting.
4. [Style sample, optional]: visual-language reference only.

Use the approved shared style: [insert unchanged Style Prompt Module].

Scene and composition: [insert Page Composition Brief scene direction].

Text must be rendered natively, clearly, and exactly as written below. Design the composition around it; do not cover focal action. [For each item, state its wording, form, speaker, placement, and treatment.]

Hard constraints: [anatomy, wardrobe, required props, prohibited additions, full-body framing, no-extra-text rule].

Do not add any text beyond the specified text items.
```

## Reference-file protocol

- Use reference images as image inputs, not merely filenames in prose.
- Character sheets control identity, wardrobe, silhouette, age, limb count, recurring props, and expression range.
- Location sheets control stable setting geometry, signature architecture, materials, and recurring props.
- The Page Bible controls wording and text form. It outranks aesthetic improvisation.
- The Page Composition Brief controls camera, staging, lighting, mood, and text-safe negative space. It must not redefine shared character or location facts.
- Attach only references visible in the intended page. Avoid overloading the model with unrelated visual sources.
- Record the full attachment list in the build record. A later user must be able to reproduce the generation without guessing.

## Quality gate

Approve a page only when all checks pass.

| Category | Required check |
| --- | --- |
| Canvas | Exact project aspect ratio, pixel dimensions, and full-page framing |
| Story | Required action reads immediately and matches the manuscript |
| Text | Every required word is present, spelled correctly, legible, and in its planned form and placement |
| Composition | Text has intentional quiet space and does not obscure characters, action, or key setting information |
| Character continuity | Correct identity, age, clothing, accessories, anatomy, and required limb representation |
| Location continuity | Required anchors and spatial logic match the approved location reference |
| Style | Matches the approved visual style and does not drift into a different medium or franchise |
| Safety / scope | No unapproved characters, props, powers, violence, labels, watermarks, or extra text |

## Common failures and corrections

| Failure | Correction |
| --- | --- |
| Text is added after the art and obscures it | Regenerate with the text plan included in the image prompt and with intentional negative space |
| Text is misspelled or unreadable | Regenerate; shorten or reflow only if the Page Bible is explicitly revised and approved |
| Speech is written as narration | Rebuild the prompt with an explicit balloon type, speaker, and pointer direction |
| A character or location drifts | Reattach its approved sheet and state that it is the exact visual authority |
| A full body is accidentally cropped | Add an explicit framing constraint and regenerate; do not stretch or crop the page |
| Different pages have different formats | Reject before review; regenerate at the locked project canvas |
| Generic art is reused as the page base | Discard it and generate a new composition from the complete input set |

## Deliverables per final page

1. Page Composition Brief
2. Final assembled generation prompt
3. Build record with exact attached references
4. Final natively lettered page image
5. Approval/version record
