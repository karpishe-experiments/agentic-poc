#!/usr/bin/env bash
set -euo pipefail
script=scripts/deploy/vps-deployment.sh
grep -Fq '"$ACTION" != dify-repair-broker && "$ACTION" != dify-repair-collaboration ]]; then' "$script"
grep -Fq 'values["CELERY_BROKER_URL"] = f"redis://:{values['"'"'REDIS_PASSWORD'"'"']}@redis:6379/1"' "$script"
broker_fixture="$(mktemp -d)"
VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
source "$1"
DIFY_ENV="$2/runtime.env"
password="$(printf "%064d" 0)"
printf "REDIS_PASSWORD=%s\nCELERY_BROKER_URL=redis://:difyai123456@redis:6379/1\n" "$password" > "$DIFY_ENV"
chmod 600 "$DIFY_ENV"
[[ "$(dify_broker_environment preview)" == "would update: Dify Celery broker credential" ]]
grep -Fxq "CELERY_BROKER_URL=redis://:difyai123456@redis:6379/1" "$DIFY_ENV"
dify_broker_environment apply >/dev/null
grep -Fxq "CELERY_BROKER_URL=redis://:$password@redis:6379/1" "$DIFY_ENV"
[[ "$(dify_broker_environment apply)" == "exists: Dify Celery broker credential matches Redis" ]]
printf "REDIS_PASSWORD=%s\nCELERY_BROKER_URL=redis://:other@redis:6379/1\n" "$password" > "$2/unknown.env"
chmod 600 "$2/unknown.env"
DIFY_ENV="$2/unknown.env"
if dify_broker_environment apply >/dev/null 2>&1; then
  echo "accepted an unknown broker credential" >&2
  exit 1
fi
' _ "$script" "$broker_fixture"
rm -rf "$broker_fixture"
broker_operation_fixture="$(mktemp -d)"
VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
source "$1"
DIFY_DATA="$2"; mkdir -p "$DIFY_DATA"; printf "1.17.1\n" > "$DIFY_DATA/current"
dify_idle_host() { printf "idle\n" >> "$DIFY_DATA/events"; }
dify_broker_environment() {
  if [[ "$1" == preview ]]; then printf "would update: Dify Celery broker credential\n";
  else printf "repaired\n" >> "$DIFY_DATA/events"; fi
}
set_step() { printf "step:%s\n" "$1" >> "$DIFY_DATA/events"; }
dify_compose() { printf "compose:%s\n" "$*" >> "$DIFY_DATA/events"; }
dify_verify_services() { printf "ready\n" >> "$DIFY_DATA/events"; }
dify_api_broker_authenticates() { printf "authenticated\n" >> "$DIFY_DATA/events"; }
save_success() { printf "complete\n" >> "$DIFY_DATA/events"; }
dify_repair_broker_host >/dev/null
grep -Fxq "compose:up -d --no-deps --force-recreate api worker worker_beat" "$DIFY_DATA/events"
grep -Fxq authenticated "$DIFY_DATA/events"
grep -Fxq complete "$DIFY_DATA/events"
' _ "$script" "$broker_operation_fixture"
rm -rf "$broker_operation_fixture"
collaboration_fixture="$(mktemp -d)"
VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
source "$1"
DIFY_DATA="$2"; printf "1.17.1\n" > "$DIFY_DATA/current"
dify_install_preflight() { printf "preflight\n" >> "$DIFY_DATA/events"; }
dify_validate_compose() { printf "validated\n" >> "$DIFY_DATA/events"; }
dify_idle_host() { printf "idle\n" >> "$DIFY_DATA/events"; }
dify_collaboration_is_ready() { [[ -f "$DIFY_DATA/recreated" ]]; }
set_step() { printf "step:%s\n" "$1" >> "$DIFY_DATA/events"; }
dify_compose() { printf "compose:%s\n" "$*" >> "$DIFY_DATA/events"; touch "$DIFY_DATA/recreated"; }
dify_verify_services() { printf "ready\n" >> "$DIFY_DATA/events"; }
save_success() { printf "complete\n" >> "$DIFY_DATA/events"; }
dify_repair_collaboration_host >/dev/null
grep -Fxq "compose:up -d --no-deps --force-recreate api_websocket" "$DIFY_DATA/events"
[[ "$(head -n 3 "$DIFY_DATA/events" | paste -sd,)" == preflight,validated,idle ]]
dify_repair_collaboration_host >/dev/null
[[ "$(grep -c "^compose:" "$DIFY_DATA/events")" == 1 ]]
rm "$DIFY_DATA/recreated"
dify_idle_host() { return 1; }
if (set -e; dify_repair_collaboration_host >/dev/null); then exit 1; fi
[[ "$(grep -c "^compose:" "$DIFY_DATA/events")" == 1 ]]
curl() { printf "0{\"sid\":\"test-session\"}"; }
dify_socket_responds
curl() { printf "<html>not a socket</html>"; }
if dify_socket_responds; then exit 1; fi
curl() { printf "0{}"; }
if dify_socket_responds; then exit 1; fi
curl() { return 28; }
if dify_socket_responds; then exit 1; fi
' _ "$script" "$collaboration_fixture"
rm -rf "$collaboration_fixture"
workflow=.github/workflows/vps-operation.yml
vps_access=.github/actions/vps-access/action.yml
if grep -F 'terraform -chdir="$REPO_ROOT/infra/terraform"' "$script" >/dev/null; then
  echo 'Terraform executes inside the read-only repository checkout' >&2
  exit 1
