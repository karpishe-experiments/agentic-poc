# `illustrate_panel` workflow contract

This workflow is internal to Dify. The manager supplies identifiers only. Booklet supplies the approved prompt after it reserves an attempt.

## Manager-visible inputs

| Input | Type | Constraint |
|---|---|---|
| `project_id` | text | `booklet-dify-trial` |
| `booklet_run_id` | text | Exact Run ID in the current Booklet turn |
| `expected_revision` | number | Current approved revision |
| `panel_number` | number | `1` |

The workflow obtains `workflow_run_id` from Dify's `sys.workflow_run_id`. It is not a manager input.

## Internal Booklet callbacks

All callbacks use `X-Booklet-Tool-Key: {{BOOKLET_TOOL_KEY}}`. Do not expose these operations through the manager's Swagger tool.

### Authorize

`POST {{BOOKLET_BASE_URL}}/api/experiments/dify/tools/image/authorize`

Content type: `application/json`

```json
{
  "project_id": "booklet-dify-trial",
  "run_id": "<current Booklet run UUID>",
  "expected_revision": 1,
  "panel_number": 1,
  "workflow_run_id": "<sys.workflow_run_id>"
}
```

A new reservation returns HTTP 200 with `data.started=true`, `data.attempt_id`, `data.revision`, `data.status`, and `data.prompt`. Only the literal boolean `true` permits the image node to execute. Existing generating or ready work returns `started=false` and no prompt. Any non-200, malformed response, or other `started` value stops the workflow without generation.

### Complete

`POST {{BOOKLET_BASE_URL}}/api/experiments/dify/tools/image/complete?project_id=booklet-dify-trial&expected_revision=<revision>&attempt_id=<attempt UUID>`

Content type: `image/png`. The request body is the single generated file as raw binary, not JSON, multipart, base64, or a URL. Query names must occur exactly once. The body limit is 20 MiB. Booklet accepts only a decodable 1536-by-1536 PNG. Identical repeat uploads succeed; a different file for a completed attempt conflicts.

The completion node may retry once. The authorize and image nodes must have automatic retry disabled.

### Failure

`POST {{BOOKLET_BASE_URL}}/api/experiments/dify/tools/image/failure`

Content type: `application/json`

```json
{
  "project_id": "booklet-dify-trial",
  "expected_revision": 1,
  "attempt_id": "<attempt UUID>",
  "category": "generation_failed"
}
```

Allowed categories are `generation_failed`, `generation_unknown`, and `upload_failed`. Do not send raw provider messages. A generation error with a definite absence of output uses `generation_failed`. An uncertain provider outcome uses `generation_unknown`. A generated file that Booklet could not save uses `upload_failed`; return that file as the workflow's recovery output.

## Manual node configuration fallback

Use this when the target Dify version cannot import [illustrate-panel.yml](illustrate-panel.yml) without repair.

1. Create a Workflow named `booklet_illustrator` with the four manager-visible inputs above.
2. Add a Code node named **Build authorization JSON**. Build a JSON object from the four inputs and `sys.workflow_run_id`, then serialize it. Do not use hand-written JSON interpolation.
3. Add an HTTP Request node named **Authorize attempt**. Use `POST`, the authorize URL, the tool-key header, `application/json`, and the Code node's serialized body. Disable retry.
4. Parse the HTTP status and JSON body. Add an If/Else node that continues only when status is 200 and `data.started` is the boolean `true`. Every other branch returns a short non-billable status.
5. Add OpenAI Tools **GPT Image 2 / 2.5 Generate**. Bind prompt to `data.prompt`. Fix model=`gpt-image-2`, size=`1536x1536`, quality=`medium`, n=`1`, output_format=`png`, background=`opaque`, moderation=`auto`. Disable node retry. Record that the pinned plugin can retry eligible provider failures internally and that Booklet attempts are not an exact provider-request or billing count.
6. Validate that the tool returned exactly one `image/png` file. A missing, multiple, or non-PNG result follows the generation failure branch.
7. Add **Complete attempt** as an HTTP Request node. Bind its raw binary body directly to the generated file. Set `Content-Type: image/png`. Permit one retry only.
8. On image failure, call the failure endpoint with `generation_failed` or `generation_unknown`. On completion failure, call it with `upload_failed` and include the generated file in the End node's recovery output.
9. Publish the Workflow as the tool `illustrate_panel`. Its description must state that it accepts identifiers only and loads the approved prompt from Booklet.

Do not claim the DSL is verified until it imports in the target workspace and each binding above is inspected there.
