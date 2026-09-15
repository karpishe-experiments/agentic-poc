#!/usr/bin/env bash
set -euo pipefail
script=scripts/deploy/vps-deployment.sh
workflow=.github/workflows/vps-operation.yml
vps_access=.github/actions/vps-access/action.yml
if grep -F 'terraform -chdir="$REPO_ROOT/infra/terraform"' "$script" >/dev/null; then
  echo 'Terraform executes inside the read-only repository checkout' >&2
  exit 1
fi
bash "$script" --help >/dev/null
! grep -q 'gh pr create' "$script"
grep -q 'GITHUB_STEP_SUMMARY' "$workflow"
grep -q "grep -E '.*result" "$workflow"
test "$(grep -Fc -- '--retry 4 --retry-all-errors --retry-delay 2' "$vps_access")" = 2
grep -q -- 'curl -fsSL --retry 4 --retry-all-errors --retry-delay 2' "$script"
for summarized_workflow in .github/workflows/deploy.yml .github/workflows/infrastructure.yml .github/workflows/validate.yml; do
  grep -q 'GITHUB_STEP_SUMMARY' "$summarized_workflow"
done
for reusable_caller in .github/workflows/check-deployment.yml .github/workflows/maintenance.yml .github/workflows/reset-staging.yml; do
  grep -q 'uses: ./.github/workflows/vps-operation.yml' "$reusable_caller"
done
grep -q 'organizations/\$owner/settings/billing/budgets' "$script"
grep -q 'will_alert:false' "$script"
grep -q '"\$variables_complete" == true' "$script"
grep -q 'python3 - "\$TEMP_DIR/\$asset" "\$TEMP_DIR/terraform"' "$script"
if grep -q '\<unzip\>' "$script"; then
  echo 'deployment script still requires unzip' >&2
  exit 1
fi
reject() { if bash "$script" "$@" > /dev/null 2>&1; then printf 'unexpected success: %s\n' "$*" >&2; exit 1; fi; }
reject unexpected
reject --action unknown
reject --action deploy --environment prod
reject --action discover-config
reject --action discover-config --zone example.com
reject --action discover-config --write-config infra/config/vps.json
reject --action discover-config --zone invalid --write-config infra/config/vps.json
reject --action discover-config --zone example.com --prod-hostname booklet.other.example --write-config infra/config/vps.json
VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; parse_arguments --action discover-config --zone example.com --prod-hostname example.com --write-config infra/config/vps.json; validate_arguments' _ "$script"
reject --action github-login
reject --action credential-session --apply
reject --action clear-credential-session --apply
reject --action access-check --apply
source_option_check="$(bash -c 'set +e +u +o pipefail; VPS_DEPLOYMENT_LIBRARY_ONLY=true source "$1"; [[ $(set -o | awk "\$1==\"errexit\" {print \$2}") == off && $(set -o | awk "\$1==\"nounset\" {print \$2}") == off && $(set -o | awk "\$1==\"pipefail\" {print \$2}") == off ]]' _ "$script"; printf %s "$?")"
test "$source_option_check" = 0
credential_session_check="$(CLOUDFLARE_API_TOKEN=temporary-cloudflare-token AWS_ACCESS_KEY_ID=0123456789abcdef0123456789abcdef AWS_SECRET_ACCESS_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef GITHUB_ADMIN_TOKEN=temporary-github-token ATLAS_ADMIN_PUBLIC_KEY=temporary-atlas-public ATLAS_ADMIN_PRIVATE_KEY=temporary-atlas-private VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; interactive_terminal() { :; }; main --action credential-session; test "$CLOUDFLARE_API_TOKEN" = temporary-cloudflare-token; test "$TF_VAR_cloudflare_api_token" = temporary-cloudflare-token; clear_credential_session; test -z "${CLOUDFLARE_API_TOKEN:-}"' _ "$script")"
grep -q 'cleared: deployment credentials' <<< "$credential_session_check"
grep -q 'next: bash scripts/deploy/vps-deployment.sh --action access-check' <<< "$credential_session_check"
if ! CLOUDFLARE_API_TOKEN=temporary-cloudflare-token AWS_ACCESS_KEY_ID=0123456789abcdef0123456789abcdef AWS_SECRET_ACCESS_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef GITHUB_ADMIN_TOKEN=temporary-github-token ATLAS_ADMIN_PUBLIC_KEY=temporary-atlas-public ATLAS_ADMIN_PRIVATE_KEY=temporary-atlas-private VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'set -e; source "$1"; interactive_terminal() { :; }; main --action credential-session; set -o | grep -Eq "^errexit[[:space:]]+off$"; false; clear_credential_session; set -o | grep -Eq "^errexit[[:space:]]+on$"' _ "$script" > /dev/null; then
  echo 'credential-session did not suppress and restore errexit' >&2
  exit 1
