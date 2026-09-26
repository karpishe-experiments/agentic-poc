# Dify booklet lifecycle experiment on staging

Status: Booklet-side implementation is complete locally. Target-workspace import, non-billable authorization testing, and the live paid checkpoint remain operator verification. Issue: [#50](https://github.com/karpishe-experiments/agentic-poc/issues/50).

## Scope and accepted architecture

Dify owns the manager, Story Writer Workflow, and `illustrate_panel` Workflow. Booklet owns saved revisions, review and approval, attempt authorization, the two-attempt cap, durable assets, recovery, and UI state. The manager chooses an allowed action; Booklet validates and commits it.

This supersedes the earlier direct-provider image design in this experiment. It does not change the normal booklet runtime or production. It requires no Terraform, Compose, Cloudflare, database reset, infrastructure workflow, new Dify API key, or VPS OpenAI image key.

Fixed provider settings are OpenAI Tools `0.2.1`, `gpt-image-2`, `1536x1536`, medium quality, one opaque PNG. Dify uses the existing `dify-booklet-manager-test` credential. Booklet retains the existing manager `DIFY_API_KEY` and callback `DIFY_TOOL_KEY`.

The existing staging project, revision 1, approval, history, and current attempt at `2/2` are retained. Recover the existing generated file; do not generate again or reset the experiment. No migration is required because new attempt metadata is optional.

## End-to-end flow

1. Booklet starts a ten-minute manager turn and supplies its Run ID.
2. The manager loads Booklet context.
3. If `illustrate_panel` is allowed, the manager calls it with identifiers only.
4. The workflow obtains `sys.workflow_run_id` and requests Booklet authorization.
5. Booklet validates availability, maintenance, active turn, revision, approval, image enablement, and remaining attempts. It atomically reserves one ten-minute attempt and returns the saved prompt once.
6. Only HTTP 200 and literal `started=true` reaches the image node. Repeated authorization never permits another provider call.
7. Dify generates one PNG and uploads raw bytes to Booklet.
8. Booklet claims completion for 60 seconds, fully decodes the image, stores it under an attempt-derived path, records SHA-256 identity, and marks it ready only after storage succeeds.
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

Completion accepts at most 20 MiB of raw image bytes. It fully decodes single-frame PNG, JPEG, or WebP, with positive dimensions and at most 64 megapixels. MIME labels and file extensions are not authoritative. Dimension/aspect-ratio differences from 1536 by 1536 and non-PNG formats produce warnings, not failure. Original bytes are retained; decoded format determines the storage extension and served MIME type. Optional width, height, and format metadata support the actual image aspect ratio in the UI. Older records expose null metadata. A server-derived path includes the attempt UUID and completion-claim UUID. Same-digest replay succeeds; different bytes after completion conflict. A completion claim serializes uploads and expires after 60 seconds. Final commit matches the claim, current revision, approval, and attempt. Claim-specific object keys prevent an expired writer from overwriting the asset selected by a newer claim.

Failure accepts only `generation_failed`, `generation_unknown`, or `upload_failed`. Booklet maps these to safe messages and never stores raw provider output. Failure cannot replace ready, claimed, or superseded work.

### Story validation

Require nonempty text, exactly three ordered panels numbered 1, 2, 3, a title of at most 1,000 characters, and at most 16,000 characters for each other story text field. Preferred lengths (160-character title, 100-word storyline, 40-word panel text, and prior field character preferences) produce derived `story_warnings`. Unknown fields inside Story and panels are stripped. Mutation envelopes remain strict. Story Writer serialization is unchanged.

### Browser recovery

Failed and unknown attempts show attempt and workflow identifiers, Retry, and **Save existing image**. Recovery uses the same completion validator, normal browser gate, and same-origin check. It neither reserves another attempt nor calls Dify and remains available at the cap. Successful recovery clears the current image error and failure category but preserves run history and attempt count. Completed images show warnings without offering regeneration. Retry is disabled while completion is claimed.

## Persistence and isolation

New image fields are optional so existing MongoDB documents remain readable. Existing attempts without a new deadline keep their earlier expiry behavior. New manager turns and attempts use the shared ten-minute constants. Callback and recovery mutations use deployment tracked-mutation accounting; maintenance rejects them.

Booklet stores the original image through the existing asset store. If Dify finishes during maintenance and upload fails, the operator downloads the workflow file and performs application recovery after maintenance.

The direct OpenAI image adapter and runtime check for `DIFY_IMAGE_OPENAI_API_KEY` are removed. Legacy optional deployment-secret support remains inert for compatibility.

## Dify delivery

- [illustrate-panel.yml](illustrate-panel.yml) is the sanitized workflow export template with a pinned plugin dependency and no credential binding.
- [illustrator-workflow.md](illustrator-workflow.md) defines callbacks and exact manual node bindings.
- [manager-prompt.md](manager-prompt.md) is the complete replacement manager prompt.
- [runbook.md](runbook.md) is the operator sequence.

The workflow must not give the manager the raw OpenAI tool or internal callbacks. It builds authorization JSON in Code, gates generation on `started=true`, fixes all image settings, disables authorization and generation retries, and disables completion retry to retain non-2xx HTTP response bodies for bounded error parsing. Transport failure stops the workflow; the generated file remains recoverable from its node log. Upload failure returns the generated file for recovery.

The checked-in DSL is sanitized. Import, credential binding, failure-branch inspection, binary binding, and plugin retry inspection in the target workspace are required before it is called verified.

OpenAI Tools `0.2.1` creates the OpenAI Python client without `max_retries=0`. The SDK retries eligible failures twice by default. Disable the Dify image node's retry, but accept that one authorized Booklet attempt can still cause more than one provider request. This experiment records that billing uncertainty instead of maintaining a custom plugin build. Do not treat the Booklet attempt counter as an exact provider-request or billing count, silently change the image model, or add a direct host-provider path.

## Verification and completion

Automated checks cover approval and revision rejection, stale turns, duplicate authorization, attempt cap, image byte validation, warning-only quality preferences, idempotent and conflicting completion, recovery without a new attempt, expiry, persistence compatibility, route isolation, fake browser lifecycle, and normal production isolation.

Run type checks, lint, focused Dify tests, and the fake browser test. Production/container builds run during deployment. Inspect the DSL for secrets, bypasses, and retry behavior. Complete independent review and documentation reconciliation before publication.

The experiment is locally complete when code and documentation checks pass. Dify delivery is complete only after a target-workspace import check. The one live image is a separate result after spending approval. Booklet attempt reservation does not guarantee exactly-once provider billing after an uncertain network outcome.
