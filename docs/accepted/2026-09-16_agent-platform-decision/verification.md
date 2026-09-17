# Verify the small lifecycle

This checklist is for the future implementation. No item below is claimed as passed by the planning package.

## Automated checks with fake providers

| Check | Required observation |
|---|---|
| Contract | fixtures.example_story passes the Story schema and word/number rules; malformed story fails with 422. |
| Context | Fresh seed has no draft; preferences and feedback survive save/reload. Normal booklet records are untouched. |
| Revision | Save at expected_revision=0 creates 1; feedback creates 2; stale save against 0 fails and changes nothing. |
| Revision boundary | Feedback after approval or while a turn is active returns 409 without saving feedback; approval while feedback/turn is pending also returns 409. |
| Review | Repeated request_review is harmless; approval only accepts the current pending review. |
| Tool authorization | No/wrong key fails; unknown project fails; tool key cannot access browser/approval/asset routes. _prod and disabled experiment routes return 404. |
| Image guard | Before approval, image request fails and provider call count stays zero. |
| Image dispatch | Duplicate calls while generating/ready do not dispatch again. Failure/unknown needs explicit Retry and keeps attempt count. |
| Retry cap | First failed attempt leaves image_attempt_count=1; Retry clears only image; next dispatch increments to 2; third dispatch/retry is rejected, including after refresh/restart. |
| Race | Concurrent saves/approvals/image calls cannot bypass revision/approval/attempt checks. |
| Failure | Provider failure retains approved draft; timed-out outcome is unknown; late completion cannot overwrite a newer attempt. |
| Resume | Fresh Dify conversation reloads saved state; completed project produces zero new mutations. |
| Dify parsing | Split SSE frames parse; closing message replaces deltas; error/truncated stream marks failure without deleting saved work; unknown events are tolerated. |
| Browser | Create → feedback → revision → approve → image → refresh works with a labeled fake image. |
| Deployment | Older required-only secret files still validate; optional experiment secrets can be rotated; production remains disabled; maintenance rejects new mutations. |

Run npm run typecheck, npm run lint, npm run test:dify, the focused fake browser test, and npm run build after implementing the slice. Add the relevant deployment checks listed in configuration.md. Test script wiring is part of implementation.

## Live staging sequence

Use the fixed sample project in fixtures.json. Capture only synthetic outputs and sanitized identifiers.

1. Open /experiments/dify on the reviewed staging SHA; initialize once.
2. Create story. Expect first tool=get_project_context, then save_story_draft and request_review. Confirm storyline, exactly three panels, correct character/style, review_revision=1, and no approval/image.
3. In Dify's HTTP tool tester, send negative_requests.before_approval. Expect 409 approval_required, image absent, attempt count zero.
4. Submit revision_feedback. Expect current_revision=2; ending changes; panel one and its prompt remain; approval is still absent.
5. Enable real image calls after setup and spending confirmation. Approve revision 2 through the page, then continue. Expect get_project_context followed by generate_panel_image; one request, generating then ready.
6. View the saved image: Pip's description and panel one's scene should match; no multi-panel collage or requested lettering. Record imperfections rather than silently replacing the image.
7. Refresh. Confirm saved story, history, approval and image. Resume with a fresh conversation; verify the manager reports completion without a new revision or image call.
8. Verify persistence across one application restart using normal deployment procedures if this was not already observed. Do not trigger a deployment solely to repeat an already-proven check.
9. Change one short final-response instruction in Dify and publish; Resume reflects that change without application code changes.
10. Export the real configuration and preserve its skill source separately. Record any export limitation; do not fabricate an export.

If an early step fails, fix the smallest cause and repeat from saved state. If rerunning from scratch is necessary, arrange an explicitly scoped experiment cleanup; no normal booklet data or whole staging database reset.

## Short result comment for Issue #50

Copy and fill after the run:

- Application SHA / staging run:
- Dify app / published configuration / text model:
- Image model:
- Setup time and manual configuration corrections:
- Lifecycle: draft / revision / approval / image / resume — observed results:
- Before-approval rejection: provider calls = 
- Saved output or sanitized screenshot links:
- Dify latency, reported tokens/cost (or unavailable):
- Image attempts and provider cost (or unavailable; not assumed included above):
- Errors and limitations:
- Next step: continue Dify / try Mastra / resolve one named blocker.

No automatic score or platform adoption claim follows from completing this trial.
