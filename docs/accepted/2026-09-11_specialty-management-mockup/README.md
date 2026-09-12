# Agent Studio mockup

This Phase 0 mockup explores unified specialty and agent management with synthetic browser-local data. It does not use MongoDB, authentication, runtime agent definitions, or model calls.

## Start the mockup

```powershell
npm run mockup:dev
```

Open `http://127.0.0.1:3100/mockups/specialty-management`.

The page saves all demo records, unsaved editor content, navigation state, and the shared chat conversation in browser `localStorage`. Refreshing the page restores that state in the same browser profile. **Reset demo data** removes only the mockup state after confirmation and restores the bundled synthetic examples. The data is not shared between browsers, devices, profiles, or tabs.

The **Editing assistant** uses the AI SDK chat hook with a browser-local streaming transport. All answers, clarification choices, progress labels, proposals, and diagnostics are deterministic simulations. No request leaves the browser, and the selected model is context only.

The assistant follows the selected specialty settings, agent configuration, Main instructions, or reference. Suggestions fill the composer without sending. Press Enter to send or Shift+Enter for a newline. Proposals are read-only and require explicit Apply, followed by the editor's normal Save action. Apply is disabled after the selected section changes. Applying a proposal to a confirmed version creates a complete draft and leaves the confirmed version unchanged.

“Make this concise” and “shorter” preserve headings, the first prose paragraph, and mention links. “Use a numbered checklist” numbers prose outside headings and fenced code. “Add an example” appends a synthetic example. Vague requests ask for clarification, and informational questions return an answer without changing editor content. **Stop**, interrupted-refresh recovery, Retry, and the seeded synthetic failure let you explore error handling. Reset restores that failure fixture and aborts a running response.

## Five-minute feedback path

1. Create a specialty and choose its output type and allowed tools.
2. Create an agent, then edit its configuration, Main instructions, and a reference.
3. Insert `@` specialty, `/` tool, and `$` reference mentions. Inspect the Markdown preview.
4. Ask the Editing assistant a question, try a clarification, then review and apply a read-only proposal.
5. Refresh the page and confirm that the synthetic data and conversation remain.
6. Open an Image agent and inspect **Preview sample result**.

Please focus feedback on pane navigation, prompt authoring, proposal review, streaming, clarification, and recovery. Lifecycle and permission rules are illustrative and are not a runtime specification.

## Limits

This mockup has no real orchestration, model execution, uploads, schema authoring, runtime tool permission enforcement, multi-tab synchronization, or production persistence. Agent selection and activation only change synthetic local records.