fi
trace_output="$(CLOUDFLARE_API_TOKEN=temporary-cloudflare-token AWS_ACCESS_KEY_ID=0123456789abcdef0123456789abcdef AWS_SECRET_ACCESS_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef GITHUB_ADMIN_TOKEN=temporary-github-token ATLAS_ADMIN_PUBLIC_KEY=temporary-atlas-public ATLAS_ADMIN_PRIVATE_KEY=temporary-atlas-private VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; interactive_terminal() { :; }; set -x; start_credential_session; set +x' _ "$script" 2>&1)"
if grep -q 'temporary-.*-token\|0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\|temporary-atlas-private' <<< "$trace_output"; then
  echo 'credential-session leaked a secret through shell tracing' >&2
  exit 1
fi
github_token_check="$(GITHUB_ADMIN_TOKEN=temporary-github-token VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; load_github_admin_token; printf %s "$GH_TOKEN"' _ "$script")"
test "$github_token_check" = temporary-github-token
cloudflare_token_check="$(CLOUDFLARE_API_TOKEN=temporary-cloudflare-token VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; load_cloudflare_api_token; printf "%s:%s" "$CLOUDFLARE_API_TOKEN" "$TF_VAR_cloudflare_api_token"' _ "$script")"
test "$cloudflare_token_check" = temporary-cloudflare-token:temporary-cloudflare-token
r2_token_check="$(AWS_ACCESS_KEY_ID=0123456789abcdef0123456789abcdef AWS_SECRET_ACCESS_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; load_r2_state_credentials; printf "%s:%s" "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY"' _ "$script")"
test "$r2_token_check" = 0123456789abcdef0123456789abcdef:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
if AWS_ACCESS_KEY_ID=temporary-cloudflare-api-token AWS_SECRET_ACCESS_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; load_r2_state_credentials' _ "$script" </dev/null > /dev/null 2>&1; then
  echo 'accepted a non-R2 access key ID' >&2
  exit 1
