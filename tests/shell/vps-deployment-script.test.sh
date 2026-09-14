#!/usr/bin/env bash
set -euo pipefail
script=scripts/deploy/vps-deployment.sh
bash "$script" --help >/dev/null
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
credential_session_check="$(CLOUDFLARE_API_TOKEN=temporary-cloudflare-token AWS_ACCESS_KEY_ID=temporary-r2-key AWS_SECRET_ACCESS_KEY=temporary-r2-secret GITHUB_ADMIN_TOKEN=temporary-github-token ATLAS_ADMIN_PUBLIC_KEY=temporary-atlas-public ATLAS_ADMIN_PRIVATE_KEY=temporary-atlas-private VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; interactive_terminal() { :; }; main --action credential-session; test "$CLOUDFLARE_API_TOKEN" = temporary-cloudflare-token; test "$TF_VAR_cloudflare_api_token" = temporary-cloudflare-token; clear_credential_session; test -z "${CLOUDFLARE_API_TOKEN:-}"' _ "$script")"
grep -q 'cleared: deployment credentials' <<< "$credential_session_check"
grep -q 'next: bash scripts/deploy/vps-deployment.sh --action access-check' <<< "$credential_session_check"
if ! CLOUDFLARE_API_TOKEN=temporary-cloudflare-token AWS_ACCESS_KEY_ID=temporary-r2-key AWS_SECRET_ACCESS_KEY=temporary-r2-secret GITHUB_ADMIN_TOKEN=temporary-github-token ATLAS_ADMIN_PUBLIC_KEY=temporary-atlas-public ATLAS_ADMIN_PRIVATE_KEY=temporary-atlas-private VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'set -e; source "$1"; interactive_terminal() { :; }; main --action credential-session; set -o | grep -Eq "^errexit[[:space:]]+off$"; false; clear_credential_session; set -o | grep -Eq "^errexit[[:space:]]+on$"' _ "$script" > /dev/null; then
  echo 'credential-session did not suppress and restore errexit' >&2
  exit 1
fi
trace_output="$(CLOUDFLARE_API_TOKEN=temporary-cloudflare-token AWS_ACCESS_KEY_ID=temporary-r2-key AWS_SECRET_ACCESS_KEY=temporary-r2-secret GITHUB_ADMIN_TOKEN=temporary-github-token ATLAS_ADMIN_PUBLIC_KEY=temporary-atlas-public ATLAS_ADMIN_PRIVATE_KEY=temporary-atlas-private VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; interactive_terminal() { :; }; set -x; start_credential_session; set +x' _ "$script" 2>&1)"
if grep -q 'temporary-.*-token\|temporary-r2-secret\|temporary-atlas-private' <<< "$trace_output"; then
  echo 'credential-session leaked a secret through shell tracing' >&2
  exit 1
fi
github_token_check="$(GITHUB_ADMIN_TOKEN=temporary-github-token VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; load_github_admin_token; printf %s "$GH_TOKEN"' _ "$script")"
test "$github_token_check" = temporary-github-token
cloudflare_token_check="$(CLOUDFLARE_API_TOKEN=temporary-cloudflare-token VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; load_cloudflare_api_token; printf "%s:%s" "$CLOUDFLARE_API_TOKEN" "$TF_VAR_cloudflare_api_token"' _ "$script")"
test "$cloudflare_token_check" = temporary-cloudflare-token:temporary-cloudflare-token
r2_token_check="$(AWS_ACCESS_KEY_ID=temporary-r2-key AWS_SECRET_ACCESS_KEY=temporary-r2-secret VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; load_r2_state_credentials; printf "%s:%s" "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY"' _ "$script")"
test "$r2_token_check" = temporary-r2-key:temporary-r2-secret
atlas_token_check="$(ATLAS_ADMIN_PUBLIC_KEY=temporary-atlas-public ATLAS_ADMIN_PRIVATE_KEY=temporary-atlas-private VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; load_atlas_admin_credentials; printf "%s:%s" "$ATLAS_PUBLIC_KEY" "$ATLAS_PRIVATE_KEY"' _ "$script")"
test "$atlas_token_check" = temporary-atlas-public:temporary-atlas-private
access_check_output="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"
load_config() { :; }
load_terraform_configuration() { TF_VAR_cloudflare_account_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; R2_STATE_BUCKET=kids-booklet-terraform-state; R2_ENDPOINT=https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com; }
need_command() { :; }
load_cloudflare_api_token() { :; }
verify_cloudflare_token() { printf "verified: Cloudflare token\\n"; }
verify_cloudflare_zero_trust() { printf "verified: Cloudflare Access\\n"; }
load_r2_state_credentials() { :; }
verify_r2_state_access() { printf "verified: R2 credentials\\n"; }
load_atlas_admin_credentials() { :; }
atlas_request() { printf "atlas: %s %s\\n" "$1" "$2"; }
github_get() { GITHUB_RESPONSE=/dev/null; printf "github: %s\\n" "$1"; }
jq() { case "$*" in *atlas_project_id*) printf "%s\\n" 6a869d84e65675f845fa22eb;; *.repository*) printf "%s\\n" karpishe-experiments/agentic-poc;; *.permissions.admin*) return 0;; esac; }
access_check' _ "$script")"
grep -q 'verified: Cloudflare token' <<< "$access_check_output"
grep -q 'verified: R2 credentials' <<< "$access_check_output"
grep -q 'atlas: GET groups/6a869d84e65675f845fa22eb/accessList?itemsPerPage=1' <<< "$access_check_output"
grep -q 'github: organizations/karpishe-experiments/settings/billing/budgets?per_page=1' <<< "$access_check_output"
grep -q 'verified: GitHub repository administration and billing API' <<< "$access_check_output"
set +e
zero_trust_missing_output="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; cloudflare_get() { CF_STATUS=404; }; verify_cloudflare_zero_trust aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' _ "$script" 2>&1)"
zero_trust_missing_status=$?
set -e
test "$zero_trust_missing_status" -ne 0
grep -q 'Cloudflare Zero Trust is not enrolled' <<< "$zero_trust_missing_output"
if VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; source "$1"; load_r2_state_credentials' _ "$script" </dev/null > /dev/null 2>&1; then
  echo 'accepted missing noninteractive R2 state credentials' >&2
  exit 1
fi
reject --action check --environment staging --apply
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
