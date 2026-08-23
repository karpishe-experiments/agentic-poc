# Lessons learned

## MongoDB/Sharp integration suites need deterministic file execution

- Context: the multi-agent booklet integration suite runs MongoDB transactions, in-process job polling, and Sharp image/PDF work.
- Observation: the four-worker Vitest run intermittently observed a stale generation-review card; the configured one-worker run passed all 121 tests.
- Guidance: keep this repository's Vitest files serial unless the fixture explicitly proves isolation under parallel workers.
- Evidence: `vitest.config.ts` uses `maxWorkers: 1`; the configured full suite passed 121/121 on 2026-08-22.
- Promotion candidate: Documentation.

## Persisted cards must reconcile even when their message ID is stable

- Context: an Agent Run card changes from ready to results under the same persisted assistant message ID.
- Observation: appending only unseen messages after `router.refresh()` left the browser on an obsolete ready card, even though the server had persisted candidate results.
- Guidance: replace/reconcile saved message projections on refresh; message identity alone is not a freshness signal for evolving generative-UI cards.
- Evidence: the 2026-08-22 multi-agent Playwright scenario runs two candidates, selects a result, and renders the next question card.
- Promotion candidate: Architecture guidance.

## Recovered item execution needs its owning workflow continuation

- Context: a selected image Agent Run is one step inside an ordered reference or page generation job.
- Observation: recovering the Agent Run alone can finalize the current image while leaving its generation job unable to claim the next item.
- Guidance: inject the owning generation continuation into recovered image materialization, using the persisted ready input’s job ID and the batch’s booklet ID; keep candidate execution separate from sequence ownership.
- Evidence: `ImageAgentRunService` invokes its continuation after materialization; `runner-bootstrap.ts` supplies it during recovery; `tests/integration/reference-generation.test.ts` covers the callback on recovered materialization.
- Promotion candidate: Architecture guidance.
