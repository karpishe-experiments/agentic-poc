# Children's booklet creation: proposed v0 workflow

## Summary

Define a minimal workflow in which a user and an agent prepare a six-page children's booklet: one cover and five story pages.

This proposed PRD was produced for a 30-minute workshop. The process is the primary workshop outcome. Participants will present their results, compare flows, and converge them into a shared v0 workflow.

## Hypothesis

An adaptive agent can turn a short storyline into a generation-ready booklet by progressively filling narrative gaps and asking the user to confirm the plot, visual direction, characters, booklet specifications, and complete page-by-page story.

## POC boundaries

This POC specifies the experience and agent decisions; it does not implement them.

### In scope

- The user journey from dashboard entry through mocked final generation
- The agent's main decisions and stopping rules
- Generative UI for questions, choices, summaries, and reviewable outputs
- Autosave, draft resume, and a generic retry path
- Inventory-based style and character selection
- Confirmation of the plot, visual references, character sheet, booklet specifications, and complete story
- A combined user-and-agent flowchart

### Out of scope

- A clickable or implemented UI
- A working agent or dynamic question generation
- Real image generation or booklet generation
- Production persistence, authentication, accessibility validation, or observability
- Detailed service-specific failure handling
- Completion of the final generation job after the **Generating** state

## Experience principles

- Present each step through generative UI whenever useful, using the card, controls, recommendations, and editable fields best suited to the requested decision.
- Keep the conversation sequential and manageable.
- Make the agent's current task and requested user action clear.
- Offer recommendations without removing user control.
- Autosave meaningful progress so the user can safely leave and resume.
- Preserve the draft and offer a retry when a recoverable failure occurs.

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
   - whether the booklet uses dialogue;
   - any other global format decisions needed for consistent page generation.
3. The user confirms the specifications and may edit every field except the fixed page count.

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
2. Confirmation starts mocked asynchronous generation.
3. The user returns immediately to the dashboard.
4. The new booklet appears with **Generating** status. Later status changes are outside v0.

## Agent decision rules

- Infer missing story information from context; do not require fixed story fields.
- Generate up to eight focused questions from the identified plot gaps and present them one at a time.
- Generate the whole plot after the planned questions are answered, or immediately when no gaps are identified.
- Accept plot edits without restarting the interview.
- Decide style before selecting characters so character suggestions fit the visual direction.
- Use only inventory styles and characters.
- Lock reusable style and character references before generating the character sheet or page prompts.
- Preserve confirmed constraints when updating an individual story card.
- Do not offer final generation until the plot, style, cast, references, character sheet, booklet specifications, and all story cards are confirmed.

## State and recovery

- Autosave after the initial storyline, every answer, and every confirmed or edited artifact.
- Resume an incomplete draft at its last incomplete step.
- For a recoverable error, explain the failure, keep the saved draft intact, and offer retry.
- Use one generic recovery path in v0 rather than service-specific error branches.

## Flowchart

See the [combined user and agent Mermaid flowchart](childrens-booklet-v0-flowchart.mmd). The diagram is stored separately so it can be rendered, edited, and compared independently during the workshop.

## Success criteria

- A participant can explain the complete flow in a few minutes.
- The flow shows both user actions and the agent's important decisions without implementation detail.
- Relevant steps use generative UI to make questions, choices, and generated artifacts easy to review and edit.
- The agent can progress from an open-ended storyline without fixed story fields or a fixed questionnaire.
- The sequence clearly covers plot, style, characters, locked references, character sheet, booklet specifications, and the complete page-by-page story before generation.
- Each story page exposes enough information to review setting, props, layout, panels, and panel-level prompts.
- Autosave, resume, and generic recovery preserve progress without dominating the happy path.
- The artifact is simple enough to compare with other workshop flows and revise into a shared v0.
