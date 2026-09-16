# Agent Studio mockup

This Phase 0 mockup explores unified specialty and agent management with synthetic browser-local data. It does not use MongoDB, authentication, runtime agent definitions, or model calls.

## Start the mockup

```powershell
npm run mockup:dev
```

Open `http://127.0.0.1:3100/mockups/specialty-management`.

The page saves demo records, unsaved editor content, navigation state, and the shared editing conversation in browser `localStorage`. Refreshing restores valid current-format data in the same browser profile. Incompatible or unreadable mockup data is replaced with the current synthetic seed and a notice. **Reset demo data** removes only the mockup state after confirmation. The data is not shared between browsers, devices, profiles, or tabs.

The **Assistant** uses the AI SDK chat hook with a browser-local streaming transport. All answers, clarification choices, progress labels, proposals, and diagnostics are deterministic simulations. No request leaves the browser, and the selected model is context only.

The assistant follows the selected specialty settings, agent configuration, Main instructions, or reference. Suggestions fill the composer without sending. Press Enter to send or Shift+Enter for a newline. Proposals are read-only and require explicit Apply, followed by the editor's normal Save action. Apply is disabled after the selected section changes. Applying a proposal to a confirmed version creates a complete draft and leaves the confirmed version unchanged.

The mockup has no agent-testing or evaluation workspace. Testing inside the future booklet studio is deferred.

**Focus mode** hides Studio navigation, agent section navigation, and the Assistant so the current editor can use the full shell. The exit control remains in the toolbar; Escape exits when no dialog or menu is open. Pane sizes and chat visibility return unchanged.

Each agent version has an optional description. Confirmation opens a native dialog where **Suggest note** previews a deterministic summary of configuration, Main instructions, and reference changes. **Save and confirm** atomically saves visible draft edits and the optional 240-character note, then locks the version; it never calls a model. Confirmed and retired versions are read-only, and every derived draft begins with an empty note. The version information control exposes the selected version's saved note. Agent configuration also shows the specialty's visible allowed tools, including unsaved specialty changes. **Version actions** groups confirmation, activation, retirement, deletion, and forking while keeping Save/Discard and Edit as draft prominent.

“Make this concise” and “shorter” preserve headings, the first prose paragraph, and mention links. “Use a numbered checklist” numbers prose outside headings and fenced code. “Add an example” appends a synthetic example. Vague requests ask for clarification, and informational questions return an answer without changing editor content. **Stop**, interrupted-refresh recovery, Retry, and the seeded synthetic failure let you explore error handling. Reset restores that failure fixture and aborts a running response.

## Five-minute feedback path

1. Create a specialty and choose its output type and allowed tools.
2. Create an agent, then edit its configuration, Main instructions, and a reference.
3. Insert `@` specialty, `/` tool, and `$` reference mentions. Inspect the Markdown preview.
4. Ask the Assistant a question, try a clarification, then review and apply a read-only proposal.
5. Refresh the page and confirm that local edits and the Assistant conversation remain.
6. Try Focus mode, confirm a draft with a suggested note, and inspect Version actions and Allowed tools.
7. Browse the 15 guideline-derived specialties and open a specialty or agent from the directory.

Please focus feedback on pane navigation, prompt authoring, proposal review, streaming, clarification, and recovery. Lifecycle and permission rules are illustrative and are not a runtime specification.

## Limits

This mockup has no real orchestration, model execution, evaluation, booklet database access, uploads, schema authoring, runtime tool permission enforcement, multi-tab synchronization, or production persistence. Agent selection and activation only change synthetic local records.
