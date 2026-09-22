# Guideline — Generating a Book Export Package

## Purpose

Prepare and create the final downloadable book only after every physical Final Page Illustration Package is approved. The application executes the export deterministically; this guideline defines the export artifact, preflight, and user-visible delivery rules.

## Required inputs

- Approved Pagination & Layout Plan.
- Current approved Final Page Illustration Package for every physical page.
- Explicit user request to export.

## Required artifact

```markdown
# Book Export Package — [Working Title]

**Status:** Draft awaiting user export request | Exported

## Source Page Manifest
| Reading order | Physical page ID | Approved asset filename | Asset revision | Preflight result |
| --- | --- | --- | --- | --- |

## Export Settings
- Page geometry and order:
- File format:
- Output filename:

## Preflight Results
## Export Asset and Delivery Record
```

## Method and rules

1. Verify each physical page has a current approval, matching approved canvas, and a recorded filename/build lineage.
2. Verify the source-page manifest matches the Pagination & Layout Plan's reading order and geometry.
3. Present preflight results and wait for the user's explicit export request. Export is never automatic.
4. The application generates the final downloadable PDF or supported export format, then records the asset, source manifest, settings, status, and errors if any.
5. A failed export never invalidates approved pages. The user may retry the export without regenerating page art.

## Quality gate

- Export cannot run with missing or stale page approvals.
- The output preserves approved page order and geometry.
- The delivered file is traceable to its exact approved page assets.
