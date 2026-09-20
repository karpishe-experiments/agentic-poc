# Start the Dify booklet experiment

This is the handoff for the Dify setup and remaining verification. The staging routes and fake lifecycle exist. The OpenAI provider, Story Writer, manager, and authenticated Booklet tools are configured. A live context load is verified; the corrected tool import and the remaining lifecycle still require verification. Follow [plan.md](plan.md) for the implementation contract.

Before staging, run `npm run test:dify:browser` to check the synthetic create, feedback, approval, image, refresh, and Resume path. This uses a local fake-only development server; it is not a Dify or provider test. On staging, the page displays its current `fake` or `real` mode. Do not mistake a fake result for live provider verification.

## Current Dify checkpoint

- Completed 2026-09-17: the shared Dify workspace has an OpenAI provider credential for the `Booklet` OpenAI project. It uses the Responses API and has no organization header. The OpenAI project has a $20 monthly limit. The published `booklet_manager` agent uses `gpt-5.6-terra`.
- Completed 2026-09-20: the manager has the Story Writer tool and four authenticated Booklet staging tools attached. Its API key is installed in staging, and the current [manager-prompt.md](manager-prompt.md) is published.
- Decision 2026-09-17: test a separate Dify `story_writer` Workflow published as the `write_story` tool. This is Dify configuration only. Booklet keeps its four HTTP tools and all lifecycle authority.
- Completed 2026-09-17: Story Writer has the three typed inputs, `gpt-5.6-terra`, and the Booklet Story structured-output schema. Workflow version 1 is published internally as the `write_story` tool and attached to the manager. Before the live run, synchronize its system prompt with the current story-writing/SKILL.md and republish if changed.
- Verified 2026-09-17: the Story Writer synthetic create test returned a valid three-panel Story object. This verifies only Dify configuration and the text model; it did not contact Booklet or an image provider.
- Verified 2026-09-20: staging runs in real mode, initializes the synthetic project, and calls `get_project_context` through Dify. The first create run reached `save_story_draft` but failed because Dify imported the referenced `story` request schema as a string. The OpenAPI definition now inlines that object. Reimport and a successful lifecycle run remain.

## What remains before a live run

The Booklet-side state, tools, page, adapters, and fake tests are deployed on `_staging`. The host feature flag does not block the page. The temporary host configuration selects real Dify mode and enables the image path in staging. The manager, Story Writer, Booklet tools, tool key, and manager app key are configured. Replace the existing Booklet tool import with the corrected inline request schema, then resume the lifecycle test. Do not infer that local fake tests or the successful context call verify the remaining mutations or image path.

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
3. In a copy of tools.openapi.json, replace https://replace-with-staging-origin.example with the actual staging origin. Keep the /api/experiments/dify/tools paths unchanged. Keep the `save_story_draft.story` schema inline; Dify imports a request-body `$ref` there as a string.
4. For a first import, create a Swagger/OpenAPI tool named Booklet staging tools. To replace the existing import safely, create Booklet staging tools v2 from the corrected copy. Keep the old integration attached until the replacement passes step 6.
5. Configure the new tool's API-key authentication with custom header X-Booklet-Tool-Key and the dedicated value supplied privately. Do not use the browser Basic Auth password.
6. Confirm that the imported `save_story_draft` shows `story` as an object with its nested fields, not as a string. Test get_project_context with {"project_id":"booklet-dify-trial"}. Expect the saved current state; a fresh project has current_revision=0 and state=draft_needed. If the importer cannot send the configured header or parse the contract, record that concrete failure; do not weaken endpoint authentication.
7. Attach all four replacement operations to booklet_manager and remove its four old Booklet operations. Confirm the current prompt passes Booklet's turn Run ID as `run_id` in every mutating tool call. Confirm the model and `write_story` tool against build-request.md. Do not attach a direct image plugin or the writing skill to the manager. After the manager is republished and verified, the old integration can be deleted.
8. Publish the agent. For a first setup only, create the app API key in Access Point / API and install DIFY_API_KEY server-side. When replacing only the Swagger tool, retain the existing manager app key; no server-side key change is required. Staging Compose already selects real mode and enables the image path; do not approve the billable image step until its separate key and operator spending approval are in place.
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