fi
bash "$script" --help >/dev/null
VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
source "$1"
dify_compose() { printf '\''[{"Service":"api"},{"Service":"web"}]\n'\''; }
[[ "$(dify_service_records | jq -r '\''.[].Service'\'' | paste -sd, -)" == api,web ]]
dify_compose() { printf '\''{"Service":"api"}\n{"Service":"web"}\n'\''; }
[[ "$(dify_service_records | jq -r '\''.[].Service'\'' | paste -sd, -)" == api,web ]]
printf '\''[{"Service":"init_permissions","State":"exited","ExitCode":0},{"Service":"worker_beat","State":"running","Health":""}]\n'\'' | dify_service_records_are_ready
if printf '\''[{"Service":"worker_beat","State":"running","Health":"starting"}]\n'\'' | dify_service_records_are_ready; then
  echo "accepted a service whose healthcheck is still starting" >&2
  exit 1
fi
if printf '\''[{"Service":"worker_beat","State":"exited","ExitCode":1,"Health":""}]\n'\'' | dify_service_records_are_ready; then
  echo "accepted a stopped long-running service" >&2
  exit 1
fi
' _ "$script"
persistent_fixture="$(mktemp -d)"
VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
source "$1"
fixture="$2"
DIFY_DATA="$fixture/data"; DIFY_RELEASE="$fixture/release"
mkdir -p "$DIFY_DATA/sandbox/conf" "$DIFY_DATA/agent/home" "$DIFY_DATA/agent/workspace" "$DIFY_RELEASE/docker/volumes/sandbox/conf"
printf "pinned sandbox config\n" > "$DIFY_RELEASE/docker/volumes/sandbox/conf/config.yaml"
chown() { printf "%s\n" "$*" >> "$fixture/chown-args"; }
dify_prepare_persistent_files
grep -Fxq "pinned sandbox config" "$DIFY_DATA/sandbox/conf/config.yaml"
grep -Fxq -- "-R 1000:1000 $DIFY_DATA/agent/home $DIFY_DATA/agent/workspace" "$fixture/chown-args"
printf "operator-preserved config\n" > "$DIFY_DATA/sandbox/conf/config.yaml"
dify_prepare_persistent_files
grep -Fxq "operator-preserved config" "$DIFY_DATA/sandbox/conf/config.yaml"
rm "$DIFY_DATA/sandbox/conf/config.yaml"
ln -s "$fixture/outside-config" "$DIFY_DATA/sandbox/conf/config.yaml"
if (dify_prepare_persistent_files >/dev/null 2>&1); then
  echo "accepted dangling persistent sandbox configuration symlink" >&2
  exit 1
