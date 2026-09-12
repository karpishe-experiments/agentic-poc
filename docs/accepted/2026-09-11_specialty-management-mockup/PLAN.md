# Phase 0: Agent Studio mockup

## Purpose and authority

Deliver an interactive desktop mockup that the user can evaluate before defining the runtime platform. Parent: [issue #22](https://github.com/karpishe-experiments/agentic-poc/issues/22). This document is the complete implementation handoff for Phase 0. Checkpoints below are sequential and do not require separate checkpoint files.

The user requested a mockup with synthetic data, simulated chat, and persistence between refreshes. Their conversation decisions govern this phase. This plan does not implement or complete the parent issue's runtime requirements. In particular, schemas, migrations, tool execution, workflow routing, result mapping, and runtime integration remain later work. The parent issue still uses “skill”; this mockup uses “specialty”. Do not rename existing runtime symbols.

Status: Checkpoints 1–8 complete; checkpoint 9 planned and not implemented. This consolidated document governs resumption. Defaults are experiment choices, not permanent runtime contracts.

### Agreed product model

- A specialty has a name, description, allowed tools, and exactly one primary output type: Text or Image. Users can add specialties and retire unused ones.
- Image output can include an optional description and expandable text metadata. It is one illustrative result, not separate competing text and image results.
- Every agent belongs to exactly one specialty. Cross-specialty copying is excluded.
- Every agent has a title and a Language model (provider and model). Image specialties additionally require an Image model (provider and model).
- Each agent version contains Main instructions, References, and configuration. A reference has a name, description, and Markdown content. Reference contents are conceptually read on demand; Phase 0 does not execute this behavior.
- The built-in Orchestrator specialty can contain multiple agents. The future workflow selects one orchestrator per booklet. Other specialties retain the existing concept of team selection and parallel results; Phase 0 does not modify those creator flows.
- Agent draft, confirmation, activation, retirement, and fork interactions are represented locally.
- The editor supports `@` specialty, `/` available tool, and `$` reference menus. All agents can mention specialties. Mentions do not execute anything.
- The Editing assistant proposes changes to the selected specialty settings, agent configuration, Main instructions, or reference. Proposals show read-only proposed content and require explicit Apply. Activation is separate.
- Agent Studio is the visible feature name. Preserve existing routes, storage keys, and internal identifiers. Test conversations are labeled Test agent.
- The user explicitly wants simulated responses and simple JSON data, without existing runtime schemas or real model calls.

## 1. Implementation boundary and startup

### Current repository evidence

Inspected on 2026-09-11:

- The app uses Next.js App Router, React, Tailwind, Lucide, and Radix. Existing administration is under `app/admin/agents` and `components/admin/agents`.
- Existing agent contracts distinguish manager, specialist, and image roles. Existing image configurations have no editable instructions. Do not reuse these contracts for the mockup.
- `app/layout.tsx` wraps all routes in a fixed-width main container. The mockup needs a wider shell without changing other pages.
- `instrumentation.ts` imports and starts the job runner at server startup. The standard dev script runs environment preflight. Both are unsuitable for an isolated mockup launch.
- The default Vitest global setup and the normal E2E runner start MongoDB. Use dedicated mockup test configurations.
- Implementation runs on `agent/issue-22-specialty-management-mockup`, created from `master`. Do not switch branches during implementation. Preserve unrelated edits. Commit this revised plan before checkpoint 1, then commit each checkpoint after its review gate passes.

### Source organization

Implement at `/mockups/specialty-management`. Keep the route outside `/admin/agents` so database-backed loading and error boundaries are not inherited.

Use these ownership boundaries:

| Area | Location and responsibility |
| --- | --- |
| Route | `app/mockups/specialty-management/page.tsx`: render the client mockup; no data fetching |
| UI | `components/mockups/specialty-management/`: shell, navigation, specialty form, agent editor, Markdown editor, chat panel, result preview, scoped CSS |
| Mockup data and logic | `lib/mockups/specialty-management/`: independent types, seed JSON, reducer, storage, mention helpers, simulated chat |
| Local illustration | `public/mockups/specialty-management/`: a small hand-authored SVG sample; no generated or downloaded media |
| Isolated checks | `tests/mockups/specialty-management/`, `vitest.mockup.config.ts`, `playwright.mockup.config.ts` |
| Launcher | `scripts/run-management-mockup.mjs`: launch only the required Next dev process |

Use existing visual primitives and installed dependencies where suitable. Do not import runtime agent repositories, contracts, Server Actions, runtime model catalogs, environment validators, or application services. Use React state and a small reducer for synthetic records. From checkpoint 7, use installed AI SDK hooks and a local ChatTransport for simulated conversations. No additional state-management framework or rich-text editor dependency.

For Markdown preview, add `react-markdown@10` and `remark-gfm@4`, saving exact resolved versions and the package lock. Use the renderer's React component overrides for mention links. Do not enable raw HTML. These are the only planned new dependencies. If installation is blocked, report the dependency blocker; do not replace Markdown with unsafe HTML injection or a homegrown Markdown parser.

Implementation references checked on 2026-09-11: [react-markdown component and URL APIs](https://github.com/remarkjs/react-markdown#api) and [remark-gfm usage](https://github.com/remarkjs/remark-gfm#use). Use `remarkPlugins`, `components`, and a narrowly scoped `urlTransform` for the behaviors below.

### Mockup launch commands

Add these package scripts:

```text
mockup:dev       node scripts/run-management-mockup.mjs
mockup:build     node scripts/build-management-mockup.mjs
test:mockup      vitest run --config vitest.mockup.config.ts
test:mockup:e2e  playwright test --config playwright.mockup.config.ts
```

The launcher starts the local Next CLI through `process.execPath`, with `next dev --hostname 127.0.0.1 --port <port>`. Accept `--port`, default 3100. Supply `SPECIALTY_MOCKUP_ONLY=1` only in the child environment, and disable Next telemetry for this process. Do not run `npm run dev`, preflight, seed, or a database setup command. Forward shutdown to the owned child process and return its exit code. Bind locally; do not deploy.

At the beginning of `instrumentation.register`, return before importing the runner when `SPECIALTY_MOCKUP_ONLY === "1"`. When absent, preserve the existing behavior exactly. Cover both branches with an isolated test using mocked imports; the test must not actually start the runner.

The route must not need credentials or database access. In this launch mode, evaluate only the mockup URL; other app routes remain ordinary application routes. The mockup-only flag disables automatic job startup, not all application endpoints. Do not build a global request guard or change runtime endpoints.

Add a clearly labeled “Agent Studio” link in the existing global navigation. Leave the real Agents link intact. Use a mockup root data attribute and route-scoped CSS selectors to widen only the containing main element, remove its large vertical padding, and size the shell to the remaining viewport. Avoid replacing the root layout or using fixed overlays over the global header. Keep the existing skip-link target.

## 2. Synthetic JSON state and persistence

### Minimal independent data shape

Define plain TypeScript types in the mockup namespace. They are UI data, not runtime or public API contracts. Persist one JSON document under `specialty-management-mockup:v1` in `localStorage`.

| Record | Fields |
| --- | --- |
| Specialty | `id`, `name`, `description`, `outputType: text/image`, `allowedToolIds`, `builtIn`, `retired` |
| Agent | `id`, `specialtyId`, `activeVersionId: string/null`, `versions` |
| Agent version | `id`, `number`, `parentVersionId`, `status: draft/confirmed/retired`, `title`, `languageModel: {provider, model}`, `imageModel: {provider, model}/null`, `mainInstructions`, `references` |
| Reference | `id`, `name`, `description`, `content` |
| Tool fixture | `id`, `name`, `description` |
| Model fixture | `id`, `provider`, `label`, `kind: language/image` |
| Root document | `formatVersion`, `specialties`, `agents`, `workingCopies`, `ui`, `chat`; checkpoint 8 adds booklet fixtures and test sessions |

Checkpoint 6 currently uses format 1. Checkpoint 7 introduces format 2, checkpoint 8 format 3, and checkpoint 9 format 4. Keep the storage key unchanged. Support sequential migration of earlier supported formats without resetting user data.

IDs are opaque strings, with stable seed IDs and `crypto.randomUUID()` for new items. Forked versions preserve reference IDs within their own version; resolve references by agent, version, and reference ID. There are no foreign-key constraints, database adapters, database migrations, or production compatibility layers. Local JSON format migrations are required when the document shape changes.

`workingCopies` stores pending specialty edits by specialty ID and pending complete agent-version edits by agent/version ID. `ui` stores selected entity/version/section/reference, expanded specialty IDs, retired visibility, pane widths, chat open state, and Markdown Edit/Preview choice. Store one shared chat conversation. Each request and proposal records its captured specialty or agent/version/editable-section target. Keep the structure small and serializable; no binary images, DOM state, or credentials.

### Initial dataset

Check in human-readable seed JSON with:

- Orchestrator (Text, built-in): “Booklet Guide” with an active confirmed version and one draft, plus “Gentle Guide” with an inactive confirmed version.
- Story Planning (Text): “Playful Writer” and “Concise Planner”, both with active confirmed versions. Give Playful Writer two references, `rhyming-guide.md` and `story-template.md`.
- Illustration (Image): “Watercolor Illustrator” with an active version and “Bold Shapes Illustrator” with a draft. Each includes both model selections, main instructions, and a composition reference.
- An empty Text specialty, “Character Notes”, to demonstrate adding the first agent.
- One retired specialty, “Legacy Review”, hidden by default.

Use recognizable but fictional model fixtures: providers “Demo North” and “Demo South”; language models “Story”, “Reason”, and “Quick”; image models “Watercolor” and “Shapes”. Label all selectors “Demo catalog”. They make no claim about real model support or pricing.

Tool fixtures: `get_workflow_overview`, `get_artifact_context`, `get_conversation_context`, `get_execution_context`, and `generate_image`. The last tool illustrates the image-agent concept and is not an addition to issue #22's read-only runtime catalog. Orchestrator has the four context tools; Story Planning has artifact and conversation tools; Illustration has artifact context and image generation. Templates demonstrate all three mention kinds.

### Save, discard, and refresh

Hydrate from storage in a client effect. Render a neutral loading shell until hydration completes; do not save seed state over existing storage during hydration. Seed only when the key is absent.

Persist each reducer state change synchronously to localStorage after hydration. With this small text dataset, no debounce or unload-only write is needed. Keep storage I/O outside the reducer. Persist pending working copies as well as saved data: refreshing halfway through an edit restores the text and the unsaved indicator.

- Save commits the selected working copy to the saved record and clears that working copy.
- Discard restores the saved record and clears its working copy.
- Switching entities or editor sections retains pending working copies. Show a dirty dot in navigation and “Unsaved changes · retained in this browser” in the editor.
- Creating a specialty or agent inserts a saved default record immediately and opens its editor. Subsequent changes use working copies. Defaults are “Untitled specialty” with Text output, or “Untitled agent” with draft v1 and the first matching demo models.
- New references are added to the version working copy with a unique `reference-N.md` name. Discard removes uncommitted additions.
- Persist selected entity, open references, chat history/proposals, and pane preferences across refreshes.
- “Reset demo data” confirms once, replaces only this storage key with fresh seeds, and resets selection and chat. It does not clear all browser storage.

Use a small mockup-only shape check when reading JSON. If parsing fails or `formatVersion` is unsupported, show a recovery message with Reset demo data; do not silently overwrite the stored value. If storage writes fail, retain in-memory edits and show “Changes cannot be retained after refresh” with Retry. Do not claim saved persistence. Cross-browser/device sharing and multi-tab conflict handling are excluded; last write wins between tabs.

## 3. Desktop layout and interactions

### Shell and visual direction

Use the current app's warm neutral colors and font, with compact controls, subtle borders, clear selection backgrounds, and minimal decorative cards. Show a small persistent “Mockup · synthetic data · simulated chat” indicator. No runtime health or live-service status claims.

```text
Global navigation
Mockup title / synthetic-data indicator / Reset demo data / Chat toggle
+----------------------+--------------------------------------+-------------------+
| Specialties & agents | Selected specialty settings          | Contextual chat   |
|                      |                 OR                   | (collapsible)     |
| > Orchestrator       | Agent header: version / state/actions| Target breadcrumb |
| v Story Planning     +------------+-------------------------+ Messages          |
|   Playful Writer     | Config     | Config form OR          | Proposed content  |
|   Concise Planner    | Main instr.| Markdown Edit / Preview | Apply / Dismiss   |
| v Illustration       | References |                         | Composer          |
|   Watercolor...      | + Add      |                         |                   |
+----------------------+------------+-------------------------+-------------------+
```

Primary verification viewport: 1440×900. Also inspect 1280×800 and 1920×1080. Outer navigation defaults to 240px (range 200–320); chat defaults to 340px (range 300–460); agent section navigation defaults to 180px (range 150–240). Main edit area must retain at least 360px. Use draggable separators and keyboard arrow resizing in 16px steps. Clamp widths to available space. Each pane scrolls independently without hiding its primary actions.

At 1280px chat starts collapsed unless a saved preference fits. Opening it clamps other widths. Below 1100px collapse chat and use a horizontally scrollable desktop shell with an 1100px minimum width; do not invent a mobile redesign. Do not cover the editor with chat. Preserve the user's saved desired widths when temporary viewport clamping occurs.

### Left navigation

Provide a search field and Add specialty button. Each specialty row has a separate expand/collapse chevron and a clickable name that opens specialty settings. Show Text/Image and Built-in badges. Expanded sections show agent titles and concise active/draft indicators plus Add agent. Clicking an agent opens its most recently selected version, otherwise its active version, otherwise its newest version.

Use nested lists and buttons rather than an ARIA tree requiring a complete tree keyboard model. Chevron buttons expose `aria-expanded`; selected rows expose `aria-current`. Do not add redundant open icons to every name.

Search matches specialty and agent names. A matching specialty shows all its agents; matching agents show their parent specialty and matching agent rows. Filtering does not destroy expansion preferences or selection. “Show retired” reveals retired specialties with muted styling. Do not move or copy agents between specialties.

### Specialty workspace

Show name, description textarea, Text/Image segmented control, and allowed-tools checklist with tool descriptions. Include Save changes and Discard in a stable footer/header action row, disabled when clean. Only a nonempty trimmed name is required. Show an inline error on Save; preserve all typed content.

Retire and Restore are reversible local actions. Retiring hides a specialty from normal navigation but keeps its data and agents. If selected, retain the visible editor with a Retired badge until the user navigates away. Orchestrator displays Built-in: its name, output type, and retirement action are fixed; description and allowed-tool checklist remain editable for mockup exploration. This is only a UI default, not a final permissions design.

Changing output type is allowed without migration rules. Confirmed versions remain unchanged. For an Image specialty, display the first demo image model when a stored version has none; persist it only when creating or saving a draft. Text hides image fields but retains their values for switching back. Show a brief informational notice; no compatibility wizard.

### Agent workspace and lifecycle

Header: current title, specialty breadcrumb, version selector, status/Active badge, Save and Discard when editing a draft, and a compact actions menu. Configuration contains title, provider/model controls, and read-only status information. Changing provider chooses its first matching demo model. Image controls appear only for Image specialties. Keep prompt text in its dedicated editor sections.

Inner navigation: Configuration, Main instructions, References heading with Add reference, and named reference rows. Reference editor includes editable name and description above the content editor. Allow Remove reference with one confirmation. Removing a reference leaves existing textual mentions unchanged so the preview can show an unresolved reference. This is sufficient for feedback; no dependency graph is needed.

Represent these lifecycle actions with independent mockup data:

- New agent: inactive draft v1.
- Edit draft: edit directly through a working copy.
- Fork / Edit as draft: clone the currently visible content, including pending edits, to the next version number of the same agent. Preserve the source working copy. Give the clone a new version ID, `parentVersionId`, draft status, and no activation. Open it immediately. No cross-specialty copying.
- Confirm: for a saved draft, change status to confirmed and make its content read-only.
- Activate: available for saved, confirmed versions; set that agent's `activeVersionId`. Other agents in the specialty can remain active. The mockup does not choose a team or orchestrator for a real booklet.
- Deactivate: clear that agent's active pointer.
- Retire: for an inactive saved version, mark retired. Retired versions remain inspectable and can be forked.
- Delete draft: available only for inactive draft versions; confirm once. If this removes the agent's final version, remove the synthetic agent as well and select its specialty.

Save/discard applies to the complete selected version, including all references and model settings. Block Confirm/Activate/Retire while that version has pending edits with “Save or discard changes first”. Active and other confirmed versions are read-only; edits and chat Apply use a new draft. These simple interactions demonstrate the existing lifecycle vocabulary without reimplementing its runtime validation.

### Markdown editor and mentions

Use a controlled multiline textarea in Edit mode and a rendered Markdown pane in Preview mode. Show an explicit Edit/Preview toggle, preserve text and cursor selection on mode changes, and use a readable monospace editing font. Support standard GFM headings, lists, tables, fenced code, emphasis, and links through the Markdown renderer.

Typing `@`, `/`, or `$` at the start of text or after whitespace opens a searchable menu anchored below the editor toolbar (a stable location; caret-coordinate positioning is not required). Filter the text typed after the trigger until whitespace or Escape. Do not trigger on slashes inside URLs. Arrow keys move, Enter selects, Escape closes; mouse selection also works. Preserve ordinary textarea behavior when the menu is closed. Add toolbar buttons for the same menus so users need not know the shortcuts.

Insert standard Markdown links with stable local targets:

```text
[@Story Planning](specialty:sp-story)
[/get_artifact_context](tool:get_artifact_context)
[$rhyming-guide.md](reference:ref-rhyme)
```

The specialty menu shows non-retired specialties for all agents. The tool menu shows tools selected on the saved parent specialty. The reference menu shows current version working-copy references, excluding the currently edited reference. Unsaved specialty tool edits take effect after Save. Empty menus explain why there are no choices.

Configure Markdown URL handling explicitly: recognize only the three local mention schemes and safe ordinary link schemes (`https`, `http`, `mailto`). Render local mentions as buttons/badges; never navigate the browser to a custom protocol. A specialty mention opens its settings, a reference mention opens that reference in the same version, and a tool mention opens a small description popover. Resolve labels from current data; unknown IDs render a muted “Unavailable reference/tool/specialty” badge with original label. Raw HTML remains disabled. Do not execute links as tools or enforce runtime prompt rules.

### Editing assistant

Checkpoint 7 below is the complete chat behavior specification. Use the visible name Editing assistant, one continuous target-aware conversation, local streaming, and read-only proposal cards. Chat edits specialty settings, configuration, instructions, and references. On Test or Test history, retain the conversation and disable edit submission until an editable section is selected. Preserve draft-only application and explicit Save; confirmed or retired versions require a new draft.

### Image result illustration

For Image agents, add “Preview sample result” in Configuration. Open a lightweight dialog with the local SVG, an optional editable description, and expandable fixed metadata (alt text, style, dimensions). Persist preview description edits as demo UI state. Label it “Sample result · not generated”. This illustrates the agreed output model without adding generation, uploads, configurable schemas, or a new agent editor section.

## 4. Sequential implementation checkpoints

Complete checkpoints in order. After each checkpoint, run its focused checks, then obtain independent read-only reviews and fix findings until two consecutive reviews report no issues with no intervening changes. Any correction resets the clean-review count. Record both clean reviews, commit the checkpoint, revise the next checkpoint plan only if verified implementation requires it, commit that revision, and continue without changing branches or pausing for routine approval. Do not create issue children or change the parent issue as part of this mockup.

Use these closed interaction defaults throughout implementation:

- The initial view expands Story Planning and selects Playful Writer's draft, Main instructions, in Edit mode.
- Require nonempty agent titles and reference names. Allow empty descriptions and instructions. Duplicate display names are valid because IDs own identity.
- After reference removal, select Main instructions. After version deletion, select the active version, then newest remaining version, then the specialty.
- Retirement is independent of working copies and preserves pending form edits.
- Mention insertion replaces the active trigger query, appends one space, restores focus, and uses the remembered cursor for toolbar insertion.
- Markdown image syntax renders a non-network placeholder. Only the bundled sample SVG can render as an image.
- Demo model fixtures have explicit providers and stable order. The demo uses `127.0.0.1:3100`; browser tests use `127.0.0.1:3101`.
- Only the latest completed, pending proposal for a target is actionable when selection and base match. Starting another request does not supersede it. Follow checkpoint 7's transition table below. Reset or target deletion cancels an applicable pending response.

| Checkpoint | Work | Exit evidence |
| --- | --- | --- |
| 1 — Isolated foundation | Add route, mockup launcher, runner opt-out, seed JSON/types, reducer/storage, empty shell, dedicated test configs | Mockup URL loads without credentials/MongoDB; no runner import in mockup mode; refresh restores synthetic state; normal boot branch still calls the runner in a mocked test |
| 2 — Navigation and specialty editing | Implement resizable desktop shell, search/expand/select, add/save/discard/retire/restore specialties, allowed-tool controls, global mockup link | Create a specialty, edit and reload; discard restores saved data; retired filter and empty agent state work; width controls work by mouse and keyboard |
| 3 — Agent workspace | Add agents, configuration/model selectors, full-version working copies, version header/actions, references, save/discard | New Image agent shows both selectors; text agent hides image selector; fork/confirm/activate/deactivate/retire/delete are local and persist; pending text survives section switches and reload |
| 4 — Markdown and mentions | Add dependencies, Edit/Preview, all three pickers and local link rendering | Keyboard and mouse menus insert correct tokens; preview renders Markdown and clickable mentions; removed reference is shown as unavailable |
| 5 — Chat and result preview (completed baseline) | Implement shared conversation, deterministic simulation, original before/after editing, Apply and create-draft flow, sample image result | Suggest→review→Apply works; manual-edit conflict prevents replacement; active version stays unchanged; image dialog shows description and expandable metadata |
| 6 — Verification and handoff | Complete tests, browser inspection, documentation, independent read-only review, bounded corrections | Acceptance matrix passes with evidence; final source checks pass; screenshots inspected; launch instructions and limitations documented |
| 7 — Editing assistant | Complete: local AI SDK streaming, typed cards, all editable sections, migration to format 2 | P0-08 and P0-13–P0-15 pass; independent review gate passed |
| 8 — Agent tests | Complete: stage snapshots, test sessions/history, repeat and editing handoff, format 3 | P0-16–P0-23 pass; independent review gate passed |
| 9 — Focus and lifecycle UX | Pending: focus mode, optional version notes, tool visibility, format 4 | P0-24–P0-27 pass; independent review gate |

An implementation agent should use the relevant repository React/Next.js, UI review, and browser skills when implementing their surfaces. The primary agent owns edits and integration. A separate read-only reviewer is required after implementation; delegate that bounded review without concurrent edits. A review may find ordinary in-scope defects to fix; it must not expand the mockup into the parent runtime platform.

### Verification commands and isolation

`vitest.mockup.config.ts` must be standalone: alias `@` to repository root, use jsdom, include only `tests/mockups/**/*.test.{ts,tsx}`, and omit MongoDB global setup. Keep Playwright specs outside this Vitest include by naming them `.spec.ts`.

`playwright.mockup.config.ts` uses `tests/mockups/specialty-management/*.spec.ts`, one worker, and the repository's existing Chrome-on-Windows / Chromium-elsewhere convention. Start `npm run mockup:dev -- --port 3101` through its `webServer`; readiness URL is `/mockups/specialty-management`, never `/`. Use `reuseExistingServer: false` so tests cannot accidentally target a real application instance. Write output under `output/playwright/specialty-management-mockup/`. The launcher must shut down its child when Playwright exits. Each test resets only the mockup storage key. One test deliberately reloads without resetting it.

Run at completion:

```text
npm run typecheck
npm run lint
npm run test:mockup
npm run test:mockup:e2e
npm run mockup:build
git diff --check
```

Run Git commands with repository-required permissions. Do not run paid evaluations, real smoke tests, database reset, or normal MongoDB-backed E2E setup for this phase. Build failures attributable to pre-existing environment requirements must be reported with their evidence; do not supply real credentials or mutate shared data to obtain a green result. Never report an unrun command as passed.

### Acceptance and evidence matrix

| ID | Observable acceptance | Required verification |
| --- | --- | --- |
| P0-01 | Mockup starts independently with synthetic JSON and no model/database calls | Launcher smoke; mocked runner-guard test for on/off; static import inspection; browser request recording rejects `/api/` and external service requests during the full scenario |
| P0-02 | Left pane expands specialties, opens both entity kinds, searches, and adds entities | Browser navigate/search/create flow with explicit selection assertions |
| P0-03 | Specialty fields save/discard and retirement is reversible | Reducer tests plus browser Save→reload→Discard→retire→Show retired→Restore |
| P0-04 | Agent has exactly one specialty; Text/Image model controls adapt | Browser create one of each output type; assert image controls only for Image; verify no move/copy action |
| P0-05 | Version package includes config, instructions, references; lifecycle works locally | Reducer tests for fork isolation and transitions; browser active→draft edit→save→confirm→activate |
| P0-06 | Unsaved edits and created entities survive refresh and section changes | Browser create specialty+agent+reference, type unsaved content, reload, assert saved records and pending text; Discard restores saved value |
| P0-07 | Markdown supports Edit/Preview and all three pickers | Browser keyboard/mouse insertion and preview navigation; unit tests for trigger boundaries, ID resolution, and safe link rendering |
| P0-08 | Chat remains bound to its editing target and cannot silently replace later manual edits | Deterministic simulator tests; browser selection switch, read-only proposals for all editable sections, manual conflict, Apply, active-version draft creation, refresh restoration |
| P0-09 | Sample image includes optional description and expandable metadata | Browser open/edit/reload preview; no generation request |
| P0-10 | Resizing and collapse preserve readable desktop layout | Inspect screenshots at 1280×800, 1440×900, 1920×1080, chat open/closed; keyboard resize and focus checks; no horizontal page overflow at these desktop sizes |
| P0-11 | Reset and storage failures behave honestly | Unit storage exceptions/malformed JSON tests; browser Reset confirmation and fresh seed assertions |
| P0-12 | Real management/workflow implementation stays separate | Final diff/import review: no runtime-schema, repository, agent action, routing, model-call, or database changes; only explicit runner opt-out and additive navigation affect shared app files |
| P0-13 | Editing chat streams answers, questions, and proposals with natural revisions and keyboard controls | Browser Send/Stop, clarification, Copy, Retry, Edit request, Jump to latest |
| P0-14 | Error diagnostics and refresh recovery retain captured context | Expand seed error, retry, refresh mid-stream, and verify target identity |
| P0-15 | Format-1 migration preserves management data and shared chat | Fixtures with records, working copies, legacy proposals, and pending response; composer/card refresh |
| P0-16 | Booklet selection exposes only current and previous stages with appropriate historical context; compatibility warnings allow continuation | Select multiple booklets and earlier stages; verify later artifacts are absent; continue after a mismatch warning |
| P0-17 | Tests capture unsaved agent content and keep session snapshots fixed | Start with unsaved edits, edit again, reopen the session, and verify the captured version remains unchanged |
| P0-18 | Text, Image, and Orchestrator tests show appropriate synthetic results and expandable activity | Exercise all three result types and inspect captured tool/reference/context activity |
| P0-19 | Follow-ups, Stop, refresh recovery, session history, ratings, and notes persist correctly | Converse, stop, reload, reopen, rename, rate, annotate, and delete a session |
| P0-20 | Editing-chat handoff preserves composer text and never sends or applies automatically | Send a selected response and feedback to editing chat; inspect version identity, pre-filled content, and unchanged editor data |
| P0-21 | Tests preserve agent/booklet records and the isolated mockup boundary | Compare records before/after runs and reject API, database, model, or external requests |
| P0-22 | Repeat captures current edits while preserving original session and booklet snapshot | Repeat setup, explicit Start, new-session link, and comparison with Retry |
| P0-23 | History remains accessible after source deletion | Delete version/agent and reopen history; verify disabled source-dependent actions and frozen-session follow-up |
| P0-24 | Focus restores panes/preferences without interrupting conversations | Enter/exit, refresh, Escape with popup/dialog, and editing handoff |
| P0-25 | Optional notes obey version lifecycle and use simulated suggestions | Save/Discard, confirmed read-only, new-draft blank, suggestion review/apply |
| P0-26 | Names, lifecycle explanations, and tool summary clarify behavior | Inspect Editing assistant/Test agent labels, disabled reasons, visible specialty edits |
| P0-27 | Sequential migrations preserve all supported data | Format 1→2→3→4 and direct load of 2/3/4 with chat, tests, working copies, preferences |

Use user-facing labels and roles in browser selectors. Verify tab order, labels, visible focus, popup Escape, dialog focus return, button disabled explanations, and live announcements for save/chat outcomes. This is a focused desktop check, not an accessibility certification or a cross-browser project.

Save screenshots for specialty settings, Image agent configuration, Markdown mention picker, preview, chat proposal, and active-version draft creation. Inspect the images rather than relying only on passing assertions. Artifacts stay under ignored `output/`; do not commit screenshot collections by default.

### Completion ledger

Update this table during implementation. Use actual commands/results and affected source identity; do not prefill passing claims.

| Checkpoint | Status | Validation/evidence | Remaining defects |
| --- | --- | --- | --- |
| 1 | Complete | `npm run typecheck`; `npm run test:mockup` (6); `npm run test:mockup:e2e` (1); two consecutive independent reviews passed | None |
| 2 | Complete | `npm run typecheck`; `npm run lint`; `npm run test:mockup`; `npm run test:mockup:e2e` (3); two consecutive independent reviews passed | None |
| 3 | Complete | `npm run typecheck`; `npm run lint`; `npm run test:mockup` (7); `npm run test:mockup:e2e` (7); two consecutive independent reviews passed | None |
| 4 | Complete | `npm run typecheck`; `npm run lint`; `npm run test:mockup` (12); `npm run test:mockup:e2e` (10); two consecutive independent reviews passed with no intervening changes | None |
| 5 | Complete | `npm run typecheck`; `npm run lint`; `npm run test:mockup` (15); `npm run test:mockup:e2e` (18); two consecutive independent reviews passed with no intervening changes | None |
| 6 | Complete | `npm run typecheck`; `npm run lint`; `npm run test:mockup` (15); `npm run test:mockup:e2e` (22); `npm run mockup:build`; working-tree and branch whitespace checks; six desktop screenshots inspected; two consecutive independent final reviews passed with no intervening changes | None |
| 7 | Complete | `npm run typecheck`; `npm run lint`; `npm run test:mockup` (20); `npm run test:mockup:e2e` (25); `npm run mockup:build`; `git diff --check`; streaming, clarification, text/field proposal, diagnostics, and 1280×800/1440×900/1920×1080 screenshots inspected; two consecutive independent reviews passed with no intervening changes | None |
| 8 | Complete | `npm run typecheck`; `npm run lint`; `npm run test:mockup` (31); `npm run test:mockup:e2e` (36); `npm run mockup:build`; `git diff --check`; tracked Next metadata restored cleanly; Test and Test history screenshots generated at 1280×800, 1440×900, and 1920×1080 and inspected at 1280 and 1920; two consecutive independent reviews passed with no intervening changes | None |
| 9 | Pending | Not run | Implementation pending |

## 5. Handoff and completion boundary

At implementation completion, add a short README beside this plan with: `npm run mockup:dev`, the URL, reset behavior, browser-local persistence limits, simulated chat transforms, and a five-minute feedback path. The path is: create specialty → create agent → edit instructions/reference → use a mention → review/apply chat proposal → refresh → inspect Image result. Invite feedback on pane navigation, prompt authoring, and proposal review. Feedback collection itself is not an automated completion gate.

After implementation review passes, reconcile docs through `sync-docs-issues`. Update `docs/architecture.md` only to describe the isolated mockup and startup opt-out as implemented, not to claim a new runtime platform. Update the root README with a concise link to the mockup guide. No new PRD, migration document, standalone learning report, or checkpoint files are needed. This plan remains the Phase 0 authority; future runtime specifications may replace its deliberately synthetic choices.

Report the route, launch command, tested flows, verification outcomes, and known mockup limitations. Do not call issue #22 complete. Do not require a real model, MongoDB, authentication, shared storage, production validations, multi-tab synchronization, schema authoring, runtime tool permissions, actual reference loading by agents, creator team selection, or actual orchestration to finish Phase 0.

Checkpoints 1–6 are complete on the issue branch. Checkpoints 7–9 remain pending. Exclude Changes view, automated reference/tool checks, workspace import/export, batch evaluation, and automated quality scoring.

## 6. Checkpoint 7 — Interactive simulated management chat

Use installed AI SDK `useChat`, typed `UIMessage` parts, and a local streaming `ChatTransport`. Follow booklet chat patterns in mockup components without refactoring booklet chat. No model, database, API, or external requests.

Chat edits the current section: specialty name/description/output type/tools (preserving built-in restrictions); agent title and applicable models; Main instructions; or reference name/description/content. Lifecycle commands remain in existing controls. Applying to a confirmed version creates a draft.

Keep a continuous shared conversation with captured targets. Contextual chips populate a persisted multiline composer. Enter sends; Shift+Enter adds a newline. Stream progress and text, then cards. One response runs at a time, including while collapsed. Use near-bottom scrolling, Jump to latest, and Copy. No attachments, branching, feedback, or message editing.

Recognized edits produce proposals; vague requests produce clarification cards with two or three choices and free-text replies; questions produce answers. Unsupported requests explain simulation limits. Keep concise/checklist/example transforms; shorter means concise. Resolve fields against existing fields and demo choices; clarify ambiguous values.

Render read-only proposed Markdown or labeled values within the assistant turn, with Show full/Collapse for long content. Replace editable Before/After. Apply and Dismiss remain explicit. Open target changes selection only. Apply requires latest proposal, matching selection, available target, and matching selected-section base. Apply updates working copies; Save remains separate. Only completed replacements supersede proposals. Clarification and retry remain target-bound, require opening another target, and require a fresh request after base changes. Deleted targets are unavailable.

Stop retains a cancelled item with Retry and discards incomplete proposals. Refresh creates an interrupted item. Errors provide Retry, Edit request, and collapsed Show error details with input, target, prompt snapshots, stages, timestamps, and system errors. Selected models are context, never executed models. Seed one historical synthetic failure on fresh/reset data only; its retry succeeds. No error-trigger control. Edit request restores the target and appends its prepared request below existing composer text with a clear separator; never overwrite text or send automatically.

Keep storage key `specialty-management-mockup:v1`, upgrade to `formatVersion: 2`, and migrate version-1 messages/proposals without losing entities, working copies, or preferences. Preserve legacy proposal order when association is unavailable. Persist cards, proposals, composer, pending clarification, selection, and errors. Do not seed failures into migrated conversations.

### Checkpoint 7 acceptance and exit evidence

#### Captured targets, comparisons, and atomic application

Use independent mockup types: EditingTarget is either specialty ID, or agent ID + version ID + section (configuration, instructions, or reference ID). A captured base contains exactly the editable fields for that target:

| Target | Base fields |
| --- | --- |
| Specialty | name, description, outputType, allowedToolIds |
| Configuration | title, languageModel provider/model pair, plus imageModel provider/model pair only when the visible specialty output is Image |
| Main instructions | mainInstructions |
| Reference | name, description, content |

Capture visible working-copy values. Compare strings exactly and tools as a unique sorted set of IDs; compare model provider/model values explicitly rather than object property order. Store visible specialty output type and built-in identity as eligibility context and recheck them at Apply. Version notes added in checkpoint 9 are outside these editing-chat fields.

A proposal can change multiple fields within one section. Store a partial field patch and the full section base. Apply validates the entire patch and base before writing all fields atomically; never partially apply. Reject unknown fields/tool IDs/model pairs and blank required names/titles. Built-in Orchestrator name/output type cannot be patched; description/tools can. Lifecycle fields are never patchable. If applicability or base changed, disable Apply and require a fresh request. Preserve unrelated section content and ordinary Save semantics.

| Event | Existing proposal | New result |
| --- | --- | --- |
| Request starts or streams | Remains pending and eligible under normal guards | Incomplete result is not an actionable proposal |
| Answer or clarification completes | Unchanged | No replacement proposal |
| Failure, Stop, or refresh interruption | Unchanged | Error/interrupted item; no incomplete proposal |
| Proposal completes for an available target | Earlier pending proposals for that target become superseded atomically | Register the completed pending proposal; base/selection guards determine Apply availability |
| Existing proposal applied during a later request | Applied state remains historical | Later completion can register, but its old base prevents Apply if content changed |
| Target deleted | Pending proposals become unavailable | Cancel applicable stream; no actionable completion |

Completed changes for other targets never supersede each other.

Satisfy P0-08 and P0-13–P0-15 in the consolidated acceptance matrix. Preserve P0-01–P0-12 and independent desktop scrolling. Use the label Editing assistant and Test agent for their separate conversations. Configuration base comparisons cover title and applicable models; reference comparisons cover name, description, and content. Answers, clarification, failure, and cancellation do not supersede proposals. On Test or Test history, require an editable target before submitting an editing request.

Run typecheck, lint, isolated mockup unit/browser tests, isolated build, and whitespace checks. Reject API/external requests in browser verification. Inspect streaming, clarification, text/field proposals, and expanded errors at 1280×800, 1440×900, and 1920×1080. Update the handoff guide and local-transport architecture description.

Commit the amended plan first. After implementation and verification, obtain two consecutive independent clean reviews with no intervening changes; corrections reset the count. Record evidence and commit checkpoint 7 on the existing branch.


## 7. Checkpoint 8 — Agent test workspace

### Purpose and entry point

Add **Test** to each agent's inner navigation. Users test the selected agent against a synthetic booklet, converse with it, inspect simulated activity, and record feedback. Implement this checkpoint after checkpoint 7.

Use the existing mockup architecture and checkpoint 7's local chat patterns. All booklets, responses, tool activity, images, and diagnostics are synthetic.

### Setup and session behavior

- Select a booklet, then its current or any previous prepared stage. Show stage order and identify the current stage. Future stages are unavailable.
- Preview the selected stage's context read-only: available artifacts, relevant conversation, and task context. Earlier snapshots exclude later-stage information.
- Allow every agent at every available stage. Show a nonblocking compatibility warning based on explicit demo specialty/stage mappings. Custom specialties show “Compatibility not defined.”
- Enter an opening request and start the test. No custom-input-only mode or editable context overrides.
- Capture the selected agent's complete visible version, including unsaved configuration, instructions, and references. Capture the booklet stage context at the same time.
- Keep both snapshots fixed throughout the conversation. Later editor changes require **New test** to take effect.
- Tests never modify booklet artifacts or activate, save, or otherwise change agent versions.

### Test conversation and results

- Place setup, session history, conversation, and results in the main Test section. Keep the editing assistant in the right pane as a separate conversation.
- Stream simulated responses with Stop and recoverable interrupted/error states. Reuse checkpoint 7's local transport patterns without connecting to runtime services.
- Text agents return Markdown. Image agents return bundled sample images with descriptions and expandable metadata. Orchestrator agents return a specialty choice and explanation without running that specialty.
- Show expandable activity entries for simulated context reads, reference reads, and tool calls. Each entry exposes its synthetic input/output. Use only tools available in the captured specialty.
- Select deterministic fixtures by specialty output, stage, and supported request patterns. Explain unsupported requests and offer examples. Do not imply that the simulator measures actual prompt quality.
- Allow follow-up requests in the same session.
- Each completed assistant response supports **Useful**, **Needs work**, and an optional editable note.

### History and editing handoff

- Persist multiple sessions per agent, including snapshots, messages, activity, results, ratings, and notes.
- Generate an editable session name from booklet, stage, and agent version. Show newest sessions first. Support reopening, renaming, and deleting a session with confirmation.
- Reopening a session restores its captured context. Source-version edits or deletion do not alter its stored evidence. Reset demo data clears test history.
- Add **Send to editing chat** to completed responses. Open the source agent's Main instructions, reveal the editing assistant, and pre-fill the result and feedback as a request.
- Include the tested version and snapshot context in the handoff. If its source version is unavailable, open the agent's current available version and explicitly identify the difference.
- Append the handoff below existing composer text with a clear separator. Sending the request and applying any resulting proposal remain explicit actions.

### Repeat, history, and snapshot rules

**Repeat test with current edits** opens pre-filled setup using the old session's exact booklet snapshot, stage, and opening request. Require explicit **Start test**. Capture fresh agent content at Start, create a new session linked to the original, and preserve the original unchanged.

If that agent is currently open, use its selected version and working copy. Otherwise use its most recently viewed existing version, then active version, then newest remaining version. Display the chosen version before Start. Retry instead replays a failed or stopped turn against the original frozen session inputs.

Snapshot specialty output type, allowed tools, and demo routing catalog alongside the complete agent version and booklet context. Later source edits cannot affect existing sessions. Permit one running test response across sessions, independently of the Editing assistant. Navigation does not stop it. Deleting that session or resetting cancels it. Refresh converts incomplete responses to interrupted turns with Retry.

Add **Test history** to Studio navigation outside specialty sections. Show all sessions newest first with agent and booklet filters. Per-agent Test sections show the same records filtered by agent. Preserve captured names and snapshots after deletion; mark missing sources clearly. Orphaned sessions remain inspectable and can continue using frozen snapshots, but Repeat and editing handoff are disabled if the entire agent is missing. If only its version is missing, use the version fallback above and identify the difference in editing handoff.

### Implementation and verification

Extend mockup JSON with a synthetic booklet library, stage snapshots, compatibility hints, and test sessions. Upgrade to format 3 from format 2, preserving management and chat data. Existing users receive booklet fixtures and empty test history.

Provide three example booklets at different workflow stages, with representative earlier snapshots and bundled image assets. Share fixture assets rather than duplicating image data in sessions.

#### Deterministic booklet fixtures

Declare the mockup's own ordered stage list using these IDs: audience_profile, story_plan, visual_style, visual_bible, booklet_specification, page_plan, final_pages, pdf_export. These match the app vocabulary but must not import runtime schemas.

| Booklet ID / title | Premise and audience | Current stage | Selectable snapshots |
| --- | --- | --- | --- |
| demo-forest / Forest Friends | A fox and a rabbit learn to share; ages 4–6 | story_plan | audience_profile through story_plan |
| demo-moon / Moon Picnic | Two siblings prepare a picnic on the Moon; ages 6–8 | visual_bible | audience_profile through visual_bible |
| demo-garden / The Smallest Garden | A child builds a balcony garden; ages 8–10 | final_pages | audience_profile through final_pages |

Each selectable snapshot has a stable ID formed from booklet ID and stage ID. It contains the premise plus only the fixture artifacts from stages strictly before the selected stage. Use the following small independent text artifacts; substitute the selected booklet's premise and audience where specified:

| Artifact stage | Fixture content |
| --- | --- |
| audience_profile | Booklet audience range; gentle tone; one clear lesson |
| story_plan | Booklet premise; beginning: introduce the goal; middle: overcome one obstacle; end: resolve through cooperation |
| visual_style | Warm watercolor, simple shapes, clear focal point |
| visual_bible | Two protagonists from the premise; consistent colors and clothing; bundled sample illustration path |
| booklet_specification | Square format; cover and three story pages |
| page_plan | Cover: introduce protagonists; page 1: goal; page 2: obstacle; page 3: resolution |
| final_pages | Three sample page records using the bundled illustration with goal/obstacle/resolution captions |
| pdf_export | Synthetic export summary only; no file generation |

At each snapshot include a user message “Help with [stage label] for [title].” and one preceding assistant summary per available artifact, ordered by stage. Task context is “Prepare [stage label] using the available earlier artifacts.” Do not include later-stage artifacts or messages. Snapshot data is explicit fixture JSON, not loaded from the real booklet database.

Compatibility: Orchestrator accepts every stage; Story Planning accepts audience_profile, story_plan, booklet_specification, and page_plan; Illustration accepts visual_style, visual_bible, and final_pages; Character Notes accepts story_plan and visual_bible; Legacy Review accepts every stage. Other combinations warn and continue. User-created specialties have undefined compatibility.

Deterministic supported test requests are “Summarize context”, “Produce a sample result”, and “Revise the result”; show these as suggestions. A summary lists captured context; result/revision requests return the specialty-appropriate fixture with the latest request recorded as a simulated revision note. Text results contain the title, stage, premise, and three-step fixture outline. Image results use the bundled illustration, premise-based description, and fixed sample metadata. Orchestrator chooses Illustration for visual stages/final_pages and Story Planning otherwise, using the frozen routing catalog; if that specialty is unavailable, return a routing-unavailable explanation. Other requests explain the supported simulation examples.

Activity reports only frozen context, reference IDs, and allowed tool fixtures. “Summarize context” reads context only; sample-result and revision requests additionally show the first captured reference when present and the first allowed context tool when present. Image runs show generate_image only if it was allowed. Image requests without that tool return an explanatory unavailable result rather than claim a tool call. Never invent actual execution evidence.

Acceptance: P0-16–P0-23 in the consolidated matrix.

Keep the Test section and expanded activity readable within independently scrolling desktop panes. Inspect the existing 1280×800, 1440×900, and 1920×1080 viewports.

Update the handoff guide when implemented. Retain the existing typecheck, lint, isolated unit/browser tests, isolated build, whitespace checks, and two consecutive independent clean-review gate. Record actual evidence before committing checkpoint 8.



## 8. Checkpoint 9 — Focus, version notes, and lifecycle clarity

### Focus mode

Focus mode expands the main workspace by hiding Studio navigation, agent section navigation, and the Editing assistant. Keep the entity header, version identity, relevant actions, and an accessible **Exit focus mode** control visible. Support specialty settings, configuration, instructions, references, and Test.

Preserve pane widths and chat-open preferences rather than overwriting them; restore them on exit. Persist focus state across refresh. Escape exits focus only when no dialog or popup consumes it. An editing-chat handoff exits focus and reveals the Editing assistant. Hidden conversations continue running. Keep independent main-pane scrolling and restore focus to the entry control on exit.

### Optional version note

Add **Version note** in configuration, optional and limited to 240 characters. Display it beneath version identity, in version choices, and captured test details. Use ordinary version Save/Discard; confirmed and retired notes are read-only. New drafts start with an empty note, including fork, Edit as draft, reference-add draft creation, and chat-application drafts. Notes are never required to save, confirm, or test.

**Suggest note** generates a deterministic editable suggestion labeled simulated; no LLM call. Compare the visible draft with its parent and summarize changed categories in this fixed order: models, Main instructions, references. Compare reference names/descriptions/content as well as additions/removals. Ignore note changes. With no parent suggest “Initial draft”; with no compared changes suggest “No configuration or instruction changes.” Otherwise suggest “Updated models, Main instructions, and references.” including only changed categories. Show the suggestion before replacing existing text. Applying it changes only the note working copy and requires ordinary Save. Cancel leaves the note unchanged.

### Lifecycle and tool visibility

Keep Save/Discard visible when dirty. Show **Test** outside Test; on confirmed or retired versions show **Edit as draft** prominently. Place remaining lifecycle actions in an accessible menu with keyboard open/navigation, Escape, and focus return. Explain Confirm as “Lock this version” and Activate as “Make available for selection.” Preserve current lifecycle behavior and explain disabled actions in visible text, not hover-only tooltips.

Show a read-only **Allowed tools** summary in agent configuration with **Edit specialty tools** navigation. Reflect the specialty's visible working copy and label unsaved values. Returning to the agent preserves its working copy.

Upgrade format 3 to format 4 with empty version notes (including version working copies) and focus off. Retain immutable historical test snapshots; absent historical notes display empty. Support sequential migration from all earlier formats under the unchanged storage key.

Acceptance: P0-24–P0-27. Update the mockup guide and relevant architecture description after verification. Inspect focused editing and Test history at all three desktop sizes.

## 9. Unattended implementation resumption

Planning work alone must not start implementation. When the user explicitly resumes implementation, first verify the issue branch and preserve unrelated work, including generated Next.js type-file differences. Commit this consolidated plan before code changes.

Implement checkpoints 7, 8, then 9 without switching branches. For each checkpoint, implement and run relevant checks; obtain independent read-only review; fix findings and rerun affected checks until two consecutive reviews are clean with no intervening changes. Any correction resets the clean count. Record actual commands/results and both clean reviews in the single ledger, then commit the checkpoint. Inspect the next checkpoint against implemented behavior; commit any necessary plan adjustment and continue without routine approval pauses.

At final completion run typecheck, lint, isolated mockup unit/browser tests, isolated build, and whitespace checks. Inspect screenshots of the new states at 1280×800, 1440×900, and 1920×1080. No real model, database, or external requests are required. No merge, deployment, or issue closure is authorized.
