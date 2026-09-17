# Build-mode request

Paste this into Dify Build after creating booklet_manager:

> Configure a small Booklet manager using gemini-2.5-flash. It must first load project state through get_project_context, use the attached story-writing skill to write or revise a storyline and three panels, save through save_story_draft, request_review, and wait for the operator. Only an application-confirmed approval permits generate_panel_image for panel one. Read the supplied manager instructions and apply them. These four tools will be imported from the supplied OpenAPI definition; do not invent tools, add a direct image plugin, or create a second project database. Do not make live image requests during configuration.

After applying the Build draft, check:

- Model is gemini-2.5-flash and supports tool calling.
- Manager prompt matches [manager-prompt.md](manager-prompt.md).
- Exactly one writing skill is attached.
- Exactly the four Booklet HTTP tools are attached once their endpoint is available.
- No provider credentials or tool keys appear in prompts or files.
- The Build note does not contradict approval, context-loading, or retry instructions.
- Publish before API use. A saved draft alone is not the active configuration.

If Build cannot perform an item, finish that item in Configure and record the manual work. Conversational setup quality is an observation, not a reason to block the whole experiment.
