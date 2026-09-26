# Verification checklist

Local checks do not prove target Dify import, plugin authorization, model access, or a live image result.

## Automated checks

- Story preferred word/character lengths produce warnings; content extras are stripped. Missing content, wrong panel count/order, and hard storage limits still reject. Revision saves, feedback, review, approval, stale writes, and reload still pass.
- Authorization rejects missing approval, stale run or revision, disabled images, and exhausted attempts.
- Concurrent or repeated authorization reserves at most one attempt. A lost response cannot authorize another provider call.
- Existing persisted documents and the current failed attempt remain readable without migration.
- Completion accepts PNG/JPEG/WebP at exact, smaller, and rectangular dimensions, even with absent/inaccurate MIME labels. It preserves original bytes, derives served MIME, and shows warnings. Corrupt, unsupported, multi-frame, over-20-MiB, over-64-megapixel, wrong-attempt, duplicate-query, and superseded inputs are rejected.
- Identical completion is idempotent. Different bytes for a ready attempt conflict.
- Completion claims serialize uploads, expire after 60 seconds, and are released after storage failure where possible.
- Failure callbacks cannot replace a ready, claimed, or superseded image.
- Recovery saves the existing file without incrementing attempts, including at `2/2`.
- Retry racing with completion produces one winning transition.
- Exact callback paths can bypass staging Basic Auth with the tool key. Browser recovery and normal actions retain same-origin and browser authentication. Production remains unavailable.
- The fake browser lifecycle includes failure, recovery controls, refresh, and normal Booklet isolation.

Run:

```text
npm run typecheck
npm run lint
npm run test:dify
npm run test:dify:browser
```

Production/container builds remain deployment checks. Also parse the OpenAPI JSON, inspect the DSL for secrets and credential IDs, and confirm there is no runtime reference to `DIFY_IMAGE_OPENAI_API_KEY` outside legacy deployment configuration.

## Target Dify checks

Record the Dify version and exact OpenAI Tools plugin package identity. Confirm that the Dify image node retry is disabled. Record that Marketplace `0.2.1` can retry eligible provider failures internally and that Booklet attempts are not an exact provider-request or billing count.

1. Import [illustrate-panel.yml](illustrate-panel.yml).
2. Bind `dify-booklet-manager-test` and the two workflow environment variables.
3. Inspect every node against [illustrator-workflow.md](illustrator-workflow.md).
4. Confirm authorization and generation retries are off and completion retry and HTTP error handling are disabled to preserve rejected response bodies.
5. Confirm failure and upload-failure branches report bounded categories.
6. Run an invalid-Run-ID test. It must stop before the OpenAI node and leave the attempt count unchanged.
7. Publish `illustrate_panel` and update the existing manager as stated in [runbook.md](runbook.md).

The DSL is verified only after these steps pass in the target workspace.

## Live paid checkpoint (already consumed for the current project)

The current recovery must retain revision 1 and attempts `2/2`. Do not repeat generation. Recover the existing file as described below. The following sequence documents the original checkpoint, not a new authorization:

Use the preserved synthetic project. Confirm revision 1 is approved, the first attempt remains failed, and attempts show `1/2`. Obtain explicit spending approval, click **Retry image** once, and resume the manager.

Expected evidence:

- one authorization and one image-provider invocation;
- one raw PNG completion;
- displayed attempt and Dify workflow run identifiers;
- attempts `2/2` and state `complete`;
- refresh preserves story, approval, history, and image;
- a later Resume performs no new mutation.

If generation succeeds but completion fails, download the original workflow image and use **Save existing image**. Confirm it clears the current error, preserves revision/approval/history, does not increment attempts or invoke Dify, and renders warnings below the image. If no file exists after attempt 2, stop. Do not reset the project or raise the cap.

## Issue #50 evidence

Local practical-validation checks: typecheck, lint, 64 focused tests, and three fake browser tests passed. The browser recovery case mocks HTTP state; MongoDB integration tests separately verify storage, identity, and recovery at the cap. No provider call was made by these checks.

The original retained Dify file was downloaded and inspected on 2026-09-26: PNG, 1254 × 1254, one frame, 2,700,516 bytes, SHA-256 `98a4fc94fa8f86c3958ac52e305358feb6cd7d5a059226de379143747cc73373`. This is original-file metadata, not a preview measurement. Workflow run `f09829c6-55d9-4243-ad71-eb78bac5e688` produced the file; the matching Booklet attempt is `222dff77-33b7-4214-a58a-9c02bdf1a4a3`.

The practical-validation update was released through [PR #63](https://github.com/karpishe-experiments/agentic-poc/pull/63). [Staging Deploy 36237298517](https://github.com/karpishe-experiments/agentic-poc/actions/runs/36237298517) passed, including Release and verify, at application merge SHA `612297bcbb695b7189ad2824d98493a8c4bcf333` (implementation `823d2af5a6d2ac5aac52901d57fb8d25f1430d6c`).

Live browser recovery passed on 2026-09-26. **Save existing image** stored the retained file for the same attempt. The page showed `complete`, revision 1, attempts `2/2`, the original image, and a non-blocking dimension warning. The browser decoded the served image at 1254 × 1254. Reload preserved completion and history; the current upload error and recovery control were absent. A subsequent **Resume** completed with only `get_project_context` and reported that revision 1 was approved and panel 1 was ready. No new image generation or attempt reservation occurred during recovery or Resume.

This verifies recovery and completed-state manager behavior, not a fresh generation-to-upload run through the updated workflow. Preserve this completed project. A fresh paid test requires a separately approved test allowance and must not reset this project's attempt cap. Provider cost was not available from this recovery evidence.

The existing Dify Cloud workflow was updated in place on 2026-09-26, preserving credentials and its identity. The file validator now requires exactly one file without a MIME gate. Completion uses `application/octet-stream`, retry off, and HTTP error handling None; the completion parser retains its failure branch and bounded messages. The recovery End node includes `upload_error` from that parser. A test with inactive Run ID `00000000-0000-4000-8000-000000000000` returned HTTP 409 `stale_run` and executed only User Input, Build authorization JSON, Authorize attempt, Require new authorization, Newly authorized?, and Not authorized. No image node ran. Workflow version 7 was published, then **Workflow as Tool** was saved and its update confirmed for `illustrate_panel`. This was a manual in-place update, not a fresh DSL import verification. Dify Cloud's exact server version was not exposed in this check.

- Application SHA and staging deployment run:
- Dify version, manager publication, and Workflow publication:
- OpenAI Tools version and credential validation result:
- DSL import result and manual repairs:
- Non-billable stale-run result; provider calls and attempt count:
- Live authorization, workflow, attempt, and saved state:
- Recovery result, if used:
- Provider usage or cost as reported, or unavailable:
- Errors and limitations:
- Next decision:

Do not infer exact provider billing from Booklet's reservation count.
