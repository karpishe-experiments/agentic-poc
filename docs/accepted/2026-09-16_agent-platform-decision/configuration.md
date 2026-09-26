# Experiment configuration

The staging experiment uses Dify for manager, story-writing, and illustration execution. Booklet remains the system of record and owns authorization, attempts, revisions, approval, assets, and UI state. Production remains disabled.

## Booklet host

| Setting | Purpose |
|---|---|
| `DIFY_BASE_URL` | Dify API origin; default `https://api.dify.ai/v1` |
| `DIFY_EXPERIMENT_MODE` | `real` on staging and `fake` for isolated local checks |
| `DIFY_IMAGE_ENABLED` | Enables Booklet authorization for the illustration workflow |
| `DIFY_IMAGE_MAX_ATTEMPTS` | Fixed at `2` for this experiment |
| `DIFY_API_KEY` | Existing published manager application key |
| `DIFY_TOOL_KEY` | Existing 32-byte minimum callback credential sent as `X-Booklet-Tool-Key` |

The application enables this experiment only on `_staging` or in explicit local fake mode. The setup endpoint reports `image_execution=dify_workflow` and whether the required Booklet credentials exist. It does not verify OpenAI access inside Dify.

`DIFY_IMAGE_OPENAI_API_KEY` remains an optional legacy deployment field for compatibility. The current runtime does not read it. Do not rotate or install it for this rollout. No Compose, Terraform, Cloudflare, or infrastructure-workflow change is required.

## Dify manager

- Retain the existing manager application and its `DIFY_API_KEY`.
- Retain the working `write_story` Workflow tool and Story JSON-string mapping.
- Import [tools.openapi.json](tools.openapi.json), configure its API-key authentication with the existing `DIFY_TOOL_KEY`, and attach its three operations to the manager.
- Attach the published `illustrate_panel` Workflow tool.
- Remove the retired `generate_panel_image` tool from the manager.
- Paste [manager-prompt.md](manager-prompt.md) and publish the manager.

## Dify illustration workflow

Import [illustrate-panel.yml](illustrate-panel.yml) as `booklet_illustrator`. Its published Workflow tool name is `illustrate_panel`.

Set these workflow environment variables after import:

| Variable | Type | Value |
|---|---|---|
| `BOOKLET_BASE_URL` | text | `https://booklet-staging.uniwares.co.uk` |
| `BOOKLET_TOOL_KEY` | secret | The existing `DIFY_TOOL_KEY` value |

OpenAI Tools `langgenius/openai_tool` version `0.2.1` is the inspected and pinned Marketplace dependency in the DSL. Install it and bind the existing key used by the Dify credential named `dify-booklet-manager-test`. Disable retries on the Dify image node. The plugin still uses the OpenAI Python SDK's default retries, so one Booklet attempt can cause more than one provider request after an eligible failure. For this disposable experiment, accept and record that bounded billing uncertainty. The workflow fixes generation to `gpt-image-2`, `1536x1536`, medium quality, one PNG. Credential validation does not prove model access; verify access only through the approved live checkpoint.

Requested image settings are preferences, not completion gates. Booklet accepts supported image bytes and reports deviations as warnings; see [plan.md](plan.md). After publishing workflow changes, save **Workflow as Tool** to update its pinned workflow version.

Do not add the OpenAI Tools plugin to the manager. Do not expose Booklet's authorize, complete, or failure callbacks to the manager. Do not create another Dify API key.

## Authentication and isolation

Only the exact callback paths documented in [illustrator-workflow.md](illustrator-workflow.md) bypass staging Basic Auth. Each still requires the tool key and experiment availability. Browser actions keep the normal browser gate and same-origin check. `_prod` returns 404 for the experiment.

Before any billable run, confirm explicit spending approval. Booklet's attempt reservation limits application-authorized calls, but it cannot prove exactly-once provider billing after a network failure.
