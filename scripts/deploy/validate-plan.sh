#!/usr/bin/env bash
set -euo pipefail
plan_json="${1:?plan JSON}" stack="${2:?stack}"
jq -e . "$plan_json" >/dev/null
deletions="$(jq -r '.resource_changes[]? | select(.change.actions | index("delete")) | [.type,.address] | @tsv' "$plan_json")"
[[ -z "$deletions" ]] && exit 0
if [[ "$stack" == "bootstrap" && "${ALLOW_BOOTSTRAP_SECURITY_CHANGE:-false}" != "true" ]]; then
  echo "Bootstrap security deletions require an exceptional administrator operation." >&2; printf '%s\n' "$deletions" >&2; exit 1
fi
if grep -Eq '^aws_(s3_bucket|eip|secretsmanager_secret|wafv2_web_acl|iam_)' <<<"$deletions"; then
  echo "The plan deletes protected storage, the retained NAT EIP, secrets, WAF, or IAM controls." >&2
  printf '%s\n' "$deletions" >&2
  exit 1
fi