fi
test ! -e "$fixture/outside-config"
' _ "$script" "$persistent_fixture"
rm -rf "$persistent_fixture"
installation_root="$(mktemp -d)"
VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
source "$1"
DIFY_DATA="$2"; ROOT="$2"
mkdir -p "$ROOT/dify"
printf "{\"images\":{}}" > "$ROOT/dify/release.json"
dify_install_preflight() { :; }
dify_prepare_directories() { :; }
dify_prepare_release() { :; }
dify_prepare_persistent_files() { :; }
dify_prepare_environment() { :; }
dify_validate_compose() { :; }
set_step() { :; }
save_success() { :; }
dify_compose() { printf "started\n" >> "$DIFY_DATA/starts"; }
dify_verify_services() { die "simulated readiness failure"; }
set +e
(set -e; dify_install_host) 2>/dev/null
result=$?
set -e
[[ "$result" != 0 && ! -f "$DIFY_DATA/current" ]]
dify_verify_services() { :; }
dify_install_host
[[ "$(cat "$DIFY_DATA/current")" == 1.17.1 ]]
[[ "$(wc -l < "$DIFY_DATA/starts")" == 2 ]]
dify_install_host
[[ "$(wc -l < "$DIFY_DATA/starts")" == 2 ]]
' _ "$script" "$installation_root"
rm -rf "$installation_root"
! grep -q 'gh pr create' "$script"
grep -q 'GITHUB_STEP_SUMMARY' "$workflow"
grep -q 'grep -E' "$workflow"
grep -q 'result): ' "$workflow"
test "$(grep -Fc -- '--retry 4 --retry-all-errors --retry-delay 2' "$vps_access")" = 2
grep -Fq 'GH_TOKEN: ${{ github.token }}' "$vps_access"
grep -Fq -- '--header "Authorization: Bearer $GH_TOKEN"' "$vps_access"
grep -q -- 'curl -fsSL --retry 4 --retry-all-errors --retry-delay 2' "$script"
for summarized_workflow in .github/workflows/deploy.yml .github/workflows/infrastructure.yml; do
  grep -q 'GITHUB_STEP_SUMMARY' "$summarized_workflow"
