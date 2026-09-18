# Lessons learned

## Candidate: Bind external agent tools to one application run

- **Context:** A hosted agent uses a shared tool credential while the application can expire a turn and start another.
- **Observation:** A shared credential and revision check alone do not identify which turn issued a mutation. The experiment service now checks the supplied run ID in conditional writes. Dify tool responses omit the active run ID; the integration test rejects an expired turn after a new turn starts.
- **Guidance:** Give each turn an unpredictable application-owned ID. Require it in mutating tools, check it in the write condition, and do not reveal a later turn's ID to an earlier turn.
- **Evidence:** `lib/dify-experiment/service.ts`, `lib/dify-experiment/http.ts`, and `tests/integration/dify-experiment.test.ts`.
- **Promotion target:** Documentation for future third-party agent integrations.
- **Status:** Candidate; live Dify behavior is not yet verified.
