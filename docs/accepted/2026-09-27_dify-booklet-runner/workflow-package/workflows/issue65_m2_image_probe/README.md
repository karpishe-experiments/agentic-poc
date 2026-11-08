# Shared image executor, including J13

## Purpose and identity

Shared image executor, including J13; the historical app name contains “probe”.

| Field | Value |
| --- | --- |
| App name | issue65_m2_image_probe |
| App ID | 923566e9-c6fd-4936-836f-b21704d39628 |
| Source published workflow ID | d016b1e3-93a6-4e9b-8509-de2a9b3568ad |
| Source captured UTC | 2026-11-08T08:22:16.438Z |
| Derived UTC | 2026-11-08T10:30:01.888Z |
| Graph | 9 nodes; 8 edges |
| Capture method | Real-only derivative of a recorded native secret-free export |

[Source live editor](https://dify.uniwares.co.uk/app/923566e9-c6fd-4936-836f-b21704d39628/workflow) · [Real-only DSL](workflow.yml) · [Prompt reference](prompts.md) · [Inventory](../../README.md#workflow-inventory) · [Manifest](../../manifest.json)

The source live editor retains other modes. The packaged DSL removes their execution paths. [Original snapshot](https://github.com/karpishe-experiments/agentic-poc/blob/1d4cc02307edad21aadefc244bcc4e286396b88f/docs/accepted/2026-09-27_dify-booklet-runner/workflow-package/workflows/issue65_m2_image_probe/workflow.yml). Source descriptions may be stale; they are preserved in the DSL. Empty secret declarations are retained.

## Inputs and outputs

### Direct Start inputs

| Name | Type | Required | Default | Visible maximum |
| --- | --- | --- | --- | --- |
| run_id | text-input | yes | "" | — |
| operation_id | text-input | yes | "" | — |
| parent_workflow_run_id | text-input | no | "" | — |
| mode | text-input | yes | "real" | — |
| reference_files | file-list | no | null | 15 |

`mode` is required and defaults to `real`; the identity script rejects other values. The ordered file list retains the exact formats, upload settings and count limits in the DSL.

### Fetched data

Booklet authorization supplies the current eligible prepared request, operation fingerprint, deadline and policy metadata, or a reason to pause. Creative sources and request assembly are described in [prompts.md](prompts.md).

### Terminal outputs

| End node | Output | Type | Selector |
| --- | --- | --- | --- |
| real_paused | authorization_reason | string | ["real_decode","authorization_reason"] |
| real_image_finish | image_result | string | ["real_image_result","image_result"] |
| real_image_finish | reference_files | array[file] | ["start","reference_files"] |

Success returns execution evidence/result; pause returns the authorization reason. There is no packaged simulation save callback. Acceptance and persistence are external.

## Execution

```mermaid
flowchart TD
  S[Start: Real identity] --> A[Authorize prepared request]
  A --> D[Decode and validate]
  D --> G{Authorized?}
  G -->|No| P[Return pause reason]
  G -->|Yes| E[Execute image tool and validate result]
  E --> R[Return result]
```

1. Validate Real mode and UUID identities.
2. Claim the prepared operation through the authorization endpoint.
3. Decode the carrier; check status, identity/role, digests, deadline and applicable policy/schema/reference evidence.
4. Run the selected image tool only after authorization.
5. Return the selected End envelope. Script/provider failures remain failures; no successful result is fabricated.

## Models, prompts, tools, and configuration

No LLM node is present.

| Node | Provider/tool namespace | Tool | Parameters |
| --- | --- | --- | --- |
| real_image_tool | langgenius/openai_tool/openai | booklet_real_image | {"booklet_tool_key":{"type":"mixed","value":"{{#env.BOOKLET_TOOL_KEY#}}"},"input_fingerprint":{"type":"variable","value":["real_decode","input_fingerprint"]},"operation_id":{"type":"variable","value":["start","operation_id"]},"parent_workflow_run_id":{"type":"variable","value":["start","parent_workflow_run_id"]},"reference_files":{"type":"variable","value":["start","reference_files"]},"request_json":{"type":"variable","value":["real_decode","request_json"]},"run_id":{"type":"variable","value":["start","run_id"]},"workflow_run_id":{"type":"variable","value":["sys","workflow_run_id"]}} |

The tool receives `real_decode.request_json` directly, with operation identity and the ordered Start files. The prepared request supplies the final image prompt, model, dimensions, quality and other provider settings; this graph has no LLM chunk-forwarding template or text output schema. [Exact image prompt and assembly reference](prompts.md).

Plugin dependencies:

- `langgenius/openai_tool:0.2.2-dev3@8a7f865a47ce9e25260bd7d7cade70d4712506d945a7a2a66607f9f324160f05`

| Environment name | Type | Binding category |
| --- | --- | --- |
| BOOKLET_ORIGIN | string | Booklet origin; non-secret |
| BOOKLET_TOOL_KEY | secret | Private callback/tool key; empty value |

Ordered files and reference manifests must remain consistent; consult the DSL Start settings and shared image/report assembly reference.

## Relationships and external interfaces

Consumes J08 style samples, J09/J10 sheet requests and J13 page/cover requests.

No direct child-workflow calls are present. Booklet sequences these workflows externally. Do not interpret artifact dependencies as direct Dify calls.

| HTTP node | Method | URL | Timeouts | Retry configuration |
| --- | --- | --- | --- | --- |
| real_authorize | post | {{#env.BOOKLET_ORIGIN#}}/api/experiments/booklet-tools/authorize | {"connect":10,"read":30,"write":30} | {"max_retries":0,"retry_enabled":false,"retry_interval":0} |

Authorization uses `x-booklet-tool-key` bound to `BOOKLET_TOOL_KEY`. The custom tool may perform provider/storage/accounting requests internally; the one tool node does not establish their count.

## Failure and pause behavior

Invalid Real mode or UUIDs fail before authorization. Transport/envelope/digest/deadline/policy checks can fail before provider execution. An authorization refusal returns `real_paused`. A successful provider envelope is returned for application acceptance, not saved by a result callback in this graph. HTTP retry settings are listed above; provider-internal behavior requires the pinned adapter source. The Real image policy disables provider retries; unknown outcomes require reconciliation.

## Efficiency and relevance to Unitale

Authorized selected path: **one HTTP authorization + one tool invocation**. Paused path: one authorization and zero model/tool invocations.  No loop or iteration node is retained. Provider calls and transport are serial. These counts describe graph structure, not measured cost, timing, reliability or quality.

External context preparation and result acceptance remain coupling points. Target role: **Image Executor**. [Unitale implications](../../prompt-reference/unitale-migration.md).

## Evidence limits

This file is a derived reference, not a new live export or a self-contained Unitale workflow. It requires external prepared requests, runtime state, credentials and custom provider/tool packages. Offline graph validation does not prove import or execution. Simulation-only behavior has been removed from this DSL. Inherited source wording and projection limitations are documented in [context and contracts](../../prompt-reference/context-and-contracts.md).
