# Illustrated Children’s Book: Artifact Structure

This guide defines the core working artifacts for developing an illustrated children’s booklet. Each artifact builds on the previous ones, helping keep the story, visual world, and final pages consistent.

## Artifact Register

| # | Artifact | Purpose | Key contents |
| --- | --- | --- | --- |
| 1 | **Book Concept Brief** | Establish the book’s creative foundation. | Premise, audience age range, tone, format, emotional or learning goal, and a short one-sentence promise. |
| 2 | **Story Outline** | Shape the narrative before writing final prose. | Beginning, middle, ending, page-by-page beats, conflict or mystery, resolution, and emotional arc. |
| 3 | **Page-by-Page Manuscript** | Establish the complete child-facing story before defining the cast or setting. | Narration/dialogue by story page, required action, characters, and setting; no visual design or layout decisions. |
| 4 | **Character List** | Derive the story-required cast from the approved manuscript. | Narrative role, pages, relationship notes, recurrence/continuity need, and design routing. |
| 5 | **Visual Style Package** | Establish, visually validate, and record the reusable visual language. | Draft Style Definition, canonical Style Prompt Module, 2–4 varied validation samples, feedback record, and approved samples. |
| 6 | **Individual Character Package** | Create an approved, reproducible design source for each character needing visual continuity. | Character Design Profile → character-only Character-Sheet Prompt Module → assembled build record → numbered Character Sheet Image → approval/version record. The sheet is generated only from the approved shared Style Prompt Module plus the character module. |
| 7 | **Required Locations List** | Derive only the settings needed by the approved manuscript. | Location, pages, story need, continuity need, and routing. |
| 8 | **Location Definition Package** | Create an approved, reproducible visual source for each location in scope. | Location Definition Profile → location-only Location-Sheet Prompt Module → assembled build record → numbered Location Sheet Image → approval/version record. The sheet is generated only from the approved shared Style Prompt Module plus the location module. |
| 9 | **Pagination & Layout Plan** | Turn the approved manuscript into a practical book sequence. | Page count, cover/title/end matter, orientation, text allocation, text-safe areas, and page turns. |
| 10 | **Final Page Bible** | Lock the exact readable content and visual text treatment of every physical page before final art is generated. | Cover/title/credit text, narration, dialogue, headlines, intentional no-text decisions, hierarchy, native text form (block, balloon, sound effect, or prop), and placement notes for every physical page. |
| 11 | **Page Illustration Package** | Direct, generate, and record each final page. | Exact locked Page Bible entry + page-only art prompt + assembled build record + final natively lettered page image + approval/version record. |
| 11 | **Production Checklist** | Prepare the booklet for final delivery. | Dimensions, resolution, bleed, safe margins, typography, proofing, file naming, export settings, and final page order. |

## Dependency Map

```text
Concept Brief → Story Outline → Page-by-Page Manuscript
  → Character List → Visual Style Package → Character Packages
  → Required Locations List → Location Packages
  → Pagination & Layout Plan → Final Page-Text Script → Page Illustration Packages → Production Checklist
```

## Recommended Working Order

