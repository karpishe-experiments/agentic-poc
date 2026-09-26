# Dify illustration rollout

For the current project, generation has already used attempts `2/2`. Deploy the validation update and proceed to checkpoint 9 to recover the existing file. Do not repeat checkpoint 8 or reset the experiment.

For a fresh authorized rollout, use these checkpoints in order. Stop at the first unexpected result. This rollout does not rotate host secrets, run Infrastructure, reset data, or change Terraform, Compose, or Cloudflare.

## 1. Back up Dify configuration

Export the published `booklet_manager` and `story_writer` applications. Store exports that contain credential or workspace bindings outside Git.

Expected: both existing applications can be restored without changing the Booklet project.

Recovery: do not edit either published application until both backups exist.

## 2. Install and authorize the image plugin

Install Dify Marketplace plugin `langgenius/openai_tool` version `0.2.1` and authorize it with the existing `dify-booklet-manager-test` key. Do not create or copy an API key into Booklet. Disable retries on the workflow's image node. The plugin can still retry eligible provider failures internally, so Booklet's attempt count is not an exact provider-request or billing count.

Expected: Dify accepts the existing credential and the installed package identity is recorded. Credential validation does not prove access to `gpt-image-2`.

Recovery: if installation or credential validation fails, stop the rollout and repair the plugin or existing Dify credential. Do not rotate Booklet host secrets.

## 3. Import the workflow

Import [illustrate-panel.yml](illustrate-panel.yml) as `booklet_illustrator`. Set:

- `BOOKLET_BASE_URL=https://booklet-staging.uniwares.co.uk`
- `BOOKLET_TOOL_KEY` to the existing `DIFY_TOOL_KEY` value, as a secret

Bind the OpenAI node to `dify-booklet-manager-test`. Inspect every node against [illustrator-workflow.md](illustrator-workflow.md). If the target Dify importer changes a node binding, use the manual fallback in that document.

Confirm before publishing:

- workflow input contains project ID, Booklet run ID, revision, and panel number only;
- `workflow_run_id` comes from `sys.workflow_run_id`;
- authorization JSON is built by Code;
- only HTTP 200 plus literal `started=true` reaches generation;
- generation is `gpt-image-2`, `1536x1536`, medium, one PNG;
- the validation Code node returns a boolean only, a List Operator exposes `first_record`, and the completion binary body reads that single file;
- each failure callback has exactly one JSON body item containing the complete JSON object;
- authorization and generation retries are disabled;
- completion sends one raw file, leaves HTTP error handling unset, and disables retry so rejected response bodies reach the completion parser;
- completion reaches success only after Booklet returns HTTP 200 with state `complete`;
- generation errors report `generation_failed` or `generation_unknown`;
- upload errors report `upload_failed` and return the generated file;
- no secret, credential ID, or raw provider failure appears in outputs.

Expected: the workflow imports and validates. Record the target Dify version and any importer repair. The checked-in DSL is not considered verified until this checkpoint passes.

Recovery: delete only the failed imported draft and repeat from the checked-in file or manual node instructions. If Dify reports that a Code output has type `file`, that an HTTP body entry has type `number`, that a JSON body has multiple items, or that a Binary body cannot fetch `generate_image.files`, the obsolete import is still open; replace it with the current DSL. Do not change the saved Booklet project.

## 4. Deploy the application

Review and publish the application change through Issue #50's existing branch workflow. Deploy the reviewed `_staging` release during an idle experiment window. Use the normal deployment runbook. No Infrastructure run or host secret rotation is required.

Expected: `/experiments/dify` reports real mode, existing revision 1, approval, failed/unknown attempt, and `2/2` attempts for the current recovery. Preserve the saved approval and attempt ID. The setup endpoint reports Dify workflow image execution, and the new callback routes are available.

Recovery: stop new experiment actions and inspect active mutations before rolling back the application and Dify manager together. Retain the project and assets. The retired direct-provider route is not a rollback image path.

## 5. Non-billable authorization test

Run the workflow with:

- `project_id=booklet-dify-trial`
- a random valid UUID that is not the active Booklet run
- the current revision
- `panel_number=1`

Expected: Booklet rejects authorization with `stale_run`; the OpenAI node does not run; the Booklet attempt count stays unchanged.

Recovery: if the OpenAI node runs, unpublish or disable the workflow and repair the `started` branch before continuing.

## 6. Publish the workflow tool

Publish the workflow, then open **Workflow as Tool**, save `illustrate_panel`, and confirm the update. Repeat this after every workflow publication to synchronize the tool's pinned version. Its description must say that Booklet supplies the approved prompt after authorization and that callers provide identifiers only.

Expected: the manager can attach `illustrate_panel`; no workflow API key is created.

## 7. Update the manager

In the existing manager:

1. Update its existing Booklet Swagger tool from [tools.openapi.json](tools.openapi.json).
2. Confirm it exposes only `get_project_context`, `save_story_draft`, and `request_review`.
3. Attach `illustrate_panel`.
4. Remove `generate_panel_image` and any raw image plugin.
5. Keep the working `write_story` tool unchanged.
6. Replace the instructions with [manager-prompt.md](manager-prompt.md).
7. Keep the existing manager API key and publish.

Expected: the manager has exactly two Workflow tools and three Booklet HTTP operations. Story remains a string in Dify's UI and is passed as JSON text as documented.

Recovery: restore the manager backup. Do not reset Booklet data.

## 8. Run the one paid checkpoint

Obtain explicit spending approval. Confirm revision 1 is still approved and attempts are `1/2`. Click **Retry image** once, then **Resume** if the UI asks for it.

Expected:

- one authorization reserves attempt 2;
- one OpenAI image call occurs;
- one PNG upload completes;
- attempts show `2/2`;
- state becomes `complete`;
- refresh preserves the image and saved story.

Do not click Retry again, call the workflow manually with a live Run ID, or reset the project.

## 9. Recover a generated but unsaved file

If Dify produced an image but Booklet reports `upload_failed` or an unknown upload result:

1. Open the Dify workflow run named by the Booklet run details.
2. Download its single original generated file. Inspect its decoded format and actual dimensions, not only a browser preview.
3. In Booklet, use **Save existing image** for the same attempt.

Expected: Booklet validates and saves the file without incrementing attempts or invoking Dify. This remains permitted at `2/2`. If transport failed or the failure callback also failed, download the file from the generation node's run log.

Recovery: if Booklet rejects it, inspect the bounded validation message and confirm the displayed attempt/revision. PNG, JPEG, and WebP are accepted if they fully decode, contain one frame, and meet the 20 MiB/64-megapixel limits. Size, aspect ratio, and supported format differences are warnings. Successful recovery clears the current image error, keeps attempts at `2/2`, and displays the original image with warnings. Do not regenerate. If no image exists after the final attempt, stop and record the failure.

## 10. Record evidence

Complete [verification.md](verification.md) with the application SHA, Dify and plugin versions, sanitized run identifiers, state transitions, attempt count, and whether target import and live generation passed. Do not invent cost or usage figures.
