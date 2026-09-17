# Experiment configuration

These settings are planned additions, not supported runtime variables yet. Keep production unchanged. The experiment requires DEPLOYMENT_ENV=_staging and DIFY_EXPERIMENT_ENABLED=true.

| Setting | Default | Where it belongs |
|---|---|---|
| DIFY_EXPERIMENT_ENABLED | false | Reviewed Compose staging configuration; false/absent in production |
| DIFY_BASE_URL | https://api.dify.ai/v1 | Non-secret server configuration |
| DIFY_EXPERIMENT_MODE | fake | Server configuration: fake or real; separate from normal MODEL_RUNTIME |
| DIFY_IMAGE_ENABLED | false | Staging configuration; explicit opt-in for billable calls |
| DIFY_IMAGE_MAX_ATTEMPTS | 2 | Server configuration; project-wide, not agent-controlled |
| DIFY_API_KEY | absent | Protected host application secret; published Dify app key |
| DIFY_TOOL_KEY | absent | Protected host secret; independent random value of at least 32 bytes; Dify tool credential sends it as X-Booklet-Tool-Key |
| GEMINI_API_KEY | absent | Protected host secret for server image generation; separately configured in Dify for text |
| Text model | gemini-2.5-flash | Dify agent configuration |
| Image model | gemini-2.5-flash-image | Fixed experiment server default |

Missing credentials disable affected experiment operations with a readable setup error. They must not stop the existing application from starting when the experiment is disabled. Real mode requires DIFY_API_KEY; enabled real image calls require GEMINI_API_KEY. Tool handlers always require DIFY_TOOL_KEY.

Use the actual staging origin from the current deployment configuration. Replace tools.openapi.json's example server URL in the copy imported into Dify. Never put keys into that file. The tool key grants access only to booklet-dify-trial.

## Deployment work needed during implementation

The existing deployment script accepts exactly five application secrets. Therefore adding environment variables to app code alone is insufficient.

Extend the canonical secret-name allowlist, input validation, prompting, secret staging/rotation and Compose rendering to support the three optional keys above. Preserve all five currently required secrets and their validations. Existing secret files without optional keys must remain valid. Prompt for optional experiment keys only when explicitly selected; never request them for normal production operations.

Add non-secret flags and optional secret slots to the reviewed Compose configuration. Absent optional values must not break interpolation, rotation, readiness or rollback. Use the same names across environments; do not create STAGING_* secret variants.

Update focused configuration/secret tests, both deployment shell tests, bash -n and ShellCheck. Document the supported optional key rotation in the canonical deployment runbook after code exists.

Installed host script/Compose changes remain Infrastructure-owned. Publish and merge the reviewed change to master through the normal review process; run Infrastructure for the installed configuration, then promote the reviewed application change to _staging. Use [the deployment runbook](../../deployment/runbook.md) at every live checkpoint. No manual secrets.json edits, new deployment entrypoint, or direct production mutation.

Before billable runs, confirm provider access and the operator's spending approval. Included Dify text credits do not imply free Gemini image calls. Report image charges separately if Dify usage omits them.

## Disabled and recovery behavior

Outside staging or with the flag disabled, all experiment routes return 404. Tools also require the dedicated key. Existing Basic Auth still protects browser, approval, and asset routes.

Turning the flag off prevents new experiment work. Drain any running work using existing deployment procedures. Keep saved experiment documents/assets for diagnosis; cleanup is a later explicit operation scoped to the experiment collection/project and asset prefix, never a staging database reset.
