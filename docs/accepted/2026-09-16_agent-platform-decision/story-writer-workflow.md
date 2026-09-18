# Story Writer specialty workflow

Use this Dify **Workflow**, not a Chatflow. Dify can publish a Workflow as a Tool for `booklet_manager` to call.

## Create

1. In Studio, create from blank and select **Workflow**.
2. Name it `story_writer` and describe it as `Creates or revises a valid three-panel Booklet Story proposal.`
3. In the Start node, add these required inputs:
   - `operation` (short text): `create` or `revise`.
   - `project_context` (paragraph): the complete output from `get_project_context`.
   - `request` (paragraph): the operator's idea or the saved pending feedback.
4. Add one LLM node using `gpt-5.6-terra`.
5. Enable Structured Output on the LLM node. Configure it as the Booklet Story object in [tools.openapi.json](tools.openapi.json), then add an End node that returns `LLM / structured_output` as the object `story`.

## LLM system prompt

Copy the body of [story-writing/SKILL.md](story-writing/SKILL.md), excluding its YAML header, then append:

```
The inputs are operation, project_context, and request. project_context is authoritative.
For operation=create, use the idea and preferences in project_context plus request.
For operation=revise, use the saved story and pending feedback in project_context plus request.
Return only one valid Story JSON object. Do not use Markdown fences or explanatory text.
```

## Publish as a tool

Publish the Workflow as a Tool with these values:

- Display name: `Story Writer`
- Tool name: `write_story`
- Description: `Create or revise a complete three-panel Booklet Story proposal from authoritative project context. It does not save, approve, or generate images.`

Attach `write_story` to `booklet_manager` after the workflow is published. It is the only Dify-internal specialty in this trial. The manager remains responsible for calling Booklet's HTTP tools and enforcing the lifecycle through their responses.
