# Lessons learned

## Candidate: Bind external agent tools to one application run

- **Context:** A hosted agent uses a shared tool credential while the application can expire a turn and start another.
- **Observation:** A shared credential and revision check alone do not identify which turn issued a mutation. The experiment service now checks the supplied run ID in conditional writes. Dify tool responses omit the active run ID; the integration test rejects an expired turn after a new turn starts.
- **Guidance:** Give each turn an unpredictable application-owned ID. Require it in mutating tools, check it in the write condition, and do not reveal a later turn's ID to an earlier turn.
- **Evidence:** `lib/dify-experiment/service.ts`, `lib/dify-experiment/http.ts`, and `tests/integration/dify-experiment.test.ts`.
- **Promotion target:** Documentation for future third-party agent integrations.
- **Status:** Candidate; live Dify behavior is not yet verified.

## Candidate: Encode inline Dify object parameters as JSON text

- **Context:** A Dify Swagger API tool accepts a nested object in a JSON request body.
- **Observation:** A clean Dify Cloud import exposes an inline `type: object` request property as a string tool parameter. Dify's official parser has no object tool-parameter type, while its custom-tool request assembly applies `json.loads` to a string when the original inline property has `type: object`. A property-level `$ref` bypasses that conversion path.
- **Guidance:** Keep the request property inline as `type: object`, and instruct the model to supply the complete object as valid JSON text without Markdown or a wrapper. Keep a reusable component only when a contract test proves that the inline schema is identical. Seeing a string parameter in Dify is expected; validate the emitted HTTP body before changing the server contract.
- **Evidence:** The clean Dify schema-test import, Dify's official `api/core/tools/utils/parser.py` and `api/core/tools/custom_tool/tool.py`, `tools.openapi.json`, and `tests/unit/dify-experiment-openapi.test.ts`.
- **Promotion target:** Documentation for integrations that import OpenAPI definitions into Dify.
- **Status:** Candidate; verify one live save through the inline conversion path before promotion.

## Candidate: Inspect provider-library retries below workflow retry controls

- **Context:** A Dify Workflow reserves one application-owned paid attempt before it invokes an image plugin.
- **Observation:** Disabling the Dify tool node's retry does not disable retries inside the plugin. OpenAI Tools `0.2.1` constructs `OpenAI(...)` without `max_retries=0`; the OpenAI Python SDK retries eligible errors twice by default.
- **Guidance:** Inspect every retry layer before a paid operation. If the experiment accepts provider-library retries, state that the application reservation count is not an exact provider-request or billing count and require explicit spending approval.
- **Evidence:** `langgenius/dify-official-plugins` `gpt_image_2_generate.py`, the OpenAI Python SDK retry documentation, [plan.md](plan.md), and [runbook.md](runbook.md).
- **Promotion target:** Third-party workflow and paid-provider integration guidance.
- **Status:** Candidate; source inspection is verified, while target-workspace and live billing behavior remain incomplete.

## Candidate: Isolate storage writes by completion claim

- **Context:** An asynchronous callback uses an expiring database claim before it writes an asset to object storage.
- **Observation:** Matching the final database update to the claim does not protect a shared object key. A slow writer can resume after its claim expires and overwrite the bytes selected by a newer claimant.
- **Guidance:** Give each claim a distinct object key and persist only the winning claim's key. Treat uncommitted objects as cleanup candidates; never let an expired claimant write to the committed object's key.
- **Evidence:** `DifyExperimentService.completeImage` and the expired-claim concurrency test in `tests/integration/dify-experiment.test.ts`.
- **Promotion target:** Documentation for callback-driven asset ingestion.
- **Status:** Candidate; verified with the fake asset store and MongoDB integration test.
