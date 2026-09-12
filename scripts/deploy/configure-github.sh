#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_config
: "${STATE_BUCKET:?}" "${OPERATIONS_BUCKET:?}"

branch_protection() {
  local branch="$1"
  gh api --method PUT -H "Accept: application/vnd.github+json" "repos/$REPOSITORY/branches/$branch/protection" --input - <<JSON
{"required_status_checks":{"strict":true,"contexts":["Validate / validate"]},"enforce_admins":true,"required_pull_request_reviews":{"dismiss_stale_reviews":true,"required_approving_review_count":1},"restrictions":null,"required_linear_history":true,"allow_force_pushes":false,"allow_deletions":false,"required_conversation_resolution":true}
JSON
}

set_environment_variable() {
  local environment="$1" name="$2" value="$3"
  gh api --method POST -H "Accept: application/vnd.github+json" "repositories/$REPOSITORY_ID/environments/$environment/variables" -f name="$name" -f value="$value" >/dev/null 2>&1 \
    || gh api --method PATCH -H "Accept: application/vnd.github+json" "repositories/$REPOSITORY_ID/environments/$environment/variables/$name" -f name="$name" -f value="$value" >/dev/null
}

# Preserve unrelated OIDC configuration. An incompatible template is reported and
# must be reviewed because replacing it can break other repository integrations.
claims='["repository_id","repository_owner_id","ref","context","job_workflow_ref"]'
existing="$(gh api "repos/$REPOSITORY/actions/oidc/customization/sub" --jq '.include_claim_keys // [] | @json')"
if [[ "$existing" != "[]" && "$existing" != "$claims" ]]; then
  echo "The repository has an incompatible OIDC subject template: $existing" >&2
  exit 1
fi
if [[ "$existing" == "[]" ]]; then
  gh api --method PUT "repos/$REPOSITORY/actions/oidc/customization/sub" --input - <<JSON
{"use_default":false,"include_claim_keys":$claims}
JSON
fi

for environment in _shared _staging _prod; do
  gh api --method PUT "repos/$REPOSITORY/environments/$environment" --input - <<'JSON' >/dev/null
{"deployment_branch_policy":{"protected_branches":true,"custom_branch_policies":false}}
JSON
done

bootstrap_json="$(terraform -chdir="$DEPLOY_ROOT/infra/terraform/bootstrap" output -json)"
for stack in shared staging prod; do
  environment="_$stack"
  set_environment_variable "$environment" AWS_ACCOUNT_ID "$AWS_ACCOUNT_ID"
  set_environment_variable "$environment" STATE_BUCKET "$STATE_BUCKET"
  set_environment_variable "$environment" OPERATIONS_BUCKET "$OPERATIONS_BUCKET"
  roles=(plan apply); [[ "$stack" == "shared" ]] || roles+=(release maintenance)
  for role in "${roles[@]}"; do
    role_key="$stack-$role"
    role_arn="$(jq -r --arg key "$role_key" '.roles.value[$key]' <<<"$bootstrap_json")"
    set_environment_variable "$environment" "AWS_${role^^}_ROLE_ARN" "$role_arn"
  done
  if [[ "$stack" != "shared" ]] && aws s3api head-object --bucket "$STATE_BUCKET" --key "$PROJECT/$stack.tfstate" >/dev/null 2>&1; then
    init_stack "$stack"
    repository_url="$(terraform -chdir="$(stack_dir "$stack")" output -json deployment | jq -r .repository_url)"
    set_environment_variable "$environment" ECR_REPOSITORY_URL "$repository_url"
  fi
done

for branch in master _staging _prod; do
  if gh api "repos/$REPOSITORY/branches/$branch" >/dev/null 2>&1; then branch_protection "$branch"; fi
done
echo "GitHub environments, variables, branch protections, and the OIDC subject template are configured."
