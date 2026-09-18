# Start the Dify booklet experiment

This is the handoff for the Dify setup and remaining verification. The staging routes and fake lifecycle exist. The OpenAI provider and Story Writer are configured in Dify; Booklet's staging integration and full lifecycle remain unverified. Follow [plan.md](plan.md) for the implementation contract.

Before staging, run `npm run test:dify:browser` to check the synthetic create, feedback, approval, image, refresh, and Resume path. This uses a local fake-only development server; it is not a Dify or provider test. On staging, the page displays its current `fake` or `real` mode. Do not mistake a fake result for live provider verification.

## Current Dify checkpoint

- Completed 2026-09-17: the shared Dify workspace has an OpenAI provider credential for the `Booklet` OpenAI project. It uses the Responses API and has no organization header. The OpenAI project has a $20 monthly limit. The unpublished `booklet_manager` agent uses `gpt-5.6-terra`.
- Completed 2026-09-17: the manager has the Story Writer tool attached. The manager prompt was initially pasted in its earlier single-agent form; verify that the current [manager-prompt.md](manager-prompt.md) has replaced it before publication.
- Decision 2026-09-17: test a separate Dify `story_writer` Workflow published as the `write_story` tool. This is Dify configuration only. Booklet keeps its four HTTP tools and all lifecycle authority.
- Completed 2026-09-17: Story Writer has the three typed inputs, `gpt-5.6-terra`, and the Booklet Story structured-output schema. Workflow version 1 is published internally as the `write_story` tool and attached to the manager. Before the live run, synchronize its system prompt with the current story-writing/SKILL.md and republish if changed.
- Verified 2026-09-17: the Story Writer synthetic create test returned a valid three-panel Story object. This verifies only Dify configuration and the text model; it did not contact Booklet or an image provider.
- Not yet completed: no Booklet HTTP tools, published manager app key, staging deployment, or end-to-end Booklet run exists.

## What remains before a live run

The Booklet-side state, tools, page, adapters, and fake tests are implemented locally. The application release makes the page available on `_staging`; the host feature flag does not block it. The merged temporary host configuration selects real Dify mode and enables the image path in staging. Missing keys still prevent affected operations. The Dify operator must synchronize the manager and Story Writer instructions, import the four Booklet tools after staging is reachable, then publish the manager and supply its app key privately. Do not infer that local fake tests verify Dify or staging.

