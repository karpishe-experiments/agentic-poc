# Experiment configuration

The runtime supports these settings. Keep production unchanged. The experiment requires DEPLOYMENT_ENV=_staging and DIFY_EXPERIMENT_ENABLED=true.

| Setting | Default | Where it belongs |
|---|---|---|
| DIFY_EXPERIMENT_ENABLED | false | Reviewed Compose staging configuration; false/absent in production |
| DIFY_BASE_URL | https://api.dify.ai/v1 | Non-secret server configuration |
| DIFY_EXPERIMENT_MODE | fake | Server configuration: fake or real; separate from normal MODEL_RUNTIME |
| DIFY_IMAGE_ENABLED | false | Staging configuration; explicit opt-in for billable calls |
| DIFY_IMAGE_MAX_ATTEMPTS | 2 | Server configuration; project-wide, not agent-controlled |
| DIFY_API_KEY | absent | Protected host application secret; published Dify app key |
| DIFY_TOOL_KEY | absent | Protected host secret; independent random value of at least 32 bytes; Dify tool credential sends it as X-Booklet-Tool-Key |
| DIFY_IMAGE_OPENAI_API_KEY | absent | Protected host secret for experiment image calls; use a separate restricted Booklet project key with Images Write |
| Text model | gpt-5.6-terra | Dify manager and Story Writer configuration |
| Image model | gpt-image-2 | Fixed experiment server default |

Missing credentials disable affected experiment operations with a readable setup error. They must not stop the existing application from starting when the experiment is disabled. Real mode requires DIFY_API_KEY; enabled real image calls require DIFY_IMAGE_OPENAI_API_KEY. Tool handlers always require DIFY_TOOL_KEY. The existing OPENAI_API_KEY remains for normal Booklet runtime calls.

Use the actual staging origin from the current deployment configuration. Replace tools.openapi.json's example server URL in the copy imported into Dify. Never put keys into that file. The tool key grants access only to booklet-dify-trial.

## Deployment configuration checkpoint

The deployment script now keeps its five required application secrets and accepts the three optional Dify keys above. Existing secret files without those keys remain valid. Select and rotate each optional key by name; normal production operations do not prompt for it.

The reviewed Compose configuration has the non-secret flags and optional secret slots. Absent optional values do not break interpolation, rotation, readiness, or rollback. The same names apply in both environments; there are no `STAGING_*` secret variants.

Before publication, run the focused configuration tests, both deployment shell tests, `bash -n`, and ShellCheck. The optional-key rotation procedure is in the canonical [deployment runbook](../../deployment/runbook.md).

Installed host script/Compose changes remain Infrastructure-owned. Publish and merge the reviewed change to `master` through the normal review process; run Infrastructure for the installed configuration, then promote the reviewed application change to `_staging`. Use the deployment runbook at every live checkpoint. Do not edit `secrets.json` manually, add a deployment entrypoint, or mutate production directly.

Before billable runs, confirm provider access and the operator's spending approval. Dify text usage and the server image call are charged separately. Report image charges separately if Dify usage omits them.

## Disabled and recovery behavior

Outside staging or with the flag disabled, all experiment routes return 404. Tools also require the dedicated key. Existing Basic Auth still protects browser, approval, and asset routes.

Turning the flag off prevents new experiment work. Drain any running work using existing deployment procedures. Keep saved experiment documents/assets for diagnosis; cleanup is a later explicit operation scoped to the experiment collection/project and asset prefix, never a staging database reset.
