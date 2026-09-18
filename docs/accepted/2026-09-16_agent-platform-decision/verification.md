# Verify the small lifecycle

This checklist covers the implemented experiment. It does not claim that Dify Cloud or a live provider has been verified.

## Automated checks with fake providers

| Check | Required observation |
|---|---|
| Contract | fixtures.example_story passes the Story schema and word/number rules; malformed story fails with 422. |
| Context | Fresh seed has no draft; preferences and feedback survive save/reload. Normal booklet records are untouched. |
| Revision | Save at expected_revision=0 creates 1; feedback creates 2; stale save against 0 fails and changes nothing. |
| Revision boundary | Feedback after approval or while a turn is active returns 409 without saving feedback; approval while feedback/turn is pending also returns 409. |
| Review | Repeated request_review is harmless; approval only accepts the current pending review. |
| Tool authorization | Route tests reject missing/wrong keys before loading context; unknown project fails; the proxy does not let a tool key bypass Basic Auth for browser/approval/asset routes. _prod and disabled experiment routes return 404. |
| Image guard | Before approval, image request fails and provider call count stays zero. |
| Image dispatch | Duplicate calls while generating/ready do not dispatch again. Failure/unknown needs explicit Retry and keeps attempt count. |
| Retry cap | With the default cap of two, the first failed attempt leaves image_attempt_count=1; Retry clears only image; the next dispatch increments to 2; a third dispatch/retry is rejected, including after refresh/restart. The page hides Retry and explains the terminal state at the configured cap, which can also be one. |
| Race | Concurrent saves/approvals/image calls cannot bypass revision/approval/attempt checks. |
| Failure | Provider failure retains approved draft; timed-out outcome is unknown; late completion cannot overwrite a newer attempt. |
| Resume | Fresh Dify conversation reloads saved state; completed project produces zero new mutations. |
| Dify parsing | Split SSE frames parse; closing message replaces deltas; error, malformed, or truncated stream marks failure without deleting saved work; unknown events are tolerated. |
| Run ownership | Each mutating tool requires the current server run ID; no Dify tool response reveals another turn's ID; a late call from an expired turn is rejected even after a new turn starts. |
| Browser | Create → feedback → revision → approve → image → refresh works with a labeled fake image. |
| Deployment | Shell fixtures validate old required-only secrets, valid optional keys, short-key rejection, flat-file input, and a merged single-key rotation; production remains disabled; maintenance rejects new mutations. |

Run `npm run typecheck`, `npm run lint`, `npm run test:dify`, `npm run test:dify:browser`, and `npm run build` after implementing the slice. The browser command starts an isolated local development server with fake adapters and MongoDB; it makes no Dify or paid image call. Add the relevant deployment checks listed in configuration.md.

## Live staging sequence

Use the fixed sample project in fixtures.json. Capture only synthetic outputs and sanitized identifiers.

1. Open /experiments/dify on the reviewed staging SHA; initialize once.
2. Create story. Expect first tool=get_project_context, then save_story_draft and request_review. Confirm storyline, exactly three panels, correct character/style, review_revision=1, and no approval/image.
3. In Dify's HTTP tool tester, send negative_requests.before_approval. Its sample run_id is a valid UUID for this pre-approval check only. Expect 409 approval_required, image absent, attempt count zero. For a stale-save test, replace the sample run_id with the current active turn ID; otherwise the server correctly returns stale_run first.
4. Submit revision_feedback. Expect current_revision=2; ending changes; panel one and its prompt remain; approval is still absent.
5. Enable real image calls after setup and spending confirmation. Approve revision 2 through the page, then continue. Expect get_project_context followed by generate_panel_image; one request, generating then ready.
6. View the saved image: Pip's description and panel one's scene should match; no multi-panel collage or requested lettering. Record imperfections rather than silently replacing the image.
7. Refresh. Confirm saved story, history, approval and image. Resume with a fresh conversation; verify the manager reports completion without a new revision or image call.
8. Verify persistence across one application restart using normal deployment procedures if this was not already observed. Do not trigger a deployment solely to repeat an already-proven check.
9. Change one short final-response instruction in Dify and publish; Resume reflects that change without application code changes.
10. Export the manager and Story Writer configurations and preserve the Story Writer instruction source separately. Record any export limitation; do not fabricate an export.

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
