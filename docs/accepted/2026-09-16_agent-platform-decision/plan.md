# Dify booklet lifecycle experiment on staging

Status: implementation in progress. The isolated staging routes, fake lifecycle, tool contract, and optional real adapters exist. Dify's OpenAI provider and Story Writer Workflow have passed a synthetic create test; the Booklet integration has not run on staging.
Issue: [#50](https://github.com/karpishe-experiments/agentic-poc/issues/50).
Start with the [compact runbook](runbook.md). Use the [verification checklist](verification.md) at the end.

## What we are trying

A Dify manager loads Booklet context, writes a short storyline and three panels, saves a draft, responds to feedback, waits for approval, generates the first panel's image, and resumes without repeating completed work.

Use one synthetic project, one operator, one manager, one Story Writer Workflow based on the writing instructions, three story moments, and one image. “Panel” means one sequential story moment, not a multi-panel page or a change to the canonical Booklet PRD.

Run the experiment on _staging inside the existing application. The browser uses ordinary requests and polling. No local web server, local streaming setup, tunnel, or self-hosted Dify installation is needed.

This plan replaces the previous one-shot generation, concept-proposal, and local-server trial scopes. The live issue still has the earlier broad criteria; this plan is the latest user-approved scope. Reconcile the issue when publishing implementation. The [decision record](DECISION.md) retains the platform rationale.

## The full small scenario

1. Open /experiments/dify on staging. Initialize the synthetic project from [fixtures.json](fixtures.json) if absent.
2. Click **Create story**. Booklet starts a Dify turn. The manager loads context, calls `write_story`, saves revision 1, requests review, and stops.
3. The page displays the saved storyline and three panels in a review card.
4. Submit “Make the ending funnier, but keep Pip kind and preserve the first panel.” Booklet saves feedback. The manager reloads context, saves revision 2, requests review, and stops.
5. Click **Approve and illustrate** on revision 2. Booklet records approval and then starts a continuation turn.
6. The manager reloads context and requests the first-panel image. The tool checks approval and starts one image attempt.
7. The page polls saved state and displays the image and its prompt when ready.
8. Refresh. The revision history, approval, feedback, and image remain. **Resume** starts a fresh Dify conversation; the manager loads saved context and reports completion without another save or image generation.

One negative check is part of the live scenario: call generate_panel_image before approval and confirm that Booklet rejects it without contacting the image provider.

## Who owns what

| Component | Responsibility |
|---|---|
| Dify manager | Decide next action, call the Story Writer specialty and the four Booklet tools, explain progress. |
| Story Writer Workflow | Propose/revise storyline, three panels, and the first-panel image prompt as typed Story output. |
| Booklet experiment service | Validate tool requests, load context, persist revisions, enforce approval, dispatch and save the image. |
| Staging page | Show persisted artifacts and review controls; collect feedback and approval; poll progress. |
| Existing staging MongoDB and R2 | Persist isolated experiment state and its image across requests and deployments. |

Dify never owns approval or durable project state. Its chat text is not the review card. The page reads the saved project after each operation.

Use existing Next.js, MongoDB access, R2 asset infrastructure, Zod, and fetch. Keep experiment code grouped under an experiment module; do not add stages to the normal booklet workflow, route normal chat through Dify, or copy full runtime services.

Use `gpt-5.6-terra` in Dify and `gpt-image-2` in the server image adapter. The Booklet OpenAI project holds separate restricted text and image keys. Dify stores the text credential; the server holds `DIFY_IMAGE_OPENAI_API_KEY` for images. No Dify image plugin is attached because that would bypass Booklet's approval tool.

## Shared artifacts

- [tools.openapi.json](tools.openapi.json): importable OpenAPI 3.0 tool definition and Story/Context schemas. Replace only its server URL before import.
- [manager-prompt.md](manager-prompt.md): paste into the manager's instructions.
- [story-writing/SKILL.md](story-writing/SKILL.md): source instructions for the Story Writer Workflow.
- [story-writer-workflow.md](story-writer-workflow.md): Dify Workflow-as-Tool configuration.
- [build-request.md](build-request.md): conversational setup request and configuration checks.
- [fixtures.json](fixtures.json): seed data, a valid example draft, feedback, and expected outcomes.
- [configuration.md](configuration.md): settings, credential ownership, and deployment requirements.
- [verification.md](verification.md): fake-provider checks, live sequence, and issue-comment template.

These are authored contracts and examples, not tested Dify exports. Export the actual working Dify definition after setup and preserve the Story Writer instructions separately.

## Four application tools

All tools live below /api/experiments/dify/tools. Only these four paths accept the dedicated X-Booklet-Tool-Key credential. The credential is scoped server-side to the fixed experiment project; project_id is a checked selector, not authority.

| operationId | Behavior |
|---|---|
| get_project_context | Return preferences, current draft/revision, feedback, review, approval, image state, and allowed_actions. |
| save_story_draft | Validate the full story and expected_revision; append an immutable revision; clear prior review and approval. |
| request_review | Mark the current revision ready for review; repeat calls for that revision are harmless. |
| generate_panel_image | Require current revision approval, panel 1, image opt-in and remaining attempt allowance; start one attempt and return immediately. |

Schemas and request bodies are in tools.openapi.json. The three mutating tools require run_id from the current Booklet turn. No tool accepts an approval flag, role, budget, filesystem path, provider URL, or model override. The manager cannot approve its own work.

Use HTTP 401 for missing/wrong tool key; 404 for unknown project; 422 for invalid input; 409 for stale_revision, approval_required, busy or image_attempt_exists; 403 for image_disabled or image_limit_reached. Return the common error envelope and actionable message. The context tool remains usable after errors.

### Story contract

Story has title, storyline, character_description, exactly three panels numbered 1–3 with text and scene, and first_panel_image_prompt. Storyline: at most 100 whitespace-separated words. Each panel text: 1–40 words. All story strings are nonempty. Reject extra fields, out-of-order numbers, and invalid word counts in server-side Zod validation.

The prompt describes only panel one with the saved character and illustration style, a square composition, and no lettering or collage. Assess prompt/scene consistency by reading the output and viewing the image; schema checks cannot prove creative quality.

### Context and lifecycle

Return the current story, current_revision, review_revision, approved_revision, pending feedback, image summary, and allowed_actions. Include saved audience, language, style, and character details every time. Supply recent feedback (last five entries) rather than whole run logs. Do not expose active_run_id in any Dify tool response; only the browser project view receives it.

Derive state and permitted mutation tools as follows; get_project_context is always available:

| State | Condition | allowed_actions |
|---|---|---|
| draft_needed | No revision | save_story_draft |
| draft_saved | Draft saved, review not requested | save_story_draft, request_review |
| awaiting_review | Current review, no approval | request_review; also save_story_draft when pending feedback exists |
| ready_for_image | Current revision approved, image absent | generate_panel_image |
| generating | Image request in progress | none |
| complete | Image ready | none |
| image_failed | Image failed or outcome unknown | none; operator can explicitly retry |

Every mutating tool checks state as well as expected_revision. Saving a new draft consumes pending feedback and invalidates prior review/approval. Reject edits during image generation or after completion; this small experiment ends at its first completed image.

Accept browser revise only for the current unapproved pending review with no active manager turn or image attempt. Atomically claim the turn and append feedback; reject all other revise requests with 409 without storing feedback. Disable approval while a turn or pending feedback exists, and enforce this on the server. After approval this experiment offers image continuation/retry, not further story edits.

For an existing generating/ready image of the same current revision, generate_panel_image returns that state before applying the allowed_actions mutation check. It does not start work. Check approval before image-enabled or credential checks so the before-approval test always returns approval_required.

## Persistence and minimal recovery

Use one new MongoDB collection, dify_experiment_projects, in the existing staging database. Do not write to normal booklet, artifact, job, or conversation collections. Initialization is an explicit authenticated UI action, using insert-if-absent for project_id=booklet-dify-trial; page reads do not reset data.

The project document stores schema_version=1, seed fields, revisions[], feedback[], current_revision=0, review_revision=null, approved_revision=null, image=null, image_attempt_count=0, and runs[]. The image_attempt_count is project-wide and survives clearing image state. Each revision stores revision, story, created_at. Feedback records store text, based_on_revision, and consumed_by_revision. Runs store server run ID, action, status, timestamps, Dify task/conversation/message IDs when available, sanitized errors, tool call summaries, and reported usage.

Use atomic Mongo conditional updates for revision checks, active-run claims, and image dispatch claims. A single document avoids transaction plumbing. Avoid whole-document read-modify-write that could lose parallel tool or image updates.

Fake tests use an isolated test database and fake asset store. Do not populate the live staging project with fake revisions or images; staging fake-mode smoke checks are readiness/auth checks only.

Use the existing staging assets bucket with keys under experiments/dify/booklet-dify-trial/. Save the image bytes through the existing storage layer; keep asset key, MIME, revision, prompt, attempt_count and status in the experiment document. Do not invent normal booklet asset records. An authenticated experiment asset route serves only the saved image key; there is no arbitrary URL/key proxy.

A Dify turn and image attempt have explicit deadlines. Any running record past its deadline is shown as unknown on the next state read/resume; do not automatically retry it. Booklet sends its server run ID in the manager turn message. Each mutating Booklet tool requires that exact run_id and atomically checks it against the active run. A late turn cannot mutate state after another turn starts. Retain completed drafts if Dify fails after saving.

Image dispatch is one background task using Next.js after and the existing tracked-mutation wrapper for its full duration. Return generating promptly to Dify. Existing maintenance/drain controls govern manager turns, image work, and expiration recovery writes. No experiment mutation bypasses them. One active manager turn per project, but its HTTP tools must be able to write without acquiring the manager-turn lock again.

No general queue, distributed workflow engine, or automatic provider retries. This is sufficient for a single-instance experiment, not an exactly-once billing guarantee.

## Staging page and server interface

Use /experiments/dify and /api/experiments/dify/*; browser-facing paths retain the existing Basic Auth gate. The application enables the experiment on _staging without a host feature flag. When the authenticated setup endpoint reports that it is available, the main header shows a Dify experiment link. Return 404 in _prod. A local development server can enable fake mode with DIFY_EXPERIMENT_ENABLED=true for the isolated browser test; it cannot enable real calls or run in a production build.

| Relative API path | Contract |
|---|---|
| GET /project | Public-safe project context, revisions and run summaries; 404 with initialize guidance if absent. |
| POST /initialize | Insert synthetic seed if absent; never overwrite existing experiment data. |
| POST /turn | action=create/resume/revise; revise includes expected_revision and feedback. Save feedback before starting Dify. Return 202 with run_id; reject concurrent turns. |
| POST /approve | expected_revision; require matching pending review; persist approval. Repeating approval of the same revision is harmless. Browser then starts a resume turn. |
| GET /assets/panel-1 | Stream saved current image after Basic Auth; 404 until ready. |
| POST /image/retry | expected_revision; only failed/unknown current approved revision with no active turn and image_attempt_count below the cap. Atomically clear image to null without changing image_attempt_count. Browser then starts resume. |
| GET /setup | Only non-secret readiness: modes, required credential presence, project ID. |

The page shows the idea/preferences, Create story, a saved review card, feedback input, Approve and illustrate, Resume, progress, image, and compact run details. Poll /project every two seconds while a manager run or image is active, then stop. Load once on page open. Disable conflicting actions while busy.

Require JSON and same-origin checks for browser mutations. Do not expose approval through the tool schema. The auth exception in proxy.ts must match only the four exact tool paths and apply only when staging experiment mode is enabled; handlers must validate the dedicated key. All other paths keep existing Basic Auth. Never give Dify the staging access password.

## Dify adapter

Call POST /chat-messages from the server with inputs={}, response_mode=streaming, user=booklet-trial-operator, auto_generate_name=false, no conversation_id, and a query containing the project ID, action hint, and current server run ID. The manager passes that ID to mutating Booklet tools and loads the actual idea and feedback through get_project_context.

Consume Dify's required SSE internally. The browser does not implement streaming. Accumulate agent_message text, replace it with the closing message, and return when message_end arrives, even if the connection remains open. Parse arbitrary chunk boundaries; ignore unknown events, but fail on an error event, malformed event, or stream that ends before message_end. Persist tool names/status and final explanatory text, not raw reasoning. Persist usage when available, otherwise record unavailable.

Run the adapter in Next.js after with tracked-mutation accounting; a five-minute deadline bounds one turn. If interrupted/timed out, best-effort call Dify's stop endpoint with task_id and the same user, with a five-second timeout on that call. Keep saved artifacts and show Resume. Every Resume starts fresh and proves state comes from Booklet.

## Image adapter

Only generate_panel_image can dispatch a provider request. It reads the approved saved prompt, atomically reserves the attempt, and calls OpenAI's image generation endpoint with `gpt-image-2`, square size, and medium quality. Decode the returned image bytes and store them in staging R2. A duplicate tool call returns the existing image state and does not schedule another provider request.

A refusal/no-image response or definite provider error becomes failed. A 120-second timeout becomes unknown because the provider may have charged. Do not auto-retry.

Duplicate requests return the existing generating/ready image state. Failed/unknown attempts return image_attempt_exists until the operator explicitly retries. At most two real attempts across the project, including failures; Retry explains possible previous billing. Default DIFY_IMAGE_ENABLED=false. Fake mode never calls a provider and marks output visibly as fake; real mode never silently falls back to fake.

Dispatch atomically requires image=null, current approval and image_attempt_count below the cap; increment image_attempt_count and create the generating image with attempt_count equal to that value in the same update. Retry transitions image_failed to ready_for_image by clearing only image, not approval or the project counter. Repeated Retry while already ready_for_image is harmless; Retry while generating or at the cap fails. Old attempts cannot publish because their IDs no longer match. Include image_attempt_count in context even when image is null.

## Parallel tracks and delivery sequence

| Coding track | Dify setup track |
|---|---|
| Implement experiment state/tools/UI with fixture-backed fake adapters. | Create Cloud account, configure the OpenAI provider, create the manager, and publish Story Writer as `write_story`. |
| Implement internal Dify SSE consumption and image adapter; test auth/state transitions. | Import OpenAPI with placeholder server; configure tools and prepare app publication. Endpoint tests wait for staging. |
| Keep staging availability in application code; prepare optional credential support through canonical deployment configuration. | Supply Dify app key privately; obtain a dedicated tool key from the operator. |
| Publish reviewed code and prepare staging deployment using the deployment runbook. | Replace server URL with actual staging origin; set tool-key header; publish. |
| Verify staging readiness and auth without mutating the sample; then enable live mode and run the full scenario together. | Inspect Dify traces and correct instructions if needed. |

The server URL and operation IDs are the only integration handshake. Code can begin against fixtures; Dify setup can begin against schemas and prompts. Neither track needs the other's implementation to start.

Implement in three slices: state/tools and fake page; Dify setup and adapter; real image and live staging verification. Full run follows the [runbook](runbook.md). The reviewed application change exposes the page on _staging. The merged temporary host configuration selects real mode there; affected operations still need protected credentials. Do not modify _prod settings or deploy production.

## Verification and boundaries

After implementation run typecheck, lint, focused experiment contract/service/adapter tests, and a fake browser lifecycle test. Run both deployment shell tests, bash -n and ShellCheck when changing the secret contract/Compose installation; run the relevant deployment contract tests and build. Preserve readiness, drain and rollback. Live Dify and image calls are a separate operator-run experiment.

Use [verification.md](verification.md) to prove initial draft, revision, approval, one image, persisted resume and rejection before approval. Keep results in issue comments; record setup effort, latency, tool errors, observed usage and image cost separately. No numeric scoring system or model-comparison framework.

This covers context loading, static tool discovery, manager-to-specialty Workflow delegation, orchestration, structured artifacts, review/revision/approval, image generation, durable state, custom UI and resume. It does not prove general agent-to-agent delegation, dynamic tool discovery, large-context retrieval, multi-user permissions, payments, cancellation guarantees, full-book consistency, asset reuse/personalization, layout or PDFs.

## Source notes

Checked 2026-09-17; live access, imports and provider behavior still need verification.

- [Dify Agent setup, skills and export](https://docs.dify.ai/en/cloud/use-dify/build/new-agent/build)
- [Dify OpenAPI tools](https://docs.dify.ai/en/cloud/use-dify/workspace/tools)
- [Dify Agent API](https://docs.dify.ai/en/api-reference/guides/agent)
- [OpenAI image generation](https://developers.openai.com/api/docs/guides/image-generation)

The experiment runtime is implemented locally but not deployed or verified end to end. Record live behavior only after the staging trial.
