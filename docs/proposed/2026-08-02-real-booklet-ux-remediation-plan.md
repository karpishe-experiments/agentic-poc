# Real Booklet UX Remediation Plan

## Purpose and status

This remediation plan was approved for implementation after a hands-on real-provider run on 2026-08-02. It remains a companion to, not an amendment of, the accepted POC plan. Working-flow implementation is complete through Final Pages; PDF export verification is deliberately deferred as a final-stage feature.

The run created booklet `2cec7640-c4f6-418d-be98-b75d5ffd7b14` from the prompt *“Nia and her tiny lantern help a closed moonflower listen to three kind nighttime sounds before it blooms for her sleepy neighbors.”* It used the real OpenAI manager and specialist providers. Twelve successful model calls were recorded before the workflow blocked; estimated model cost was $0.133630. No image, page, or PDF asset was created.

The visual record of the blocked state is retained at `output/playwright-realux-visual-bible-blocker.png` (ignored evaluation output).

## Observed flow and findings

### P0 — Visual Bible creation can dead-end a real booklet

After the Story and visual-style decisions, the real Visual Bible specialist response failed the cross-document invariant with `visual_bible_entities_mismatch`. The UI displayed the raw JSON error in red, retained an empty Visual Bible editor, and disabled the composer and Start guided questions action. A creator has no retry, repair, or explanation of which entity differs. The path cannot proceed to canonical references, pages, or PDF export without bypassing the product.

The likely fault line is a strict deterministic check in `ArtifactService` applied to an LLM-authored complete Visual Bible document. The application requires its character and location ID sets to exactly match every named or continuity-relevant Story Plan entity, while the specialist has too much authority to alter membership or IDs. The test fixture follows the happy-path shape and does not exercise this real-provider divergence.

### P0 — A recoverable server error becomes a terminal chat error

The chat endpoint returns a 400 JSON envelope for a `RecoverableApplicationError`. AI SDK renders that JSON as the chat error, and the chat hook stays out of the ready state. The error is not translated into a user action or an active recovery card.

### P1 — Approvals do not consistently advance the workspace without a reload

Approving the Audience profile and Story Plan changed the underlying state, but the active stage and selected artifact stayed stale until a manual page reload. In the Story case the first approval also produced an unexpected targeted repair card; after approving the repair, the page still needed a reload before it showed Style. The client only refreshes for selected approval types, so it does not reliably reconcile a material workflow transition.

### P1 — The Story review is too opaque and the repair is unexplained

The real Story Plan was coherent and age-appropriate, but its review card exposed only Premise, Theme, and Ending. Cast, setting, beats, continuity constraints, and the visual-subject decisions lived in a large editable raw JSON field. The quality system then created a "targeted repair" after approval without explaining the finding or the exact repair to the creator.

### P2 — The current decision is buried in a long transcript

The conversation preserves useful history, but submitted cards remain visually large. By the Visual Bible stage, the current error/action was below multiple completed cards. The start-guided-questions control also remained available after the workflow had started. The initial idea is used as a truncated workspace heading rather than a readable working title.

### P2 — Development refresh failure needs a contained recovery path

On the already-running development server, creating a booklet first encountered missing Next static chunks and the generic error boundary. A separate fresh production server completed the real evaluation until the Visual Bible blocker. This is likely a stale `.next`/server lifecycle condition rather than a product-flow defect, but the generic recovery message gives no practical recovery action.

## Implementation slices

### Slice 1 — Make Visual Bible membership application-owned

**Requirements addressed:** P0 real-provider completion, Story-to-Visual-Bible continuity, canonical-reference safety.

1. Derive the canonical character and location slots deterministically from the approved Story Plan. The application owns entity IDs and membership: all named or continuity-relevant entities receive exactly one definition; `recurringVisualSubject` only determines whether a canonical image is required.
2. Narrow `visual_direction_reference_planning@1` to author visual attributes for the supplied slots, rather than authoring arbitrary Visual Bible membership. Have the application merge those attributes into the canonical slots and preserve the approved style references.
3. Retain strict cross-document validation as a final guard, but produce structured diagnostics for invalid specialist output (missing, extra, or unknown IDs) rather than only a generic mismatch.
4. Add fixtures for the Nia/lantern/moonflower/night-garden shape and for a specialist response with an omitted or invented entity. Both must produce a valid canonical Visual Bible or a recoverable, actionable repair result—never a stranded draft.

**Acceptance criteria:** A real-style response that omits, renames, or invents an entity cannot make the booklet unrecoverable; the next Visual Bible review has exactly the approved Story Plan’s eligible entities and only recurring visual subjects schedule references.

