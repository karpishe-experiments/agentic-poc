#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_config
master_sha="$(gh api "repos/$REPOSITORY/git/ref/heads/master" --jq .object.sha)"
configuration="$(gh api "repos/$REPOSITORY/contents/infra/config/configured.json?ref=master" --jq .content | tr -d '\n' | base64 -d)"
jq -e --arg account "$AWS_ACCOUNT_ID" --arg region "$AWS_REGION" --arg state "$STATE_BUCKET" --arg operations "$OPERATIONS_BUCKET" '.awsAccountId==$account and .awsRegion==$region and .stateBucket==$state and .operationsBucket==$operations' <<<"$configuration" >/dev/null \
  || { echo "The merged configuration does not match this setup." >&2; exit 1; }
for branch in _staging _prod; do
  gh api "repos/$REPOSITORY/git/ref/heads/$branch" >/dev/null 2>&1 \
    || gh api --method POST "repos/$REPOSITORY/git/refs" -f ref="refs/heads/$branch" -f sha="$master_sha" >/dev/null
done
"$DEPLOY_ROOT/scripts/deploy/configure-github.sh"
checkpoint="$(mktemp)"; trap 'rm -f "$checkpoint"' EXIT
jq -cn --arg commit "$master_sha" --arg at "$(date -u +%FT%TZ)" '{schemaVersion:"1",status:"verified",configuredCommit:$commit,updatedAt:$at}' > "$checkpoint"
aws s3api put-object --bucket "$OPERATIONS_BUCKET" --key setup/status.json --body "$checkpoint" --content-type application/json >/dev/null
echo "Setup is verified. Deployment branches exist and were not reset."