1. Start with the **Book Concept Brief**, then build the **Story Outline**.
2. Draft and approve the complete **Page-by-Page Manuscript**. It is the source for character and location decisions.
3. Derive the **Character List** from the manuscript, keeping detailed visual design open.
4. Draft the **Visual Style Package** before any reference sheet or page image is produced: a human-readable Style Definition and a separate canonical Style Prompt Module. The prompt module is the shared visual input and must not be manually rewritten in other prompts.
5. Generate **2–4 Style Validation Samples** from the draft Style Prompt Module. Use varied, non-final test scenes that expose the important style dimensions: a close emotional moment, a wider environment, an energetic action moment, and, where useful, an object or detail study. These images validate the visual language, not a final character design or book page.
6. Ask the user to approve, select, or comment on the samples. Revise the Style Definition and Style Prompt Module as needed, then regenerate only the samples needed to resolve the feedback. The package remains a draft until the user explicitly approves it.
7. Record the approved **Visual Style Package** as three linked results: the final human-readable Style Definition, the final reusable Style Prompt Module, and the approved sample images with their exact assembled generation prompts. Retain the samples as visual references for later generations.
8. Build an **Individual Character Package** for every character that needs a consistent illustrated presence. The mandatory order is: approve profile → approve character module → assemble the unchanged Style Prompt Module + character module → generate the numbered sheet → approve the sheet.
9. Derive the **Required Locations List** from the approved manuscript, then build a **Location Definition Package** for every location in scope. The mandatory order is: approve definition profile → approve location module → assemble the unchanged Style Prompt Module + location module → generate the numbered sheet → approve the sheet. Location profiles define stable reusable facts only; time, weather, lighting, plot action, composition, and text-safe space belong to the page illustration package.
10. Create the **Pagination & Layout Plan** to decide what each page needs to accomplish.
11. Create and lock the **Final Page Bible** before generating page art. It must assign exact readable text or an explicit no-text decision to every physical page, including cover and back matter, and identify whether each text item is a title, narration block, speech/thought balloon, sound effect, or diegetic prop/screen text. This Bible is the single source of truth for native in-image text.
12. Create the **Page Illustration Packages** one at a time. Before any composition work, lock one project-wide physical-page canvas (trim size, orientation, aspect ratio, working pixel dimensions, bleed and safe margins). Every physical reading-sequence page—front cover, endpapers, title/legal pages, story pages, and back cover—must use that exact canvas. A wraparound printer cover is a separate final-production export and must never be substituted for the front-cover page. Reject a candidate with a mismatched canvas before visual review. Then, for every page, first read its locked Page Bible entry and its manuscript scene/action entry. Turn those two sources into a page-composition brief that reserves purposeful, quiet space for narration; allocates speech/thought balloons to their speakers; places prop text where it belongs in the scene; and states the page's focal action. Then assemble the approved Style Prompt Module, that page-composition brief, the exact Page Bible text, and the relevant approved character-sheet and location-sheet references. Do not generate a final page image from pre-existing generic art, and do not generate a final page image before this complete input exists. The image model must render all approved page text natively as part of the composition, with no post-generation text overlay. Obtain page approval before moving to the next page.
13. Proof and complete the **Production Checklist** before delivery.

## Approval and Reuse Rule

Every project artifact starts as a clearly labelled **Draft awaiting approval**. It becomes approved only after explicit user approval. Each artifact must have a paired, reusable Markdown guideline describing the required inputs, controlled template, generation method, approval gate, quality checks, and common failures.

For image generation, use composable prompt modules rather than copying shared information:

- The **Visual Style Prompt Module** is shared and injected unchanged into every character-sheet and page-illustration request.
- Each **Style Validation Sample** is generated from the draft Style Prompt Module plus a test-scene module. Save both the exact assembled prompt and the generated image. After approval, the samples become visual references; they do not replace the approved Style Prompt Module.
- A **Character-Sheet Prompt Module** contains only the relevant character design and sheet instructions; it is assembled with the Style Prompt Module for its sheet.
- A **Location-Sheet Prompt Module** contains only stable location identity and sheet instructions; it is assembled with the Style Prompt Module for its sheet.
- A **Page-Specific Prompt Module** contains only the scene, composition, in-page positions, text-safe areas, and page-only requirements. Its build may not begin until the page's exact **Final Page-Text Script** entry is available. It is assembled with the Style Prompt Module and the approved character-sheet and location-sheet references required by the page.
- The saved **assembled prompt** must accurately record every injected module and reference used for the resulting image. It is a build record, not a duplicate authoring source.

## First Working Artifact

Begin with the **Book Concept Brief**. It gives every later decision a shared creative anchor.
