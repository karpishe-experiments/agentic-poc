#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_config
verify_identity
: "${OPERATIONS_BUCKET:?Run bootstrap and set OPERATIONS_BUCKET first.}"
action="${1:-status}"
lock_key="operations/current.json"
case "$action" in
  acquire)
    lock_file="$(mktemp)"; trap 'rm -f "$lock_file"' EXIT
    printf '{"operation":"%s","environment":"%s","commit":"%s","run":"%s","step":"acquired","createdAt":"%s"}\n' "${OPERATION:?}" "${ENVIRONMENT:-shared}" "${GITHUB_SHA:-local}" "${GITHUB_RUN_ID:-cloudshell}" "$(date -u +%FT%TZ)" > "$lock_file"
    aws s3api put-object --bucket "$OPERATIONS_BUCKET" --key "$lock_key" --body "$lock_file" --content-type application/json --if-none-match '*' >/dev/null
    ;;
  update)
    step="${2:?step}"; lock_file="$(mktemp)"; next_file="$(mktemp)"; trap 'rm -f "$lock_file" "$next_file"' EXIT
    etag="$(aws s3api head-object --bucket "$OPERATIONS_BUCKET" --key "$lock_key" --query ETag --output text)"
    aws s3 cp "s3://$OPERATIONS_BUCKET/$lock_key" "$lock_file" >/dev/null
    jq --arg step "$step" --arg updatedAt "$(date -u +%FT%TZ)" '.step=$step | .updatedAt=$updatedAt' "$lock_file" > "$next_file"
    aws s3api put-object --bucket "$OPERATIONS_BUCKET" --key "$lock_key" --body "$next_file" --content-type application/json --if-match "$etag" >/dev/null
    ;;
  release) aws s3api delete-object --bucket "$OPERATIONS_BUCKET" --key "$lock_key" --if-match "$(aws s3api head-object --bucket "$OPERATIONS_BUCKET" --key "$lock_key" --query ETag --output text)" >/dev/null ;;
  status) aws s3 cp "s3://$OPERATIONS_BUCKET/$lock_key" - 2>/dev/null || echo '{"status":"unlocked"}' ;;
  *) echo "Usage: operation-lock.sh acquire|update STEP|release|status" >&2; exit 2 ;;
esac