### Slice 2 — Turn recoverable generation failures into a usable recovery interaction

**Requirements addressed:** recoverable errors, visible agent state, deterministic fallback behavior.

1. Return expected recoverable chat failures as a valid message-stream response containing a typed recovery card, not a JSON 400 consumed as a terminal transport error.
2. The card must say what did and did not happen (for this case: no Visual Bible saved and no images generated), identify the affected stage, and offer a safe retry/repair action. Keep the composer usable.
3. Make the retry idempotent, retain the failed attempt in evidence, and prevent duplicate cards/jobs after a refresh.
4. Reserve transport-level error rendering for genuinely unexpected failures. Add a clear “Reload workspace” action for chunk-load failures rather than an opaque generic boundary alone.

**Acceptance criteria:** Injected Visual Bible and page-planning recoverable errors leave the chat ready for input, expose a human-readable recovery action, and can be retried without a browser reload or duplicated workflow state.

### Slice 3 — Reconcile every material card decision immediately

**Requirements addressed:** sequential eight-stage workflow, resumability, understandable actions.

1. Extend the card-response contract with authoritative transition data (for example, changed artifact state and next stage), or use a simple unconditional `router.refresh()` after every successful material card submission in this POC.
2. Re-render the stage rail, selected artifact, and conversation from the refreshed server state after Audience, Story, repair, Visual Bible, Page Plan, Final Pages, and export-related decisions.
3. Represent a quality repair as an explicit outcome: name the quality finding, show what changed, and make the new review card the clear current next action.
4. Add browser coverage that verifies Audience and Story approvals advance to the next stage without manually reloading, including the quality-repair branch.

**Acceptance criteria:** After any completed approval, the workspace immediately shows the authoritative next stage and selected artifact. No happy-path test depends on an explicit `page.reload()`.

### Slice 4 — Make review checkpoints creator-readable

**Requirements addressed:** human review before irreversible work; editing and continuity control.

1. Add structured, readable Story Plan sections for premise, cast/roles, setting, story beats, ending, age fit, and continuity constraints. Keep raw JSON behind an “Advanced document” disclosure for this POC.
2. Ensure the Visual Bible view explains why each item is present and whether it needs a paid canonical reference. Label incidental objects such as a carried lantern clearly so the creator understands the cost/continuity choice.
3. Make quality findings and targeted repairs visible beside the changed fields rather than only in a follow-up narration.
4. Replace the truncated idea heading with a readable working title/idea summary, show the current active decision nearer the top, and hide “Start guided questions” once the first workflow turn exists.

**Acceptance criteria:** A creator can approve or request a revision of Story and Visual Bible decisions without reading or editing JSON, and can see the active decision without scanning completed transcript cards.

### Slice 5 — Verify the full real-provider path and local runtime recovery

**Requirements addressed:** browser golden path, real evidence, cost evidence, PDF inspection.

1. Expand deterministic unit and integration coverage for the canonical Visual Bible builder, recovery-card conversion, and approval-transition contract.
2. Update the fake-provider browser golden path to assert no reload is necessary, the current decision remains reachable, and each review displays the intended structured summary.
3. Run one bounded real-provider evaluation booklet (3 story pages) through reference generation, final-page approval, and PDF export. Capture evidence JSON, stage screenshots, estimated/actual costs, and render the downloaded PDF for layout inspection.
4. Document a narrow dev-server recovery procedure for stale Next chunks and add a user-facing reload control in the boundary. Do not add broad cache-clearing logic or production infrastructure solely for this POC.

**Acceptance criteria:** A new real booklet completes from idea to reviewed PDF without internal API workarounds; the retained evaluation packet includes evidence, screenshots, and rendered PDF pages.

## Sequencing and scope

Implement Slices 1–3 as the first vertical slice before spending on another real image/PDF run. Slice 4 makes the repaired flow understandable; Slice 5 is the verification gate. Keep this as a small POC: no generic orchestration framework, no global character inventory, no production queueing, and no automated retries that could incur unbounded model or image cost.

## Risks and checks

- The live model can still return semantically weak visual details. The deterministic shell must protect membership and IDs, while review cards retain human approval before images are generated.
- The targeted Story repair cost was material in the failed run. Surface the reason before a repair is created and verify that only one repair/review is issued per approval attempt.
- Do not judge final illustrated-booklet UX until a repaired real run reaches PDF export; the current run is valid evidence of the upstream UX failure but not of image or PDF quality.