done
grep -Fq 'test "$GITHUB_REF_NAME" = master' .github/workflows/dify-tool-key.yml
grep -Fq 'DIFY_TOOL_KEY: ${{ secrets.DIFY_TOOL_KEY }}' .github/workflows/dify-tool-key.yml
grep -Fq 'DIFY_API_KEY: ${{ secrets.DIFY_API_KEY }}' .github/workflows/dify-tool-key.yml
grep -Fq -- '--action rotate-protected-dify-key --environment staging --secret-name "$SECRET_NAME"' .github/workflows/dify-tool-key.yml
grep -Fq 'rotate-protected-dify-key is available only through GitHub Actions' "$script"
GITHUB_ACTIONS=true VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
source "$1"
ACTION=rotate-protected-dify-key; ENVIRONMENT=staging; SECRET_NAME=DIFY_API_KEY; APPLY=true; REQUEST_ID=123-1; VPS_USER=kids-booklet-deploy
validate_arguments
' _ "$script"
for protected_name in DIFY_TOOL_KEY DIFY_API_KEY; do
protected_rotation_root="$(mktemp -d)"
protected_rotation_output="$(GITHUB_ACTIONS=true DIFY_TOOL_KEY='0123456789abcdef0123456789abcdef' DIFY_API_KEY='app-test-secret' VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
source "$1"
TEMP_DIR="$2"; SECRET_NAME="$3"; ENVIRONMENT=staging; APPLY=true; REQUEST_ID=123-1; VPS_HOST=deploy.example
load_config() { :; }
need_command() { :; }
private_temp() { :; }
configure_ssh() { :; }
ssh() { cat > "$TEMP_DIR/staged.json"; printf "updated: staged staging secret rotation\n"; }
host_call() { [[ "$ACTION" == rotate-secrets && -z "$SECRET_NAME" && -z "${DIFY_TOOL_KEY:-}" && -z "${DIFY_API_KEY:-}" ]]; printf "updated: rotation invoked\n"; }
rotate_protected_dify_key
jq -e --arg name "$3" '\''(.services.app.environment | keys)==[$name] and (.services.app.environment[$name]|length>0)'\'' "$TEMP_DIR/staged.json" >/dev/null
' _ "$script" "$protected_rotation_root" "$protected_name")"
grep -q 'updated: staged staging secret rotation' <<< "$protected_rotation_output"
grep -q 'updated: rotation invoked' <<< "$protected_rotation_output"
! grep -q '0123456789abcdef' <<< "$protected_rotation_output"
! grep -q 'app-test-secret' <<< "$protected_rotation_output"
rm -rf "$protected_rotation_root"
done
community_rotation_root="$(mktemp -d)"
community_rotation_output="$(GITHUB_ACTIONS=true DIFY_COMMUNITY_WORKFLOW_API_KEY='community$app-key' DIFY_COMMUNITY_CALLBACK_KEY='0123456789abcdef0123456789abcdef' VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
set -euo pipefail
source "$1"
TEMP_DIR="$2"; ACTION=rotate-protected-dify-key; SECRET_NAME=DIFY_COMMUNITY_PROBE; ENVIRONMENT=staging; APPLY=true; REQUEST_ID=123-1; VPS_HOST=deploy.example; VPS_USER=kids-booklet-deploy
validate_arguments
load_config() { :; }; need_command() { :; }; private_temp() { :; }; configure_ssh() { :; }
ssh() { [[ "$*" == *"--secret-name DIFY_COMMUNITY_PROBE"* ]]; cat > "$TEMP_DIR/staged.json"; }
host_call() { [[ "$ACTION" == rotate-secrets && -z "$SECRET_NAME" && -z "${DIFY_COMMUNITY_WORKFLOW_API_KEY:-}" && -z "${DIFY_COMMUNITY_CALLBACK_KEY:-}" ]]; printf "updated: Community rotation invoked\n"; }
rotate_protected_dify_key
community_probe_patch_is_valid "$TEMP_DIR/staged.json"
jq -e '\''.services.app.environment.DIFY_COMMUNITY_WORKFLOW_API_KEY=="community$$app-key"'\'' "$TEMP_DIR/staged.json" >/dev/null
' _ "$script" "$community_rotation_root")"
grep -q 'updated: Community rotation invoked' <<< "$community_rotation_output"
! grep -q 'community\$app-key' <<< "$community_rotation_output"
! grep -q '0123456789abcdef' <<< "$community_rotation_output"
GITHUB_ACTIONS=true VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
set -euo pipefail
source "$1"
TEMP_DIR="$2"
if (build_community_probe_patch staging "$TEMP_DIR/rejected.json") >/dev/null 2>&1; then echo "accepted missing Community credentials"; exit 1; fi
ENVIRONMENT=prod; SECRET_NAME=DIFY_COMMUNITY_PROBE; ACTION=stage-secrets; VPS_USER=kids-booklet-deploy
if (validate_arguments) >/dev/null 2>&1; then echo "accepted production Community bundle"; exit 1; fi
' _ "$script" "$community_rotation_root"
rm -rf "$community_rotation_root"
grep -Fq 'node scripts/ci/validate.mjs summary' .github/workflows/validate.yml
grep -q 'GITHUB_STEP_SUMMARY' scripts/ci/validate.mjs
grep -Fq 'test "$GITHUB_REF_NAME" = "_$TARGET"' .github/workflows/deploy.yml
test "$(grep -Fc 'commits/$GITHUB_REF_NAME' .github/workflows/deploy.yml)" = 2
! grep -q 'actions/workflows/infrastructure.yml/runs' .github/workflows/deploy.yml
! grep -q 'infrastructure-verified master' .github/workflows/deploy.yml
! grep -q 'VERIFIED_MASTER_SHA' .github/workflows/deploy.yml
! grep -q 'commits/master' .github/workflows/deploy.yml
! grep -q 'compare/.*master_sha' .github/workflows/deploy.yml
grep -q 'REQUEST_ID:.*github.run_id' .github/workflows/infrastructure.yml
grep -q 'retained infrastructure journal' .github/workflows/infrastructure.yml
grep -Fq "inputs.apply && '--apply' || ''" .github/workflows/infrastructure.yml
! grep -Fq "github.event_name == 'push' || inputs.apply" .github/workflows/infrastructure.yml
VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
source "$1"
fixture="$(jq -n '\''{services:{app:{environment:{OPENAI_API_KEY:"test",MONGODB_URI:"mongodb://example",ACCESS_GATE_PASSWORD:"sixteen-characters",AWS_ACCESS_KEY_ID:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",AWS_SECRET_ACCESS_KEY:("a"*64),DIFY_COMMUNITY_PROBE_ENABLED:"true",DIFY_COMMUNITY_BASE_URL:"https://dify.uniwares.co.uk",DIFY_COMMUNITY_WORKFLOW_API_KEY:"test-runtime-key",DIFY_COMMUNITY_CALLBACK_KEY:("b"*32)}}}}'\'')"
fixture_file="$(mktemp)"; trap '\''rm -f "$fixture_file"'\'' EXIT
printf "%s" "$fixture" > "$fixture_file"
application_secret_override_is_valid "$fixture_file"
printf "%s" "$fixture" | jq '\''.services.app.environment.DIFY_COMMUNITY_CALLBACK_KEY="short"'\'' > "$fixture_file"
if application_secret_override_is_valid "$fixture_file"; then
  printf "accepted a short Community callback key\n" >&2; exit 1
