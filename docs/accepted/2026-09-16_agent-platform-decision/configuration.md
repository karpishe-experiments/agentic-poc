# Experiment configuration

This temporary host configuration supports the staging Dify trial. Keep production unchanged. The application release enables the page on `_staging`; the host supplies real-provider mode and optional credentials. The application branch contains the current manager and Story Writer setup instructions.

| Setting | Default | Where it belongs |
|---|---|---|
| DIFY_EXPERIMENT_ENABLED | false | Local fake-mode development only; the application ignores it on `_staging` and `_prod` |
| DIFY_BASE_URL | https://api.dify.ai/v1 | Non-secret server configuration |
| DIFY_EXPERIMENT_MODE | fake | Staging Compose sets real; separate from normal MODEL_RUNTIME |
| DIFY_IMAGE_ENABLED | false | Staging Compose sets true for the approved image step; no image call occurs before Booklet approval |
| DIFY_IMAGE_MAX_ATTEMPTS | 2 | Server configuration; project-wide, not agent-controlled |
| DIFY_API_KEY | absent | Protected host application secret; published Dify app key |
| DIFY_TOOL_KEY | absent | Protected host secret; independent random value of at least 32 bytes; Dify tool credential sends it as X-Booklet-Tool-Key |
| DIFY_IMAGE_OPENAI_API_KEY | absent | Protected host secret for experiment image calls; use a separate restricted Booklet project key with Images Write |
| Text model | gpt-5.6-terra | Dify manager and Story Writer configuration |
| Image model | gpt-image-2 | Fixed experiment server default |

Missing credentials disable affected experiment operations with a readable setup error. They must not stop the existing application from starting. Real mode requires DIFY_API_KEY; enabled real image calls require DIFY_IMAGE_OPENAI_API_KEY. Tool handlers always require DIFY_TOOL_KEY. The existing OPENAI_API_KEY remains for normal Booklet calls.

Use the actual staging origin from the current deployment configuration. Replace tools.openapi.json's example server URL in the copy imported into Dify. Never put keys into that file. The tool key grants access only to booklet-dify-trial.

## Temporary host setup

The host script retains its five required application secrets and accepts the three optional Dify keys above. Existing secret files without these keys remain valid. Normal production operations do not prompt for them.

Rotate each optional key by name through the serialized procedure in the [deployment runbook](../../deployment/runbook.md). Supply DIFY_TOOL_KEY to Dify as the X-Booklet-Tool-Key credential. Do not place any key in Git, workflow variables, prompts, or logs.

For the trial only, an operator without the local Cloudflare Access service token can store `DIFY_TOOL_KEY` as a protected GitHub repository secret and run the master-owned **Dify staging tool key** workflow. The workflow stages and rotates only this staging key through the existing serialized host path. Remove the repository secret after the successful rotation. It is not a general secret-management interface.

The staging Compose overlay selects real Dify text and enables the image path. Production keeps fake mode and images disabled. The image path still requires a separate image key and approval of the current story revision. Do not approve the image step until the operator has authorized the billed image call and installed that key.

This host support is temporary. When the Dify platform trial has a recorded decision, remove the optional Dify keys and staging settings if Dify is rejected. If Dify is adopted, replace this trial setup with the approved long-term credential and runtime design.

Installed host script/Compose changes remain Infrastructure-owned. Publish and merge this reviewed change to `master`, run Infrastructure for the installed configuration, then release the reviewed application change to `_staging`. Use the deployment runbook at every live checkpoint. Do not edit secrets.json manually or mutate production directly.

Before billable runs, confirm provider access and the operator's spending approval. Dify text and server image calls are charged separately. Report image charges separately if Dify usage omits them.

## Disabled and recovery behavior

The application branch owns staging availability. Production experiment routes return 404. Tools require the dedicated key. Existing Basic Auth still protects browser, approval, and asset routes.

To disable the experiment, release the application change that removes staging availability. Drain any running work using existing deployment procedures. Keep saved experiment documents/assets for diagnosis; cleanup is a later explicit operation scoped to the experiment collection/project and asset prefix, never a staging database reset.