Account links: [Dify Cloud](https://cloud.dify.ai/), [OpenAI Platform](https://platform.openai.com/).
If the expected Agent/model is unavailable, record the actual blocker before spending time on an alternate architecture.

### Configure the Story Writer specialty

Follow [story-writer-workflow.md](story-writer-workflow.md). It uses the writing skill as source instructions and exposes the typed `write_story` Workflow-as-Tool to the manager. It does not add a Booklet endpoint or persistence contract.

## Local verification and publication checkpoint

The staging page, four tools, fake lifecycle, real adapters, and optional-secret support exist on `agent/issue-50-dify-platform-exploration`. Before publication, run typecheck, lint, `npm run test:dify`, `npm run test:dify:browser`, build, both deployment shell tests, `bash -n`, and ShellCheck. Review the exact diff after those checks. The shell tests and ShellCheck require an environment with `jq` and ShellCheck; a local fake browser pass does not replace them.

Publish through the normal reviewed issue branch, then promote the reviewed application commit to `_staging` through the [deployment runbook](../../deployment/runbook.md). Require a successful Infrastructure run for the merged temporary host configuration before relying on its real-mode settings. Install the optional keys before the affected operations. Do not deploy production.

The goal of this checkpoint is an accessible staging page that reports real mode and its readiness state, plus authenticated tools. Do not report page availability as provider verification.

## Connect Dify to staging

1. Confirm the reviewed application commit is deployed on `_staging`. For real Dify calls, set the mode and credentials in configuration.md through the supported host secret/configuration procedure. The installed DIFY_EXPERIMENT_ENABLED value does not control staging availability.
2. Open the staging /experiments/dify page using the existing browser access gate. Initialize the synthetic project once.
3. In a copy of tools.openapi.json, replace https://replace-with-staging-origin.example with the actual staging origin. Keep the /api/experiments/dify/tools paths unchanged.
4. In Dify Integrations → Tools, create a Swagger/OpenAPI tool and import that copy. Name it Booklet experiment.
5. Configure API-key authentication with custom header X-Booklet-Tool-Key and the dedicated value supplied privately. Verify that a test call sends exactly that header; do not use the browser Basic Auth password.
6. Test get_project_context with {"project_id":"booklet-dify-trial"}. Expect current_revision=0 and state=draft_needed on a fresh project. If the importer cannot send the configured header or parse the contract, record that concrete failure; do not weaken endpoint authentication.
7. Attach all four imported operations to booklet_manager. Confirm the current prompt passes Booklet's turn Run ID as `run_id` in every mutating tool call. Confirm the model and `write_story` tool against build-request.md. Do not attach a direct image plugin or the writing skill to the manager.
8. Publish the agent. In its Access Point / API section, create the app API key. Install DIFY_API_KEY server-side. Staging Compose already selects real mode and enables the image path; do not approve the billable image step until its separate key and operator spending approval are in place.
9. Confirm /api/experiments/dify/setup reports only safe readiness booleans and mode names. Keys must not be returned.

A Dify preview tool call reaches the same saved project as the page. Avoid running preview and browser turns concurrently. Provider tools cannot initialize or approve projects.

## Run the experiment together

Follow [verification.md](verification.md) and record observations in Issue #50.

1. Create the story from the staging page; verify revision 1 and a review card.
2. Try the image tool through Dify's tool test UI before approval; supply any valid UUID for `run_id`. Expect approval_required and no provider attempt. A call after approval without the current active run ID must return stale_run.
3. Submit the supplied feedback; verify revision 2 and unchanged panel one.
4. Before approving the image step, confirm image-provider access, install DIFY_IMAGE_OPENAI_API_KEY, and obtain operator spending approval. The staging overlay already enables the image path.
5. Click Approve and illustrate. Watch the saved image state progress to ready. Inspect the matching Dify tool trace.
6. Refresh the page, then Resume. Check that no new revision or provider attempt was created.
7. Restart/redeploy through the existing runbook only if needed to verify persistence; re-open the same project and image.
8. Make one small wording change in Dify, publish it, and Resume. Check the reply reflects it without regenerating the story or image.

Export the working Dify manager and Story Writer definitions into output/dify-setup/ after success. Inspect them for credentials before sharing. Keep the Story Writer instruction source separately; Dify exports do not include external skill/file sources. Record app/model/plugin versions and the reviewed application SHA.

## If something fails

| Symptom | Next action |
|---|---|
| Tool call returns Basic Auth HTML | Check that the staging-only exact-path exception is deployed. Do not give Dify the site password. |
| Tool returns 401 | Re-enter the dedicated tool key/header; inspect no secret values in logs. |
| 409 stale_revision | Reload project context. Do not overwrite using the old revision. |
| 409 stale_run | The turn ended or was replaced. Use Resume in Booklet; do not reuse the old Run ID. |
| Image approval_required | Approve the current pending review through the page. |
| Image disabled / missing key | Finish the image setup checkpoint; preserve the saved story. |
| Image failed / unknown | Read the saved error. Retry is shown only while an attempt remains; an unknown outcome may already have incurred a charge. At the configured attempt limit, stop. Do not reset the project to obtain another paid attempt. |
| Dify turn failed | Inspect Dify run ID and saved project, then Resume. Saved tool work remains. |
| Experiment unavailable | Confirm deployed SHA, _staging target and ordinary readiness. The installed feature flag does not control staging availability. |
| Setup cannot finish within Cloud access limits | Record the exact unavailable feature; decide the next step from evidence. |

After recording the result, disable new experiment runs if no longer needed. Retain synthetic data until it is no longer needed for review; deletion is a separate scoped cleanup. Do not close the issue or clear staging automatically.