fi
' _ "$script"
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
reject --action dify-discover --apply
VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; ACTION=dify-discover; VPS_USER=kids-booklet-deploy; APPLY=false; validate_arguments' _ "$script"
reject --action dify-install --environment staging
reject --action backup --environment dify
reject --action dify-check --environment dify --apply
reject --action dify-idle --environment dify --apply
VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
source "$1"
CONFIG_FILE="$REPO_ROOT/infra/config/vps.json"
load_config
unset TF_VAR_dify_hostname TF_VAR_dify_backup_bucket TF_VAR_dify_public_enabled
load_terraform_configuration
test "$TF_VAR_dify_hostname" = dify.uniwares.co.uk
test "$TF_VAR_dify_backup_bucket" = kids-booklet-dify-backups
test "$TF_VAR_dify_public_enabled" = "$(jq -r .dify_public_enabled "$CONFIG_FILE")"
bash -c '\''test "$TF_VAR_dify_hostname" = dify.uniwares.co.uk && [[ "$TF_VAR_dify_public_enabled" =~ ^(true|false)$ ]]'\''
private_temp
jq '\''.dify_public_enabled=true'\'' "$CONFIG_FILE" > "$TEMP_DIR/public-config.json"
CONFIG_FILE="$TEMP_DIR/public-config.json"
load_terraform_configuration
bash -c '\''test "$TF_VAR_dify_public_enabled" = true'\''
' _ "$script"
VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
source "$1"
TEMP_DIR="$(mktemp -d)"
fixture="$TEMP_DIR/host"; mkdir -p "$fixture/deploy" "$fixture/state"
cp "$REPO_ROOT/infra/config/vps.json" "$fixture/config.json"
printf "{\"requestId\":\"issue69-upgrade\",\"action\":\"infrastructure\"}" > "$fixture/state/operation.json"
REQUEST_ID=issue69-upgrade; VPS_HOST=example.invalid; VPS_USER=kids-booklet-deploy
configure_ssh() { :; }
ssh() {
  local received="$TEMP_DIR/received.tar"
  cat > "$received"
  if [[ ! -f "$fixture/vps-deployment.sh" ]]; then
    # The previous dispatcher admits exactly these five paths before replacing itself.
    printf "%s\n" deploy/compose.prod.yml deploy/compose.staging.yml deploy/compose.yml infra/config/vps.json scripts/deploy/vps-deployment.sh | sort > "$TEMP_DIR/legacy-expected"
    tar -tf "$received" | sort > "$TEMP_DIR/received-paths"
    cmp "$TEMP_DIR/legacy-expected" "$TEMP_DIR/received-paths" || return 1
    tar -xOf "$received" scripts/deploy/vps-deployment.sh > "$fixture/vps-deployment.sh"
  else
    VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '\''
      source "$1/vps-deployment.sh"
      ROOT="$1"; STATE="$1/state"; TEMP_DIR=""
      require_root() { :; }
      SSH_ORIGINAL_COMMAND="--action sync-host --request-id issue69-upgrade --apply"
      host_dispatch
    '\'' _ "$fixture" < "$received" || return $?
  fi
}
sync_host_configuration
cmp "$REPO_ROOT/deploy/dify/release.json" "$fixture/dify/release.json"
cmp "$REPO_ROOT/deploy/dify/compose.override.yml" "$fixture/dify/compose.override.yml"
test -f "$fixture/state/operation.json"
# Repeating the upgrade also works with the new dispatcher already installed.
sync_host_configuration
calls=0
ssh() { calls=$((calls + 1)); return 42; }
if sync_host_configuration; then exit 1; else test "$?" = 42; fi
test "$calls" = 1
' _ "$script"
VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"; ACTION=dify-install; ENVIRONMENT=dify; VPS_USER=kids-booklet-deploy; APPLY=true; validate_arguments' _ "$script"
idle_result="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
source "$1"
TEMP_DIR="$(mktemp -d)"; DIFY_DATA="$TEMP_DIR"; DIFY_ENV="$TEMP_DIR/runtime.env"
printf "DIFY_AGENT_REDIS_PREFIX=dify-agent\n" > "$DIFY_ENV"; touch "$DIFY_DATA/current"
dify_compose() {
  case "$*" in
    *db_postgres*) printf "0\n" ;;
    *"--scan"*) printf "dify-agent:runs:00000000-0000-4000-8000-000000000069:record\n" ;;
    *" GET "*) printf "{\"status\":\"succeeded\"}\n" ;;
    *) return 1 ;;
  esac
}
dify_idle_host
' _ "$script")"
grep -Fq 'verified: no active Dify workflow or New Agent records' <<< "$idle_result"
if VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
source "$1"
TEMP_DIR="$(mktemp -d)"; DIFY_DATA="$TEMP_DIR"; DIFY_ENV="$TEMP_DIR/runtime.env"
printf "DIFY_AGENT_REDIS_PREFIX=dify-agent\n" > "$DIFY_ENV"; touch "$DIFY_DATA/current"
dify_compose() {
  case "$*" in
    *db_postgres*) printf "1\n" ;;
    *"--scan"*) : ;;
    *) return 1 ;;
  esac
}
dify_idle_host
' _ "$script" >/dev/null 2>&1; then
  echo 'Dify idle check accepted an active workflow' >&2
  exit 1
