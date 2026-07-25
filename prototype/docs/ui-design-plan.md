# Kid Comics UI Design Plan

## Design direction

Kid Comics should feel like a guided book-building workspace rather than a traditional form wizard. The agent leads the conversation, while the user progressively reviews and locks the creative decisions needed to generate a six-page children's booklet.

The core interaction model is:

> Agent explains what it needs → the composer transforms into the appropriate input UI → the user responds → the response becomes part of the conversation → the composer returns or transforms for the next request.

## Product structure

### Dashboard

- Primary CTA: `Create your first booklet` or `Create a new booklet`
- Draft cards with title, thumbnail, progress, and status
- Resume incomplete drafts at their last incomplete step
- Generating and completed booklet states

### Creation workspace

- Mobile: the agent chat nearly fills the screen
- Desktop: the chat appears in a sidebar with the active artifact or preview alongside it
- A compact progress rail shows:
  `Story → Plot → Style → Characters → References → Sheet → Specs → Pages → Generate`

### Review workspace

- Confirmed artifacts appear as compact, reopenable summaries
- The current artifact remains expanded and active
- Full-story review uses `Previous incomplete` and `Next incomplete` navigation
- Final generation is disabled until required artifacts are confirmed

## Generative UI and input model

Generative UI is a primary product behavior, not an enhancement to the chat. The agent chooses the appropriate structured input based on what it needs to learn.

All agent-requested inputs must appear in the chat thread's interaction area, using a drawer, inline card, or composer replacement. This input surface occupies the same functional space as the message composer on both mobile and desktop. Users should always understand that the active input is the place to provide the requested information.

The UI should not scatter agent-requested forms across unrelated screens.

### Supported input patterns

- Text fields for storyline, plot edits, dialogue, and continuity notes
- Long-form editors for narrative and scene descriptions
- Single-choice cards for tone, endings, and format decisions
- Multi-select cards for themes, props, and supporting characters
- Recommendation cards with `Accept recommendation` or `Proceed with recommendations`
- Character forms for names, traits, and visual attributes
- Toggles for dialogue, narration, and layout preferences
- Sliders or segmented controls for mood, age range, and visual softness
- Structured page and panel forms for story planning
- Voice input wherever free-text entry is appropriate
- Generated previews with inline `Edit`, `Regenerate`, and `Confirm` actions

After submission, the active input should collapse into the conversation as a concise summary of the user's response. The composer can then return to its normal state or transform into the next generated input.

On desktop, the input surface remains anchored at the bottom of the chat sidebar. On mobile, it remains the bottom interaction area and can expand into a taller drawer when the task needs more room.

## Conversation and card behavior

The agent conversation should feel calm and editorial rather than like an unstructured transcript. Each agent message should introduce one focused action and clearly state:

1. What the agent understood or decided
2. What the user needs to review or provide
3. What will happen after confirmation

Only the current card is fully expanded. Completed cards collapse into summaries such as:

- `Plot confirmed`
- `Style: Soft watercolor storybook`
- `Cast: Milo, Grandma, Pip`
- `Character sheet confirmed`

Use one vertical scroll container for the chat and its cards. Avoid nested vertical scrolling. When new content appears, bring it into view without hiding the agent message that introduced it. Do not force-scroll while the user is reading; show `Jump to latest` when appropriate.

Style and character galleries may scroll horizontally and should show part of the next item to make the interaction discoverable.

## Core generative UI cards

### Storyline composer

Large text input with optional voice entry and a clear submit action.

### Question card

Generated one question at a time. It may contain free text, single choice, multiple choice, recommended answers, or `Generate for me`.

### Plot overview card

Editable sections for premise, main arc, key events, ending, tone, and inferred details. Edits update the plot directly without restarting the interview.

### Style gallery card

Two to five inventory-based styles with title, short description, image gallery, and a recommended option.

### Character card

Inventory-based cast selection with portraits, names, simple traits, and style attributes. Custom character generation is not available in v0.

### Locked-reference card

Compact review of the selected visual style and each character's defining visual traits. These references become the consistency rules for later generation.

### Character-sheet card

Generated cast sheet with `Confirm`, `Edit`, and `Request edits` actions.

### Booklet-specifications card

Review and edit cover direction, dialogue usage, and other global format decisions. The fixed format of one cover plus five story pages is visible but not editable.

### Story artifact cards

The full story is represented by a cover card and one story card per page. Each page exposes narrative text, dialogue when enabled, setting, props, and layout.

### Panel card

Each panel exposes its characters, action, continuity notes, and illustration prompt. Regeneration should be local to the selected card and preserve confirmed decisions elsewhere.

## Full-story review

Full-story review should use a dedicated review mode rather than behaving like a long chat exchange.

Suggested structure:

- Sticky header: `Story review · 4 of 9 sections confirmed`
- Navigation for Cover and Pages 1–5
- Expandable page sections
- Page-level narrative, setting, props, layout, and panel cards
- Bottom navigation: `Previous incomplete`, `Next incomplete`, and `Confirm all`

This gives users detailed control without losing their place in the overall booklet.

## Visual direction

The interface should feel like a modern children's publishing tool:

- Warm paper-like background
- Dark ink-colored text
- One bright accent color for actions and recommendations
- Friendly rounded cards without becoming overly playful
- Strong image previews for styles, characters, sheets, and pages
- Clear distinction between agent-generated, user-confirmed, and needs-review content

The application should support the generated book as the visual focus rather than competing with it.

## MVP screen and state coverage

The first prototype should represent these screens and states:

1. Empty dashboard
2. Dashboard with an incomplete draft
3. Storyline entry
4. Generated question in the composer area
5. Plot confirmation
6. Style selection
7. Character selection
8. Character-reference review
9. Character-sheet review
10. Booklet-specification review
11. Full-story page and panel review
12. Generating state
13. Completed booklet preview

Later generation steps may use realistic placeholders, provided the user can experience the complete flow.

## UX risks and safeguards

- **Too much scrolling:** collapse completed cards and provide jump navigation.
- **Unclear agent decisions:** label recommendations and explain why they were made.
- **Fear of losing work:** show autosave status and preserve confirmed artifacts.
- **Overwhelming story review:** separate page-level review from panel-level detail.
- **Regeneration destroying good work:** regenerate only the selected card and preserve confirmed content elsewhere.
- **Unclear completion state:** show a confirmation checklist before enabling final generation.
- **Unclear input location:** keep every agent-requested form or structured control in the persistent chat/composer interaction area.

## Design principle

**Conversation for guidance, generative composer UI for input, cards for decisions, and the review workspace for confidence.**
