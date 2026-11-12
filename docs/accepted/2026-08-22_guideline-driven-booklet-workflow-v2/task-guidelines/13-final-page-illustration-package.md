# Guideline — Generating a Final Page Illustration Package

## Purpose

Generate, review, and approve one final physical book page from its approved Final Page Bible entry and approved reference artifacts. Each final page is a complete composition: artwork, narration, dialogue, bubbles, titles, and diegetic text are generated as specified by the Bible. No post-generation text overlay is permitted.

## Required inputs

- Approved Final Page Bible entry for the physical page.
- Approved Page-by-Page Manuscript and Pagination & Layout Plan entry.
- Approved Visual Style Package, required Character Sheet Packages, and required Location Sheet Packages.
- The selected generation mode: page by page or batch.

## Required artifact per physical page

```markdown
# Final Page Illustration Package — Page [physical page number]

**Status:** Draft awaiting approval | Approved
**Page ID:** [stable physical-page identifier]
**Based on:** [approved source versions]

## Page Composition Brief
## Attached Reference Record
## Final Assembled Generation Prompt
## Candidate and Approved Asset Record
## Review, Approval, and Revision Record
```

## Method and rules

1. Read the Page Bible first. Its exact text, form, speaker, panel/image assignment, and placement are non-negotiable unless the Bible is revised and reapproved.
2. Use the Pagination & Layout Plan's fixed canvas, font/bubble system, and panel structure. Use attached Character and Location Sheets as the visual authority; do not recreate their descriptions in prose.
3. Build a page-specific composition brief: focal action, panel composition, framing, character placement, required location anchors, text-safe areas, and visual pacing.
4. Generate the complete page with its required text and bubbles natively integrated. Reject generic art followed by pasted text.
5. In page-by-page mode, present the candidate immediately for review. In batch mode, create all selected page candidates as drafts, then present them for independent per-page review.
6. An approved page is immutable until a targeted revision is requested. A revision produces a new page-package version and a new candidate.

## File naming and records

The application assigns filenames; specialists do not invent them. Use a stable, sortable page identity and explicit revision:

```text
[booklet-slug]_page-[physical-page-3-digits]_r[revision-2-digits].png
```

Example: `moonlight-milo_page-007_r02.png`.

The build record stores the stable page ID, filename, source artifact versions, attachment IDs and roles, assembled prompt, generation mode/job ID, review decision, and approval state. Batch output is never marked approved merely because generation succeeded.

## Quality gate

- The canvas, panels, story action, text, bubbles, typography, and composition match the approved Page Bible and layout plan.
- Attached character/location references are correct and relevant.
- Text is exact, legible, and natively integrated; there is no watermark, extra text, or overlay.
- Approval and revision are always scoped to one physical page.
