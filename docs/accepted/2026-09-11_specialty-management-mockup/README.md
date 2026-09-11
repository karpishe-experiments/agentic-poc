# Specialty management mockup

This Phase 0 mockup explores unified specialty and agent management with synthetic browser-local data. It does not use MongoDB, authentication, runtime agent definitions, or model calls.

## Start the mockup

```powershell
npm run mockup:dev
```

Open `http://127.0.0.1:3100/mockups/specialty-management`.

The page saves all demo records, unsaved editor content, navigation state, and the shared chat conversation in browser `localStorage`. Refreshing the page restores that state in the same browser profile. **Reset demo data** removes only the mockup state after confirmation and restores the bundled synthetic examples. The data is not shared between browsers, devices, profiles, or tabs.

Chat responses are simulated locally after a short delay. “Make this concise” preserves headings, the first prose paragraph, and mention links. “Use a numbered checklist” numbers prose outside headings and fenced code. “Add an example” appends a synthetic example. Any other request is appended literally under “Requested guidance.” No request leaves the browser.

## Five-minute feedback path

1. Create a specialty and choose its output type and allowed tools.
2. Create an agent, then edit its configuration, Main instructions, and a reference.
3. Insert `@` specialty, `/` tool, and `$` reference mentions. Inspect the Markdown preview.
4. Ask chat for a change. Compare Before and After, then apply the proposal.
5. Refresh the page and confirm that the synthetic data and conversation remain.
6. Open an Image agent and inspect **Preview sample result**.

Please focus feedback on pane navigation, prompt authoring, and proposal review. Lifecycle and permission rules are illustrative and are not a runtime specification.

## Limits

This mockup has no real orchestration, model execution, uploads, schema authoring, runtime tool permission enforcement, multi-tab synchronization, or production persistence. Agent selection and activation only change synthetic local records.
