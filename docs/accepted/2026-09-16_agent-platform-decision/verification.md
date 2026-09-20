# Verification checklist

Local checks do not prove target Dify import, plugin authorization, model access, or a live image result.

## Automated checks

- Story schema, revision saves, feedback, review, approval, stale writes, and persisted reload still pass.
- Authorization rejects missing approval, stale run or revision, disabled images, and exhausted attempts.
- Concurrent or repeated authorization reserves at most one attempt. A lost response cannot authorize another provider call.
- Existing persisted documents and the current failed attempt remain readable without migration.
- Completion accepts one valid 1536-by-1536 PNG up to 20 MiB and rejects malformed, oversized, wrong-size, wrong-attempt, duplicate-query, and superseded requests.
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
npm run build
```

Also parse the OpenAPI JSON, inspect the DSL for secrets and credential IDs, and confirm there is no runtime reference to `DIFY_IMAGE_OPENAI_API_KEY` outside legacy deployment configuration.

## Target Dify checks

Record the Dify version and exact OpenAI Tools plugin package identity. Verify in source that the image client sets `max_retries=0`; Marketplace `0.2.1` does not and is not approved for a live run.

1. Import [illustrate-panel.yml](illustrate-panel.yml).
2. Bind `dify-booklet-manager-test` and the two workflow environment variables.
3. Inspect every node against [illustrator-workflow.md](illustrator-workflow.md).
4. Confirm authorization and generation retries are off and completion has at most one retry.
5. Confirm failure and upload-failure branches report bounded categories.
6. Run an invalid-Run-ID test. It must stop before the OpenAI node and leave the attempt count unchanged.
7. Publish `illustrate_panel` and update the existing manager as stated in [runbook.md](runbook.md).

The DSL is verified only after these steps pass in the target workspace.

## Live paid checkpoint

Use the preserved synthetic project. Confirm revision 1 is approved, the first attempt remains failed, and attempts show `1/2`. Obtain explicit spending approval, click **Retry image** once, and resume the manager.

Expected evidence:

- one authorization and one image-provider invocation;
- one raw PNG completion;
- displayed attempt and Dify workflow run identifiers;
- attempts `2/2` and state `complete`;
- refresh preserves story, approval, history, and image;
- a later Resume performs no new mutation.

If generation succeeds but completion fails, download the workflow PNG and use **Save existing image**. Confirm it does not increment attempts or invoke Dify. If no file exists after attempt 2, stop. Do not reset the project or raise the cap.

## Issue #50 evidence

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
