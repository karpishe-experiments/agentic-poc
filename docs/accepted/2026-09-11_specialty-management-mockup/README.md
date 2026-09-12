# Agent Studio mockup

This Phase 0 mockup explores unified specialty and agent management with synthetic browser-local data. It does not use MongoDB, authentication, runtime agent definitions, or model calls.

## Start the mockup

```powershell
npm run mockup:dev
```

Open `http://127.0.0.1:3100/mockups/specialty-management`.

The page saves all demo records, unsaved editor content, navigation state, the shared editing conversation, and agent test sessions in browser `localStorage`. Refreshing the page restores that state in the same browser profile. **Reset demo data** removes only the mockup state after confirmation and restores the bundled synthetic examples. The data is not shared between browsers, devices, profiles, or tabs.

The **Editing assistant** uses the AI SDK chat hook with a browser-local streaming transport. All answers, clarification choices, progress labels, proposals, and diagnostics are deterministic simulations. No request leaves the browser, and the selected model is context only.

The assistant follows the selected specialty settings, agent configuration, Main instructions, or reference. Suggestions fill the composer without sending. Press Enter to send or Shift+Enter for a newline. Proposals are read-only and require explicit Apply, followed by the editor's normal Save action. Apply is disabled after the selected section changes. Applying a proposal to a confirmed version creates a complete draft and leaves the confirmed version unchanged.

Each agent has a **Test** workspace. Select one of three synthetic booklets and a prepared current or earlier stage, review its frozen context, then start a deterministic test conversation. Test sessions capture visible unsaved agent content without saving it. Results, activity details, ratings, notes, and session names persist. **Repeat test with current edits** preserves the original session and booklet snapshot, but waits for an explicit **Start test** before it captures current agent content. **Test history** shows every stored session and retains frozen evidence after a source version or agent is deleted.

Test conversations are separate from the Editing assistant. **Send to editing chat** appends a prepared request to any existing editing composer text and never sends or applies it automatically. Test Stop/Retry and refresh interruption operate only on the frozen test session. The Editing assistant and Test agent can each have one independent simulated response in progress.

**Focus mode** hides Studio navigation, agent section navigation, and the Editing assistant so the current editor or Test workspace can use the full shell. The exit control remains in the toolbar; Escape exits when no dialog or menu is open. Pane sizes and chat visibility return unchanged. Hidden Editing assistant and Test agent responses continue, and an explicit test-result handoff exits focus mode.

Draft agent versions can store an optional 240-character **Version note**. **Suggest note** previews a deterministic summary of model, Main instructions, and reference changes before replacing the editable note; it never calls a model. Confirmed and retired notes are read-only, and every derived draft begins with an empty note. Agent configuration also shows the specialty's visible allowed tools, including unsaved specialty changes. **Version actions** groups confirmation, activation, retirement, deletion, and forking while keeping Save/Discard and Edit as draft prominent.

“Make this concise” and “shorter” preserve headings, the first prose paragraph, and mention links. “Use a numbered checklist” numbers prose outside headings and fenced code. “Add an example” appends a synthetic example. Vague requests ask for clarification, and informational questions return an answer without changing editor content. **Stop**, interrupted-refresh recovery, Retry, and the seeded synthetic failure let you explore error handling. Reset restores that failure fixture and aborts a running response.

## Five-minute feedback path

1. Create a specialty and choose its output type and allowed tools.
2. Create an agent, then edit its configuration, Main instructions, and a reference.
3. Insert `@` specialty, `/` tool, and `$` reference mentions. Inspect the Markdown preview.
4. Ask the Editing assistant a question, try a clarification, then review and apply a read-only proposal.
5. Open **Test**, run a synthetic booklet stage, inspect activity, and record feedback.
6. Repeat the test with current edits, then inspect both sessions in **Test history**.
7. Send a result to the Editing assistant and confirm that the prepared request does not send automatically.
8. Refresh the page and confirm that synthetic records, conversations, and tests remain.
9. Try Focus mode, add or suggest a Version note, and inspect Version actions and Allowed tools.
10. Open an Image agent and inspect **Preview sample result**.

Please focus feedback on pane navigation, prompt authoring, proposal review, streaming, clarification, and recovery. Lifecycle and permission rules are illustrative and are not a runtime specification.

## Limits

This mockup has no real orchestration, model execution, booklet database access, uploads, schema authoring, runtime tool permission enforcement, multi-tab synchronization, or production persistence. Agent selection and activation only change synthetic local records.
