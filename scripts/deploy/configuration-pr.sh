#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_config
: "${STATE_BUCKET:?}" "${OPERATIONS_BUCKET:?}"
branch="agent/issue-24-deployment-configuration"
base_sha="$(git rev-parse HEAD)"
gh api "repos/$REPOSITORY/git/ref/heads/$branch" >/dev/null 2>&1 \
  || gh api --method POST "repos/$REPOSITORY/git/refs" -f ref="refs/heads/$branch" -f sha="$base_sha" >/dev/null
document="$(jq -cn --arg account "$AWS_ACCOUNT_ID" --arg region "$AWS_REGION" --arg state "$STATE_BUCKET" --arg operations "$OPERATIONS_BUCKET" --arg commit "$base_sha" '{schemaVersion:"1",awsAccountId:$account,awsRegion:$region,stateBucket:$state,operationsBucket:$operations,reviewedCommit:$commit}')"
content="$(printf '%s\n' "$document" | base64 -w0)"
current_sha="$(gh api "repos/$REPOSITORY/contents/infra/config/configured.json?ref=$branch" --jq .sha 2>/dev/null || true)"
arguments=(--method PUT "repos/$REPOSITORY/contents/infra/config/configured.json" -f message="Configure AWS deployment account" -f content="$content" -f branch="$branch")
[[ -z "$current_sha" ]] || arguments+=(-f sha="$current_sha")
gh api "${arguments[@]}" >/dev/null
gh pr view "$branch" --repo "$REPOSITORY" >/dev/null 2>&1 \
  || gh pr create --repo "$REPOSITORY" --base master --head "$branch" --title "Configure AWS deployment account" --body "Records the non-secret AWS account, region, state bucket, operations bucket, and reviewed setup commit. Merge this PR before creating the deployment branches." >/dev/null
echo "Configuration PR created or updated. Merge it after review, then run: scripts/deploy/deploy.sh finalize"
