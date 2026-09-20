# Build-mode request

Paste this into Dify Build after the three Booklet tools and both Workflow tools are available:

> Configure the existing `booklet_manager` with `gpt-5.6-terra`. On every turn it must first call `get_project_context`. It may call `write_story` to create or revise the three-panel Story, then save it through `save_story_draft`, call `request_review`, and stop. Preserve the exact Booklet Run ID for those mutations. Only when Booklet reports the current revision approved and includes `illustrate_panel` in allowed actions may it call `illustrate_panel` with the project ID, original Booklet Run ID, current revision, and panel number 1. It must never pass or rewrite the image prompt, use a raw image tool, call internal callbacks, retry an uncertain paid action, or treat chat text as approval. Use the attached complete manager instructions. Keep `write_story` and the existing Story JSON-text mapping unchanged.

After Build applies its draft, check Configure:

- model is `gpt-5.6-terra` and supports tool calling;
- prompt exactly matches [manager-prompt.md](manager-prompt.md);
- `write_story` and `illustrate_panel` are attached;
- Booklet exposes only `get_project_context`, `save_story_draft`, and `request_review`;
- no raw OpenAI image tool or callback operation is attached;
- no provider credential or Booklet tool key appears in the prompt or files;
- publish before API use.

If Build cannot complete an item, configure it manually and record that work. Conversational setup quality is an observation, not a reason to weaken the Booklet boundary.
