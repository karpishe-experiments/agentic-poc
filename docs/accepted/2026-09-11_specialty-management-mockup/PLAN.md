# Phase 0: Unified specialty and agent management mockup

## Purpose and authority

Deliver an interactive desktop mockup that the user can evaluate before defining the runtime platform. Parent: [issue #22](https://github.com/karpishe-experiments/agentic-poc/issues/22). This document is the complete implementation handoff for Phase 0. Checkpoints below are sequential and do not require separate checkpoint files.

The user requested a mockup with synthetic data, simulated chat, and persistence between refreshes. Their conversation decisions govern this phase. This plan does not implement or complete the parent issue's runtime requirements. In particular, schemas, migrations, tool execution, workflow routing, result mapping, and runtime integration remain later work. The parent issue still uses “skill”; this mockup uses “specialty”. Do not rename existing runtime symbols.

Status: plan prepared; implementation not started. Behavioral details marked as mockup defaults below are implementation choices for this experiment, not permanent platform contracts. Do not add approval pauses for these defaults during implementation. Gather product feedback after the mockup works.

### Agreed product model

- A specialty has a name, description, allowed tools, and exactly one primary output type: Text or Image. Users can add specialties and retire unused ones.
- Image output can include an optional description and expandable text metadata. It is one illustrative result, not separate competing text and image results.
- Every agent belongs to exactly one specialty. Cross-specialty copying is excluded.
- Every agent has a title and a Language model (provider and model). Image specialties additionally require an Image model (provider and model).
- Each agent version contains Main instructions, References, and configuration. A reference has a name, description, and Markdown content. Reference contents are conceptually read on demand; Phase 0 does not execute this behavior.
- The built-in Orchestrator specialty can contain multiple agents. The future workflow selects one orchestrator per booklet. Other specialties retain the existing concept of team selection and parallel results; Phase 0 does not modify those creator flows.
- Agent draft, confirmation, activation, retirement, and fork interactions are represented locally.
- The editor supports `@` specialty, `/` available tool, and `$` reference menus. All agents can mention specialties. Mentions do not execute anything.
- Chat proposes changes to the selected Main instructions or Reference. The user reviews before/after text and applies the proposal to a draft. Activation is separate.
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

Use existing visual primitives and installed dependencies where suitable. Do not import runtime agent repositories, contracts, Server Actions, AI SDK hooks, model catalogs, environment validators, or application services. Implement the mockup with React state and a small reducer; no state-management framework or rich-text editor dependency.

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

Add a clearly labeled “Management mockup” link in the existing global navigation. Leave the real Agents link intact. Use a mockup root data attribute and route-scoped CSS selectors to widen only the containing main element, remove its large vertical padding, and size the shell to the remaining viewport. Avoid replacing the root layout or using fixed overlays over the global header. Keep the existing skip-link target.

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
| Root document | `formatVersion: 1`, `specialties`, `agents`, `workingCopies`, `ui`, `chatThreads` |

IDs are opaque strings, with stable seed IDs and `crypto.randomUUID()` for new items. Forked versions preserve reference IDs within their own version; resolve references by agent, version, and reference ID. There are no foreign-key constraints, database adapters, schema migrations, or production compatibility layers.

`workingCopies` stores pending specialty edits by specialty ID and pending complete agent-version edits by agent/version ID. `ui` stores selected entity/version/section/reference, expanded specialty IDs, retired visibility, pane widths, chat open state, and Markdown Edit/Preview choice. Store one shared chat conversation. Each request and proposal records its target agent, version, and instruction/reference section. Keep the structure small and serializable; no binary images, DOM state, or credentials.

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
|   Playful Writer     | Config     | Config form OR          | Before / After    |
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

### Simulated chat

Chat defaults open at 1440px when there is no saved preference. Its header shows “Simulated assistant” and a target breadcrumb with agent, version, and Main instructions or reference name. On specialty settings or Configuration, disable the composer with “Select Main instructions or a reference to edit with chat”. Do not pretend to edit models or specialty settings.

Keep one chat conversation across target selections. Each message and proposal displays its captured target. Selection changes update the header breadcrumb but retain the conversation. A response can finish after selection changes, but can mutate only its captured target. Apply is enabled only when its target matches the current selection and its base content still matches. An older proposal offers **Open target**. Allow one simulated response at a time across the conversation. Reset cancels it; deletion makes affected proposals unavailable. Keep only the latest proposal per target actionable. The user can type any request. Provide three suggestion chips: “Make this concise”, “Use a numbered checklist”, and “Add an example”. Implement deterministic local transforms:

- Concise: keep headings and the first nonempty prose paragraph, preserving any lines containing mention links.
- Checklist: turn nonheading, nonempty prose lines into a numbered list; leave fenced code blocks and headings unchanged.
- Example: append a clearly marked sample `## Example` section with a short synthetic instruction.
- Other requests: append `## Requested guidance` with the user's literal request. State that this is a simulated suggestion, not a model interpretation.

Expose this limitation in assistant copy. Delay the response briefly (about 400ms) to show a cancellable working state, but make the result deterministic. A follow-up request transforms the latest pending proposal for that target, otherwise the current editor content. Keep the original base text for the before comparison.

Each proposal stores target IDs, base text, proposed text, and pending/applied/dismissed status. Show readable Before and After panels with Markdown source; no diff library needed. Allow editing the After text, Apply, and Dismiss. Apply to a draft updates its working copy and dirty state, never activates it. For a confirmed/active version, label the action “Create draft with changes”, clone the complete version, apply the proposal to the corresponding section, and select the new draft.

If the target content changed manually since the proposal base, disable Apply with “Content changed; generate a new proposal”. If the reference/version was deleted, disable Apply with a target-unavailable message. These are small editor safeguards to prevent confusing feedback, not runtime conflict rules. Applying twice must not duplicate a draft. Collapsing chat retains its messages and proposals. After refresh, an interrupted simulated response becomes a retryable message rather than a permanently pending spinner.

When generating after a manual-edit conflict, dismiss the old pending proposal and use the current editor text as the new base. For follow-up requests without a conflict, keep the existing base and transform the pending After text. Cancel stops only the current simulated response and leaves editor content unchanged.

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
- Only the latest proposal for a target is actionable. Earlier proposals become superseded. A manual conflict requires a new proposal from current content. Reset or target deletion cancels an applicable pending response.

| Checkpoint | Work | Exit evidence |
| --- | --- | --- |
| 1 — Isolated foundation | Add route, mockup launcher, runner opt-out, seed JSON/types, reducer/storage, empty shell, dedicated test configs | Mockup URL loads without credentials/MongoDB; no runner import in mockup mode; refresh restores synthetic state; normal boot branch still calls the runner in a mocked test |
| 2 — Navigation and specialty editing | Implement resizable desktop shell, search/expand/select, add/save/discard/retire/restore specialties, allowed-tool controls, global mockup link | Create a specialty, edit and reload; discard restores saved data; retired filter and empty agent state work; width controls work by mouse and keyboard |
| 3 — Agent workspace | Add agents, configuration/model selectors, full-version working copies, version header/actions, references, save/discard | New Image agent shows both selectors; text agent hides image selector; fork/confirm/activate/deactivate/retire/delete are local and persist; pending text survives section switches and reload |
| 4 — Markdown and mentions | Add dependencies, Edit/Preview, all three pickers and local link rendering | Keyboard and mouse menus insert correct tokens; preview renders Markdown and clickable mentions; removed reference is shown as unavailable |
| 5 — Chat and result preview | Implement target threads, deterministic simulation, before/after editing, Apply and create-draft flow, sample image result | Suggest→review→Apply works; manual-edit conflict prevents replacement; active version stays unchanged; image dialog shows description and expandable metadata |
| 6 — Verification and handoff | Complete tests, browser inspection, documentation, independent read-only review, bounded corrections | Acceptance matrix passes with evidence; final source checks pass; screenshots inspected; launch instructions and limitations documented |

An implementation agent should use the relevant repository React/Next.js, UI review, and browser skills when implementing their surfaces. The primary agent owns edits and integration. A separate read-only reviewer is required after implementation; delegate that bounded review without concurrent edits. A review may find ordinary in-scope defects to fix; it must not expand the mockup into the parent runtime platform.

### Verification commands and isolation

`vitest.mockup.config.ts` must be standalone: alias `@` to repository root, use jsdom, include only `tests/mockups/**/*.test.{ts,tsx}`, and omit MongoDB global setup. Keep Playwright specs outside this Vitest include by naming them `.spec.ts`.

`playwright.mockup.config.ts` uses `tests/mockups/specialty-management/*.spec.ts`, one worker, and the repository's existing Chrome-on-Windows / Chromium-elsewhere convention. Start `npm run mockup:dev -- --port 3100` through its `webServer`; readiness URL is `/mockups/specialty-management`, never `/`. Use `reuseExistingServer: false` so tests cannot accidentally target a real application instance. Write output under `output/playwright/specialty-management-mockup/`. The launcher must shut down its child when Playwright exits. Each test resets only the mockup storage key. One test deliberately reloads without resetting it.

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
| P0-08 | Chat remains bound to its editing target and cannot silently replace later manual edits | Deterministic simulator tests; browser selection switch, before/after, manual conflict, Apply, active-version draft creation, refresh restoration |
| P0-09 | Sample image includes optional description and expandable metadata | Browser open/edit/reload preview; no generation request |
| P0-10 | Resizing and collapse preserve readable desktop layout | Inspect screenshots at 1280×800, 1440×900, 1920×1080, chat open/closed; keyboard resize and focus checks; no horizontal page overflow at these desktop sizes |
| P0-11 | Reset and storage failures behave honestly | Unit storage exceptions/malformed JSON tests; browser Reset confirmation and fresh seed assertions |
| P0-12 | Real management/workflow implementation stays separate | Final diff/import review: no runtime-schema, repository, agent action, routing, model-call, or database changes; only explicit runner opt-out and additive navigation affect shared app files |

Use user-facing labels and roles in browser selectors. Verify tab order, labels, visible focus, popup Escape, dialog focus return, button disabled explanations, and live announcements for save/chat outcomes. This is a focused desktop check, not an accessibility certification or a cross-browser project.

Save screenshots for specialty settings, Image agent configuration, Markdown mention picker, preview, chat proposal, and active-version draft creation. Inspect the images rather than relying only on passing assertions. Artifacts stay under ignored `output/`; do not commit screenshot collections by default.

### Completion ledger

Update this table during implementation. Use actual commands/results and affected source identity; do not prefill passing claims.

| Checkpoint | Status | Validation/evidence | Remaining defects |
| --- | --- | --- | --- |
| 1 | Complete | `npm run typecheck`; `npm run test:mockup` (6); `npm run test:mockup:e2e` (1); two consecutive independent reviews passed | None |
| 2 | Complete | `npm run typecheck`; `npm run lint`; `npm run test:mockup`; `npm run test:mockup:e2e` (3); two consecutive independent reviews passed | None |
| 3 | Complete | `npm run typecheck`; `npm run lint`; `npm run test:mockup` (7); `npm run test:mockup:e2e` (7); two consecutive independent reviews passed | None |
| 4 | Not started | — | — |
| 5 | Not started | — | — |
| 6 | Not started | — | — |

## 5. Handoff and completion boundary

At implementation completion, add a short README beside this plan with: `npm run mockup:dev`, the URL, reset behavior, browser-local persistence limits, simulated chat transforms, and a five-minute feedback path. The path is: create specialty → create agent → edit instructions/reference → use a mention → review/apply chat proposal → refresh → inspect Image result. Invite feedback on pane navigation, prompt authoring, and proposal review. Feedback collection itself is not an automated completion gate.

After implementation review passes, reconcile docs through `sync-docs-issues`. Update `docs/architecture.md` only to describe the isolated mockup and startup opt-out as implemented, not to claim a new runtime platform. Update the root README with a concise link to the mockup guide. No new PRD, migration document, standalone learning report, or checkpoint files are needed. This plan remains the Phase 0 authority; future runtime specifications may replace its deliberately synthetic choices.

Report the route, launch command, tested flows, verification outcomes, and known mockup limitations. Do not call issue #22 complete. Do not require a real model, MongoDB, authentication, shared storage, production validations, multi-tab synchronization, schema authoring, runtime tool permissions, actual reference loading by agents, creator team selection, or actual orchestration to finish Phase 0.

For the current planning task, completion means this document has been checked against every agreed interaction and the current repository. It does not mean any mockup code or tests have been implemented. Publication, commit approval, and user feedback are separate from delivery of the local plan.
