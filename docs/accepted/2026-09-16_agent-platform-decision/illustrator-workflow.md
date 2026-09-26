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

Content type: `application/octet-stream` (labels are advisory). The request body is the single generated file as raw binary, not JSON, multipart, base64, or a URL. Query names must occur exactly once. Booklet fully decodes single-frame PNG/JPEG/WebP up to 20 MiB and 64 megapixels. Different dimensions, aspect ratios, or supported formats produce warnings. Original bytes are stored without conversion; decoded format determines the suffix and MIME type. Identical repeat uploads succeed; a different file for a completed attempt conflicts.

All three nodes have automatic retry disabled. Completion remains idempotent. Dify 1.13's HTTP error strategy discards the response body, so completion leaves that strategy unset and passes non-2xx responses to **Require saved completion** for bounded error parsing. A transport failure stops the workflow; recover the file from **Generate one panel PNG** in its run log. Do not rerun generation.

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
4. Parse the HTTP status and JSON body. Treat missing or invalid `attempt_id`, `revision`, or `prompt` values as malformed. Add an If/Else node that continues only when status is 200 and `data.started` is the boolean `true`. Every other branch returns a short non-billable status.
5. Add OpenAI Tools **GPT Image 2 / 2.5 Generate**. In Prompt, insert **Require new authorization → prompt** with the variable picker. The DSL uses `type: mixed` and `value: '{{#parse_authorization.prompt#}}'` for this text field, not a selector array. Fix model=`gpt-image-2`, size=`1536x1536`, quality=`medium`, n=`1`, output_format=`png`, background=`opaque`, moderation=`auto`. Disable node retry. Record that the pinned plugin can retry eligible provider failures internally and that Booklet attempts are not an exact provider-request or billing count.
6. Validate that the tool returned exactly one file; do not inspect its MIME label. The Code node returns only a boolean. It must not return or forward a file because Dify Code outputs do not support the `file` type. A missing or multiple result follows the generation failure branch. Booklet validates the actual file bytes.
7. Add a List Operator for the OpenAI tool's `files` output. Select that input through the variable picker so Dify records `var_type: array[file]` and `item_var_type: file`. Use its `first_record` file output only after the validation Code node succeeds. A Binary HTTP body requires one `file`; it cannot consume the tool's `array[file]` output directly.
8. Add **Complete attempt** as an HTTP Request node. Set its body type to Binary and bind it to the List Operator's `first_record`. Set `Content-Type: application/octet-stream`. Disable retry and leave error handling unset so non-2xx bodies reach the next Code node.
9. Require HTTP 200 and state `complete` before the success End node. For each failure callback, use one JSON body item that contains the complete JSON template. A JSON HTTP body accepts exactly one item. On image failure, report `generation_failed` or `generation_unknown`. For a rejected or malformed completion response, report `upload_failed` and include the selected generated file and bounded `upload_error` in the End output. On a transport failure, use the generated file retained in the image node's log. A failed failure callback must fail the workflow.
10. Give End outputs unique names across the graph: `authorization_status` for **Not authorized**, `status` for successful completion, `generation_failure_response` for generation failure, and `upload_failure_response`, `upload_error`, and `recovery_file` for upload failure. Bind `recovery_file` to **Select image file → first_record**. These failure responses do not prove success; Booklet state remains authoritative.
11. Open the publish checklist and resolve all errors before publishing the Workflow as `illustrate_panel`. Its description must state that it accepts identifiers only and loads the approved prompt from Booklet. Repeat the invalid-run test: expect `authorization_status: rejected`, no image-node execution, and no attempt-count change. This checks the rejection path, not the paid generation path.

After each workflow publication, open **Workflow as Tool**, save its configuration, and confirm the update. This synchronizes the tool's pinned workflow version; publishing the workflow alone does not.

HTTP behavior reference: [Dify 1.13 HTTP node](https://github.com/langgenius/dify/blob/1.13.0/api/core/workflow/nodes/http_request/node.py) and [error handler](https://github.com/langgenius/dify/blob/1.13.0/api/core/workflow/graph_engine/error_handler.py).

Do not claim the DSL is verified until it imports in the target workspace and each binding above is inspected there.
