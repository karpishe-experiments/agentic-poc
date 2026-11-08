# Prompt reference for the Real experiment

The DSL forwards prepared requests. The experiment application owns the creative instructions, context selection, output schemas and final provider request. This reference makes those external dependencies inspectable before Unitale moves creative ownership into Dify.

## Sources and coverage

Code source: [`1d4cc02307edad21aadefc244bcc4e286396b88f`](https://github.com/karpishe-experiments/agentic-poc/tree/1d4cc02307edad21aadefc244bcc4e286396b88f). The primary policy is Real `execution_v3`. This identifies inspected code, not deployment or successful-run evidence. Original workflow publications and capture times remain in the [manifest](../manifest.json).

- [Exact prompt/schema catalog](catalog.json): 48 selectors covering Manager, J01–J12, three persona decisions/reports and judge reports. Identical content is stored once: 19 prompts and 17 unbound schemas.
- [Context and contracts](context-and-contracts.md): fetching, projection, schema binding, final request construction and a synthetic J02 trace.
- [Image requests](image-requests.md): exact static assembly text, dynamic substitutions, style/reference/page requests and image revisions. J13 belongs here; the source text-task enum contains J01–J12 only.
- [Unitale migration](unitale-migration.md): agreed target ownership, seven roles, quality gates and correction policy.
- [Workflow inventory](../README.md#workflow-inventory): each workflow links to its own `prompts.md`, including exact effective instructions and applicable catalog keys.

## Reading the catalog

Each request key identifies role, task, persona and decision/proposal versus report. `promptSha256` addresses the exact UTF-8 string in `promptContents`. `schemaSha256` addresses the recursively key-sorted, compact JSON schema in `schemaContents`; array order is preserved. `definitionHash` is the source builder's own definition identity, which covers more than prompt/schema content.

The schemas are **unbound**. `runtimeBindingCandidates` lists names considered by the source binding helper; not every candidate appears in every schema. The application derives current eligible values, narrows enums and UUID choices, and prunes impossible branches before dispatch. The catalog does not confer authority or contain private current identities.

The extractor called the inspected pure `executionDefinitionFor` directly through the existing TypeScript loader. It did not initialize a service, database, provider or dispatcher. Shared base definitions and Real/v3 overrides were applied by the source functions. Historical policy versions remain available through source links instead of duplicate catalogs.

## Evidence categories

**Exact extraction:** catalog prompt strings and schemas, and fenced prompt text in workflow references. **Explanation:** prose describing inspected control/data flow. **Target requirement:** statements in the Unitale migration document. Target requirements are not implemented experiment behavior.

Inherited wording, fixture assumptions and source limitations are preserved and identified. Synthetic examples are illustrative and contain no private run records, paid execution or generated media.

## Refresh

Freeze a new code commit, re-inspect effective policy selection, then extract the same supported selectors through pure builders. Recompute content hashes and update affected prose. For DSL updates, retain the source publication identity and compare the Real closure before deriving it. Do not relabel a derivative as a native export or infer live compatibility from offline validation. Review the complete resulting diff before publication.
