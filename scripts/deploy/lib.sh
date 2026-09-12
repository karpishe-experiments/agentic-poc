#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_CONFIG="${DEPLOY_CONFIG:-$DEPLOY_ROOT/infra/config/deployment.env}"

load_config() {
  [[ -f "$DEPLOY_CONFIG" ]] || { echo "Copy infra/config/deployment.env.example to deployment.env and complete it." >&2; return 1; }
  # shellcheck disable=SC1090
  source "$DEPLOY_CONFIG"
  : "${AWS_ACCOUNT_ID:?}" "${AWS_REGION:?}" "${PROJECT:?}" "${REPOSITORY:?}" "${REPOSITORY_ID:?}" "${REPOSITORY_OWNER_ID:?}"
  [[ "$AWS_ACCOUNT_ID" =~ ^[0-9]{12}$ ]] || { echo "AWS_ACCOUNT_ID must contain 12 digits." >&2; return 1; }
}

verify_identity() {
  local actual region
  actual="$(aws sts get-caller-identity --query Account --output text)"
  region="$(aws configure get region || true)"
  [[ "$actual" == "$AWS_ACCOUNT_ID" ]] || { echo "Expected AWS account $AWS_ACCOUNT_ID, received $actual." >&2; return 1; }
  [[ -z "$region" || "$region" == "$AWS_REGION" ]] || { echo "Set the AWS CLI region to $AWS_REGION." >&2; return 1; }
}

prepare_bootstrap_inputs() {
  local file="$DEPLOY_ROOT/infra/terraform/bootstrap/bootstrap.auto.tfvars.json"
  [[ -f "$file" ]] && return
  if [[ -n "${OPERATIONS_BUCKET:-}" ]] && aws s3 cp "s3://$OPERATIONS_BUCKET/setup/bootstrap-inputs.json" "$file" >/dev/null 2>&1; then return; fi
  local oidc_arn=null services=() role service
  while read -r candidate; do
    [[ -n "$candidate" ]] || continue
    if [[ "$(aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$candidate" --query Url --output text 2>/dev/null || true)" == "token.actions.githubusercontent.com" ]]; then oidc_arn="\"$candidate\""; break; fi
  done < <(aws iam list-open-id-connect-providers --query 'OpenIDConnectProviderList[].Arn' --output text | tr '\t' '\n')
  while IFS='|' read -r role service; do
    aws iam get-role --role-name "$role" >/dev/null 2>&1 || services+=("$service")
  done <<'ROLES'
AWSServiceRoleForECS|ecs.amazonaws.com
AWSServiceRoleForElasticLoadBalancing|elasticloadbalancing.amazonaws.com
AWSServiceRoleForCloudFrontVPCOrigin|vpcorigin.cloudfront.amazonaws.com
ROLES
  jq -n --argjson oidc "$oidc_arn" --argjson services "$(printf '%s\n' "${services[@]}" | jq -Rsc 'split("\n") | map(select(length>0))')" '{oidc_provider_arn:$oidc,create_service_linked_roles:$services}' > "$file"
}

stack_dir() {
  case "$1" in bootstrap|shared) printf '%s/infra/terraform/%s' "$DEPLOY_ROOT" "$1" ;; staging|prod) printf '%s/infra/terraform/environment' "$DEPLOY_ROOT" ;; *) echo "Stack must be bootstrap, shared, staging, or prod." >&2; return 1 ;; esac
}

environment_name() { [[ "$1" == "staging" ]] && printf '_staging' || [[ "$1" == "prod" ]] && printf '_prod' || return 1; }

terraform_args() {
  local stack="$1"
  printf '%s\n' "-var=aws_account_id=$AWS_ACCOUNT_ID" "-var=aws_region=$AWS_REGION" "-var=project=$PROJECT"
  if [[ "$stack" == "bootstrap" ]]; then printf '%s\n' "-var=repository=$REPOSITORY" "-var=repository_id=$REPOSITORY_ID" "-var=repository_owner_id=$REPOSITORY_OWNER_ID"; fi
  if [[ "$stack" == "staging" || "$stack" == "prod" ]]; then printf '%s\n' "-var=environment=$stack" "-var=state_bucket=$STATE_BUCKET"; fi
}

init_stack() {
  local stack="$1" directory; directory="$(stack_dir "$stack")"
  if [[ "$stack" == "bootstrap" ]]; then
    if [[ -n "${STATE_BUCKET:-}" ]]; then
      [[ -f "$directory/backend.generated.tf" ]] || printf 'terraform { backend "s3" {} }\n' > "$directory/backend.generated.tf"
      terraform -chdir="$directory" init -input=false -reconfigure -backend-config="bucket=$STATE_BUCKET" -backend-config="region=$AWS_REGION" -backend-config="key=$PROJECT/bootstrap.tfstate" -backend-config="use_lockfile=true"
    else terraform -chdir="$directory" init -input=false
    fi
  else : "${STATE_BUCKET:?Run bootstrap and set STATE_BUCKET first.}"; terraform -chdir="$directory" init -input=false -reconfigure -backend-config="bucket=$STATE_BUCKET" -backend-config="region=$AWS_REGION" -backend-config="key=$PROJECT/$stack.tfstate" -backend-config="use_lockfile=true"; fi
}
