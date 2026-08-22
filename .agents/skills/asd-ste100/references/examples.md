# Examples

## Preserve uncertainty

Before: `The request may have failed because the client could be outdated.`

After: `The request may have failed. An outdated client could be the cause.`

The rewrite keeps both uncertainty markers. It does not state that the request
failed or that the client caused the possible failure.

## Split actions

Before: `Open the file and read line 3, then check whether it matches the schema.`

After:

1. `Open the file.`
2. `Read line 3.`
3. `Check whether line 3 matches the schema.`

## Preserve excluded material

Keep commands such as `npm run build`, identifiers such as `sourceRef`, quoted issue
text, and log output unchanged unless the user explicitly asks to rewrite them.
