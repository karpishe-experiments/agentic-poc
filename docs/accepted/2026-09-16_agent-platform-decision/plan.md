# Dify booklet lifecycle experiment on staging

Status: Booklet-side implementation is complete locally. Dify publication is blocked until the pinned image plugin disables its provider-level retries; target-workspace import and the live paid checkpoint remain operator verification. Issue: [#50](https://github.com/karpishe-experiments/agentic-poc/issues/50).

## Scope and accepted architecture

Dify owns the manager, Story Writer Workflow, and `illustrate_panel` Workflow. Booklet owns saved revisions, review and approval, attempt authorization, the two-attempt cap, durable assets, recovery, and UI state. The manager chooses an allowed action; Booklet validates and commits it.

This supersedes the earlier direct-provider image design in this experiment. It does not change the normal booklet runtime or production. It requires no Terraform, Compose, Cloudflare, database reset, infrastructure workflow, new Dify API key, or VPS OpenAI image key.

Fixed provider settings are OpenAI Tools `0.2.1`, `gpt-image-2`, `1536x1536`, medium quality, one opaque PNG. Dify uses the existing `dify-booklet-manager-test` credential. Booklet retains the existing manager `DIFY_API_KEY` and callback `DIFY_TOOL_KEY`.

The existing staging project, revision 1, approval, history, and failed attempt `1/2` are retained. No migration is required because new attempt metadata is optional.

## End-to-end flow

1. Booklet starts a ten-minute manager turn and supplies its Run ID.
2. The manager loads Booklet context.
3. If `illustrate_panel` is allowed, the manager calls it with identifiers only.
4. The workflow obtains `sys.workflow_run_id` and requests Booklet authorization.
5. Booklet validates availability, maintenance, active turn, revision, approval, image enablement, and remaining attempts. It atomically reserves one ten-minute attempt and returns the saved prompt once.
6. Only HTTP 200 and literal `started=true` reaches the image node. Repeated authorization never permits another provider call.
7. Dify generates one PNG and uploads raw bytes to Booklet.
8. Booklet claims completion for 60 seconds, validates the PNG, stores it under an attempt-derived path, records SHA-256 identity, and marks it ready only after storage succeeds.
9. Dify reports bounded failure categories when generation or upload fails. The application supplies timeout fallback and recovery controls.

Manager completion, timeout, or interrupted streaming never starts generation automatically. Completion does not need an active manager turn, but it must match the unresolved attempt and current approved revision.

## Application contracts

### Manager tools

[tools.openapi.json](tools.openapi.json) exposes only:

- `get_project_context`
- `save_story_draft`
- `request_review`

`generate_panel_image` is retired. Authenticated calls to its former route return `operation_retired` without mutation. Context uses `illustrate_panel` as the allowed image action.

### Internal callbacks

The Dify workflow alone calls:

- `POST /api/experiments/dify/tools/image/authorize`
- `POST /api/experiments/dify/tools/image/complete`
- `POST /api/experiments/dify/tools/image/failure`

All require `X-Booklet-Tool-Key`. Only these exact staging paths bypass Basic Auth; handlers still enforce the experiment and maintenance boundaries. The full wire contract is in [illustrator-workflow.md](illustrator-workflow.md).

Authorization stores attempt UUID, originating Booklet run, Dify workflow run, deadline, and attempt count atomically. A generating or ready attempt returns `started=false`. Failed or unknown work requires explicit application Retry.

Completion accepts at most 20 MiB of raw `image/png`. It rejects duplicate query names, malformed PNGs, non-square files, and files other than 1536 by 1536. A server-derived path includes the attempt UUID and completion-claim UUID. Same-digest replay succeeds; different bytes after completion conflict. A completion claim serializes uploads and expires after 60 seconds. Final commit matches the claim, current revision, approval, and attempt. Claim-specific object keys prevent an expired writer from overwriting the asset selected by a newer claim.

Failure accepts only `generation_failed`, `generation_unknown`, or `upload_failed`. Booklet maps these to safe messages and never stores raw provider output. Failure cannot replace ready, claimed, or superseded work.

### Browser recovery

Failed and unknown attempts show attempt and workflow identifiers, Retry, and **Save existing image**. Recovery uses the same completion validator, normal browser gate, and same-origin check. It neither reserves another attempt nor calls Dify and remains available at the cap. Retry is disabled while completion is claimed.

## Persistence and isolation

New image fields are optional so existing MongoDB documents remain readable. Existing attempts without a new deadline keep their earlier expiry behavior. New manager turns and attempts use the shared ten-minute constants. Callback and recovery mutations use deployment tracked-mutation accounting; maintenance rejects them.

Booklet stores the PNG through the existing asset store. If Dify finishes during maintenance and upload fails, the operator downloads the workflow file and performs application recovery after maintenance.

The direct OpenAI image adapter and runtime check for `DIFY_IMAGE_OPENAI_API_KEY` are removed. Legacy optional deployment-secret support remains inert for compatibility.

## Dify delivery

- [illustrate-panel.yml](illustrate-panel.yml) is the sanitized workflow export template with a pinned plugin dependency and no credential binding.
- [illustrator-workflow.md](illustrator-workflow.md) defines callbacks and exact manual node bindings.
- [manager-prompt.md](manager-prompt.md) is the complete replacement manager prompt.
- [runbook.md](runbook.md) is the operator sequence.

The workflow must not give the manager the raw OpenAI tool or internal callbacks. It builds authorization JSON in Code, gates generation on `started=true`, fixes all image settings, disables authorization and generation retries, and permits one idempotent completion retry. Upload failure returns the generated file for recovery.

The checked-in DSL is sanitized. Import, credential binding, failure-branch inspection, binary binding, and plugin retry inspection in the target workspace are required before it is called verified.

OpenAI Tools `0.2.1` currently creates the OpenAI Python client without `max_retries=0`. The SDK retries eligible failures twice by default. A disabled Dify node retry therefore does not provide the required one-provider-call boundary. Do not publish or run the checked-in image node unchanged. The smallest acceptable resolution is a reviewed pinned plugin build whose image client sets `max_retries=0`, followed by target-workspace import and non-billable verification. Do not silently change the image model or add a direct host-provider path.

## Verification and completion

Automated checks cover approval and revision rejection, stale turns, duplicate authorization, attempt cap, PNG validation, idempotent and conflicting completion, recovery without a new attempt, expiry, persistence compatibility, route isolation, fake browser lifecycle, and normal production isolation.

Run type checks, lint, focused Dify tests, the affected build, and the fake browser test. Inspect the DSL for secrets, bypasses, and retry behavior. Complete independent review and documentation reconciliation before publication.

The experiment is locally complete when code and documentation checks pass. Dify delivery is complete only after a target-workspace import check. The one live image is a separate result after spending approval. Booklet attempt reservation does not guarantee exactly-once provider billing after an uncertain network outcome.
