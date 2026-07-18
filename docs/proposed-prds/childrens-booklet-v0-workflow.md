# Children's booklet creation: proposed v0 workflow

## Summary

Define a minimal workflow in which a user and an agent prepare a six-page children's booklet: one cover and five story pages.

This is a proposed PRD produced for a 30-minute workshop. The process is the primary workshop outcome. Participants will present their results, compare flows, and converge them into a shared v0 workflow.

## Hypothesis

A short, adaptive agent interview followed by guided character, style, and preview choices can capture enough intent to start booklet generation without overwhelming the user.

## POC boundaries

This POC specifies the experience and agent decisions; it does not implement them.

### In scope

- The user journey from dashboard entry through mocked final generation
- The agent's main decisions and stopping rules
- Generative UI question cards
- Autosave, draft resume, and a generic retry path
- Inventory-based character and style selection
- One mocked illustration preview and one possible revision
- A combined user-and-agent flowchart

### Out of scope

- A clickable or implemented UI
- A working agent or dynamic question generation
- Real image generation or booklet generation
- Production persistence, authentication, accessibility validation, or observability
- Detailed service-specific failure handling
- Completion of the final generation job after the **Generating** state

## Experience principles

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

### 2. Capture the story

1. The user enters a short storyline.
2. Any free-text input supports optional voice input.
3. The draft autosaves after the storyline and every subsequent meaningful change.

### 3. Complete the plot

1. The agent assesses the storyline and uses its storytelling skills to infer what information is missing. It does not follow a fixed questionnaire.
2. If more information is needed, the agent asks one relevant question at a time, up to a maximum of eight questions.
3. The agent chooses the most suitable question card:
   - **Free text:** may be pre-populated or offer **Generate for me**.
   - **Multiple choice:** may tag recommended options and offer **Proceed with recommendations**.
   - **Single choice:** may highlight one recommended option.
4. The agent stops asking questions when the plot is coherent enough to continue or the eight-question maximum is reached.
5. The agent presents an overview of the storyline and answers.
6. The user may edit any overview item. The agent accepts the edits without reopening the interview.

### 4. Choose characters

1. The agent searches the character inventory and proposes a cast with one main character and any useful supporting characters.
2. Characters must come from inventory; custom character generation is not available.
3. The user confirms the cast and may change names or simple traits and styles.

### 5. Choose a visual style

1. The agent searches the style inventory and selects two to five suitable options.
2. Each option includes a title, short introduction, and image gallery.
3. The user selects one style.

### 6. Preview the booklet

1. After plot, cast, and style approval, the agent creates the internal structure for the cover and five story pages.
2. The page-by-page structure is not shown for review in v0.
3. The agent chooses the story moment that best demonstrates the selected cast and visual style.
4. The system generates one mocked illustration panel.
5. The user may:
   - accept the first preview; or
   - give text or voice feedback and regenerate the preview once.

### 7. Start final generation

1. The user confirms final generation or leaves the booklet as an autosaved draft.
2. Confirmation starts mocked asynchronous generation.
3. The user returns immediately to the dashboard.
4. The new booklet appears with **Generating** status. Later status changes are outside v0.

## Agent decision rules

- Infer missing story information from context; do not require fixed story fields.
- Ask only relevant questions, one at a time, with an eight-question maximum.
- Treat a coherent plot or the question limit as permission to continue.
- Accept overview edits without reassessing completeness.
- Use only inventory characters and styles.
- Create the six-page structure only after plot, cast, and style approval.
- Select the most representative moment for the preview.
- Allow no more than one preview regeneration.

## State and recovery

- Autosave after the initial storyline, every answer or overview edit, cast confirmation, style selection, and preview feedback.
- Resume an incomplete draft at its last incomplete step.
- For a recoverable error, explain the failure, keep the saved draft intact, and offer retry.
- Use one generic recovery path in v0 rather than service-specific error branches.

## Flowchart

See the [combined user and agent Mermaid flowchart](childrens-booklet-v0-flowchart.mmd). The diagram is stored separately so it can be rendered, edited, and compared independently during the workshop.

## Success criteria

- A participant can explain the complete flow in a few minutes.
- The flow shows both user actions and the agent's important decisions without implementation detail.
- The user retains control at the overview, cast, style, and preview stages.
- The agent can progress from an open-ended storyline without fixed story fields or a fixed questionnaire.
- The document captures the eight-question maximum, inventory constraints, one preview revision, autosave and resume behavior, generic recovery, and mocked final generation.
- The artifact is simple enough to compare with other workshop flows and revise into a shared v0.
