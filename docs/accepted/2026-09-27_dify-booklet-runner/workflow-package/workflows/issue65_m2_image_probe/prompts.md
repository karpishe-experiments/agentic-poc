# Shared image executor, including J13: prompt reference

## Source and applicable policy

[executionDefinitionFor](https://github.com/karpishe-experiments/agentic-poc/blob/1d4cc02307edad21aadefc244bcc4e286396b88f/lib/experiment-runner/execution-request.ts) selects Real `execution_v3` at code commit `1d4cc02307edad21aadefc244bcc4e286396b88f`. This is code evidence, not proof of a live deployment. [Catalog](../../prompt-reference/catalog.json) records exact definitions and hashes.

No text-role LLM request is dispatched by this graph. J13 is image execution, not a text specialist. [Image request assembly](../../prompt-reference/image-requests.md) contains the exact source serializers and dynamic substitutions.

## Effective prompt

The supplied image prompt is assembled from saved creative artifacts. The DSL forwards it unchanged through the custom tool; there is no embedded creative system prompt.

## Dynamic context

Consumes J08 style samples, J09/J10 sheet requests and J13 page/cover requests.

The provider request includes prompt, ordered reference manifests and image settings. Consult [context and contracts](../../prompt-reference/context-and-contracts.md) for actual projection, omissions, source approval and runtime bindings.

## Output contract

The tool returns validated image execution evidence. Original asset storage and application acceptance remain external.

## Assembly

1. Booklet selects current eligible work and retrieves its saved context.
2. Build and validate the logical image request, verify sources and original references, then bind provider settings.
3. Authorization returns a digest-bound prepared carrier. The retained decoder checks it before the selected provider/tool executes.
4. Return the result envelope for external validation and acceptance. [Shared assembly details](../../prompt-reference/image-requests.md).

## Revision and failure rules

Saved creator feedback must target current eligible sources. Preserve source identities and approved creative choices. Missing, stale, invalid or over-limit inputs prevent preparation or execution; authorization can return a pause reason. A model result alone does not prove persistence or approval. Exact rules and source links are in the shared reference.

## Unitale migration

Target responsibility: **Image Executor**. Move creative templates and request construction into Dify. Manager supplies task context and constraints. Replace fixture persona/count assumptions with package inputs. [Agreed migration requirements](../../prompt-reference/unitale-migration.md).
