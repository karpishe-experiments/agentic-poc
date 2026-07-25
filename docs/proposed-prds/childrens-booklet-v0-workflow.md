# Children's booklet creation: proposed v0 workflow

## Summary

Define a minimal workflow in which a user and an agent prepare a six-page children's booklet: one cover and five story pages.

This proposed PRD was produced for a 30-minute workshop. The process is the primary workshop outcome. Participants will present their results, compare flows, and converge them into a shared v0 workflow.

## Hypothesis

An adaptive agent can turn a short storyline into a generation-ready booklet by progressively filling narrative gaps and asking the user to confirm the plot, visual direction, characters, booklet specifications, aspect ratio, and complete page-by-page story before exporting the result as a PDF or images.

## Related work

- [Discussion #2: Feedback on the Kid Comics project description](https://github.com/karpishe-experiments/agentic-poc/discussions/2) provides the broader POC, MVP, and product context.
- [Issue #4: Review the proposed children's booklet v0 workflow](https://github.com/karpishe-experiments/agentic-poc/issues/4) tracks review and convergence feedback for this proposed flow.

## POC boundaries

This POC is a working prototype of the proposed flow. Its stages may use disposable, manually assisted, or independently implemented components, but together they should demonstrate a complete path from storyline to a reviewable booklet.

### In scope

- A demonstrable path from dashboard entry to a generated six-page booklet
- Agent workflows that exercise the main decisions and stopping rules, even when some handoffs are manual
- Generative UI for questions, choices, summaries, and reviewable outputs
- Optional product-shell behaviors such as autosave, draft resume, and generic retry when useful for evaluating the flow
- Inventory-based style and character selection
- Confirmation of the plot, visual references, character sheet, booklet specifications, and complete story
- Story, character-sheet, panel-image, and booklet generation
- User selection of the booklet aspect ratio
- Review and export of the completed booklet as a PDF or page images
- Basic editing and regeneration of selected artifacts
- Human review of story coherence and visual consistency
- A combined user-and-agent flowchart

### Out of scope

- Production-ready architecture, schemas, scalability, reliability, security hardening, or comprehensive automated testing
- Polished UX, exhaustive editing tools, or a fully automated workflow with no manual intervention
- Production user accounts, roles, permissions, payments, or subscriptions
- Social sharing, collaboration, communities, marketplaces, or creator publishing
- Commercial printing, distribution, or publishing-platform integrations
- Animation, interactive stories, narration, translation, sequels, or broader artwork types
- Production-grade analytics, observability, support tooling, or detailed service-specific failure handling

## Experience principles

- Present each step through generative UI whenever useful, using the card, controls, recommendations, and editable fields best suited to the requested decision.
- Keep the conversation sequential and manageable.
- Make the agent's current task and requested user action clear.
- Offer recommendations without removing user control.
- Autosave meaningful progress so the user can safely leave and resume.
- Preserve the draft and offer a retry when a recoverable failure occurs.

## Flowchart

See the [combined user and agent Mermaid flowchart](childrens-booklet-v0-flowchart.mmd). The diagram is stored separately so it can be rendered, edited, and compared independently during the workshop.

## Proposed workflow

### 1. Start or resume

1. The user opens the dashboard.
2. If no booklets exist, the primary CTA is **Create your first booklet**. Otherwise it is **Create a new booklet**.
3. Selecting the CTA opens the agent chat. It nearly fills the mobile view and appears as a sidebar on desktop.
4. The user may instead open an incomplete draft, which resumes at its last incomplete step.

### 2. Capture the storyline

1. The user enters a short storyline.
2. Any free-text input supports optional voice input.
3. The draft autosaves after the storyline and every subsequent meaningful change.

### 3. Ask questions to fill the gaps

1. The agent assesses the storyline and uses its storytelling skills to infer what information is missing. It does not follow a fixed questionnaire or require fixed story fields.
2. If plot gaps exist, the agent generates up to eight focused questions designed to close those specific gaps.
3. The agent presents the generated questions one at a time and chooses the most suitable question card for each:
   - **Free text:** may be pre-populated or offer **Generate for me**.
   - **Multiple choice:** may tag recommended options and offer **Proceed with recommendations**.
   - **Single choice:** may highlight one recommended option.
4. After the generated questions are answered, the agent continues to plot generation. If no gaps were identified, it proceeds without asking questions.

### 4. Generate and confirm the whole plot

1. The agent combines the storyline and answers into a complete plot.
2. A plot overview card presents the premise, main arc, key events, ending, tone, and any inferred details.
3. The user reviews the whole plot and may confirm it or edit any part.
4. Edits update the plot directly without reopening the interview.

### 5. Decide the visual style

1. The agent searches the style inventory and selects two to five suitable options.
2. Each style card includes a title, short introduction, and image gallery.
3. The agent may highlight a recommended option.
4. The user selects one style.

### 6. Decide the characters

1. Using the confirmed plot and style, the agent searches the character inventory.
2. The agent proposes a cast with one main character and any useful supporting characters.
3. Characters must come from inventory; custom character generation is not available.
4. The user confirms the cast and may change names or simple traits and style attributes.

### 7. Lock the style and characters

1. The agent generates the reference prompts or assets needed to keep the selected visual style and character appearances consistent.
2. The user reviews a compact reference card describing the locked style and each character's defining visual traits.
3. The user confirms the references or edits them before continuing.

### 8. Generate and confirm the character sheet

1. The agent generates a character sheet using the locked references.
2. The sheet shows the confirmed cast clearly enough to review appearance and consistency.
3. The user confirms the sheet or requests edits.
4. Any edits update the locked character references before the sheet is regenerated.

### 9. Generate and confirm booklet specifications

1. The agent proposes the booklet-level specifications in a review card.
2. The specifications include at least:
   - cover style and composition;
   - the fixed workshop page count of one cover plus five story pages, shown for confirmation but not editing;
   - the booklet aspect ratio, selected by the user from the supported options;
   - whether the booklet uses dialogue;
   - any other global format decisions needed for consistent page generation.
3. The agent may recommend an aspect ratio, but the user must explicitly choose one before continuing.
4. The user confirms the specifications and may edit every field except the fixed page count.

### 10. Generate and confirm the full story

1. The agent expands the confirmed plot into the complete cover and page-by-page story.
2. The complete story appears as a set of focused generative UI cards:
   - a cover card;
   - a story card for each page's narrative text and dialogue, when enabled;
   - a scene card for each page's setting and props;
   - a layout card for each page's panel arrangement;
   - a card for every panel, including its characters, action, continuity notes, and illustration prompt.
3. The user can review, confirm, or edit every card independently.
4. The agent updates affected details while preserving confirmed plot, style, character, and booklet constraints.
5. Final generation is available only after every required card is confirmed.

### 11. Start generation

1. The user confirms final generation or leaves the booklet as an autosaved draft.
2. Confirmation starts asynchronous booklet generation.
3. The user returns immediately to the dashboard.
4. The new booklet appears with **Generating** status and becomes available for review when generation completes.

### 12. Review and export the completed booklet

1. When generation completes, the user opens the booklet and reviews the cover and story pages in the chosen aspect ratio.
2. The user may return to the relevant artifact to edit or regenerate selected content before exporting.
3. The user chooses an export format:
   - **PDF:** export the complete booklet as one PDF;
   - **Images:** export the cover and each story page as separate image files, with an option to download all page images together.
4. Export preserves the selected aspect ratio and the confirmed page order.
5. If export fails, the completed booklet remains available and the user can retry without regenerating it.

## Generative UI components

| Component | Used for | Primary interactions |
| --- | --- | --- |
| Agent chat shell | Hosting the creation flow on mobile and desktop | Read agent guidance, move through sequential steps |
| Storyline composer | Capturing the initial idea and later free-text feedback | Type, use voice input, submit |
| Question card | Answering plot-gap questions through free-text, single-choice, or multiple-choice variants | Type, use voice input, select options, accept recommendations, or choose **Generate for me** |
| Editable plot overview card | Reviewing the generated whole plot | Confirm or edit plot details |
| Style gallery card | Comparing recommended inventory styles | Review title, description, and example gallery; select one style |
| Character card | Building the inventory-based cast | Select, confirm, rename, or adjust simple traits and style attributes |
| Locked-reference card | Reviewing the prompts or assets that preserve style and character consistency | Confirm or edit reference details |
| Character-sheet card | Reviewing the generated cast appearance | Confirm or request edits |
| Booklet-specifications card | Reviewing global booklet decisions | Choose the aspect ratio; confirm or edit cover direction, dialogue usage, and other fields; review the fixed page count |
| Story artifact cards | Reviewing the cover and complete story | Confirm or edit cover, narrative, dialogue, setting, props, and layout cards |
| Panel card | Reviewing an individual panel | Confirm or edit characters, action, continuity notes, and illustration prompt |
| Completed-booklet viewer and export card | Reviewing and downloading the generated booklet | Preview pages in order; choose PDF or image export; download one page image or all page images |

## Card scrolling behavior

- Use one vertical scroll container for the agent chat and its cards.
- When a new card appears, bring it into view without hiding the agent message that introduced it.
- Keep only the current card active. Collapse completed cards into compact summaries that the user can reopen.
- Let text, forms, and review cards expand within the main scroll; avoid nested vertical scrolling.
- Allow style and character galleries to scroll horizontally. Show part of the next item to make the interaction discoverable.
- Present full-story review as a vertical card list with a sticky progress indicator and **Previous incomplete** and **Next incomplete** navigation.
- Preserve the user's position after editing, regenerating, navigating, or resuming a draft.
- Do not force-scroll while the user is reading. Show a **Jump to latest** control when newer agent content is below the viewport.

## Agent decision rules

- Infer missing story information from context; do not require fixed story fields.
- Generate up to eight focused questions from the identified plot gaps and present them one at a time.
- Generate the whole plot after the planned questions are answered, or immediately when no gaps are identified.
- Accept plot edits without restarting the interview.
- Decide style before selecting characters so character suggestions fit the visual direction.
- Use only inventory styles and characters.
- Lock reusable style and character references before generating the character sheet or page prompts.
- Require the user to choose a supported aspect ratio before booklet specifications can be confirmed.
- Preserve confirmed constraints when updating an individual story card.
- Do not offer final generation until the plot, style, cast, references, character sheet, booklet specifications, and all story cards are confirmed.
- Preserve the confirmed aspect ratio and page order in PDF and image exports.

## State and recovery

- Autosave after the initial storyline, every answer, and every confirmed or edited artifact.
- Resume an incomplete draft at its last incomplete step.
- For a recoverable error, explain the failure, keep the saved draft intact, and offer retry.
- If export fails, retry export from the completed booklet rather than rerunning booklet generation.
- Use one generic recovery path in v0 rather than service-specific error branches.

## Success criteria

- A participant can explain the complete flow in a few minutes.
- The flow shows both user actions and the agent's important decisions without implementation detail.
- Relevant steps use generative UI to make questions, choices, and generated artifacts easy to review and edit.
- The agent can progress from an open-ended storyline without fixed story fields or a fixed questionnaire.
- The sequence clearly covers plot, style, characters, locked references, character sheet, user-selected aspect ratio, booklet specifications, and the complete page-by-page story before generation.
- Each story page exposes enough information to review setting, props, layout, panels, and panel-level prompts.
- The working POC produces a reviewable six-page booklet with a coherent story and recognizably consistent characters and visual style.
- The completed booklet can be exported as one PDF or as separate page images while preserving the chosen aspect ratio and confirmed page order.
- Manual handoffs and disposable implementations are acceptable when they still provide useful evidence about the flow, models, agent patterns, and generative UI.
- The artifact is simple enough to compare with other workshop flows and revise into a shared v0.
