# *Milo the Village Postcat* — Production Roadmap

## How this package will be built

Each stage has a dedicated Markdown record. We approve its outcome before using it as input to the following stage. This keeps character design, locations, image prompts, text, and final layouts consistent.

## Fixed story constraints

- The book has **six pages total**: one cover and five story pages.
- Every page is a full illustration with text added in layout after image generation.
- The story and page briefs are in this folder; character consistency is governed by [`../Milo_the_Village_Postcat_Character_Bible.md`](../Milo_the_Village_Postcat_Character_Bible.md).
- The visual mood is warm, gentle, and suitable for children aged 3–5.

## Production stages and records

| Stage | Outcome to approve | Record file |
| --- | --- | --- |
| 0. Creative brief | Page format, art direction, audience, and output requirements | `01_Creative_Brief.md` |
| 1. Style system | The reusable GPT-Image master prompt and negative constraints | `02_Master_Visual_Style.md` |
| 2. Character references | Prompts, selected reference images, and character corrections | `03_Character_Reference_Sheets.md` |
| 3. Location references | Prompts, selected reference images, and Poppywick environment rules | `04_Location_Reference_Sheets.md` |
| 4. Page planning | Composition thumbnails, visual pacing, and text-safe zones | `05_Page_Composition_Plan.md` |
| 5. Page prompts | One approved final-generation prompt for each of the six pages | `06_Final_Page_Prompts.md` |
| 6. Final art review | Selected illustrations, revisions, and visual continuity checks | `07_Illustration_Review.md` |
| 7. Book layout | Typography, text placement, export settings, and final verification | `08_Final_Book_Layout.md` |

## Working rules

- Generate all illustration art **without embedded title text, narration, speech bubbles, or readable letter text**. Text is typeset later for reliability and accessibility.
- Reference sheets are not optional: approved character and location images are supplied as visual references for every final illustration.
- We change one variable at a time during revision: character identity, composition, environment, or detail—not all at once.
- Every final page must preserve Milo’s three forehead stripes, green eyes, navy cap, cream shirt, red satchel, and red bicycle whenever those elements are in view.

## Current status

**Stage 0 — Creative brief:** awaiting format, style, and output decisions.
