# Start the Dify booklet experiment

This is the handoff for future coding and Dify setup. Runtime routes and commands below do not exist yet. Follow [plan.md](plan.md) for the implementation contract.

## Start both tracks

| Coding owner | Dify operator |
|---|---|
| Read plan.md and tools.openapi.json. Build state/tools/page with fixtures and fake adapters. | Create a Dify Cloud account and workspace. Use the new Agent type, not Legacy Agent. |
| Implement the four tools and their auth tests first. | Configure the OpenAI provider with the Booklet project key; select gpt-5.6-terra. |
| Implement review/revision/approval, background runs, polling and persisted image. | Create booklet_manager and paste manager-prompt.md; try build-request.md if desired. |
| Implement fake tests and real Dify/image adapters; prepare staging configuration. | Package story-writing/SKILL.md as a skill ZIP and upload through Configure → Skills. |
| Supply a deployed staging origin, project ID and tool key privately when ready. | Prepare the Swagger/OpenAPI import using tools.openapi.json. Live import tests wait for staging. |

Account links: [Dify Cloud](https://cloud.dify.ai/), [OpenAI Platform](https://platform.openai.com/).
If the expected Agent/model is unavailable, record the actual blocker before spending time on an alternate architecture.

### Package the writing skill

From the repository root, after checking the source:

```powershell
New-Item -ItemType Directory -Force -Path output/dify-setup | Out-Null
Compress-Archive -Path docs/accepted/2026-09-16_agent-platform-decision/story-writing/SKILL.md -DestinationPath output/dify-setup/story-writing.zip -Force
```

The ZIP contains SKILL.md at its root. Generated setup files stay under ignored output/. Dify's skill upload accepts a ZIP with SKILL.md. See [Dify setup](https://docs.dify.ai/en/cloud/use-dify/build/new-agent/build).

## Coding completion checkpoint

- Add the staging experiment page/routes/module described in plan.md.
- Add npm run test:dify for isolated fake-provider tests, including Mongo conditional updates and the stream parser.
- Run typecheck, lint, the focused tests, fake browser lifecycle, and build.
- Apply the optional-secret deployment changes in [configuration.md](configuration.md) and their shell/deployment tests.
- Review and publish the change through the normal issue branch. Keep all work on agent/issue-50-dify-platform-exploration.
- Follow the [deployment runbook](../../deployment/runbook.md) to install master-owned host configuration before promoting the reviewed application commit to _staging. No production deployment.

The goal of this checkpoint is an accessible staging page with fake mode visibly labeled, plus authenticated tools. Do not report a fake run as provider verification.

## Connect Dify to staging

1. Set the experiment flags and credentials as specified in configuration.md through the supported host secret/configuration procedure.
2. Open the staging /experiments/dify page using the existing browser access gate. Initialize the synthetic project once.
3. In a copy of tools.openapi.json, replace https://replace-with-staging-origin.example with the actual staging origin. Keep the /api/experiments/dify/tools paths unchanged.
4. In Dify Integrations → Tools, create a Swagger/OpenAPI tool and import that copy. Name it Booklet experiment.
5. Configure API-key authentication with custom header X-Booklet-Tool-Key and the dedicated value supplied privately. Verify that a test call sends exactly that header; do not use the browser Basic Auth password.
6. Test get_project_context with {"project_id":"booklet-dify-trial"}. Expect current_revision=0 and state=draft_needed on a fresh project. If the importer cannot send the configured header or parse the contract, record that concrete failure; do not weaken endpoint authentication.
7. Attach all four imported operations to booklet_manager. Confirm prompt, model, and skill against build-request.md. Do not attach a direct image plugin.
8. Publish the agent. In its Access Point / API section, create the app API key. Install DIFY_API_KEY server-side. The temporary staging host overlay already selects real mode and enables the image path; do not approve an image call until its separate key is installed and spending is authorized.
9. Confirm /api/experiments/dify/setup reports only safe readiness booleans and mode names. Keys must not be returned.

A Dify preview tool call reaches the same saved project as the page. Avoid running preview and browser turns concurrently. Provider tools cannot initialize or approve projects.

## Run the experiment together

Follow [verification.md](verification.md) and record observations in Issue #50.

1. Create the story from the staging page; verify revision 1 and a review card.
2. Try the image tool through Dify's tool test UI before approval; expect approval_required and no provider attempt.
3. Submit the supplied feedback; verify revision 2 and unchanged panel one.
4. Confirm image-provider access, spending approval, and installation of DIFY_IMAGE_OPENAI_API_KEY. The staging image path is already enabled in Compose.
5. Click Approve and illustrate. Watch the saved image state progress to ready. Inspect the matching Dify tool trace.
6. Refresh the page, then Resume. Check that no new revision or provider attempt was created.
7. Restart/redeploy through the existing runbook only if needed to verify persistence; re-open the same project and image.
8. Make one small wording change in Dify, publish it, and Resume. Check the reply reflects it without regenerating the story or image.

Export the working Dify definition into output/dify-setup/ after success. Inspect it for credentials before sharing. Keep the skill source separately; Dify exports do not include skills/files. Record app/model/plugin versions and the reviewed application SHA.

## If something fails

| Symptom | Next action |
|---|---|
| Tool call returns Basic Auth HTML | Check that the staging-only exact-path exception is deployed. Do not give Dify the site password. |
| Tool returns 401 | Re-enter the dedicated tool key/header; inspect no secret values in logs. |
| 409 stale_revision | Reload project context. Do not overwrite using the old revision. |
| Image approval_required | Approve the current pending review through the page. |
| Image disabled / missing key | Finish the image setup checkpoint; preserve the saved story. |
| Image failed / unknown | Read the saved error. Explicit Retry is allowed within the two-attempt cap; unknown may already have incurred a charge. |
| Dify turn failed | Inspect Dify run ID and saved project, then Resume. Saved tool work remains. |
| Experiment unavailable | Confirm deployed SHA, _staging target, enabled flag and ordinary readiness. |
| Setup cannot finish within Cloud access limits | Record the exact unavailable feature; decide the next step from evidence. |

After recording the result, disable new experiment runs if no longer needed. Retain synthetic data until it is no longer needed for review; deletion is a separate scoped cleanup. Do not close the issue or clear staging automatically.
