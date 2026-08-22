# Guideline — Generating a Pagination & Layout Plan

**Artifact:** 09 — Reusable guideline
**Status:** Draft awaiting approval

## Purpose

Translate an approved page-by-page manuscript into a print-aware book sequence without prematurely designing individual illustrations or rewriting the manuscript.

## Required Inputs

1. Approved page-by-page manuscript.
2. Target readership and reading format.
3. Approved Character List and Required Locations List.
4. Approved Visual Style Package, character packages, and location packages available at this point.
5. Any specified trim size, printing method, language direction, and publisher requirements. If unspecified, label a practical format recommendation as a proposal.

## Required Output

Create one Markdown plan containing:

1. Status, source artifacts, and an explicit physical-book assumption.
2. Total physical page count, including whether cover pages are counted separately.
3. A book-architecture table for covers, front matter, story pages, and closing matter.
4. Global rules for trim size, orientation, a single fixed aspect ratio and working pixel canvas for every physical page, safe text margins, full bleed, text capacity, and continuity-source routing.
5. One ordered row for every physical page or meaningful page group.
6. A page-turn rhythm table, focused on narrative questions and payoffs.
7. A source-routing section naming the approved character and location packages each page will use.
8. An approval gate that clearly states what the plan approves and what remains page-specific.

## Method

1. Preserve every approved manuscript page in order before adding cover or ancillary pages.
2. Lock the physical trim, orientation, aspect ratio, working pixel dimensions, bleed, and safe margins before any page art is generated. Apply that one canvas to every physical page in the reading sequence. Treat a printer's wraparound cover as a later, separate production export.
3. Select a physical page count compatible with the intended production method. For standard saddle-stitched printing, total pages including the cover should normally be a multiple of four.
4. Add front matter and closing matter only when they serve a reading or production purpose. Never add filler story beats to solve a page-count constraint.
5. Estimate text load from the approved manuscript; assign one calm text-safe zone to each illustrated story page.
6. Vary text-zone placement to serve the page’s future composition, but do not prescribe final camera, staging, weather, time of day, or art direction.
7. Identify high-value page turns: reveals, decisions, reversals, discoveries, and emotional landings.
8. Route each page to its approved visual source modules. Keep the page plan as a source map, not a duplicate of character or location definitions.
9. Validate the plan against the manuscript and canvas lock: no reordered causality, missing manuscript beat, duplicated narrative page, unapproved story addition, or candidate page at a nonconforming ratio.

## Text and Image Rules

- Keep all readable text inside the live-text safe margin. The trim, bleed, and binding allowances must be explicit or marked as production assumptions.
- Do not ask image generation to render narration, page titles, headlines, dialogue, labels, or credits. Typeset them later.
- A text-safe zone is a protected composition constraint, not a mandate for blank white space. It may be calm sky, wall, floor, shadow, open interior area, or a deliberately contained panel.
- Use page-specific illustration packages for exact visual direction. The layout plan decides *where text can live*, not every element of the scene.

## Quality Checks

- Every approved manuscript page appears exactly once and remains in sequence.
- Every physical page specifies and uses the same approved trim, aspect ratio, and working pixel dimensions; no cover or interior page may silently use a different canvas.
- Total physical page count is technically plausible for the stated format.
- Cover, title, legal/credit, and back-cover needs are explicitly accounted for.
- No page contains text too close to trim, gutter, or barcode space.
- Each story page identifies an amount and placement strategy for text without duplicating the manuscript.
- Important reveals land after deliberate page turns.
- Every page that includes a recurring character or defined setting identifies its approved source package.
- The plan contains no invented character design, location design, scene time, weather, or final illustration composition.

## Common Failures

- Treating manuscript page numbers as physical production page numbers without mapping them.
- Forcing a fixed text box onto every page, which makes the book visually repetitive.
- Creating an invalid print page count.
- Cutting, merging, or inventing story beats to make pagination easier without manuscript approval.
- Starting page-art generation before the pagination plan has been approved.
- Replacing approved character/location sources with fresh generic prompt descriptions.
