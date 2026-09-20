# Lessons learned

## Candidate: Bind external agent tools to one application run

- **Context:** A hosted agent uses a shared tool credential while the application can expire a turn and start another.
- **Observation:** A shared credential and revision check alone do not identify which turn issued a mutation. The experiment service now checks the supplied run ID in conditional writes. Dify tool responses omit the active run ID; the integration test rejects an expired turn after a new turn starts.
- **Guidance:** Give each turn an unpredictable application-owned ID. Require it in mutating tools, check it in the write condition, and do not reveal a later turn's ID to an earlier turn.
- **Evidence:** `lib/dify-experiment/service.ts`, `lib/dify-experiment/http.ts`, and `tests/integration/dify-experiment.test.ts`.
- **Promotion target:** Documentation for future third-party agent integrations.
- **Status:** Candidate; live Dify behavior is not yet verified.

## Candidate: Inline nested request objects for Dify Swagger tools

- **Context:** A Dify Swagger API tool accepts a nested object in a JSON request body.
- **Observation:** The live Dify import represented `save_story_draft.story` as a string when the property used `$ref: "#/components/schemas/Story"`. The same object works as the structured output of the Story Writer workflow. The Booklet endpoint correctly rejected the string because its request contract requires an object.
- **Guidance:** Inline nested request-object schemas at the Dify tool boundary. Keep a reusable component only when a contract test proves that the inline schema is identical. Confirm the imported parameter type before a live mutation.
- **Evidence:** The sanitized Dify exports, the imported tool parameter view, `tools.openapi.json`, and `tests/unit/dify-experiment-openapi.test.ts`.
- **Promotion target:** Documentation for integrations that import OpenAPI definitions into Dify.
- **Status:** Candidate; verify that reimporting the inline schema produces an object parameter before promotion.