fi
atlas_token_check="$(ATLAS_ADMIN_PUBLIC_KEY=temporary-atlas-public ATLAS_ADMIN_PRIVATE_KEY=temporary-atlas-private VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; load_atlas_admin_credentials; printf "%s:%s" "$ATLAS_PUBLIC_KEY" "$ATLAS_PRIVATE_KEY"' _ "$script")"
test "$atlas_token_check" = temporary-atlas-public:temporary-atlas-private
atlas_handoff_check="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"
plan_atlas_configuration() { printf plan; }
report_atlas_plan() { printf report; }
apply_atlas_plan() { printf apply; }
APPLY=false; configure_atlas
APPLY=true; configure_atlas' _ "$script")"
test "$atlas_handoff_check" = planreportapply
if command -v jq >/dev/null; then
atlas_recovery_role_check="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"
TEMP_DIR="$(mktemp -d)"; STATE="$TEMP_DIR/state"; mkdir -p "$STATE"
CONFIG_FILE="$TEMP_DIR/config.json"
jq -n "{atlas_project_id:\"aaaaaaaaaaaaaaaaaaaaaaaa\",atlas_cluster_name:\"kids-booklet\"}" > "$CONFIG_FILE"
curl() { printf "51.195.218.185"; }
atlas_request() {
  case "$2" in
    *accessList*) printf "{\"results\":[{\"ipAddress\":\"51.195.218.185\"}]}" ;;
    *clusters/*) printf "{\"connectionStrings\":{\"standardSrv\":\"mongodb+srv://kids-booklet.example\"}}" ;;
    *databaseUsers*) printf "{\"results\":[{\"username\":\"kids_booklet_staging\",\"databaseName\":\"admin\",\"roles\":[{\"databaseName\":\"kids_booklet\",\"roleName\":\"readWrite\"}],\"scopes\":[{\"type\":\"CLUSTER\",\"name\":\"kids-booklet\"}]},{\"username\":\"kids_booklet_prod\",\"databaseName\":\"admin\",\"roles\":[{\"databaseName\":\"kids_booklet_prod\",\"roleName\":\"readWrite\"}],\"scopes\":[{\"type\":\"CLUSTER\",\"name\":\"kids-booklet\"}]}]}" ;;
    *) return 1 ;;
  esac > "$TEMP_DIR/atlas-response.json"
  ATLAS_RESPONSE="$TEMP_DIR/atlas-response.json"
}
plan_atlas_configuration
jq -e ".access_action == \"exists\" and .users.staging.action == \"update\" and .users.prod.action == \"update\"" "$ATLAS_PLAN_FILE" >/dev/null
rm -rf "$TEMP_DIR"' _ "$script")"
test -z "$atlas_recovery_role_check"
grep -q 'roleName:"dbAdmin"' "$script"
grep -q 'atlas_request PATCH "groups/\$project/databaseUsers/admin/\$username"' "$script"
else
  printf '%s\n' 'skipped: Atlas recovery-role fixture requires jq'
fi
backend_root="$(mktemp -d)"
printf 'terraform { backend "s3" {} }\n' > "$backend_root/backend.generated.tf"
backend_repair_output="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; repair_generated_s3_backend_block "$2"' _ "$script" "$backend_root/backend.generated.tf")"
grep -q 'updated: repaired interrupted bootstrap backend configuration' <<< "$backend_repair_output"
test "$(cat "$backend_root/backend.generated.tf")" = $'terraform {\n  backend "s3" {}\n}'
[[ "$(stat -c %a "$backend_root/backend.generated.tf")" == 600 ]] || [[ "$(uname -s)" == MINGW* ]]
mkdir -p "$backend_root/bootstrap"
printf 'terraform { backend "s3" {} }\n' > "$backend_root/bootstrap/backend.generated.tf"
printf '%s\n' '{"resources":[]}' > "$backend_root/bootstrap/terraform.tfstate"
cp "$backend_root/bootstrap/terraform.tfstate" "$backend_root/bootstrap/local-state.backup"
VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; STATE="$2"; TF_VAR_cloudflare_account_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; R2_STATE_BUCKET=kids-booklet-terraform-state; jq() { return 0; }; interrupted_bootstrap_state_is_resumable' _ "$script" "$backend_root"
printf '%s\n' changed > "$backend_root/bootstrap/local-state.backup"
set +e
resume_drift_output="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; STATE="$2"; TF_VAR_cloudflare_account_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; R2_STATE_BUCKET=kids-booklet-terraform-state; jq() { return 0; }; interrupted_bootstrap_state_is_resumable' _ "$script" "$backend_root" 2>&1)"
resume_drift_status=$?
set -e
test "$resume_drift_status" -ne 0
grep -q 'Interrupted bootstrap local state differs from its backup' <<< "$resume_drift_output"
rm -f "$backend_root/bootstrap/backend.generated.tf" "$backend_root/bootstrap/terraform.tfstate" "$backend_root/bootstrap/local-state.backup"
rmdir "$backend_root/bootstrap"
printf 'terraform {\n  backend "s3" {}\n}\n' > "$backend_root/backend.generated.tf"
VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; repair_generated_s3_backend_block "$2"' _ "$script" "$backend_root/backend.generated.tf"
printf 'terraform {\n  backend "local" {}\n}\n' > "$backend_root/backend.generated.tf"
set +e
reject_backend_drift_output="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; repair_generated_s3_backend_block "$2"' _ "$script" "$backend_root/backend.generated.tf" 2>&1)"
reject_backend_drift_status=$?
set -e
test "$reject_backend_drift_status" -ne 0
grep -q 'Generated bootstrap backend configuration contains incompatible drift' <<< "$reject_backend_drift_output"
rm -f "$backend_root/backend.generated.tf"
rmdir "$backend_root"
apply_atlas_block="$(sed -n '/^apply_atlas_plan()/,/^}/p' "$script")"
if grep -q 'atlas_request GET' <<< "$apply_atlas_block"; then
  echo 'Atlas apply performs a redundant discovery request' >&2
  exit 1
fi
access_check_output="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"
load_config() { :; }
load_terraform_configuration() { TF_VAR_cloudflare_account_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; R2_STATE_BUCKET=kids-booklet-terraform-state; R2_ENDPOINT=https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com; }
need_command() { :; }
load_cloudflare_api_token() { :; }
verify_cloudflare_token() { printf "verified: Cloudflare token\\n"; }
verify_cloudflare_token_permissions() { printf "verified: Cloudflare write permissions\\n"; }
verify_cloudflare_zero_trust() { printf "verified: Cloudflare Access\\n"; }
load_r2_state_credentials() { :; }
verify_r2_state_access() { printf "verified: R2 credentials\\n"; }
load_atlas_admin_credentials() { :; }
atlas_request() { printf "atlas: %s %s\\n" "$1" "$2"; }
github_get() { GITHUB_RESPONSE=/dev/null; printf "github: %s\\n" "$1"; }
jq() { case "$*" in *atlas_project_id*) printf "%s\\n" 6a869d84e65675f845fa22eb;; *.repository*) printf "%s\\n" karpishe-experiments/agentic-poc;; *.permissions.admin*) return 0;; esac; }
access_check' _ "$script")"
grep -q 'verified: Cloudflare token' <<< "$access_check_output"
grep -q 'verified: Cloudflare write permissions' <<< "$access_check_output"
grep -q 'verified: R2 credentials' <<< "$access_check_output"
grep -q 'atlas: GET groups/6a869d84e65675f845fa22eb/accessList?itemsPerPage=1' <<< "$access_check_output"
grep -q 'atlas: GET groups/6a869d84e65675f845fa22eb/apiKeys?itemsPerPage=100' <<< "$access_check_output"
grep -q 'verified: Atlas temporary API key has Project Owner access' <<< "$access_check_output"
grep -q 'github: organizations/karpishe-experiments/settings/billing/budgets?per_page=1' <<< "$access_check_output"
grep -q 'verified: GitHub repository administration and billing API' <<< "$access_check_output"
set +e
atlas_role_failure_output="$(ATLAS_PUBLIC_KEY=temporary-atlas-public VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"
atlas_request() { ATLAS_RESPONSE=/dev/null; }
jq() { return 1; }
verify_atlas_admin_access 6a869d84e65675f845fa22eb' _ "$script" 2>&1)"
atlas_role_failure_status=$?
set -e
test "$atlas_role_failure_status" -ne 0
grep -q 'Atlas temporary API key must have Project Owner access' <<< "$atlas_role_failure_output"
set +e
atlas_method_error_output="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"
TEMP_DIR="$(mktemp -d)"
ATLAS_PUBLIC_KEY=temporary-atlas-public
ATLAS_PRIVATE_KEY=temporary-atlas-private
curl() { local output=""; while [[ $# -gt 0 ]]; do case "$1" in --output) output="$2"; shift 2;; *) shift;; esac; done; printf "%s" "{}" > "$output"; printf 401; }
jq() { printf "%s" UNAUTHORIZED; }
atlas_request POST groups/6a869d84e65675f845fa22eb/accessList' _ "$script" 2>&1)"
atlas_method_error_status=$?
set -e
test "$atlas_method_error_status" -ne 0
grep -q 'Atlas POST request failed for groups/6a869d84e65675f845fa22eb/accessList (HTTP 401; UNAUTHORIZED)' <<< "$atlas_method_error_output"
set +e
r2_error_output="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"
TEMP_DIR="$(mktemp -d)"
R2_ENDPOINT=https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com
R2_STATE_BUCKET=kids-booklet-terraform-state
AWS_ACCESS_KEY_ID=0123456789abcdef0123456789abcdef
AWS_SECRET_ACCESS_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
curl() { local output=""; while [[ $# -gt 0 ]]; do case "$1" in --output) output="$2"; shift 2;; *) shift;; esac; done; printf "%s" "<Error><Code>InvalidAccessKeyId</Code><Message>Access key is invalid</Message></Error>" > "$output"; printf 400; }
verify_r2_state_access' _ "$script" 2>&1)"
r2_error_status=$?
set -e
test "$r2_error_status" -ne 0
grep -q 'R2 Terraform state credential check failed (HTTP 400; InvalidAccessKeyId: Access key is invalid)' <<< "$r2_error_output"
if grep -q '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' <<< "$r2_error_output"; then echo 'R2 secret leaked through access-check error' >&2; exit 1; fi
set +e
access_check_failure_output="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"
load_config() { :; }
need_command() { :; }
access_check_cloudflare() { printf "verified: Cloudflare\\n"; }
access_check_r2() { die "R2 access denied"; }
access_check_atlas() { die "Atlas access denied"; }
access_check_github() { printf "verified: GitHub\\n"; }
access_check' _ "$script" 2>&1)"
access_check_failure_status=$?
set -e
test "$access_check_failure_status" -ne 0
grep -q 'failed: R2 access check; continuing' <<< "$access_check_failure_output"
grep -q 'failed: Atlas access check; continuing' <<< "$access_check_failure_output"
grep -q 'passed: GitHub access check' <<< "$access_check_failure_output"
grep -q 'Access check found 2 failure(s); no changes were made' <<< "$access_check_failure_output"
set +e
zero_trust_missing_output="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; cloudflare_get() { CF_STATUS=404; }; verify_cloudflare_zero_trust aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' _ "$script" 2>&1)"
zero_trust_missing_status=$?
set -e
test "$zero_trust_missing_status" -ne 0
grep -q 'Cloudflare Zero Trust is not enrolled' <<< "$zero_trust_missing_output"
set +e
cloudflare_permission_failure_output="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"
CLOUDFLARE_TOKEN_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
cloudflare_get() { CF_RESPONSE=/dev/null; }
cloudflare_policy_allows() { [[ "$1" != *"DNS Write"* ]]; }
verify_cloudflare_token_permissions aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' _ "$script" 2>&1)"
cloudflare_permission_failure_status=$?
set -e
test "$cloudflare_permission_failure_status" -ne 0
grep -q 'lacks required permissions.*DNS Write' <<< "$cloudflare_permission_failure_output"
if grep -q 'Cache Settings Write' <<< "$cloudflare_permission_failure_output"; then echo 'Cloudflare permission check reported a permission that passed' >&2; exit 1; fi
if VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; source "$1"; load_r2_state_credentials' _ "$script" </dev/null > /dev/null 2>&1; then
  echo 'accepted missing noninteractive R2 state credentials' >&2
  exit 1
fi
reject --action check --environment staging --apply
reject --action repair-first-activation-secrets
reject --action repair-first-activation-secrets --environment staging --secret-name INVALID
reject --action status --secret-name ACCESS_GATE_PASSWORD
reject --action status --generate-password
reject --action repair-first-activation-secrets --environment staging --secret-name OPENAI_API_KEY --generate-password
reject --action repair-first-activation-secrets --environment staging --generate-password --apply
preview_single_rotation="$(bash "$script" --action rotate-secrets --environment staging --secret-name OPENAI_API_KEY --vps-host vps.example)"
grep -q 'would update: staged staging secrets' <<< "$preview_single_rotation"
preview_repair="$(bash "$script" --action repair-first-activation-secrets --environment staging --vps-host vps.example)"
grep -q 'would update: staging failed first-activation secrets' <<< "$preview_repair"
preview_single_repair="$(bash "$script" --action repair-first-activation-secrets --environment staging --secret-name ACCESS_GATE_PASSWORD --vps-host vps.example)"
grep -q 'would update: staging failed first-activation secrets' <<< "$preview_single_repair"
reject --action reset-staging --environment prod --confirmation kids_booklet
reject --action restore --environment staging --backup-id 'bad;id' --confirmation kids_booklet
reject --action restore --environment staging --backup-id valid --confirmation kids_booklet_prod
reject --action deploy --environment staging --environment prod
reject --action status --vps-host 'host;id'
root="$(mktemp -d)"; trap 'rm -rf "$root"' EXIT
mkdir -p "$root/bin"
cat > "$root/bin/curl" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
output=''
url=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) output="$2"; shift 2;;
    *) url="$1"; shift;;
  esac
done
printf '%s\n' '{"success":true,"result":{"id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","status":"active"}}' > "$output"
printf '%s\n' "$url" >> "$CURL_LOG"
printf '200'
STUB
cat > "$root/bin/ssh" <<'STUB'
#!/usr/bin/env bash
for argument in "$@"; do
  [[ "$argument" != --* ]] || { printf 'OpenSSH rejected option-like remote command: %s\n' "$argument" >&2; exit 88; }
done
printf '%s\n' "$*" >> "$SSH_LOG"
exit "${SSH_EXIT:-0}"
STUB
cat > "$root/bin/cloudflared" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
chmod 700 "$root/bin/curl" "$root/bin/ssh" "$root/bin/cloudflared"
export PATH="$root/bin:$PATH" SSH_LOG="$root/ssh.log" CURL_LOG="$root/curl.log" CF_ACCESS_CLIENT_ID=test CF_ACCESS_CLIENT_SECRET=never-print-me
token_check="$(CLOUDFLARE_API_TOKEN=never-print-me VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; verify_cloudflare_token aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' _ "$script")"
grep -q 'verified: Cloudflare API token metadata ID aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' <<< "$token_check"
if grep -q 'never-print-me' <<< "$token_check"; then echo 'Cloudflare API token leaked' >&2; exit 1; fi
grep -q '/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/tokens/verify$' "$CURL_LOG"
zero_trust_check="$(CLOUDFLARE_API_TOKEN=never-print-me VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; verify_cloudflare_zero_trust aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' _ "$script")"
grep -q 'verified: Cloudflare Zero Trust organization and Access application API' <<< "$zero_trust_check"
grep -q '/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/access/organizations$' "$CURL_LOG"
grep -q '/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/access/apps$' "$CURL_LOG"
if grep -q 'never-print-me' <<< "$zero_trust_check"; then echo 'Cloudflare API token leaked during Zero Trust verification' >&2; exit 1; fi
digest=ghcr.io/example/kids@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
commit=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
bash "$script" --action deploy --environment staging --image-digest "$digest" --commit "$commit" --config "$root/not-required-for-client.json" --vps-user alternate --vps-host vps.example > "$root/output"
test ! -s "$SSH_LOG"
grep -q 'would update: deploy staging' "$root/output"
export SSH_EXIT=42
set +e
bash "$script" --action deploy --environment staging --image-digest "$digest" --commit "$commit" --vps-host vps.example --apply > "$root/output" 2>&1
result=$?
set -e
test "$result" = 42
grep -q 'ProxyCommand=cloudflared access ssh' "$SSH_LOG"
if grep -q 'never-print-me' "$SSH_LOG" "$root/output"; then echo 'Access credential leaked' >&2; exit 1; fi
export SSH_EXIT=0
bash "$script" --action check --environment staging --vps-host vps.example >/dev/null
printf 'deployment argument, preview, error propagation and SSH transport contracts passed\n'