fi
for agent_record in '{"status":"running"}' '{"status":"unexpected"}' 'not-json'; do
  if DIFY_AGENT_RECORD="$agent_record" VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
  source "$1"
  TEMP_DIR="$(mktemp -d)"; DIFY_DATA="$TEMP_DIR"; DIFY_ENV="$TEMP_DIR/runtime.env"
  printf "DIFY_AGENT_REDIS_PREFIX=dify-agent\n" > "$DIFY_ENV"; touch "$DIFY_DATA/current"
  dify_compose() {
    case "$*" in
      *db_postgres*) printf "0\n" ;;
      *"--scan"*) printf "dify-agent:runs:00000000-0000-4000-8000-000000000069:record\n" ;;
      *" GET "*) printf "%s\n" "$DIFY_AGENT_RECORD" ;;
      *) return 1 ;;
    esac
  }
  dify_idle_host
  ' _ "$script" >/dev/null 2>&1; then
    echo 'Dify idle check accepted an active or malformed New Agent record' >&2
    exit 1
  fi
done
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
adoption_preview="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"
APPLY=false; TEMP_DIR="$(mktemp -d)"; TF_VAR_cloudflare_account_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; TF_VAR_dify_backup_bucket=kids-booklet-dify-backups
terraform() { [[ "$*" == *"state list"* ]] && return 0; }
cloudflare_get() { CF_STATUS=200; }
adopt_existing_r2_buckets "$TEMP_DIR"' _ "$script")"
test "$(grep -c "would update: adopt existing R2 bucket" <<< "$adoption_preview")" = 7
grep -q 'kids-booklet-staging-assets' <<< "$adoption_preview"
grep -q 'kids-booklet-prod-recovery' <<< "$adoption_preview"
grep -q 'kids-booklet-dify-backups' <<< "$adoption_preview"
adoption_apply="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"
APPLY=true; TEMP_DIR="$(mktemp -d)"; TF_VAR_cloudflare_account_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; TF_VAR_dify_backup_bucket=kids-booklet-dify-backups
r2_state_snapshot() { printf "snapshot\\n"; }
terraform() {
  if [[ "$2" == state && ( "$3" == list || "$3" == show ) ]]; then return 0; fi
  if [[ "$2" == import ]]; then printf "import: %s\\n" "$*"; return 0; fi
  return 1
}
cloudflare_get() { CF_STATUS=200; }
adopt_existing_r2_buckets "$TEMP_DIR"' _ "$script")"
test "$(grep -c '^updated: adopted existing R2 bucket' <<< "$adoption_apply")" = 7
test "$(grep -c '^snapshot$' <<< "$adoption_apply")" = 1
test "$(grep -c '^import:' <<< "$adoption_apply")" = 7
grep -Fq 'cloudflare_r2_bucket.bucket["kids-booklet-staging-assets"] aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/kids-booklet-staging-assets/default' <<< "$adoption_apply"
grep -Fq 'cloudflare_r2_bucket.bucket["kids-booklet-prod-recovery"] aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/kids-booklet-prod-recovery/default' <<< "$adoption_apply"
grep -Fq 'cloudflare_r2_bucket.dify_backup aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/kids-booklet-dify-backups/default' <<< "$adoption_apply"
set +e
adoption_drift_output="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c 'source "$1"
APPLY=false; TEMP_DIR="$(mktemp -d)"; TF_VAR_cloudflare_account_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; TF_VAR_dify_backup_bucket=kids-booklet-dify-backups
terraform() { [[ "$2" == state && "$3" == list ]] && printf "%s\\n" "cloudflare_r2_bucket.bucket[\"kids-booklet-staging-assets\"]"; }
cloudflare_get() { CF_STATUS=404; }
adopt_existing_r2_buckets "$TEMP_DIR"' _ "$script" 2>&1)"
adoption_drift_status=$?
set -e
test "$adoption_drift_status" -ne 0
grep -q 'Terraform tracks missing R2 bucket kids-booklet-staging-assets' <<< "$adoption_drift_output"
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
preview_single_rotation="$(env -u GITHUB_ACTIONS bash "$script" --action rotate-secrets --environment staging --secret-name OPENAI_API_KEY --vps-host vps.example)"
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
terraform_apply_path="$(VPS_DEPLOYMENT_LIBRARY_ONLY=true bash -c '
source "$1"
REPO_ROOT="$2"
CONFIG_FILE="$REPO_ROOT/infra/config/vps.json"
APPLY=true
GITHUB_ACTIONS=true
GITHUB_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
VPS_HOST=vps.example
REQUEST_ID=test-apply-path
R2_STATE_BUCKET=state
R2_ENDPOINT=https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com
verify_infrastructure_head() { :; }
adopt_existing_r2_buckets() { [[ -x "$1" ]]; }
verify_cloudflare_ownership() { [[ -x "$1" ]]; }
host_call() { printf "host:%s\n" "$ACTION"; }
sync_host_configuration() { printf "host:sync\n"; }
r2_state_snapshot() { [[ -x "$1" ]]; printf "snapshot:%s\n" "$2"; }
terraform() {
  local directory="${1#-chdir=}" output argument
  [[ "$TF_VAR_dify_hostname" == dify.uniwares.co.uk && "$TF_VAR_dify_backup_bucket" == kids-booklet-dify-backups && "$TF_VAR_dify_public_enabled" =~ ^(true|false)$ ]] || return 92
  shift
  [[ -d "$directory" && -x "$directory" ]] || { printf "workspace is not traversable\n" >&2; return 90; }
  case "$1" in
    init) ;;
    plan)
      for argument in "$@"; do
        case "$argument" in -out=*) output="${argument#-out=}";; esac
      done
      : > "${output:-$directory/preview.tfplan}"
      ;;
    show) printf "%s\n" "{\"resource_changes\":[]}";;
    apply) printf "terraform:apply\n";;
    state) printf "state-entry\n";;
    *) printf "unexpected terraform command: %s\n" "$*" >&2; return 91;;
  esac
}
terraform_operation
' _ "$script" "$PWD")"
grep -q '^host:infra-lock$' <<< "$terraform_apply_path"
grep -q '^snapshot:infrastructure-before$' <<< "$terraform_apply_path"
grep -q '^terraform:apply$' <<< "$terraform_apply_path"
grep -q '^snapshot:infrastructure-after$' <<< "$terraform_apply_path"
grep -q '^host:sync$' <<< "$terraform_apply_path"
grep -q '^host:infra-unlock$' <<< "$terraform_apply_path"
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
