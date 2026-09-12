#!/usr/bin/env bash
set -euo pipefail
script="scripts/deploy/aws-deployment.sh"
"$script" --help >/dev/null
if "$script" unexpected >/dev/null 2>&1; then echo 'positional arguments were accepted' >&2; exit 1; fi
if "$script" --unknown >/dev/null 2>&1; then echo 'unknown argument was accepted' >&2; exit 1; fi
if "$script" --action status --account-id bad --region eu-west-1 >/dev/null 2>&1; then echo 'invalid account was accepted' >&2; exit 1; fi
if "$script" --action status --account-id 123456789012 --region us-east-1 >/dev/null 2>&1; then echo 'invalid region was accepted' >&2; exit 1; fi
if "$script" --action infrastructure --account-id 123456789012 --region eu-west-1 --stack wrong >/dev/null 2>&1; then echo 'invalid stack was accepted' >&2; exit 1; fi
if "$script" --action maintenance --account-id 123456789012 --region eu-west-1 --environment prod --step reset-staging --confirmation kids_booklet >/dev/null 2>&1; then echo 'production reset was accepted' >&2; exit 1; fi
if grep -R -E 'scripts/deploy/(cloudshell|configuration-pr|configure-github|deploy|ecs-task|finalize-setup|github-maintenance|github-release|lib|operation-lock|validate-plan)\.sh' .github docs infra --exclude=runbook.md; then echo 'legacy shell entrypoint reference found' >&2; exit 1; fi

test_root="$(mktemp -d)"; trap 'rm -rf "$test_root"' EXIT
mkdir -p "$test_root/bin" "$test_root/tmp"; cp "$script" "$test_root/aws-deployment.sh"; chmod 700 "$test_root/aws-deployment.sh"
cat > "$test_root/bin/aws" <<'AWS'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$AWS_CALL_LOG"
case "$1 $2" in 'sts get-caller-identity') printf '123456789012\n' ;; 'configure get') printf 'eu-west-1\n' ;; 's3api head-bucket') exit 1 ;; esac
AWS
cat > "$test_root/bin/jq" <<'JQ'
#!/usr/bin/env bash
if [[ "$1" == -n ]]; then shift; while [[ $# -gt 0 ]]; do case "$1" in --arg) printf -v "$2" '%s' "$3"; shift 3 ;; *) shift ;; esac; done; printf '{"script":"%s","plan":"%s","json":"%s"}\n' "$script" "$plan" "$json"
elif [[ "$1" == -r ]]; then field="${2#.}"; sed -n "s/.*\"$field\":\"\([^\"]*\)\".*/\1/p" "$3"; else cat; fi
JQ
cat > "$test_root/bin/gh" <<'GH'
#!/usr/bin/env bash
if [[ "$1 $2" == 'auth status' ]]; then [[ "${GH_AUTHENTICATED:-false}" == true ]]; exit; fi
if [[ "$1" == api && "$*" == *'.permissions.admin'* ]]; then printf 'true\n'; exit; fi
if [[ "$1" == api && "$*" == *'.owner.id'* ]]; then printf '987654321\n'; exit; fi
exit 1
GH
chmod 700 "$test_root/bin/aws" "$test_root/bin/jq" "$test_root/bin/gh"; export AWS_CALL_LOG="$test_root/aws.log" TMPDIR="$test_root/tmp"
PATH="$test_root/bin:$PATH" "$test_root/aws-deployment.sh" --action maintenance --account-id 123456789012 --region eu-west-1 --environment staging --step backup > "$test_root/output"
grep -q 'Mode: preview' "$test_root/output"; grep -q 'would update: maintenance backup' "$test_root/output"
if grep -E 'delete-object|put-object|put-secret-value|update-service|run-task' "$AWS_CALL_LOG"; then echo 'preview invoked a mutating AWS command' >&2; exit 1; fi
[[ -z "$(find "$test_root/tmp" -mindepth 1 -print -quit)" ]] || { echo 'temporary workspace was not removed' >&2; exit 1; }
review_root="$test_root/review-work"; mkdir -p "$review_root/.deploy/plans"; printf plan > "$review_root/.deploy/plans/shared.tfplan"; printf '{}' > "$review_root/.deploy/plans/shared.tfplan.json"
(
  export AWS_DEPLOYMENT_LIBRARY_ONLY=true HOME="$test_root/home" PATH="$test_root/bin:$PATH"
  source "$test_root/aws-deployment.sh"
  export STANDALONE=true DEPLOY_ROOT="$review_root" SCRIPT_PATH="$test_root/aws-deployment.sh" AWS_ACCOUNT_ID=123456789012 PROJECT=kids-booklet STACK=shared
  export REPOSITORY=owner/repository
  unset GH_AUTHENTICATED
  if resolve_repository_owner >/dev/null 2>&1; then echo 'bootstrap preview accepted missing GitHub authentication' >&2; exit 1; fi
  export GH_AUTHENTICATED=true
  resolve_repository_owner
  [[ "$REPOSITORY_OWNER_ID" == 987654321 ]]
  persist_reviewed_plan >/dev/null
  manifest="$HOME/.kids-booklet-deployment/$AWS_ACCOUNT_ID/$PROJECT/plans/shared.manifest"; [[ -f "$manifest" ]]
  rm "$manifest"; if restore_reviewed_plan >/dev/null 2>&1; then echo 'apply accepted a missing reviewed-plan manifest' >&2; exit 1; fi
)
printf 'deployment script contract checks passed\n'
