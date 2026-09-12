#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"

install_tools() {
  local tool_dir="$DEPLOY_ROOT/.deploy/tools" terraform_version=1.11.4 gh_version=2.78.0
  mkdir -p "$tool_dir/bin"
  if [[ ! -x "$tool_dir/bin/terraform" ]]; then
    curl -fsSLo "$tool_dir/terraform.zip" "https://releases.hashicorp.com/terraform/$terraform_version/terraform_${terraform_version}_linux_amd64.zip"
    curl -fsSLo "$tool_dir/SHA256SUMS" "https://releases.hashicorp.com/terraform/$terraform_version/terraform_${terraform_version}_SHA256SUMS"
    (cd "$tool_dir" && grep "terraform_${terraform_version}_linux_amd64.zip" SHA256SUMS | sha256sum -c - && unzip -o terraform.zip -d bin)
  fi
  if [[ ! -x "$tool_dir/bin/gh" ]]; then
    curl -fsSLo "$tool_dir/gh.tar.gz" "https://github.com/cli/cli/releases/download/v$gh_version/gh_${gh_version}_linux_amd64.tar.gz"
    curl -fsSLo "$tool_dir/gh_checksums.txt" "https://github.com/cli/cli/releases/download/v$gh_version/gh_${gh_version}_checksums.txt"
    (cd "$tool_dir" && grep "gh_${gh_version}_linux_amd64.tar.gz" gh_checksums.txt | sha256sum -c - && tar -xzf gh.tar.gz && cp "gh_${gh_version}_linux_amd64/bin/gh" bin/gh)
  fi
  export PATH="$tool_dir/bin:$PATH"
}

command="${1:-status}"; stack="${2:-}"
install_tools
load_config
verify_identity

case "$command" in
  status)
    aws sts get-caller-identity
    gh auth status
    if [[ -n "${OPERATIONS_BUCKET:-}" ]]; then
      "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" status
      aws s3 cp "s3://$OPERATIONS_BUCKET/setup/status.json" - 2>/dev/null || echo '{"setup":"not-finalized"}'
    fi
    ;;
  setup)
    gh auth status >/dev/null 2>&1 || gh auth login --web --git-protocol https
    [[ "$(gh api "repos/$REPOSITORY" --jq .permissions.admin)" == "true" ]] || { echo "GitHub repository administration is required." >&2; exit 1; }
    prepare_bootstrap_inputs
    if [[ -z "${STATE_BUCKET:-}" || -z "${OPERATIONS_BUCKET:-}" ]]; then
      "$0" plan bootstrap
      echo "Review the bootstrap plan, then run: $0 apply bootstrap"
      exit 0
    fi
    "$DEPLOY_ROOT/scripts/deploy/configure-github.sh"
    "$DEPLOY_ROOT/scripts/deploy/configuration-pr.sh"
    echo "Bootstrap and GitHub are configured. Apply shared, staging, and prod, store secrets, complete Atlas checks, merge the configuration PR, then run deploy.sh finalize."
    ;;
  finalize)
    "$DEPLOY_ROOT/scripts/deploy/finalize-setup.sh"
    ;;
  plan)
    [[ -n "$stack" ]] || { echo "Usage: deploy.sh plan STACK" >&2; exit 2; }
    init_stack "$stack"; directory="$(stack_dir "$stack")"; mkdir -p "$DEPLOY_ROOT/.deploy/plans"
    mapfile -t variables < <(terraform_args "$stack")
    terraform -chdir="$directory" plan -input=false -lock-timeout=5m "${variables[@]}" -out="$DEPLOY_ROOT/.deploy/plans/$stack.tfplan"
    terraform -chdir="$directory" show -json "$DEPLOY_ROOT/.deploy/plans/$stack.tfplan" > "$DEPLOY_ROOT/.deploy/plans/$stack.tfplan.json"
    "$DEPLOY_ROOT/scripts/deploy/validate-plan.sh" "$DEPLOY_ROOT/.deploy/plans/$stack.tfplan.json" "$stack"
    ;;
  apply)
    [[ -f "$DEPLOY_ROOT/.deploy/plans/$stack.tfplan" ]] || { echo "Create and review the saved plan first." >&2; exit 1; }
    acquired_lock=false
    if [[ "$stack" != "bootstrap" && "${LOCK_HELD:-false}" != "true" ]]; then OPERATION="terraform-apply-$stack" ENVIRONMENT="$stack" "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" acquire; acquired_lock=true; fi
    trap 'echo "Operation lock retained for inspection; use Maintenance/Resume after resolving the failure." >&2' ERR
    terraform -chdir="$(stack_dir "$stack")" apply -input=false "$DEPLOY_ROOT/.deploy/plans/$stack.tfplan"
    if [[ "$stack" == "bootstrap" && ! -f "$DEPLOY_ROOT/infra/terraform/bootstrap/backend.generated.tf" ]]; then
      state_bucket="$(terraform -chdir="$DEPLOY_ROOT/infra/terraform/bootstrap" output -raw state_bucket)"
      operations_bucket="$(terraform -chdir="$DEPLOY_ROOT/infra/terraform/bootstrap" output -raw operations_bucket)"
      printf 'terraform { backend "s3" {} }\n' > "$DEPLOY_ROOT/infra/terraform/bootstrap/backend.generated.tf"
      terraform -chdir="$DEPLOY_ROOT/infra/terraform/bootstrap" init -input=false -migrate-state -force-copy -backend-config="bucket=$state_bucket" -backend-config="region=$AWS_REGION" -backend-config="key=$PROJECT/bootstrap.tfstate" -backend-config="use_lockfile=true"
      sed -i "s/^STATE_BUCKET=.*/STATE_BUCKET=$state_bucket/;s/^OPERATIONS_BUCKET=.*/OPERATIONS_BUCKET=$operations_bucket/" "$DEPLOY_CONFIG"
      aws s3 cp "$DEPLOY_ROOT/infra/terraform/bootstrap/bootstrap.auto.tfvars.json" "s3://$operations_bucket/setup/bootstrap-inputs.json" >/dev/null
    fi
    if [[ "$acquired_lock" == "true" ]]; then "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" release; fi
    trap - ERR
    ;;
  secrets)
    [[ "$stack" == "staging" || "$stack" == "prod" ]] || { echo "Use staging or prod." >&2; exit 2; }
    env_name="$(environment_name "$stack")"
    for secret in OPENAI_API_KEY MONGODB_URI ACCESS_GATE_PASSWORD; do
      read -rsp "Value for $env_name $secret: " secret_value; echo
      printf '%s' "$secret_value" | aws secretsmanager put-secret-value --secret-id "$PROJECT/$stack/$secret" --secret-string file:///dev/stdin >/dev/null
      unset secret_value
    done
    ;;
  *) echo "Usage: deploy.sh setup|finalize|status|plan STACK|apply STACK|secrets ENV" >&2; exit 2 ;;
esac
