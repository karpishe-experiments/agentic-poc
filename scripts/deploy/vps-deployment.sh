#!/usr/bin/env bash
# Direct execution is strict. Source-only credential sessions must preserve the
# caller's shell options so a failed preview cannot close the SSH login.
SCRIPT_IS_SOURCED=false
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then SCRIPT_IS_SOURCED=true; fi
if [[ "$SCRIPT_IS_SOURCED" == false ]]; then
  # Reject inherited tracing before processing any credentials.
  { set +x; } 2>/dev/null
  set -euo pipefail
  umask 077
fi

ACTION='' APPLY=false ENVIRONMENT='' IMAGE_DIGEST='' BACKUP_ID='' CONFIRMATION=''
GENERATE_PASSWORD=false
CONFIG_FILE='' VPS_HOST='' VPS_USER='' COMMIT='' REQUEST_ID=''
SECRET_NAME=''
RUN_ID=''
OPERATION_ID='' EXPECTED_REVISION='' PREVIEW_DIGEST='' ORIGINAL_REQUEST_ID=''
ABORT_RECOVERY=false RELEASE_EXPIRED_CLAIM=false
RECOVERY_ORIGINAL_EVIDENCE=''
INSPECTION_ONLY=false RECOVERY_PAGE=0 RECOVERY_LIMIT=5
COMPOSE_TIMEOUT_SECONDS=300
CONTROL_DEADLINE_SECONDS=0
COMPOSE_SECRET_FILE=''
ZONE_NAME='' STAGING_HOSTNAME='' PROD_HOSTNAME='' DEPLOY_HOSTNAME='' CONFIG_OUTPUT=''
ROOT=/opt/kids-booklet
STATE=/var/lib/kids-booklet
SECRETS=/etc/kids-booklet
DIFY_RELEASE="$ROOT/dify/releases/1.17.1"
DIFY_DATA="$STATE/dify"
DIFY_ENV="$SECRETS/dify/runtime.env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMP_DIR='' ATLAS_PLAN_FILE='' ADMIN_API_KEY_FILE=''
declare -A SEEN=()
declare -A GENERATED_MONGODB_URI=()
ATLAS_PUBLIC_KEY="${ATLAS_PUBLIC_KEY:-${ATLAS_ADMIN_PUBLIC_KEY:-}}" ATLAS_PRIVATE_KEY="${ATLAS_PRIVATE_KEY:-${ATLAS_ADMIN_PRIVATE_KEY:-}}" ATLAS_RESPONSE='' ATLAS_STATUS='' GITHUB_ADMIN_TOKEN="${GITHUB_ADMIN_TOKEN:-}"
CLOUDFLARE_TOKEN_ID=''
CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-${TF_VAR_cloudflare_api_token:-}}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-}" AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-}"
SESSION_ACTIVE="${SESSION_ACTIVE:-false}" SESSION_RESTORE_ERREXIT="${SESSION_RESTORE_ERREXIT:-false}"

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
need_command() { command -v "$1" >/dev/null || die "Required command missing: $1"; }
cleanup() { ATLAS_PUBLIC_KEY=''; ATLAS_PRIVATE_KEY=''; GITHUB_ADMIN_TOKEN=''; CLOUDFLARE_API_TOKEN=''; AWS_ACCESS_KEY_ID=''; AWS_SECRET_ACCESS_KEY=''; unset ATLAS_PUBLIC_KEY ATLAS_PRIVATE_KEY ATLAS_ADMIN_PUBLIC_KEY ATLAS_ADMIN_PRIVATE_KEY GITHUB_ADMIN_TOKEN GH_TOKEN CLOUDFLARE_API_TOKEN TF_VAR_cloudflare_api_token AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY CF_ACCESS_CLIENT_ID CF_ACCESS_CLIENT_SECRET TUNNEL_SERVICE_TOKEN_ID TUNNEL_SERVICE_TOKEN_SECRET DIFY_TOOL_KEY DIFY_API_KEY; if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then rm -rf -- "$TEMP_DIR"; fi; }
trap cleanup EXIT
usage() {
  cat <<'HELP'
Usage: bash scripts/deploy/vps-deployment.sh --action ACTION [named options] [--apply]
Actions: discover-config, dify-discover, dify-check, dify-idle, dify-diagnostics, dify-repair-sandbox, dify-repair-scheduler, dify-install, dify-repair-broker, dify-repair-collaboration, dify-enable-admin-api, access-check, setup, finalize, status, infrastructure, deploy, check, backup,
         restore, rollback, rotate-secrets, rotate-protected-dify-key, repair-first-activation-secrets, reset-staging, retire-staging-artifact-index, resume, atlas-reconcile, credential-session,
         clear-credential-session, operation-status, operation-stop, backup-verify, staging-bootstrap-reconcile, candidate-reconcile, expired-deployment-recover, host-dispatch, host-run
Options:
  --config PATH                     non-secret JSON configuration
  --zone HOSTNAME                    required for discover-config
  --staging-hostname HOSTNAME        defaults to staging.<zone> for discover-config
  --prod-hostname HOSTNAME           defaults to booklet.<zone> for discover-config
  --deploy-hostname HOSTNAME         defaults to deploy.<zone> for discover-config
  --write-config PATH                required output for discover-config; must be infra/config/vps.json
  --environment staging|prod|dify   target for application or Dify operations
  --image-digest ghcr.io/name@sha256:HEX  required for deploy
  --commit FULL_SHA                 required for deploy
  --backup-id ID --confirmation DB   required for restore
  --confirmation kids_booklet       required for reset-staging
  --commit FULL_SHA --confirmation kids_booklet  required for index retirement apply
  --vps-host HOST --vps-user USER    SSH destination (default user kids-booklet-deploy)
  --request-id ID                   identifies an operation; reused by resume/status
                                   required exact retained/completed ID for operation-status/operation-stop
  --release-expired-claim           linked recovery for an exact retained expired claim
  --abort-recovery                  apply: close and archive an unstarted repair
  --inspection-only --page N --limit N  read-only paginated candidate inspection
  --operation-id UUID --expected-revision N  exact candidate recovery target
  --preview-digest SHA256            required recovery apply preview identity
  --original-request-id ID           expired deployment being recovered
  --run-id UUID                     staging recovery or dify-diagnostics run
  --secret-name NAME                one secret, or staging-only DIFY_COMMUNITY_PROBE/DIFY_BOOKLET_RUNNER bundle
  --generate-password               generate and display ACCESS_GATE_PASSWORD once
  --help
Preview is the default; only --apply permits remote mutations. status/check reject
--apply. discover-config makes read-only provider requests; --apply only writes its
non-secret local configuration file. Setup runs locally as root on the Ubuntu VPS
from a reviewed checkout.
Source credential-session to silently load setup credentials into the current SSH
shell. They remain in memory until logout or clear-credential-session. Run
access-check after credential-session to validate provider access without mutation.
Example: bash scripts/deploy/vps-deployment.sh --action setup --config infra/config/vps.json
Example: sudo bash scripts/deploy/vps-deployment.sh --action setup --config infra/config/vps.json --apply
HELP
}
parse_arguments() {
  local name value
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help) usage; exit 0 ;;
      --apply) APPLY=true; shift ;;
      --generate-password) GENERATE_PASSWORD=true; shift ;;
      --inspection-only) INSPECTION_ONLY=true; shift ;;
      --abort-recovery) ABORT_RECOVERY=true; shift ;;
      --release-expired-claim) RELEASE_EXPIRED_CLAIM=true; shift ;;
      --action|--config|--environment|--image-digest|--backup-id|--confirmation|--vps-host|--vps-user|--commit|--request-id|--run-id|--operation-id|--expected-revision|--preview-digest|--original-request-id|--page|--limit|--secret-name|--zone|--staging-hostname|--prod-hostname|--deploy-hostname|--write-config)
        name="$1"; [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || die "$1 requires a value"
        value="$2"
        [[ -z "${SEEN[$name]+x}" || "${SEEN[$name]}" == "$value" ]] || die "Conflicting duplicate argument: $name"
        SEEN[$name]="$value"
        case "$name" in
          --action) ACTION="$value";; --config) CONFIG_FILE="$value";; --environment) ENVIRONMENT="$value";;
          --image-digest) IMAGE_DIGEST="$value";; --backup-id) BACKUP_ID="$value";; --confirmation) CONFIRMATION="$value";;
          --vps-host) VPS_HOST="$value";; --vps-user) VPS_USER="$value";; --commit) COMMIT="$value";; --request-id) REQUEST_ID="$value";;
          --secret-name) SECRET_NAME="$value";;
          --run-id) RUN_ID="$value";;
          --page) RECOVERY_PAGE="$value";; --limit) RECOVERY_LIMIT="$value";;
          --operation-id) OPERATION_ID="$value";; --expected-revision) EXPECTED_REVISION="$value";;
          --preview-digest) PREVIEW_DIGEST="$value";; --original-request-id) ORIGINAL_REQUEST_ID="$value";;
          --zone) ZONE_NAME="$value";; --staging-hostname) STAGING_HOSTNAME="$value";; --prod-hostname) PROD_HOSTNAME="$value";;
          --deploy-hostname) DEPLOY_HOSTNAME="$value";; --write-config) CONFIG_OUTPUT="$value";;
        esac
        shift 2 ;;
      *) die "Unknown or positional argument: $1" ;;
    esac
  done
  CONFIG_FILE="${CONFIG_FILE:-$REPO_ROOT/infra/config/vps.json}"
  VPS_USER="${VPS_USER:-kids-booklet-deploy}"
}
validate_arguments() {
  [[ "$ACTION" =~ ^(discover-config|dify-discover|dify-check|dify-idle|dify-diagnostics|dify-repair-sandbox|dify-repair-scheduler|dify-install|dify-repair-broker|dify-repair-collaboration|dify-enable-admin-api|access-check|setup|finalize|status|operation-status|operation-stop|backup-verify|staging-bootstrap-reconcile|candidate-reconcile|expired-deployment-recover|infrastructure|infra-lock|infra-unlock|sync-host|deploy|check|backup|restore|rollback|rotate-secrets|rotate-protected-dify-key|repair-first-activation-secrets|stage-secrets|reset-staging|retire-staging-artifact-index|resume|atlas-reconcile|credential-session|clear-credential-session|host-dispatch|host-run|host-cleanup)$ ]] || die 'Select a supported --action'
  [[ -z "$RUN_ID" || ( "$ACTION" =~ ^(dify-diagnostics|candidate-reconcile)$ && "$RUN_ID" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ ) ]] || die 'Run ID requires dify-diagnostics and a lowercase UUID'
  [[ -z "$ENVIRONMENT" || "$ENVIRONMENT" =~ ^(staging|prod|dify)$ ]] || die 'Invalid environment'
  if [[ "$ACTION" == dify-* && "$ACTION" != dify-discover ]]; then
    [[ "$ENVIRONMENT" == dify ]] || die 'Dify operation requires --environment dify'
  elif [[ "$ENVIRONMENT" == dify && "$ACTION" != host-run && "$ACTION" != host-cleanup && "$ACTION" != resume && "$ACTION" != status && "$ACTION" != operation-status && "$ACTION" != operation-stop ]]; then
    die 'Booklet operation cannot target Dify'
  fi
  [[ "$VPS_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || die 'Invalid SSH user'
  [[ -z "$VPS_HOST" || "$VPS_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || die 'Invalid SSH hostname'
  [[ -z "$COMMIT" || "$COMMIT" =~ ^[a-f0-9]{40}$ ]] || die 'Commit must be a full SHA'
  [[ -z "$REQUEST_ID" || "$REQUEST_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$ ]] || die 'Invalid request ID'
  [[ -z "$BACKUP_ID" || "$BACKUP_ID" =~ ^[a-zA-Z0-9_-]{1,160}$ ]] || die 'Invalid backup ID'
  [[ -z "$CONFIRMATION" || "$CONFIRMATION" =~ ^kids_booklet(_prod)?$ ]] || die 'Invalid database confirmation'
  [[ -z "$IMAGE_DIGEST" || "$IMAGE_DIGEST" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]] || die 'Invalid immutable GHCR digest'
  [[ -z "$SECRET_NAME" || "$SECRET_NAME" =~ ^(OPENAI_API_KEY|MONGODB_URI|ACCESS_GATE_PASSWORD|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|DIFY_API_KEY|DIFY_TOOL_KEY|DIFY_IMAGE_OPENAI_API_KEY|DIFY_COMMUNITY_WORKFLOW_API_KEY|DIFY_COMMUNITY_CALLBACK_KEY|DIFY_COMMUNITY_PROBE|DIFY_BOOKLET_RUNNER)$ ]] || die 'Invalid application secret name'
  [[ -z "$SECRET_NAME" || "$ACTION" =~ ^(repair-first-activation-secrets|rotate-secrets|rotate-protected-dify-key|stage-secrets)$ ]] || die '--secret-name is only valid for application secret repair or rotation'
  if [[ "$SECRET_NAME" == DIFY_COMMUNITY_PROBE || "$SECRET_NAME" == DIFY_BOOKLET_RUNNER ]]; then
    [[ "$ENVIRONMENT" == staging && "$ACTION" =~ ^(rotate-secrets|rotate-protected-dify-key|stage-secrets)$ ]] || die 'Dify bundle is limited to staging rotation'
  fi
  if [[ "$GENERATE_PASSWORD" == true ]]; then
    [[ "$ACTION" =~ ^(repair-first-activation-secrets|rotate-secrets)$ ]] || die '--generate-password is only valid for application secret repair or rotation'
    [[ -z "$SECRET_NAME" || "$SECRET_NAME" == ACCESS_GATE_PASSWORD ]] || die '--generate-password conflicts with the selected secret name'
    [[ -z "${GITHUB_ACTIONS:-}" ]] || die '--generate-password is forbidden in GitHub Actions'
  fi
  [[ -z "$ZONE_NAME" || "$ZONE_NAME" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || die 'Invalid Cloudflare zone hostname'
  for hostname in "$STAGING_HOSTNAME" "$PROD_HOSTNAME" "$DEPLOY_HOSTNAME"; do
    [[ -z "$hostname" || "$hostname" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || die 'Invalid application hostname'
  done
  case "$ACTION" in
    deploy) [[ -n "$ENVIRONMENT" && -n "$IMAGE_DIGEST" && -n "$COMMIT" ]] || die 'Deploy requires environment, image digest and commit';;
    check|backup|restore|rollback|rotate-secrets|rotate-protected-dify-key|repair-first-activation-secrets|stage-secrets|reset-staging|resume) [[ -n "$ENVIRONMENT" ]] || die 'Environment is required';;
  esac
  if [[ "$ACTION" == operation-status || "$ACTION" == operation-stop ]]; then
    [[ -n "$REQUEST_ID" && -n "$ENVIRONMENT" ]] || die 'Operation control requires an exact request ID and environment'
  fi
  if [[ "$ACTION" == backup-verify ]]; then
    [[ "$ENVIRONMENT" =~ ^(staging|prod)$ && -n "$BACKUP_ID" && -n "$COMMIT" && -n "$IMAGE_DIGEST" ]] || die 'Backup verification requires exact Booklet environment, backup ID, deployed commit and image digest'
  fi
  if [[ "$ACTION" == staging-bootstrap-reconcile ]]; then
    [[ "$ENVIRONMENT" == staging && "$REQUEST_ID" == 38149230374-1 && -n "$COMMIT" && -n "$IMAGE_DIGEST" && "$COMMIT" != c04d7512dfaa3156eb3b81331625d1a0af4f7faf ]] || die 'Bootstrap requires exact historical staging request and a separate reviewed candidate commit/image'
    [[ "$APPLY" == false || "$CONFIRMATION" == kids_booklet ]] || die 'Bootstrap apply requires --confirmation kids_booklet'
  fi
  if [[ "$ACTION" == candidate-reconcile || "$ACTION" == expired-deployment-recover ]]; then
    [[ "$ENVIRONMENT" == staging && -n "$REQUEST_ID" && -n "$COMMIT" && -n "$IMAGE_DIGEST" ]] || die 'Recovery requires staging, new request ID and pinned commit/image'
    [[ "$APPLY" == false || ( "$CONFIRMATION" == kids_booklet && "$PREVIEW_DIGEST" =~ ^[a-f0-9]{64}$ ) ]] || die 'Recovery apply requires confirmation and preview digest'
    if [[ "$ACTION" == candidate-reconcile && "$INSPECTION_ONLY" == false ]]; then
      [[ -n "$RUN_ID" && "$OPERATION_ID" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ && "$EXPECTED_REVISION" =~ ^[0-9]{1,10}$ && ( -z "$ORIGINAL_REQUEST_ID" || "$RELEASE_EXPIRED_CLAIM" == true ) ]] || die 'Candidate recovery requires exact run, operation and revision'
    elif [[ "$ACTION" == expired-deployment-recover ]]; then
      [[ "$ORIGINAL_REQUEST_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$ && "$ORIGINAL_REQUEST_ID" != "$REQUEST_ID" && -z "$RUN_ID$OPERATION_ID$EXPECTED_REVISION" ]] || die 'Expired recovery requires a distinct original request ID'
    fi
  else
    [[ -z "$OPERATION_ID$EXPECTED_REVISION$PREVIEW_DIGEST$ORIGINAL_REQUEST_ID" ]] || die 'Recovery arguments require a recovery action'
  fi
  [[ "$RELEASE_EXPIRED_CLAIM" == false || ( "$ACTION" == candidate-reconcile && "$INSPECTION_ONLY" == false && "$ORIGINAL_REQUEST_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$ && "$ORIGINAL_REQUEST_ID" != "$REQUEST_ID" ) ]] || die 'Claim release requires a distinct original recovery request'
  [[ "$ABORT_RECOVERY" == false || ( "$ACTION" == candidate-reconcile && "$APPLY" == true && "$INSPECTION_ONLY" == false ) ]] || die 'Abort requires candidate recovery apply'
  [[ "$RECOVERY_PAGE" =~ ^[0-9]{1,5}$ && "$RECOVERY_LIMIT" =~ ^[0-9]{1,2}$ && "$RECOVERY_PAGE" -le 10000 && "$RECOVERY_LIMIT" -ge 1 && "$RECOVERY_LIMIT" -le 50 ]] || die 'Invalid recovery inspection page or limit'
  [[ "$INSPECTION_ONLY" == false || ( "$ACTION" == candidate-reconcile && "$APPLY" == false && -z "$RUN_ID$OPERATION_ID$EXPECTED_REVISION$ORIGINAL_REQUEST_ID$PREVIEW_DIGEST" ) ]] || die 'Inspection-only is candidate preview without a mutation target'
  if [[ "$ACTION" == restore ]]; then
    [[ -n "$BACKUP_ID" ]] || die 'Restore requires backup ID'
    local expected=kids_booklet; [[ "$ENVIRONMENT" != prod ]] || expected=kids_booklet_prod
    [[ "$CONFIRMATION" == "$expected" ]] || die "Restore requires --confirmation $expected"
  fi
  if [[ "$ACTION" == reset-staging ]]; then
    [[ "$ENVIRONMENT" == staging && "$CONFIRMATION" == kids_booklet ]] || die 'Reset is staging-only and requires --confirmation kids_booklet'
  fi
  if [[ "$ACTION" == retire-staging-artifact-index ]]; then
    [[ "$ENVIRONMENT" == staging && -n "$COMMIT" ]] || die 'Index retirement requires staging and the exact deployed commit'
    [[ "$APPLY" == false || "$CONFIRMATION" == kids_booklet ]] || die 'Index retirement requires --confirmation kids_booklet'
    if [[ "$APPLY" == true && -n "$BACKUP_ID" && ! -f "$STATE/operation.json" ]]; then
      die 'Index retirement creates its own pre-change backup'
    fi
  fi
  case "$ACTION" in status|operation-status|backup-verify|check|dify-check|dify-idle|dify-discover|dify-diagnostics|access-check|credential-session|clear-credential-session) [[ "$APPLY" == false ]] || die "$ACTION rejects --apply";; esac
  if [[ "$ACTION" == discover-config ]]; then
    [[ -n "$ZONE_NAME" && -n "$CONFIG_OUTPUT" ]] || die 'discover-config requires --zone and --write-config'
    [[ -z "$STAGING_HOSTNAME" || "$STAGING_HOSTNAME" == "$ZONE_NAME" || "$STAGING_HOSTNAME" == *."$ZONE_NAME" ]] || die 'Staging hostname must be in the Cloudflare zone'
    [[ -z "$PROD_HOSTNAME" || "$PROD_HOSTNAME" == "$ZONE_NAME" || "$PROD_HOSTNAME" == *."$ZONE_NAME" ]] || die 'Production hostname must be in the Cloudflare zone'
    [[ -z "$DEPLOY_HOSTNAME" || "$DEPLOY_HOSTNAME" == "$ZONE_NAME" || "$DEPLOY_HOSTNAME" == *."$ZONE_NAME" ]] || die 'Deployment hostname must be in the Cloudflare zone'
  fi
}
load_config() {
  need_command jq
  [[ -f "$CONFIG_FILE" ]] || die "Missing configuration: $CONFIG_FILE"
  jq -e 'type == "object" and (.repository | test("^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$")) and (.image | test("^ghcr.io/[a-z0-9._/-]+$")) and (.deploy_hostname | test("^[a-zA-Z0-9][a-zA-Z0-9.-]+$")) and (.cloudflare_account_id | test("^[a-f0-9]{32}$")) and (.cloudflare_zone_id | test("^[a-f0-9]{32}$")) and (.state_bucket | test("^[a-z0-9][a-z0-9-]{2,62}$")) and (.atlas_project_id | test("^[a-f0-9]{24}$")) and (.atlas_cluster_name | test("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")) and (.environments | keys == ["prod", "staging"])' "$CONFIG_FILE" >/dev/null || die 'Invalid deployment configuration'
  VPS_HOST="${VPS_HOST:-$(jq -r .deploy_hostname "$CONFIG_FILE")}"
  local e
  for e in staging prod; do
    jq -e --arg e "$e" '.environments[$e] | (.APP_HOSTNAME | test("^[a-zA-Z0-9][a-zA-Z0-9.-]+$")) and ([.ASSETS_BUCKET,.DIAGNOSTICS_BUCKET,.RECOVERY_BUCKET] | all(test("^[a-z0-9][a-z0-9-]{2,62}$")))' "$CONFIG_FILE" >/dev/null || die "Invalid $e configuration"
  done
}
load_terraform_configuration() {
  TF_VAR_cloudflare_account_id="$(jq -r .cloudflare_account_id "$CONFIG_FILE")"
  TF_VAR_cloudflare_zone_id="$(jq -r .cloudflare_zone_id "$CONFIG_FILE")"
  TF_VAR_staging_hostname="$(jq -r .environments.staging.APP_HOSTNAME "$CONFIG_FILE")"
  TF_VAR_prod_hostname="$(jq -r .environments.prod.APP_HOSTNAME "$CONFIG_FILE")"
  TF_VAR_deploy_hostname="$(jq -r .deploy_hostname "$CONFIG_FILE")"
  TF_VAR_dify_hostname="$(jq -er .dify_hostname "$CONFIG_FILE")"
  TF_VAR_dify_backup_bucket="$(jq -er .dify_backup_bucket "$CONFIG_FILE")"
  TF_VAR_dify_public_enabled="$(jq -er '.dify_public_enabled | if type == "boolean" then tostring else error("invalid Dify public switch") end' "$CONFIG_FILE")"
  R2_STATE_BUCKET="$(jq -r .state_bucket "$CONFIG_FILE")"
  export TF_VAR_cloudflare_account_id TF_VAR_cloudflare_zone_id TF_VAR_staging_hostname TF_VAR_prod_hostname TF_VAR_deploy_hostname TF_VAR_dify_hostname TF_VAR_dify_backup_bucket TF_VAR_dify_public_enabled R2_STATE_BUCKET
  export R2_ENDPOINT="https://$TF_VAR_cloudflare_account_id.r2.cloudflarestorage.com"
  export TF_VAR_state_bucket="$R2_STATE_BUCKET"
}
private_temp() { [[ -n "$TEMP_DIR" ]] || { TEMP_DIR="$(mktemp -d)"; chmod 700 "$TEMP_DIR"; }; }
configure_ssh() {
  need_command ssh
  need_command cloudflared
  load_cloudflare_access_credentials
  # cloudflared reads these variables; secrets never enter ProxyCommand arguments.
  export TUNNEL_SERVICE_TOKEN_ID="$CF_ACCESS_CLIENT_ID" TUNNEL_SERVICE_TOKEN_SECRET="$CF_ACCESS_CLIENT_SECRET"
}
host_call() {
  configure_ssh
  local remote_command
  local -a remote=(--action "$ACTION")
  [[ -z "$ENVIRONMENT" ]] || remote+=(--environment "$ENVIRONMENT")
  [[ -z "$IMAGE_DIGEST" ]] || remote+=(--image-digest "$IMAGE_DIGEST")
  [[ -z "$COMMIT" ]] || remote+=(--commit "$COMMIT")
  [[ -z "$BACKUP_ID" ]] || remote+=(--backup-id "$BACKUP_ID")
  [[ -z "$CONFIRMATION" ]] || remote+=(--confirmation "$CONFIRMATION")
  [[ -z "$REQUEST_ID" ]] || remote+=(--request-id "$REQUEST_ID")
  [[ -z "$RUN_ID" ]] || remote+=(--run-id "$RUN_ID")
  [[ -z "$OPERATION_ID" ]] || remote+=(--operation-id "$OPERATION_ID")
  [[ -z "$EXPECTED_REVISION" ]] || remote+=(--expected-revision "$EXPECTED_REVISION")
  [[ -z "$PREVIEW_DIGEST" ]] || remote+=(--preview-digest "$PREVIEW_DIGEST")
  [[ -z "$ORIGINAL_REQUEST_ID" ]] || remote+=(--original-request-id "$ORIGINAL_REQUEST_ID")
  [[ "$ABORT_RECOVERY" == false ]] || remote+=(--abort-recovery)
  [[ "$RELEASE_EXPIRED_CLAIM" == false ]] || remote+=(--release-expired-claim)
  if [[ "$INSPECTION_ONLY" == true ]]; then remote+=(--inspection-only --page "$RECOVERY_PAGE" --limit "$RECOVERY_LIMIT"); fi
  [[ "$APPLY" == false ]] || remote+=(--apply)
  printf -v remote_command ' %s' "${remote[@]}"
  local -a bound=()
  case "$ACTION" in operation-status) bound=(timeout --kill-after=1s 30s);; operation-stop) bound=(timeout --kill-after=1s 60s);; backup-verify) bound=(timeout --kill-after=5s 1825s);; candidate-reconcile|expired-deployment-recover) bound=(timeout --kill-after=5s 2600s);; staging-bootstrap-reconcile) bound=(timeout --kill-after=5s 2365s);; esac
  "${bound[@]}" ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o 'ProxyCommand=cloudflared access ssh --hostname %h' "$VPS_USER@$VPS_HOST" "$remote_command"
}
require_root() { [[ "$EUID" -eq 0 ]] || die 'This operation requires root on the VPS'; }
validate_host_capacity() {
  local memory_kib disk_kib cpu_count
  cpu_count="$(nproc)"; memory_kib="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"; disk_kib="$(df -Pk / | awk 'NR==2 {print $4}')"
  [[ "$cpu_count" -ge 2 ]] || die 'VPS requires at least 2 CPU cores for two serialized environments'
  [[ "$memory_kib" -ge 6291456 ]] || die 'VPS requires at least 6 GiB total memory'
  [[ "$disk_kib" -ge 10485760 ]] || die 'VPS requires at least 10 GiB free disk before setup'
}
verify_release_capacity() {
  local disk_kib
  disk_kib="$(df -Pk "$STATE" | awk 'NR==2 {print $4}')"
  [[ "$disk_kib" -ge 4194304 ]] || die 'At least 4 GiB free disk is required before pulling a release image'
}
compose() {
  local release="$1"; shift
  local -a bound=()
  local seconds="$COMPOSE_TIMEOUT_SECONDS"
  if [[ "${1:-}" == up ]]; then
    [[ "$seconds" -gt 0 && "$seconds" -lt 180 ]] || seconds=180
    seconds="$(remaining_operation_seconds "$seconds")" || return 124
    record_operation_command compose-up "$seconds"
  fi
  if [[ "$seconds" -gt 0 ]]; then bound=(timeout --kill-after=5s "${seconds}s"); fi
  "${bound[@]}" docker compose --project-name "kids-booklet-$ENVIRONMENT" --env-file "$release/runtime.env" -f "$release/compose.yml" -f "$release/environment.yml" -f "${COMPOSE_SECRET_FILE:-$SECRETS/$ENVIRONMENT/secrets.json}" -f "$release/image.json" "$@"
}
maintenance() {
  local release="$1" command="$2"; shift 2
  local release_image
  release_image="$(jq -er .services.app.image "$release/image.json")"
  local full_asset_backup=false
  [[ "$ACTION" != reset-staging || "$command" != recovery ]] || full_asset_backup=true
  local phase_seconds=300 status=0 name="booklet-operation-${ENVIRONMENT}-${REQUEST_ID:-local}-$$-$RANDOM"
  case "$command:${1:-}" in
    recovery:backup|recovery:verify) phase_seconds=1800;; recovery:restore) phase_seconds=3600;;
    check-deployment-readiness:*) phase_seconds=180;;
  esac
  # Cleanup may reopen the original service after a failed drain. It is not a
  # new lifecycle phase and must remain possible after the work budget expires.
  if [[ "$command:${1:-}" != deployment-control:disable ]]; then phase_seconds="$(remaining_operation_seconds "$phase_seconds")" || return 124; fi
  if [[ "$CONTROL_DEADLINE_SECONDS" -gt 0 ]]; then
    local control_remaining=$((CONTROL_DEADLINE_SECONDS - SECONDS))
    [[ "$control_remaining" -gt 0 ]] || return 124
    [[ "$phase_seconds" -le "$control_remaining" ]] || phase_seconds="$control_remaining"
  fi
  record_operation_command "$command" "$phase_seconds"
  if COMPOSE_TIMEOUT_SECONDS="$phase_seconds" compose "$release" run --rm --no-deps -T --name "$name" \
    --label "uk.co.uniwares.booklet.request=${REQUEST_ID:-local}" --label "uk.co.uniwares.booklet.environment=$ENVIRONMENT" \
    -e RUNNER_ENABLED=false -e "DRAIN_TIMEOUT_MS=$(((phase_seconds < 300 ? phase_seconds : 300) * 1000))" -e "DEPLOYMENT_URL=${DEPLOYMENT_URL:-}" -e "BACKUP_ALL_ASSETS=$full_asset_backup" -e "RELEASE_IMAGE_DIGEST=$release_image" -e "BACKUP_ID=$BACKUP_ID" -e "CONFIRM_DATABASE=$CONFIRMATION" app node --import tsx "scripts/$command.ts" "$@"; then
    return 0
  else status=$?; fi
  # Killing the Compose client does not stop its daemon-owned container. Stop
  # only this named/labelled one-off; never infer that its writes failed.
  stop_owned_oneoff "$name" 20 || printf 'error: Owned maintenance container remains unverified; inspect before resume\n' >&2
  printf 'error: Maintenance command %s stopped (exit=%s); inspect retained phase and outputs before resume\n' "$command" "$status" >&2
  return "$status"
}
record_operation_command() {
  [[ -n "$REQUEST_ID" && -f "$STATE/operation.json" ]] || return 0
  local started; started="$(date +%s)"
  jq --arg id "$REQUEST_ID" --arg command "$1" --argjson started "$started" --argjson seconds "$2" \
    'if .requestId==$id then .command=$command | .commandStartedAt=$started | .commandDeadlineAt=($started+$seconds) else error("Operation changed") end' \
    "$STATE/operation.json" > "$STATE/operation.next.json"
  mv "$STATE/operation.next.json" "$STATE/operation.json"
}
stop_owned_oneoff() {
  local name="$1" seconds="$2" record filter
  [[ "$name" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || return 1
  filter="name=^/${name//./[.]}$"
  [[ ! "$name" =~ ^[a-f0-9]{12,64}$ ]] || filter="id=$name"
  if ! record="$(control_timeout 5 docker inspect "$name" 2>/dev/null)"; then
    record="$(control_timeout 5 docker ps -aq --filter "$filter")" || return 1
    [[ -z "$record" ]]; return
  fi
  jq -e --arg id "${REQUEST_ID:-local}" --arg environment "$ENVIRONMENT" '
    length==1 and .[0].Config.Labels["uk.co.uniwares.booklet.request"]==$id and
    .[0].Config.Labels["uk.co.uniwares.booklet.environment"]==$environment and
    .[0].Config.Labels["com.docker.compose.project"]==("kids-booklet-"+$environment) and
    .[0].Config.Labels["com.docker.compose.oneoff"]=="True"' <<< "$record" >/dev/null || return 1
  control_timeout "$seconds" docker stop --time 5 "$name" >/dev/null 2>&1 || return 1
  # --rm can remove the container between stop acknowledgement and this call.
  if ! control_timeout 5 docker rm "$name" >/dev/null 2>&1; then
    record="$(control_timeout 5 docker ps -aq --filter "$filter")" || return 1
    [[ -z "$record" ]] || return 1
  fi
}
control_timeout() {
  local seconds="$1" remaining; shift
  if [[ "$CONTROL_DEADLINE_SECONDS" -gt 0 ]]; then
    remaining=$((CONTROL_DEADLINE_SECONDS - SECONDS))
    [[ "$remaining" -gt 0 ]] || return 124
    [[ "$seconds" -le "$remaining" ]] || seconds="$remaining"
  fi
  timeout --kill-after=1s "${seconds}s" "$@"
}
operation_runtime_seconds() {
  case "$1" in restore) echo 3600;; backup) echo 1800;; deploy|dify-install|rollback|rotate-secrets|reset-staging|retire-staging-artifact-index) echo 2700;; *) echo 300;; esac
}
# Explicit compatibility bridge for one reviewed historical staging blocker.
# It never changes the original request's image, commit, phase or byte evidence.
legacy_staging_node() {
  local release="$1" mode="$2" seconds=45 status=0
  [[ "$mode" != verify-backup ]] || seconds=1800
  if [[ "$CONTROL_DEADLINE_SECONDS" -gt 0 ]]; then
    local remaining=$((CONTROL_DEADLINE_SECONDS - SECONDS))
    [[ "$remaining" -gt 0 ]] || return 124
    [[ "$seconds" -le "$remaining" ]] || seconds="$remaining"
  fi
  local name="booklet-operation-staging-bootstrap-$$-$RANDOM"
  if COMPOSE_TIMEOUT_SECONDS="$seconds" compose "$release" run --rm --no-deps -T --name "$name" \
    --label uk.co.uniwares.booklet.request=local --label uk.co.uniwares.booklet.environment=staging \
    -e RUNNER_ENABLED=false -e "BOOTSTRAP_MODE=$mode" -e "BACKUP_ID=$BACKUP_ID" \
    -e "RELEASE_IMAGE_DIGEST=$(jq -er .services.app.image "$release/image.json")" \
    app node --import tsx - 2>/dev/null <<'NODE'
(async () => {
  if (process.env.DEPLOYMENT_ENV !== '_staging' || process.env.RUNNER_ENABLED !== 'false') throw Error('TargetDiffers');
  const {getDatabase, withMongoTransaction} = require('./db/client.ts');
  const mode = process.env.BOOTSTRAP_MODE;
  if (mode === 'verify-backup') {
    const {getServerEnv} = require('./lib/config/env.ts');
    const {createObjectStoreClient} = require('./lib/assets/create-object-store-client.ts');
    const {RecoveryStorage} = require('./scripts/recovery-storage.ts');
    const env = getServerEnv(), client = createObjectStoreClient(env);
    try {
      const manifest = await new RecoveryStorage(client, env.RECOVERY_BUCKET).verifiedCompletedBackup(
        process.env.BACKUP_ID, env.MONGODB_DATABASE, '_staging', process.env.RELEASE_IMAGE_DIGEST);
      console.log(JSON.stringify({verified:true,backupId:manifest.backupId,assetCount:manifest.assets.length}));
    } finally { client.destroy(); }
    return;
  }
  const db = getDatabase(), options = {};
  const runId='92272a97-f96d-4634-8cba-3524a3fa2b51', operationId='c8c0e121-d3cf-41bc-8023-79cfdae8e291';
  const itemId='354d337a-4e9f-42ab-a8ec-0c327a45748a', jobId='1a258e4b-aa34-454c-8f04-ada32b4c808f';
  const reason='reviewed exact staging bootstrap 38149230374-1';
  async function inspect(session, repaired=false) {
    const opts=session ? {session} : options;
    const run=await db.collections.experiment_runs.findOne({_id:runId},opts);
    const op=await db.collections.experiment_operations.findOne({_id:operationId,runId},opts);
    const item=await db.collections.generation_items.findOne({_id:itemId,jobId},opts);
    const job=await db.collections.generation_jobs.findOne({_id:jobId},opts);
    if (!run || !op || !item || !job || run.mode!=='simulated' || run.status!=='blocked' || run.safeFailure!=='definite_failure' ||
        run.activeOperationId!=null || run.counters?.payableText!==0 || run.counters?.payableImage!==0 || job.bookletId!==run.bookletId || job.jobType!=='dify_pages' || JSON.parse(job.inputJson).runId!==runId ||
        JSON.parse(item.resultJson).operationId!==operationId || item.itemKey!==op.subjectId || op.subjectKind!=='page' ||
        op.role!=='image' || op.taskId!=='J13' || op.state!=='failed' || op.safeFailure!=='definite_failure' || op.reservationCount!==0 ||
        op.resultJson!=null || op.materializationJson!=null || op.imageCompletionClaim!=null || op.imageCompletionDigest!=null ||
        op.workflowRunId!=='bbd3a736-6777-4088-8627-557999d7f001' ||
        item.status!==(repaired?'failed':'running') || job.status!==(repaired?'failed':'running')) throw Error('EvidenceDiffers');
    const counts={};
    for (const name of ['generation_items','execution_items','model_calls']) counts[name]=await db.collections[name].countDocuments(
      {status:'running',...(name==='generation_items'?{_id:{$ne:itemId}}:{})},opts);
    counts.followups=await db.collections.card_responses.countDocuments({followupStatus:'running'},opts);
    counts.operations=await db.collections.experiment_operations.countDocuments({$or:[
      {state:{$in:['prepared','started','unknown']}},
      {state:'succeeded',dispatchStartedAtMs:{$ne:null},verifiedWorkflowId:null}
    ]},opts);
    counts.runs=await db.collections.experiment_runs.countDocuments({$or:[
      {status:{$in:['queued','running','pausing']}}, {activeOperationId:{$ne:null}},
      {preparation:{$ne:null},$or:[{'preparation.outcome':{$ne:'failed'}},{'preparation.unresolved':true}]}
    ]},opts);
    const control=await db.collections.deployment_control.findOne({environment:'_staging'},opts);
    if (!control || control.activeMutations!==0 || (control.interruptedMutations??0)!==0 || Object.values(counts).some(Boolean)) throw Error('OtherWorkRemains');
    return {control,op,counts};
  }
  try {
    if (mode==='reopen') {
      const changed=await db.collections.deployment_control.updateOne({environment:'_staging',maintenance:true,reason},
        {$set:{maintenance:false,reason:null,updatedAtMs:Date.now()}});
      if (changed.modifiedCount!==1) throw Error('AdmissionChanged');
      console.log(JSON.stringify({admission:'open'})); return;
    }
    const initial=await inspect(null,mode==='final');
    if (mode==='inspect' || mode==='close') {
      const {readBookletRunnerConfig}=require('./lib/experiment-runner/config.ts');
      const {createWorkflowRuntime}=require('./lib/experiment-runner/transport.ts');
      const state=readBookletRunnerConfig(); if (!state.enabled) throw Error('BindingInvalid');
      const binding=state.config.bindings.find(b=>b.role==='image' && b.taskId===null);
      const saved=JSON.parse((await db.collections.experiment_runs.findOne({_id:runId})).configurationJson).find(b=>b.role==='image');
      if (!binding || binding.appId!==saved.appId || binding.publishedWorkflowId!==saved.publishedWorkflowId) throw Error('PublicationDiffers');
      const result=await createWorkflowRuntime(state.config).retrieve(binding,initial.op.workflowRunId,{deadlineAtMs:Date.now()+10000});
      if (result.kind!=='execution' || result.execution.status!=='failed' || result.execution.id!==initial.op.workflowRunId ||
          result.execution.workflow_id!==binding.publishedWorkflowId) throw Error('RemoteOutcomeUnverified');
    }
    if (mode==='close') {
      const changed=await db.collections.deployment_control.updateOne({environment:'_staging',maintenance:false,activeMutations:0,
        updatedAtMs:initial.control.updatedAtMs},{$set:{maintenance:true,reason,updatedAtMs:Date.now()}});
      if (changed.modifiedCount!==1) throw Error('AdmissionRace');
      try { const checked=await inspect(); if (!checked.control.maintenance || checked.control.reason!==reason) throw Error('AdmissionRace'); }
      catch (error) {
        await db.collections.deployment_control.updateOne({environment:'_staging',maintenance:true,reason},{$set:{maintenance:false,reason:null,updatedAtMs:Date.now()}});
        throw error;
      }
    } else if (mode==='repair') {
      await withMongoTransaction(db,async session=>{
        const checked=await inspect(session); if (!checked.control.maintenance || checked.control.reason!==reason) throw Error('AdmissionChanged');
        const now=Date.now(), errorJson=JSON.stringify({code:'experiment_run_blocked',runId,operationId,backupId:process.env.BACKUP_ID});
        const item=await db.collections.generation_items.updateOne({_id:itemId,jobId,status:'running'},{$set:{status:'failed',errorJson,finishedAtMs:now}},{session});
        const job=await db.collections.generation_jobs.updateOne({_id:jobId,jobType:'dify_pages',status:'running'},{$set:{status:'failed',errorJson,finishedAtMs:now,updatedAtMs:now}},{session});
        if (item.modifiedCount!==1 || job.modifiedCount!==1) throw Error('EvidenceRace');
      });
    } else if (!['inspect','idle','final'].includes(mode)) throw Error('ModeInvalid');
    if (['idle','final'].includes(mode) && (!initial.control.maintenance || initial.control.reason!==reason)) throw Error('AdmissionChanged');
    console.log(JSON.stringify({verified:true,mode,runId,operationId,itemId,jobId,counts:initial.counts}));
  } finally { await db.close(); }
})().catch(()=>{ console.error('error: Exact staging bootstrap check failed; inspect retained checkpoint without replay'); process.exitCode=1; });
NODE
  then return 0; else status=$?; fi
  stop_owned_oneoff "$name" 20 || printf 'error: Bootstrap one-off remains unverified; inspect before resume\n' >&2
  return "$status"
}
backup_verify_host() {
  require_root
  dify_diagnostic_identity
  exec 9>"$STATE/operation.lock"; flock -n 9 || die 'Another host operation is running'
  local release; read -r release < "$STATE/releases/$ENVIRONMENT/current"
  [[ "$release" == "$STATE/releases/$ENVIRONMENT/$COMMIT" && ! -L "$release" ]] || die 'Selected backup verification release changed'
  [[ "$(jq -er .services.app.image "$release/image.json")" == "$IMAGE_DIGEST" ]] || die 'Selected backup verification image changed'
  # A fresh read-only command has its own finite budget, not the failed request's
  # expired execution budget. Do not rewrite the retained operation journal.
  local REQUEST_ID='' CONTROL_DEADLINE_SECONDS=$((SECONDS + 1820))
  if [[ "$ENVIRONMENT" == staging && "$COMMIT" == c04d7512dfaa3156eb3b81331625d1a0af4f7faf ]]; then
    # This exact legacy image has verifiedCompletedBackup but predates the CLI
    # verify command. Use that installed read-only implementation directly.
    legacy_staging_node "$release" verify-backup
  else
    maintenance "$release" recovery verify
  fi
  printf 'result: backup verified %s %s\n' "$ENVIRONMENT" "$BACKUP_ID"
}
staging_bootstrap_guard() {
  local release="$STATE/releases/staging/c04d7512dfaa3156eb3b81331625d1a0af4f7faf" ids=() running_image records
  [[ "$(< "$STATE/releases/staging/current")" == "$release" ]] || die 'Historical staging release changed'
  [[ "$(jq -er .services.app.image "$release/image.json")" == "$(jq -er .image "$CONFIG_FILE")@sha256:ddb944691949ed1ff020dc5d4f2fb9873bcddc260f13a7485195889d1fed70cd" ]] || die 'Historical staging image changed'
  [[ "$(timeout 5s systemctl show kids-booklet-operation-38149230374-1.service --property=ActiveState --value)" =~ ^(failed|inactive)$ ]] || die 'Historical deployment service is active or unverified'
  jq -e --arg release "$release" '.requestId=="38149230374-1" and .action=="deploy" and .environment=="staging" and .step=="draining" and .commit=="e6f0575478ba2353a4d32c6a36d642152c9d426d" and .priorRelease==$release and (.backupId // "")==""' "$STATE/operation.json" >/dev/null || die 'Historical deployment journal differs'
  verify_artifact_retirement_release "$release" c04d7512dfaa3156eb3b81331625d1a0af4f7faf
  records="$(timeout 10s docker ps -q --filter label=com.docker.compose.project=kids-booklet-staging --filter label=com.docker.compose.service=app --filter label=com.docker.compose.oneoff=False)" || die 'Historical staging container status is unavailable'
  [[ -z "$records" ]] || mapfile -t ids <<< "$records"
  [[ "${#ids[@]}" -le 1 && ( "${1:-}" == allow-stopped || "${#ids[@]}" -eq 1 ) ]] || die 'Historical staging container count differs'
  if [[ "${#ids[@]}" -eq 1 ]]; then
    running_image="$(timeout 10s docker inspect --format '{{.Config.Image}}' "${ids[0]}")"
    [[ "$running_image" == "$(jq -er .services.app.image "$release/image.json")" ]] || die 'Historical running staging image differs'
  fi
}
staging_bootstrap_reconcile_host() (
  require_root
  dify_diagnostic_identity
  local release="$STATE/releases/staging/c04d7512dfaa3156eb3b81331625d1a0af4f7faf" marker="$STATE/staging-bootstrap.json"
  exec 9>"$STATE/operation.lock"; flock -n 9 || die 'Another host operation is running'
  staging_bootstrap_guard
  [[ ! -e "$marker" && ! -e "$STATE/operations/38149230374-1.json" ]] || die 'Bootstrap checkpoint already exists; inspect before any new attempt'
  printf 'result: bootstrap old request=38149230374-1 commit=c04d7512dfaa3156eb3b81331625d1a0af4f7faf image=sha256:ddb944691949ed1ff020dc5d4f2fb9873bcddc260f13a7485195889d1fed70cd\n'
  printf 'result: bootstrap candidate commit=%s image=%s\n' "$COMMIT" "$IMAGE_DIGEST"
  local REQUEST_ID='' CONTROL_DEADLINE_SECONDS=$((SECONDS + 2100))
  legacy_staging_node "$release" inspect
  [[ "$APPLY" == true ]] || { printf 'would update: exact staging page bookkeeping after verified backup; retain maintenance for separate reviewed deployment\n'; return; }
  [[ -n "$BACKUP_ID" ]] || BACKUP_ID="staging-bootstrap-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
  # Failure before repair restores original admission. Once repair begins its
  # outcome can be uncertain; retain maintenance and durable checkpoint instead.
  local closed=false repaired=false
  trap 'if [[ "$closed" == true && "$repaired" == false ]]; then CONTROL_DEADLINE_SECONDS=$((SECONDS + 240)); compose "$release" up -d --no-deps app && verify_application "$release" && legacy_staging_node "$release" reopen || printf "error: Original admission remains unverified; inspect bootstrap checkpoint\n" >&2; fi; cleanup' EXIT
  legacy_staging_node "$release" close
  closed=true
  stop_application "$release"
  legacy_staging_node "$release" idle
  if ! maintenance "$release" recovery backup || ! legacy_staging_node "$release" verify-backup; then
    die 'Bootstrap backup failed; no repair started; bounded original admission recovery follows'
  fi
  staging_bootstrap_guard allow-stopped
  jq -n --arg oldRequest 38149230374-1 --arg oldRelease "$release" --arg oldImage "$(jq -er .services.app.image "$release/image.json")" \
    --arg commit "$COMMIT" --arg image "$IMAGE_DIGEST" --arg backupId "$BACKUP_ID" --arg journalHash "$(sha256sum "$STATE/operation.json" | awk '{print $1}')" \
    '{oldRequest:$oldRequest,oldRelease:$oldRelease,oldImage:$oldImage,commit:$commit,image:$image,backupId:$backupId,originalJournalSha256:$journalHash,phase:"repairing-maintenance"}' > "$marker"
  repaired=true
  legacy_staging_node "$release" repair
  legacy_staging_node "$release" final
  staging_bootstrap_guard allow-stopped
  # Preserve byte-for-byte evidence; supersession metadata is separate.
  cp --no-clobber "$STATE/operation.json" "$STATE/operations/38149230374-1.json"
  cmp -s "$STATE/operation.json" "$STATE/operations/38149230374-1.json" || die 'Historical journal archive differs'
  jq '.phase="reconciled-maintenance" | .superseded=true' "$marker" > "$marker.next"; mv "$marker.next" "$marker"
  rm "$STATE/operation.json"
  closed=false
  printf 'updated: exact staging bookkeeping repaired; backup=%s; admission remains closed for separately identified reviewed deployment\n' "$BACKUP_ID"
)
bootstrap_ready_for_deploy() {
  local release="$1" marker="$STATE/staging-bootstrap.json" backup
  [[ "$ENVIRONMENT" == staging && "$ACTION" == deploy ]] || die 'Bootstrap maintenance only permits its separately reviewed staging deployment'
  jq -e --arg commit "$COMMIT" --arg image "$IMAGE_DIGEST" --arg release "$release" \
    '.phase=="reconciled-maintenance" and .superseded==true and .oldRequest=="38149230374-1" and .oldRelease==$release and .commit==$commit and .image==$image and (.backupId|test("^[a-zA-Z0-9_-]{1,160}$"))' "$marker" >/dev/null || die 'Bootstrap candidate or maintenance checkpoint differs'
  [[ -f "$STATE/operations/38149230374-1.json" ]] || die 'Original bootstrap journal archive is missing'
  [[ "$(jq -er .originalJournalSha256 "$marker")" == "$(sha256sum "$STATE/operations/38149230374-1.json" | awk '{print $1}')" ]] || die 'Original bootstrap journal archive changed'
  [[ "$(jq -er .oldImage "$marker")" == "$(jq -er .services.app.image "$release/image.json")" ]] || die 'Bootstrap selected old image differs'
  verify_artifact_retirement_release "$release" c04d7512dfaa3156eb3b81331625d1a0af4f7faf
  backup="$(jq -er .backupId "$marker")"
  # Observe current state through the old runtime without rewriting the new
  # request journal or changing its original phase budget.
  (local REQUEST_ID='' BACKUP_ID="$backup"; legacy_staging_node "$release" final)
}
# Recovery artifacts are separate from the original lifecycle journal. The
# request ID is an idempotency key, never permission to repeat an uncertain write.
recovery_no_containers() {
  local ids
  ids="$(timeout 10s docker ps "$@")" || die 'Recovery container inspection failed'
  [[ -z "$ids" ]]
}
recovery_host_fingerprint() {
  sha256sum "$1/manifest.sha256" "$SECRETS/staging/secrets.json" "$CONFIG_FILE" | sha256sum | awk '{print $1}'
}
expired_recovery_handoff_hash() {
  local current="$1" marker="$STATE/recovery-handoff-staging.json" archive="$STATE/operations/recovery-handoff-$ORIGINAL_REQUEST_ID.json" original="$STATE/operation.json" id parent tree image
  [[ -e "$original" ]] || original="$STATE/operations/$ORIGINAL_REQUEST_ID.json"
  if [[ -e "$marker" && -e "$archive" ]]; then cmp -s "$marker" "$archive" || die 'Recovery handoff archive differs'; fi
  [[ -e "$marker" ]] || marker="$archive"
  [[ -e "$marker" ]] || return 0
  [[ -f "$marker" && ! -L "$marker" ]] || die 'Recovery handoff is invalid'
  id="$(jq -er .requestId "$marker")"
  [[ "$id" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$ ]] || die 'Recovery handoff identity invalid'
  parent="$STATE/recoveries/$id/host.json"
  [[ -f "$parent" && ! -L "$parent" ]] || die 'Recovery handoff journal missing'
  jq -e --arg prior "$current" '.action=="candidate-reconcile" and .environment=="staging" and .priorRelease==$prior and (.sourceTree|test("^[a-f0-9]{40}$"))' "$marker" >/dev/null || die 'Recovery handoff target differs'
  jq -e '.phase=="complete"' "$parent" >/dev/null || die 'Recovery handoff is incomplete'
  [[ "$(jq -Sc 'del(.phase)' "$marker")" == "$(jq -Sc 'del(.phase)' "$parent")" ]] || die 'Recovery handoff provenance differs'
  image="$(jq -er .image "$original")"
  tree="$(docker image inspect --format '{{index .Config.Labels "uk.co.uniwares.booklet.source-tree"}}' "$image")" || die 'Failed deployment tree inspection failed'
  [[ "$tree" == "$(jq -er .sourceTree "$marker")" ]] || die 'Recovery handoff failed deployment differs'
  sha256sum "$marker" | awk '{print $1}'
}
recovery_verify_fingerprint() {
  local journal="$1" current="$2" supplied="$BACKUP_ID" fingerprint backup digest
  fingerprint="$(recovery_host_fingerprint "$current")" || die 'Recovery fingerprint inspection failed'
  if [[ "$(jq -r .action "$journal")" == expired-deployment-recover ]] && jq -e 'has("handoffSha256")' "$journal" >/dev/null; then
    local handoff_hash
    handoff_hash="$(expired_recovery_handoff_hash "$current")" || die 'Recovery handoff inspection failed'
    [[ "$handoff_hash" == "$(jq -r .handoffSha256 "$journal")" ]] || die 'Recovery handoff changed'
    fingerprint="$(printf '%s\n' "$fingerprint" "$handoff_hash" | sha256sum | awk '{print $1}')"
  elif [[ "$(jq -r .action "$journal")" == expired-deployment-recover && -e "$STATE/recovery-handoff-staging.json" ]]; then
    die 'legacy_preview_fingerprint_unverified: recovery handoff was not pinned'
  fi
  if jq -e 'has("hostFingerprint") and has("previewBackupId")' "$journal" >/dev/null; then
    [[ "$(jq -er .hostFingerprint "$journal")" == "$fingerprint" ]] || die 'Recovery configuration changed'
    return 0
  fi
  # Legacy candidate journals overwrite backupId after backup. Only a digest
  # match proves the original value; never adopt today's protected files.
  local -a backups=("$(jq -r '.backupId // ""' "$journal")")
  if [[ "$(jq -er .action "$journal")" == candidate-reconcile ]]; then backups+=("" "$supplied"); fi
  for backup in "${backups[@]}"; do
    digest="$(printf '%s\n' "$fingerprint" "$(jq -r .action "$journal")" "$(jq -r .requestId "$journal")" "$(jq -r .priorRelease "$journal")" "$(jq -r .priorImage "$journal")" "$(jq -r .commit "$journal")" "$(jq -r .image "$journal")" "$(jq -r .runId "$journal")" "$(jq -r .operationId "$journal")" "$(jq -r .expectedRevision "$journal")" "$(jq -r .appPreviewDigest "$journal")" "$(jq -r .originalJournalSha256 "$journal")" "$backup" "$(jq -r .sourceTree "$journal")" | sha256sum | awk '{print $1}')"
    [[ "$digest" != "$(jq -er .previewDigest "$journal")" ]] || return 0
  done
  die 'legacy_preview_fingerprint_unverified'
}
recovery_child_receipt() {
  local journal="$1" parent="$STATE/recoveries/$ORIGINAL_REQUEST_ID/application-recovery.json" revision
  [[ -f "$journal" && ! -L "$journal" ]] || return 1
  [[ "$(jq -r .phase "$journal")" =~ ^(complete|aborted-closed)$ ]] || return 1
  jq -e --arg id "$REQUEST_ID" --arg original "$ORIGINAL_REQUEST_ID" --arg commit "$COMMIT" --arg image "$IMAGE_DIGEST" --arg run "$RUN_ID" --arg op "$OPERATION_ID" '
    .requestId==$id and .originalRequestId==$original and .action=="candidate-reconcile" and .purpose=="release-expired-claim" and .environment=="staging" and .commit==$commit and .image==$image and .runId==$run and .operationId==$op' "$journal" >/dev/null || die 'Historical child identity differs'
  [[ -f "$parent" && ! -L "$parent" && "$(sha256sum "$parent" | awk '{print $1}')" == "$(jq -er .parentCheckpointSha256 "$journal")" ]] || die 'Original checkpoint differs'
  revision="$(jq -r '.expectedRevision // empty' "$journal")"
  [[ -n "$revision" ]] || revision="$(jq -er .target.expectedRevision "$parent")"
  [[ "$EXPECTED_REVISION" == "$revision" ]] || die 'Historical child revision differs'
  if [[ "$APPLY" == true ]]; then [[ "$PREVIEW_DIGEST" == "$(jq -er .previewDigest "$journal")" ]] || die 'Historical child preview differs'; fi
  jq -c '{requestId,action,purpose,phase,environment,commit,image,runId,operationId,originalRequestId,backupId,previewDigest,historical:true}' "$journal"
}
recovery_phase() {
  local path="$1" phase="$2"
  jq --arg phase "$phase" '.phase=$phase' "$path" > "$path.next"
  mv "$path.next" "$path"
}
recovery_result() {
  jq -c '{requestId,action,purpose,phase,environment,commit,image,priorRelease,runId,operationId,originalRequestId,backupId,previewDigest}' "$1"
}
recovery_oneoff() {
  local release="$1" evidence="$2" phase="$3"; shift 3
  local name="booklet-operation-staging-${REQUEST_ID}-$$-$RANDOM" status=0
  local -a mounts=() command=(node --import tsx scripts/booklet-recovery.ts "$phase")
  [[ -z "$evidence" ]] || mounts=(--user 0:0 -v "$evidence:/recovery")
  [[ -z "$RECOVERY_ORIGINAL_EVIDENCE" ]] || mounts+=(--user 0:0 -v "$RECOVERY_ORIGINAL_EVIDENCE:/original-recovery:ro")
  if [[ "$phase" == legacy-compatibility ]]; then
    command=(node --import tsx --input-type=module -e '
      import {getDatabase} from "./db/client.ts";
      import {verifyMongoStructure} from "./db/setup.ts";
      import {verifyExperimentData,verifyMongoData} from "./db/verify.ts";
      import {readBookletRunnerConfig} from "./lib/experiment-runner/config.ts";
      if(process.env.RUNNER_ENABLED!=="false" || process.env.DEPLOYMENT_ENV!=="_staging" || process.env.MONGODB_DATABASE!=="kids_booklet" || process.env.ASSETS_BUCKET!=="kids-booklet-staging-assets") throw new Error("Wrong recovery environment");
      const db=getDatabase(); try {
        const control=await db.collections.deployment_control.findOne({_id:"environment:_staging"});
        if(!control?.maintenance || control.draining || control.activeMutations!==0 || (control.interruptedMutations??0)!==0 || (control.mutationOwners??[]).length) throw new Error("Admission is not closed and quiet");
        for(const name of ["generation_jobs","generation_items","execution_items","model_calls"]){if(await db.collections[name].countDocuments({status:"running"})) throw new Error("Unresolved work");}
        if(await db.collections.card_responses.countDocuments({followupStatus:"running"})) throw new Error("Unresolved followup");
        if(await db.collections.experiment_runs.countDocuments({$or:[{status:{$in:["queued","running"]}},{activeOperationId:{$exists:true,$ne:null}},{safeFailure:"unknown_outcome"},{preparation:{$exists:true,$ne:null},$or:[{"preparation.outcome":{$ne:"failed"}},{"preparation.unresolved":true}]}]})) throw new Error("Unresolved run");
        if(await db.collections.experiment_operations.countDocuments({$or:[{state:{$in:["prepared","started","unknown"]}},{"lifecycle.unresolved":true},{state:"succeeded",dispatchStartedAtMs:{$exists:true,$ne:null},verifiedWorkflowId:null},...["authorizationClaim","resultFinalizationClaim","imageCompletionClaim"].map(key=>({[key]:{$exists:true,$ne:null}}))]})) throw new Error("Unresolved operation");
        await verifyMongoStructure(db); const profile=readBookletRunnerConfig(); if(!profile.enabled && profile.reason==="invalid") throw new Error("Invalid configuration"); if(profile.enabled) await verifyExperimentData(db); else await verifyMongoData(db); console.log(JSON.stringify({verified:true,compatible:true}));} finally {await db.close();}')
  fi
  if COMPOSE_TIMEOUT_SECONDS=180 compose "$release" run --rm --no-deps -T --interactive=false --name "$name" \
    --label "uk.co.uniwares.booklet.request=$REQUEST_ID" --label uk.co.uniwares.booklet.environment=staging \
    -e RUNNER_ENABLED=false "${mounts[@]}" app "${command[@]}" "$@"; then return 0; else status=$?; fi
  stop_owned_oneoff "$name" 20 || die 'Recovery one-off cleanup is unverified; inspect retained evidence'
  return "$status"
}
recovery_schema_digest() {
  local name="booklet-operation-staging-${REQUEST_ID}-schema-$$-$RANDOM" status=0
  if timeout --kill-after=5s 30s docker run --rm --network none --name "$name"     --label "uk.co.uniwares.booklet.request=$REQUEST_ID" --label uk.co.uniwares.booklet.environment=staging     --label com.docker.compose.project=kids-booklet-staging --label com.docker.compose.oneoff=True --entrypoint node "$1" -e '
    const fs=require("fs"),c=require("crypto"),h=c.createHash("sha256");
    for(const p of ["scripts/initialize-deployment.ts","db/initialize.ts","db/setup.ts","db/indexes.ts","db/seed.ts","db/documents.ts"]){h.update(p);h.update(fs.readFileSync(p));} console.log(h.digest("hex"));'; then return 0; else status=$?; fi
  stop_owned_oneoff "$name" 20 || die 'Schema inspection container cleanup is unverified'
  return "$status"
}
recovery_app_json() {
  local release="$1" evidence="$2" phase="$3" output="$4"; shift 4
  if ! recovery_oneoff "$release" "$evidence" "$phase" "$@" > "$output" 2> "$output.stderr"; then
    # Never print arbitrary provider errors or private maintenance logs.
    jq -Rc 'fromjson? | select(type=="object") | {environment:"_staging",verified,phase,stage,outcome,code:(if (.code|type)=="string" and (.code|test("^[a-z0-9_]{1,80}$")) then .code else null end),blockers,inspectionError,errorKind,elapsedMs,remainingBudgetMs,cleanupOutcome,commitState,observedCount,blockerIds}' "$output" || true
    die "Recovery $phase failed; inspect private evidence; no automatic replay"
  fi
  jq -se 'length==1 and (.[0]|type=="object") and (.[0].verified==true)' "$output" >/dev/null || die 'Recovery result is missing or malformed'
}
recovery_finish_candidate() {
  local current="$1" candidate="$2" evidence="$3" journal="$4" app_digest="$5"
  recovery_app_json "$candidate" "$evidence" verify-completed "$evidence/completed.json" --run-id "$RUN_ID" --operation-id "$OPERATION_ID" --expected-revision "$EXPECTED_REVISION" --preview-digest "$app_digest" --evidence-dir /recovery
  recovery_phase "$journal" restoring-closed
  compose "$current" up -d --no-deps app || die 'Prior service restart failed'
  verify_application "$current" || die 'Prior service readiness failed'
  recovery_app_json "$candidate" "$evidence" verify-completed "$evidence/post-start.json" --run-id "$RUN_ID" --operation-id "$OPERATION_ID" --expected-revision "$EXPECTED_REVISION" --preview-digest "$app_digest" --evidence-dir /recovery
  cp "$journal" "$STATE/recovery-handoff-staging.json"
  recovery_phase "$journal" complete
}
expired_recovery_finish() {
  local current="$1" candidate="$2" evidence="$3" journal="$4" old_hash
  old_hash="$(jq -er .originalJournalSha256 "$journal")"
  [[ "$(timeout 10s systemctl show "kids-booklet-operation-$ORIGINAL_REQUEST_ID.service" --property=ActiveState --value)" =~ ^(inactive|failed)$ ]] || die 'Original deployment process is not stopped'
  recovery_no_containers -aq --filter "label=uk.co.uniwares.booklet.request=$ORIGINAL_REQUEST_ID" || die 'Original owned containers remain'
  [[ ! -e "$STATE/operation.json" || "$(sha256sum "$STATE/operation.json" | awk '{print $1}')" == "$old_hash" ]] || die 'Original journal changed'
  [[ ! -e "$STATE/operations/$ORIGINAL_REQUEST_ID.json" || "$(sha256sum "$STATE/operations/$ORIGINAL_REQUEST_ID.json" | awk '{print $1}')" == "$old_hash" ]] || die 'Original journal archive changed'
  [[ -e "$STATE/operation.json" || -e "$STATE/operations/$ORIGINAL_REQUEST_ID.json" ]] || die 'Original journal evidence is missing'
  # The prior service may already have restarted before the client disconnected.
  local ids id expected
  expected="$(jq -er .services.app.image "$current/image.json")"
  ids="$(timeout 10s docker ps -q --filter label=com.docker.compose.project=kids-booklet-staging)" || die 'Recovery container inspection failed'
  if [[ -n "$ids" ]]; then
    [[ "$ids" =~ ^[a-f0-9]{12,64}$ ]] || die 'Unexpected staging containers remain'
    id="$ids"
    [[ "$(docker inspect --format '{{.Config.Image}}' "$id")" == "$expected" ]] || die 'Running application image differs'
  fi
  recovery_phase "$journal" restoring-closed
  (REQUEST_ID=''; maintenance "$current" deployment-control enable recovery) > "$evidence/admission.json"
  recovery_app_json "$candidate" '' legacy-compatibility "$evidence/prior-compatible.json"
  (REQUEST_ID=''; compose "$current" up -d --no-deps app) || die 'Prior service restart failed'
  (REQUEST_ID=''; verify_application "$current") || die 'Prior service readiness failed'
  recovery_app_json "$candidate" '' legacy-compatibility "$evidence/post-start.json"
  # Retire only the preview-pinned handoff after compatibility and readiness.
  # Preserve its exact bytes with the original failed deployment.
  local handoff_hash marker="$STATE/recovery-handoff-staging.json" archive="$STATE/operations/recovery-handoff-$ORIGINAL_REQUEST_ID.json"
  handoff_hash="$(expired_recovery_handoff_hash "$current")" || die 'Recovery handoff inspection failed'
  [[ "$handoff_hash" == "$(jq -r '.handoffSha256 // ""' "$journal")" ]] || die 'Recovery handoff is not preview-pinned'
  if [[ -n "$handoff_hash" && -e "$marker" ]]; then
    if [[ ! -e "$archive" ]]; then cp --no-clobber "$marker" "$archive"; fi
    cmp -s "$marker" "$archive" || die 'Recovery handoff archive differs'
    rm "$marker"
  fi
  if [[ ! -e "$STATE/operations/$ORIGINAL_REQUEST_ID.json" ]]; then
    cp --no-clobber "$STATE/operation.json" "$STATE/operations/$ORIGINAL_REQUEST_ID.json"
  fi
  [[ "$(sha256sum "$STATE/operations/$ORIGINAL_REQUEST_ID.json" | awk '{print $1}')" == "$old_hash" ]] || die 'Original archive differs'
  recovery_phase "$journal" archived-closed
  if [[ -e "$STATE/operation.json" ]]; then
    cmp -s "$STATE/operation.json" "$STATE/operations/$ORIGINAL_REQUEST_ID.json" || die 'Original journal differs'
    rm "$STATE/operation.json"
  fi
  maintenance "$current" deployment-control disable > "$evidence/admission-open.json"
  jq -e '.maintenance==false and .draining==false and .activeMutations==0 and ((.mutationOwners // [])|length==0) and (.interruptedMutations // 0)==0' "$evidence/admission-open.json" >/dev/null || die 'Admission reopen is unverified'
}
recovery_unresolved_guard() {
  local allowed="${1:-}" original="${2:-}" record id
  [[ "$ENVIRONMENT" == staging ]] || return 0
  for record in "$STATE"/recoveries/*/host.json; do
    [[ -e "$record" ]] || continue
    [[ -f "$record" && ! -L "$record" ]] || die 'Recovery journal is invalid'
    id="$(jq -er .requestId "$record")"
    [[ "$id" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$ ]] || die 'Recovery journal identity invalid'
    [[ "$id" == "$allowed" || "$id" == "$original" || "$(jq -r .phase "$record")" =~ ^(complete|aborted-closed)$ ]] || die "Unresolved recovery $id; inspect that request before another mutation"
  done
}
# A linked claim release never adopts or rewrites its parent's interrupted journal.
recovery_release_expired_claim() {
  local current="$1" image="$2" evidence="$3" journal="$4" parent="$STATE/recoveries/$ORIGINAL_REQUEST_ID"
  local parent_hash checkpoint_hash parent_image candidate tree app_digest digest binding_hash phase container_ids
  if recovery_child_receipt "$journal"; then return 0; fi
  [[ ! -e "$STATE/operation.json" && ! -e "$STATE/recovery-handoff-staging.json" ]] || die 'Host operation or handoff remains'
  container_ids="$(timeout 10s docker ps -q --filter label=com.docker.compose.project=kids-booklet-staging)" || die 'Claim release container inspection failed'
  [[ -z "$container_ids" ]] || die 'Claim release requires the serving application and all maintenance containers stopped'
  [[ -d "$parent" && ! -L "$parent" && -f "$parent/host.json" && ! -L "$parent/host.json" && -f "$parent/application-recovery.json" && ! -L "$parent/application-recovery.json" ]] || die 'Original recovery evidence is missing or linked'
  jq -e --arg id "$ORIGINAL_REQUEST_ID" --arg run "$RUN_ID" --arg op "$OPERATION_ID" --arg rev "$EXPECTED_REVISION" --arg prior "$current" --arg image "$image" '
    .requestId==$id and .action=="candidate-reconcile" and .environment=="staging" and .phase=="reconciling" and
    .runId==$run and .operationId==$op and .expectedRevision==$rev and .priorRelease==$prior and .priorImage==$image' "$parent/host.json" >/dev/null || die 'Original recovery identity changed'
  jq -e --arg run "$RUN_ID" --arg op "$OPERATION_ID" --argjson rev "$EXPECTED_REVISION" '
    .contract=="booklet-recovery-v1" and .phase=="started" and .target.runId==$run and .target.operationId==$op and .target.expectedRevision==$rev' "$parent/application-recovery.json" >/dev/null || die 'Original application checkpoint differs'
  [[ "$(jq -er .previewDigest "$parent/application-recovery.json")" == "$(jq -er .appPreviewDigest "$parent/host.json")" ]] || die 'Original proof identity differs'
  BACKUP_ID="$(jq -er .backupId "$parent/host.json")"
  [[ "$BACKUP_ID" =~ ^[a-zA-Z0-9_-]{1,160}$ && -f "$parent/backup-verify.log" && ! -L "$parent/backup-verify.log" ]] || die 'Original backup evidence missing'
  jq -Rse --arg id "$BACKUP_ID" 'split("\n") | map(fromjson? | select(type=="object")) | any(.verified==true and .backupId==$id and .database=="kids_booklet" and .environment=="_staging")' "$parent/backup-verify.log" >/dev/null || die 'Original backup was not verified'
  parent_hash="$(sha256sum "$parent/host.json" | awk '{print $1}')"
  checkpoint_hash="$(sha256sum "$parent/application-recovery.json" | awk '{print $1}')"
  binding_hash="$(sha256sum "$current/manifest.sha256" "$SECRETS/staging/secrets.json" "$CONFIG_FILE" | sha256sum | awk '{print $1}')"
  private_temp; candidate="$(mktemp -d "$TEMP_DIR/claim-candidate.XXXXXXXX")"
  cp "$current/compose.yml" "$current/environment.yml" "$current/runtime.env" "$candidate/"
  [[ "$IMAGE_DIGEST" == "$(jq -er .image "$CONFIG_FILE")"@sha256:* ]] || die 'Candidate repository differs'
  mkdir -p "$TEMP_DIR/docker"
  DOCKER_CONFIG="$TEMP_DIR/docker" timeout --kill-after=5s 300s docker pull "$IMAGE_DIGEST" >/dev/null
  [[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE_DIGEST")" == "$COMMIT" ]] || die 'Candidate revision differs'
  tree="$(docker image inspect --format '{{index .Config.Labels "uk.co.uniwares.booklet.source-tree"}}' "$IMAGE_DIGEST")"
  [[ "$tree" =~ ^[a-f0-9]{40}$ ]] || die 'Candidate tree missing'
  parent_image="$(jq -er .image "$parent/host.json")"
  [[ "$parent_image" == "$(jq -er .image "$CONFIG_FILE")"@sha256:* ]] || die 'Original candidate repository differs'
  local parent_schema candidate_schema
  parent_schema="$(recovery_schema_digest "$parent_image")" || die 'Original candidate schema inspection failed'
  candidate_schema="$(recovery_schema_digest "$IMAGE_DIGEST")" || die 'Claim candidate schema inspection failed'
  [[ "$parent_schema" =~ ^[a-f0-9]{64}$ && "$parent_schema" == "$candidate_schema" ]] || die 'Claim candidate schema differs'
  jq -n --arg image "$IMAGE_DIGEST" '{services:{app:{image:$image}}}' > "$candidate/image.json"
  RECOVERY_ORIGINAL_EVIDENCE="$parent"
  recovery_oneoff "$candidate" '' capabilities > "$TEMP_DIR/capabilities.json" 2> "$TEMP_DIR/capabilities.stderr"
  jq -e '.contract=="booklet-recovery-v1" and .environment=="_staging" and .initializationRequired==false and (.supported|index("expired-finalization-claim-release"))!=null' "$TEMP_DIR/capabilities.json" >/dev/null || die 'Claim release capability missing'
  if [[ -e "$evidence" ]]; then
    [[ -d "$evidence" && ! -L "$evidence" && -f "$journal" && ! -L "$journal" ]] || die 'Child evidence invalid'
    jq -e --arg id "$REQUEST_ID" --arg original "$ORIGINAL_REQUEST_ID" --arg commit "$COMMIT" --arg image "$IMAGE_DIGEST" --arg parent "$parent_hash" --arg checkpoint "$checkpoint_hash" --arg binding "$binding_hash" --arg tree "$tree" '
      .requestId==$id and .purpose=="release-expired-claim" and .originalRequestId==$original and .commit==$commit and .image==$image and
      .parentJournalSha256==$parent and .parentCheckpointSha256==$checkpoint and .bindingHash==$binding and .sourceTree==$tree' "$journal" >/dev/null || die 'Child recovery identity changed'
    recovery_result "$journal"
    [[ "$APPLY" == true ]] || return 0
    [[ "$PREVIEW_DIGEST" == "$(jq -er .previewDigest "$journal")" ]] || die 'Child preview differs'
    phase="$(jq -er .phase "$journal")"
    if [[ "$phase" == aborted-closed ]]; then
      [[ "$ABORT_RECOVERY" == true ]] || die 'Aborted claim release requires a new request'
      return 0
    fi
    [[ "$phase" == releasing-claim || "$phase" == complete ]] || die 'Child phase requires inspection'
    app_digest="$(jq -er .appPreviewDigest "$journal")"
    if [[ "$ABORT_RECOVERY" == true ]]; then
      [[ "$phase" == releasing-claim ]] || die 'Completed claim release cannot be aborted'
      recovery_app_json "$candidate" '' preview-claim-release "$evidence/abort-proof.json" --run-id "$RUN_ID" --operation-id "$OPERATION_ID" --expected-revision "$EXPECTED_REVISION"
      [[ "$(jq -er .previewDigest "$evidence/abort-proof.json")" == "$app_digest" ]] || die 'Original claim or business proof changed; abort forbidden'
      [[ "$(sha256sum "$parent/host.json" | awk '{print $1}')" == "$parent_hash" && "$(sha256sum "$parent/application-recovery.json" | awk '{print $1}')" == "$checkpoint_hash" ]] || die 'Original evidence changed'
      recovery_phase "$journal" aborted-closed
      recovery_result "$journal"
      return 0
    fi
    recovery_app_json "$candidate" "$evidence" verify-claim-release "$evidence/verified.json" --run-id "$RUN_ID" --operation-id "$OPERATION_ID" --expected-revision "$EXPECTED_REVISION" --preview-digest "$app_digest" --evidence-dir /recovery
  else
    [[ "$ABORT_RECOVERY" == false ]] || die 'No child claim recovery exists to abort'
    recovery_app_json "$candidate" '' preview-claim-release "$TEMP_DIR/claim-preview.json" --run-id "$RUN_ID" --operation-id "$OPERATION_ID" --expected-revision "$EXPECTED_REVISION"
    app_digest="$(jq -er .previewDigest "$TEMP_DIR/claim-preview.json")"
    [[ "$app_digest" =~ ^[a-f0-9]{64}$ ]] || die 'Claim preview proof missing'
    digest="$(printf '%s\n' "$REQUEST_ID" "$ORIGINAL_REQUEST_ID" "$parent_hash" "$checkpoint_hash" "$binding_hash" "$COMMIT" "$IMAGE_DIGEST" "$tree" "$app_digest" | sha256sum | awk '{print $1}')"
    printf 'result: recovery preview request=%s action=candidate-reconcile digest=%s\n' "$REQUEST_ID" "$digest"
    [[ "$APPLY" == true ]] || return 0
    [[ "$PREVIEW_DIGEST" == "$digest" ]] || die 'Claim preview changed'
    mkdir "$evidence"; chmod 700 "$evidence"
    jq -n --arg id "$REQUEST_ID" --arg original "$ORIGINAL_REQUEST_ID" --arg commit "$COMMIT" --arg image "$IMAGE_DIGEST" --arg parent "$parent_hash" --arg checkpoint "$checkpoint_hash" --arg binding "$binding_hash" --arg tree "$tree" --arg digest "$digest" --arg appDigest "$app_digest" --arg run "$RUN_ID" --arg op "$OPERATION_ID" --arg backup "$BACKUP_ID" --arg prior "$current" --arg revision "$EXPECTED_REVISION" '
      {requestId:$id,expectedRevision:$revision,action:"candidate-reconcile",priorRelease:$prior,purpose:"release-expired-claim",environment:"staging",phase:"releasing-claim",originalRequestId:$original,commit:$commit,image:$image,parentJournalSha256:$parent,parentCheckpointSha256:$checkpoint,bindingHash:$binding,sourceTree:$tree,previewDigest:$digest,appPreviewDigest:$appDigest,runId:$run,operationId:$op,backupId:$backup}' > "$journal"
    recovery_app_json "$candidate" "$evidence" apply-claim-release "$evidence/applied.json" --run-id "$RUN_ID" --operation-id "$OPERATION_ID" --expected-revision "$EXPECTED_REVISION" --preview-digest "$app_digest" --evidence-dir /recovery
    recovery_app_json "$candidate" "$evidence" verify-claim-release "$evidence/verified.json" --run-id "$RUN_ID" --operation-id "$OPERATION_ID" --expected-revision "$EXPECTED_REVISION" --preview-digest "$app_digest" --evidence-dir /recovery
  fi
  [[ "$(sha256sum "$parent/host.json" | awk '{print $1}')" == "$parent_hash" && "$(sha256sum "$parent/application-recovery.json" | awk '{print $1}')" == "$checkpoint_hash" ]] || die 'Original evidence changed'
  recovery_phase "$journal" complete
  recovery_result "$journal"
}
supported_recovery_host() (
  require_root
  dify_diagnostic_identity
  exec 9>"$STATE/operation.lock"; flock -n 9 || die 'Another host operation is running'
  if [[ "$RELEASE_EXPIRED_CLAIM" == true ]] && recovery_child_receipt "$STATE/recoveries/$REQUEST_ID/host.json"; then return 0; fi
  if [[ "$INSPECTION_ONLY" == false ]]; then
    if [[ "$RELEASE_EXPIRED_CLAIM" == true ]]; then recovery_unresolved_guard "$REQUEST_ID" "$ORIGINAL_REQUEST_ID"; else recovery_unresolved_guard "$REQUEST_ID"; fi
  fi
  recovery_no_containers -q --filter label=com.docker.compose.project=kids-booklet-staging --filter label=com.docker.compose.oneoff=True || die 'Staging maintenance container remains active; inspect its owning request, do not replay'
  local CONTROL_DEADLINE_SECONDS=$((SECONDS + 2520)) current image candidate evidence journal digest app_digest='' old_hash='' failed_image='' host_fingerprint source_tree='' prior_schema failed_schema handoff_hash=''
  read -r current < "$STATE/releases/staging/current"
  [[ "$current" =~ ^$STATE/releases/staging/[a-f0-9]{40}$ && ! -L "$current" ]] || die 'Selected staging release is invalid'
  (cd "$current" && sha256sum -c manifest.sha256 >/dev/null) || die 'Selected release files changed'
  image="$(jq -er .services.app.image "$current/image.json")"
  evidence="$STATE/recoveries/$REQUEST_ID"; journal="$evidence/host.json"
  if [[ "$RELEASE_EXPIRED_CLAIM" == true ]]; then recovery_release_expired_claim "$current" "$image" "$evidence" "$journal"; return; fi
  if [[ -e "$evidence" ]]; then
    [[ -f "$journal" && ! -L "$evidence" ]] || die 'Recovery evidence is incomplete'
    jq -e --arg action "$ACTION" --arg commit "$COMMIT" --arg image "$IMAGE_DIGEST" --arg run "$RUN_ID" --arg operation "$OPERATION_ID" --arg original "$ORIGINAL_REQUEST_ID" \
      '.action==$action and .commit==$commit and .image==$image and .runId==$run and .operationId==$operation and .originalRequestId==$original' "$journal" >/dev/null || die 'Recovery request ID belongs to another target'
    recovery_result "$journal"
    if [[ "$(jq -r .phase "$journal")" =~ ^(complete|aborted-closed)$ ]]; then return 0; fi
    if [[ "$APPLY" == true ]]; then recovery_verify_fingerprint "$journal" "$current"; fi
    if [[ "$ABORT_RECOVERY" == true ]]; then
      [[ "$PREVIEW_DIGEST" == "$(jq -er .previewDigest "$journal")" && "$EXPECTED_REVISION" == "$(jq -er .expectedRevision "$journal")" && "$current" == "$(jq -er .priorRelease "$journal")" && "$image" == "$(jq -er .priorImage "$journal")" ]] || die 'Abort recovery identity changed'
      local abort_phase interrupted_phase
      abort_phase="$(jq -er .phase "$journal")"; interrupted_phase="$(jq -r '.interruptedPhase // ""' "$journal")"
      [[ "$abort_phase" =~ ^(prepared|closing|stopping|backup|reconciling|aborting-closed)$ ]] || die 'Recovery phase cannot be aborted'
      if [[ "$abort_phase" == reconciling || ( "$abort_phase" == aborting-closed && "$interrupted_phase" == reconciling ) ]]; then
        # A started checkpoint is evidence of intent, not proof of a write.
        # Only unchanged business state and the original grant permit abort.
        private_temp; candidate="$(mktemp -d "$TEMP_DIR/abort-candidate.XXXXXXXX")"
        cp "$current/compose.yml" "$current/environment.yml" "$current/runtime.env" "$candidate/"
        jq -n --arg image "$IMAGE_DIGEST" '{services:{app:{image:$image}}}' > "$candidate/image.json"
        [[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE_DIGEST")" == "$COMMIT" ]] || die 'Abort candidate revision differs'
        source_tree="$(jq -er .sourceTree "$journal")"
        [[ "$source_tree" =~ ^[a-f0-9]{40}$ && "$(docker image inspect --format '{{index .Config.Labels "uk.co.uniwares.booklet.source-tree"}}' "$IMAGE_DIGEST")" == "$source_tree" ]] || die 'Abort candidate source tree differs'
        app_digest="$(jq -er .appPreviewDigest "$journal")"
        recovery_app_json "$candidate" '' verify-unapplied "$evidence/abort-unapplied.json" --run-id "$RUN_ID" --operation-id "$OPERATION_ID" --expected-revision "$EXPECTED_REVISION" --preview-digest "$app_digest"
        jq -e '.verified==true and .outcome=="unapplied" and .providerPosts==0' "$evidence/abort-unapplied.json" >/dev/null || die 'Unapplied recovery proof is missing'
      else
        [[ ! -e "$evidence/application-recovery.json" ]] || die 'Unexpected application checkpoint; abort is forbidden'
      fi
      jq '.interruptedPhase=(.interruptedPhase // .phase) | .phase="aborting-closed"' "$journal" > "$journal.next"; mv "$journal.next" "$journal"
      maintenance "$current" deployment-control enable recovery > "$evidence/abort-admission.json" || die 'Abort admission close failed'
      compose "$current" up -d --no-deps app || die 'Abort prior service restart failed'
      verify_application "$current" || die 'Abort prior readiness failed'
      maintenance "$current" deployment-control status | jq -e '.maintenance==true and .draining==false and .activeMutations==0 and (.interruptedMutations // 0)==0 and ((.mutationOwners // [])|length==0)' >/dev/null || die 'Abort admission is not closed and quiet'
      recovery_phase "$journal" aborted-closed
      recovery_result "$journal"
      return 0
    fi
    [[ "$APPLY" == true ]] || return 0
    if [[ "$ACTION" == expired-deployment-recover && "$(jq -r .phase "$journal")" =~ ^(prepared|restoring-closed|archived-closed)$ ]]; then
      [[ "$PREVIEW_DIGEST" == "$(jq -er .previewDigest "$journal")" && "$current" == "$(jq -er .priorRelease "$journal")" && "$image" == "$IMAGE_DIGEST" ]] || die 'Expired recovery identity changed'
      if [[ "$(jq -r .phase "$journal")" == prepared ]]; then
        [[ -f "$STATE/operation.json" && "$(sha256sum "$STATE/operation.json" | awk '{print $1}')" == "$(jq -er .originalJournalSha256 "$journal")" ]] || die 'Original prepared journal changed'
        [[ "$(timeout 10s systemctl show "kids-booklet-operation-$ORIGINAL_REQUEST_ID.service" --property=ActiveState --value)" =~ ^(inactive|failed)$ ]] || die 'Original process remains active or unknown'
        recovery_no_containers -aq --filter "label=uk.co.uniwares.booklet.request=$ORIGINAL_REQUEST_ID" || die 'Original owned containers remain'
        recovery_no_containers -q --filter label=com.docker.compose.project=kids-booklet-staging || die 'Staging containers remain active'
        failed_image="$(jq -er .image "$STATE/operation.json")"
        prior_schema="$(recovery_schema_digest "$image")" || die 'Prior schema inspection failed'
        failed_schema="$(recovery_schema_digest "$failed_image")" || die 'Failed candidate schema inspection failed'
        [[ "$prior_schema" =~ ^[a-f0-9]{64}$ && "$prior_schema" == "$failed_schema" ]] || die 'Initializer or schema changed'
      fi
      BACKUP_ID="$(jq -er .backupId "$journal")"
      (REQUEST_ID=''; maintenance "$current" recovery verify) > "$evidence/resume-backup.log" 2>&1 || die 'Retained backup verification failed'
      trap 'status=$?; if [[ "$status" != 0 ]]; then (REQUEST_ID=""; CONTROL_DEADLINE_SECONDS=$((SECONDS + 120)); maintenance "$current" deployment-control enable recovery > "$evidence/fail-closed.log" 2>&1) || printf "error: Recovery admission closure is unverified\n" >&2; fi; cleanup' EXIT
      expired_recovery_finish "$current" "$current" "$evidence" "$journal"
      recovery_phase "$journal" complete
      recovery_result "$journal"
      return 0
    fi
    [[ "$ACTION" == candidate-reconcile && "$PREVIEW_DIGEST" == "$(jq -er .previewDigest "$journal")" && "$(jq -r .phase "$journal")" =~ ^(reconciling|restoring-closed)$ ]] || die 'Recovery is interrupted; inspect retained phase, do not replay'
    [[ "$EXPECTED_REVISION" == "$(jq -er .expectedRevision "$journal")" && "$current" == "$(jq -er .priorRelease "$journal")" && ! -e "$STATE/operation.json" ]] || die 'Interrupted recovery target changed'
    # Only verification of a committed result permits completing the host tail.
    # Never call the application apply phase again.
    private_temp; candidate="$TEMP_DIR/candidate"; mkdir "$candidate"
    cp "$current/compose.yml" "$current/environment.yml" "$current/runtime.env" "$candidate/"
    jq -n --arg image "$IMAGE_DIGEST" '{services:{app:{image:$image}}}' > "$candidate/image.json"
    [[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE_DIGEST")" == "$COMMIT" ]] || die 'Retained recovery image unavailable or changed'
    app_digest="$(jq -er .appPreviewDigest "$journal")"
    recovery_finish_candidate "$current" "$candidate" "$evidence" "$journal" "$app_digest"
    recovery_result "$journal"
    return 0
  fi
  [[ "$ABORT_RECOVERY" == false ]] || die 'No recovery exists to abort'
  private_temp
  candidate="$TEMP_DIR/candidate"; mkdir "$candidate"
  cp "$current/compose.yml" "$current/environment.yml" "$current/runtime.env" "$candidate/"
  if [[ "$ACTION" == candidate-reconcile ]]; then
    if [[ "$INSPECTION_ONLY" == false ]]; then
      [[ ! -e "$STATE/operation.json" && ! -e "$STATE/recovery-handoff-staging.json" ]] || die 'Unresolved host operation or recovery handoff exists'
      verify_drain_support "$current"
    fi
    [[ "$IMAGE_DIGEST" == "$(jq -er .image "$CONFIG_FILE")"@sha256:* ]] || die 'Candidate image repository differs'
    # Artifact acquisition changes only the Docker cache, not application state.
    mkdir -p "$TEMP_DIR/docker"
    DOCKER_CONFIG="$TEMP_DIR/docker" timeout --kill-after=5s 300s docker pull "$IMAGE_DIGEST" >/dev/null
    [[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE_DIGEST")" == "$COMMIT" ]] || die 'Candidate revision label differs'
    source_tree="$(docker image inspect --format '{{index .Config.Labels "uk.co.uniwares.booklet.source-tree"}}' "$IMAGE_DIGEST")"
    [[ "$source_tree" =~ ^[a-f0-9]{40}$ ]] || die 'Candidate source tree proof is missing'
    jq -n --arg image "$IMAGE_DIGEST" '{services:{app:{image:$image}}}' > "$candidate/image.json"
    recovery_oneoff "$candidate" '' capabilities > "$TEMP_DIR/capabilities.json" 2> "$TEMP_DIR/capabilities.stderr"
    jq -e '.contract=="booklet-recovery-v1" and .environment=="_staging" and .schemaVersion=="1" and .initializationRequired==false' "$TEMP_DIR/capabilities.json" >/dev/null || die 'Candidate recovery contract is incompatible'
    if [[ "$INSPECTION_ONLY" == true ]]; then
      local inspect_status=0
      recovery_oneoff "$candidate" '' inspect-blockers --page "$RECOVERY_PAGE" --limit "$RECOVERY_LIMIT" > "$TEMP_DIR/inspection.json" 2> "$TEMP_DIR/inspection.stderr" || inspect_status=$?
      jq -c '{schemaVersion,environment,inspectedAtMs,outcome,admission,blockers,inspectionError}' "$TEMP_DIR/inspection.json"
      return "$inspect_status"
    fi
    recovery_app_json "$candidate" '' preview "$TEMP_DIR/preview.json" --run-id "$RUN_ID" --operation-id "$OPERATION_ID" --expected-revision "$EXPECTED_REVISION"
    app_digest="$(jq -er .previewDigest "$TEMP_DIR/preview.json")"
    [[ "$app_digest" =~ ^[a-f0-9]{64}$ ]] || die 'Application preview digest missing'
  else
    [[ "$current" == "$STATE/releases/staging/$COMMIT" && "$image" == "$IMAGE_DIGEST" ]] || die 'Prior release identity differs'
    [[ -f "$STATE/operation.json" ]] || die 'Original failed journal missing'
    jq -e --arg id "$ORIGINAL_REQUEST_ID" --arg prior "$current" --argjson now "$(date +%s)" \
      '.requestId==$id and .action=="deploy" and .environment=="staging" and .priorRelease==$prior and .budgetDeadlineAtSeconds<$now and (.step|IN("draining","stopping","backup","initializing"))' "$STATE/operation.json" >/dev/null || die 'Original deployment is not eligible'
    [[ "$(timeout 10s systemctl show "kids-booklet-operation-$ORIGINAL_REQUEST_ID.service" --property=ActiveState --value)" =~ ^(inactive|failed)$ ]] || die 'Original deployment service remains active or unknown'
    recovery_no_containers -aq --filter "label=uk.co.uniwares.booklet.request=$ORIGINAL_REQUEST_ID" || die 'Original owned maintenance containers remain'
    recovery_no_containers -q --filter label=com.docker.compose.project=kids-booklet-staging || die 'Staging containers remain active'
    old_hash="$(sha256sum "$STATE/operation.json" | awk '{print $1}')"
    BACKUP_ID="$(jq -er .backupId "$STATE/operation.json")"
    [[ "$BACKUP_ID" =~ ^[a-zA-Z0-9_-]{1,160}$ ]] || die 'Verified backup identity required'
    failed_image="$(jq -er .image "$STATE/operation.json")"
    [[ "$failed_image" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]] || die 'Failed candidate image identity missing'
    prior_schema="$(recovery_schema_digest "$image")" || die 'Prior initializer inspection failed'
    failed_schema="$(recovery_schema_digest "$failed_image")" || die 'Failed candidate initializer inspection failed'
    [[ "$prior_schema" =~ ^[a-f0-9]{64}$ && "$prior_schema" == "$failed_schema" ]] || die 'Initializer or schema changed; compatibility is not established'
    cp "$current/image.json" "$candidate/image.json"
    recovery_app_json "$candidate" '' legacy-compatibility "$TEMP_DIR/compatibility.json"
    # Independent read-only backup proof does not inherit the expired deadline.
    (REQUEST_ID=''; maintenance "$current" recovery verify) > "$TEMP_DIR/backup.json" 2> "$TEMP_DIR/backup.stderr" || die 'Backup verification failed; inspect before recovery'
  fi
  host_fingerprint="$(recovery_host_fingerprint "$current")"
  if [[ "$ACTION" == expired-deployment-recover ]]; then
    handoff_hash="$(expired_recovery_handoff_hash "$current")" || die 'Recovery handoff inspection failed'
    host_fingerprint="$(printf '%s\n' "$host_fingerprint" "$handoff_hash" | sha256sum | awk '{print $1}')"
  fi
  digest="$(printf '%s\n' "$host_fingerprint" "$ACTION" "$REQUEST_ID" "$current" "$image" "$COMMIT" "$IMAGE_DIGEST" "$RUN_ID" "$OPERATION_ID" "$EXPECTED_REVISION" "$app_digest" "$old_hash" "$BACKUP_ID" "$source_tree" | sha256sum | awk '{print $1}')"
  printf 'result: recovery preview request=%s action=%s digest=%s\n' "$REQUEST_ID" "$ACTION" "$digest"
  [[ "$APPLY" == true ]] || return 0
  [[ "$PREVIEW_DIGEST" == "$digest" ]] || die 'Recovery preview changed; obtain a fresh preview'
  mkdir -p "$STATE/recoveries"; mkdir "$evidence"; chmod 700 "$evidence"
  jq -n --arg requestId "$REQUEST_ID" --arg action "$ACTION" --arg commit "$COMMIT" --arg image "$IMAGE_DIGEST" --arg prior "$current" --arg run "$RUN_ID" --arg operation "$OPERATION_ID" --arg original "$ORIGINAL_REQUEST_ID" --arg backup "$BACKUP_ID" --arg digest "$digest" --arg appDigest "$app_digest" --arg oldHash "$old_hash" --arg revision "$EXPECTED_REVISION" --arg tree "$source_tree" --arg priorImage "$image" --arg fingerprint "$host_fingerprint" --arg previewBackup "$BACKUP_ID" --arg handoff "$handoff_hash" \
    '{requestId:$requestId,action:$action,environment:"staging",phase:"prepared",commit:$commit,image:$image,priorRelease:$prior,runId:$run,operationId:$operation,originalRequestId:$original,backupId:$backup,previewDigest:$digest,appPreviewDigest:$appDigest,originalJournalSha256:$oldHash,expectedRevision:$revision,sourceTree:$tree,priorImage:$priorImage,hostFingerprint:$fingerprint,previewBackupId:$previewBackup} + (if $action=="expired-deployment-recover" then {handoffSha256:$handoff} else {} end)' > "$journal"
  cp "$TEMP_DIR/"*.json "$evidence/"
  # An uncertain admission reopen must be closed again. Cleanup has its own
  # bounded budget; it cannot continue business recovery or alter old journals.
  trap 'status=$?; if [[ "$status" != 0 ]]; then (REQUEST_ID=""; CONTROL_DEADLINE_SECONDS=$((SECONDS + 120)); maintenance "$current" deployment-control enable recovery > "$evidence/fail-closed.log" 2>&1) || printf "error: Recovery admission closure is unverified; inspect retained evidence\n" >&2; fi; cleanup' EXIT
  if [[ "$ACTION" == candidate-reconcile ]]; then
    recovery_phase "$journal" closing
    maintenance "$current" deployment-control enable recovery > "$evidence/admission.json" || die 'Admission close failed'
    recovery_app_json "$candidate" '' verify-closed "$evidence/closed.json" --run-id "$RUN_ID" --operation-id "$OPERATION_ID" --expected-revision "$EXPECTED_REVISION" --preview-digest "$app_digest"
    recovery_phase "$journal" stopping
    stop_application "$current" || die 'Prior service stop failed'
    recovery_phase "$journal" backup
    BACKUP_ID="staging-recovery-$REQUEST_ID"
    maintenance "$current" recovery backup > "$evidence/backup.log" 2>&1 || die 'Recovery backup failed'
    maintenance "$current" recovery verify > "$evidence/backup-verify.log" 2>&1 || die 'Recovery backup verification failed'
    jq --arg backup "$BACKUP_ID" '.backupId=$backup' "$journal" > "$journal.next"; mv "$journal.next" "$journal"
    recovery_phase "$journal" reconciling
    recovery_app_json "$candidate" "$evidence" apply "$evidence/apply.json" --run-id "$RUN_ID" --operation-id "$OPERATION_ID" --expected-revision "$EXPECTED_REVISION" --preview-digest "$app_digest" --evidence-dir /recovery
    recovery_finish_candidate "$current" "$candidate" "$evidence" "$journal" "$app_digest"
  else
    expired_recovery_finish "$current" "$candidate" "$evidence" "$journal"
  fi
  recovery_phase "$journal" complete
  recovery_result "$journal"
)
recovery_ready_for_deploy() {
  local current="$1" marker="$STATE/recovery-handoff-staging.json" evidence
  [[ "$ENVIRONMENT" == staging ]] || die 'Recovery handoff is staging-only'
  jq -e --arg current "$current" '.action=="candidate-reconcile" and .priorRelease==$current and (.sourceTree|test("^[a-f0-9]{40}$"))' "$marker" >/dev/null || die 'Recovery handoff belongs to another deployment'
  [[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE_DIGEST")" == "$COMMIT" ]] || die 'Deployment image revision differs'
  [[ "$(docker image inspect --format '{{index .Config.Labels "uk.co.uniwares.booklet.source-tree"}}' "$IMAGE_DIGEST")" == "$(jq -er .sourceTree "$marker")" ]] || die 'Deployment source tree differs from recovered candidate'
  evidence="$STATE/recoveries/$(jq -er .requestId "$marker")"
  [[ "$(jq -er .phase "$evidence/host.json")" == complete ]] || die 'Recovery did not complete'
  maintenance "$current" deployment-control status | jq -e '.maintenance==true and .draining==false and .activeMutations==0 and (.interruptedMutations // 0)==0 and ((.mutationOwners // [])|length==0)' >/dev/null || die 'Recovery admission changed'
  local run operation revision app_digest candidate
  run="$(jq -er .runId "$marker")"; operation="$(jq -er .operationId "$marker")"; revision="$(jq -er .expectedRevision "$marker")"; app_digest="$(jq -er .appPreviewDigest "$marker")"
  candidate="$STATE/releases/staging/$COMMIT"
  recovery_app_json "$candidate" "$evidence" verify-completed "$evidence/pre-deploy.json" --run-id "$run" --operation-id "$operation" --expected-revision "$revision" --preview-digest "$app_digest" --evidence-dir /recovery
}

remaining_operation_seconds() {
  local maximum="$1" deadline remaining
  if [[ -n "$REQUEST_ID" && -f "$STATE/operation.json" ]]; then
    deadline="$(jq -er --arg id "$REQUEST_ID" 'select(.requestId==$id) | .budgetDeadlineAtSeconds // 0' "$STATE/operation.json")" || return 1
    if [[ "$deadline" -gt 0 ]]; then
      remaining=$((deadline - $(date +%s)))
      [[ "$remaining" -gt 0 ]] || { printf 'error: Original operation budget expired; inspect output before any new attempt\n' >&2; return 124; }
      [[ "$maximum" -le "$remaining" ]] || maximum="$remaining"
    fi
  fi
  printf '%s\n' "$maximum"
}
ensure_operation_budget() {
  local started runtime
  started="$(date +%s)"; runtime="$(operation_runtime_seconds "$(jq -er .action "$STATE/operation.json")")"
  # Legacy journals receive one budget when first adopted. Later resumes retain
  # this exact deadline; a new systemd activation must not reset it.
  jq --arg id "$REQUEST_ID" --argjson started "$started" --argjson runtime "$runtime" '
    if .requestId!=$id then error("Operation changed")
    elif .budgetDeadlineAtSeconds!=null then .
    else .budgetStartedAtSeconds=$started | .budgetDeadlineAtSeconds=($started+$runtime) end' \
    "$STATE/operation.json" > "$STATE/operation.next.json"
  mv "$STATE/operation.next.json" "$STATE/operation.json"
  remaining_operation_seconds "$runtime"
}
start_operation_unit() {
  local runtime
  runtime="$(ensure_operation_budget)" || return 1
  # The daemon owns one-off containers, not the Compose client process group.
  # ExecStopPost performs exact-label cleanup after normal exit, timeout or stop.
  systemd-run --unit="kids-booklet-operation-$REQUEST_ID" --property=Type=exec --property=UMask=0077 \
    --property="RuntimeMaxSec=$runtime" --property=TimeoutStopSec=60 --property=KillMode=control-group \
    --property="ExecStopPost=$ROOT/vps-deployment.sh --action host-cleanup --request-id $REQUEST_ID --environment $ENVIRONMENT --apply" \
    "$ROOT/vps-deployment.sh" --action host-run --request-id "$REQUEST_ID" --apply
}
cleanup_operation_oneoffs() {
  [[ "$ENVIRONMENT" == staging || "$ENVIRONMENT" == prod ]] || return 0
  local ids id deadline=$((SECONDS + 35)) remaining
  ids="$(control_timeout 5 docker ps -aq --filter "label=uk.co.uniwares.booklet.request=$REQUEST_ID" \
    --filter "label=uk.co.uniwares.booklet.environment=$ENVIRONMENT" \
    --filter "label=com.docker.compose.project=kids-booklet-$ENVIRONMENT" --filter 'label=com.docker.compose.oneoff=True')" || return 1
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    [[ "$id" =~ ^[a-f0-9]{12,64}$ ]] || return 1
    remaining=$((deadline - SECONDS)); [[ "$remaining" -gt 10 ]] || return 1
    stop_owned_oneoff "$id" "$((remaining - 10))" || return 1
  done <<< "$ids"
}
host_cleanup() {
  require_root
  [[ "$APPLY" == true && -n "$REQUEST_ID" && -n "$ENVIRONMENT" ]] || die 'Host cleanup requires an exact unit request'
  # Do not change operation phase, admission, release pointers or saved output.
  # A missing journal can mean successful completion; labels still limit cleanup.
  cleanup_operation_oneoffs || die 'Owned one-off cleanup is incomplete; inspect exact request before resume'
}
operation_control_journal() {
  local file="$STATE/operations/$REQUEST_ID.json"
  if [[ -f "$STATE/operation.json" ]] && jq -e --arg id "$REQUEST_ID" '.requestId==$id' "$STATE/operation.json" >/dev/null; then file="$STATE/operation.json"; fi
  [[ -f "$file" ]] || die 'Exact operation request was not found'
  jq -e --arg id "$REQUEST_ID" --arg environment "$ENVIRONMENT" '.requestId==$id and .environment==$environment' "$file" >/dev/null || die 'Operation belongs to another environment'
  printf '%s\n' "$file"
}
operation_status_host() {
  if [[ -f "$STATE/recoveries/$REQUEST_ID/host.json" ]]; then
    [[ "$ENVIRONMENT" == staging ]] || die 'Recovery journal environment differs'
    jq -e --arg id "$REQUEST_ID" '.requestId==$id and .environment=="staging"' "$STATE/recoveries/$REQUEST_ID/host.json" >/dev/null || die 'Recovery journal identity differs'
    recovery_result "$STATE/recoveries/$REQUEST_ID/host.json"
    return 0
  fi
  local file state result exit_status load_state
  [[ "$CONTROL_DEADLINE_SECONDS" -gt 0 ]] || CONTROL_DEADLINE_SECONDS=$((SECONDS + 30))
  file="$(operation_control_journal)" || return 1
  load_state="$(control_timeout 5 systemctl show --property=LoadState --value "kids-booklet-operation-$REQUEST_ID.service" 2>/dev/null)" || load_state=unavailable
  if [[ "$load_state" == not-found || "$load_state" == unavailable ]]; then
    [[ "$file" != "$STATE/operation.json" ]] || die 'Active operation service is unavailable; inspect retained request before resume'
    jq -c '{requestId,action,environment,step,stepUpdatedAtSeconds,backupId,image,commit,command,commandStartedAt,commandDeadlineAt,budgetStartedAtSeconds,budgetDeadlineAtSeconds,stopRequestedAt,
      service:{state:"unavailable",result:null,exitStatus:null},outcome:"archived"}' "$file" | sed 's/^/result: operation /'
    return
  fi
  [[ "$load_state" == loaded ]] || die 'Operation service returned unsupported load state'
  state="$(control_timeout 5 systemctl show --property=ActiveState --value "kids-booklet-operation-$REQUEST_ID.service")" || die 'Operation service status is unavailable'
  result="$(control_timeout 5 systemctl show --property=Result --value "kids-booklet-operation-$REQUEST_ID.service")" || die 'Operation service result is unavailable'
  exit_status="$(control_timeout 5 systemctl show --property=ExecMainStatus --value "kids-booklet-operation-$REQUEST_ID.service")" || die 'Operation service exit status is unavailable'
  [[ "$state" =~ ^(active|activating|deactivating|reloading|failed|inactive)$ && "$result" =~ ^(success|exit-code|timeout|signal|core-dump|watchdog|start-limit-hit|resources|oom-kill|protocol|)$ && "$exit_status" =~ ^[0-9]+$ ]] || die 'Operation service returned unsupported status'
  jq -c --arg state "$state" --arg result "$result" --arg exit "$exit_status" \
    '{requestId,action,environment,step,stepUpdatedAtSeconds,backupId,image,commit,command,commandStartedAt,commandDeadlineAt,budgetStartedAtSeconds,budgetDeadlineAtSeconds,stopRequestedAt,
      service:{state:$state,result:$result,exitStatus:($exit|tonumber)},
      outcome:(if .step=="complete" and $state=="inactive" and $result=="success" then "complete" elif $state=="active" or $state=="activating" or $state=="deactivating" or $state=="reloading" then "running" else "interrupted" end)}' "$file" |
    sed 's/^/result: operation /'
}
operation_stop_host() {
  local file state stop_deadline
  CONTROL_DEADLINE_SECONDS=$((SECONDS + 60))
  file="$(operation_control_journal)" || return 1
  operation_status_host || return 1
  [[ "$file" == "$STATE/operation.json" ]] || { printf 'exists: operation is archived; inspect its outcome; no stop sent\n'; return; }
  [[ "$APPLY" == true ]] || { printf 'would update: stop exact operation %s; preserve its phase, outputs and maintenance\n' "$REQUEST_ID"; return; }
  # Inspect completed phase evidence before interrupting its owner. Reserve the
  # remaining control budget for stop delivery and the post-stop race check.
  stop_deadline="$CONTROL_DEADLINE_SECONDS"
  CONTROL_DEADLINE_SECONDS=$((SECONDS + 15))
  if ! operation_output_inspection "$file"; then
    CONTROL_DEADLINE_SECONDS="$stop_deadline"
    die 'Pre-stop output inspection unresolved; no stop sent; phase and maintenance retained'
  fi
  CONTROL_DEADLINE_SECONDS="$stop_deadline"
  # Do not wait for the host lock while its owner is the process being stopped.
  # Only root-created exact-request units are addressable through this action.
  if ! control_timeout 45 systemctl stop "kids-booklet-operation-$REQUEST_ID.service"; then
    die 'Stop acknowledgement timed out; operation may still be stopping. Inspect exact status; do not resume'
  fi
  state="$(control_timeout 5 systemctl show --property=ActiveState --value "kids-booklet-operation-$REQUEST_ID.service")"
  [[ "$state" == failed || "$state" == inactive ]] || die 'Operation remains active; no state change permitted'
  exec 8>"$STATE/operation.lock"; flock -n 8 || die 'Host lock remains owned; inspect exact status before reconciliation'
  cleanup_operation_oneoffs || die 'Owned maintenance containers remain; no state change permitted'
  operation_output_inspection "$file" || die 'Stopped request output inspection incomplete; phase and maintenance retained'
  # Completion may race the stop request. Never overwrite a different/new journal.
  if [[ -f "$STATE/operation.json" ]]; then
    jq --arg id "$REQUEST_ID" --argjson stopped "$(date +%s)" \
      'if .requestId==$id then .stopRequestedAt=$stopped else error("Operation changed") end' "$STATE/operation.json" > "$STATE/operation.next.json"
    mv "$STATE/operation.next.json" "$STATE/operation.json"
  fi
  flock -u 8
  operation_status_host
  printf 'updated: exact operation stopped; outputs and retained phase require reconciliation before resume\n'
}
operation_output_inspection() {
  local file="$1" selected='' expected='' records='[]' ids=''
  if [[ "$ENVIRONMENT" == staging || "$ENVIRONMENT" == prod ]]; then
    if [[ -f "$STATE/releases/$ENVIRONMENT/current" ]]; then
      read -r selected < "$STATE/releases/$ENVIRONMENT/current"
      [[ "$selected" == "$STATE/releases/$ENVIRONMENT/"* && "$selected" != *'/../'* ]] || return 1
      expected="$(jq -er '.services.app.image' "$selected/image.json")" || return 1
      [[ "$expected" =~ ^ghcr.io/[a-z0-9_./-]+@sha256:[a-f0-9]{64}$ ]] || return 1
    fi
    ids="$(control_timeout 5 docker ps -aq --filter "label=com.docker.compose.project=kids-booklet-$ENVIRONMENT" \
      --filter 'label=com.docker.compose.service=app' --filter 'label=com.docker.compose.oneoff=False')" || return 1
    if [[ -n "$ids" ]]; then
      local -a containers=(); mapfile -t containers <<< "$ids"
      [[ "${#containers[@]}" -eq 1 && "${containers[0]}" =~ ^[a-f0-9]{12,64}$ ]] || return 1
      records="$(control_timeout 5 docker inspect "${containers[0]}" 2>/dev/null)" || return 1
    fi
  fi
  jq -cn --argjson journal "$(jq '{requestId,step,backupId,priorRelease,image}' "$file")" --arg selected "$selected" --arg expected "$expected" --argjson records "$records" '
    {requestId:$journal.requestId,phase:$journal.step,selectedRelease:$selected,expectedImage:$expected,
      backup:{id:($journal.backupId // ""),verification:(if ($journal.backupId // "")=="" then "not_recorded" else "readback_required" end)},
      application:[$records[] | {state:.State.Status,health:(.State.Health.Status // "unknown"),
        selectedImageMatches:(.Config.Image==$expected)}],
      next:"Inspect backup completion and application readiness before resume; admission unchanged"}' | sed 's/^/result: operation outputs /'
}
prepare_staging_reset_profile() {
  local release="$1"
  [[ "$ENVIRONMENT" == staging ]] || die 'Reset profile is staging-only'
  # A prepared runner bundle selects the new initializer without opening admission.
  if jq -e '.services.app.environment | has("DIFY_BOOKLET_BINDINGS_JSON")' "$SECRETS/staging/secrets.json" >/dev/null; then
    [[ "$(jq -r .environments.staging.ASSETS_BUCKET "$CONFIG_FILE")" == kids-booklet-staging-assets ]] || die 'Reset asset bucket differs from the authorized target'
    application_secret_override_is_valid "$SECRETS/staging/secrets.json" || die 'Reset requires valid prepared runner settings'
    jq '.services.app.environment.DIFY_BOOKLET_RUNNER_ENABLED="true"' "$SECRETS/staging/secrets.json" > "$SECRETS/staging/secrets.reset.json"
    chmod 600 "$SECRETS/staging/secrets.reset.json"
    COMPOSE_SECRET_FILE="$SECRETS/staging/secrets.reset.json"
    validate_compose "$release"
    COMPOSE_SECRET_FILE=''
  else
    [[ ! -f "$SECRETS/staging/secrets.reset.json" ]] || die 'Retained reset settings require inspection before a legacy reset'
  fi
}
set_step() {
  jq --arg step "$1" --argjson updated "$(date +%s)" '.step=$step | .stepUpdatedAtSeconds=$updated' "$STATE/operation.json" > "$STATE/operation.next.json"
  mv "$STATE/operation.next.json" "$STATE/operation.json"
}
show_operation_status() {
  if [[ -f "$STATE/operation.json" ]]; then
    jq '{requestId,action,environment,commit,backupId,backupHistory,configHash,priorRelease,step}' "$STATE/operation.json"
    if [[ "$(jq -r '.environment // ""' "$STATE/operation.json")" == dify ]]; then
      if [[ "$(jq -r .action "$STATE/operation.json")" == dify-enable-admin-api ]]; then
        printf 'result: Dify admin API operation uses the private VPS terminal; repeat its local apply action to resume\n'
      else
        local request_id active_state unit_result exit_status
        request_id="$(jq -er .requestId "$STATE/operation.json")"
        active_state="$(systemctl show --property=ActiveState --value "kids-booklet-operation-$request_id.service")"
        unit_result="$(systemctl show --property=Result --value "kids-booklet-operation-$request_id.service")"
        exit_status="$(systemctl show --property=ExecMainStatus --value "kids-booklet-operation-$request_id.service")"
        [[ "$active_state" =~ ^(active|activating|deactivating|reloading|failed|inactive)$ ]] || die 'Dify operation unit returned an unknown active state'
        [[ "$unit_result" =~ ^(success|exit-code|timeout|signal|core-dump|watchdog|start-limit-hit|resources|oom-kill|protocol|)$ ]] || die 'Dify operation unit returned an unknown result'
        [[ "$exit_status" =~ ^[0-9]+$ ]] || die 'Dify operation unit returned an invalid exit status'
        printf 'result: Dify operation unit active=%s result=%s exit=%s\n' "$active_state" "${unit_result:-unset}" "$exit_status"
      fi
      if [[ -f "$DIFY_ENV" && -f "$DIFY_RELEASE/docker/docker-compose.yaml" ]]; then
        dify_service_records | jq -c -r '
          [.[] | {service:.Service,state:.State,health:(.Health // ""),exitCode:(.ExitCode // null)}]
          | "result: Dify services " + tojson
        '
      fi
    fi
  elif [[ -f "$STATE/staging-bootstrap.json" ]]; then
    jq -c '{step:"bootstrap-maintenance",oldRequest,commit,image,backupId,phase,superseded}' "$STATE/staging-bootstrap.json"
  else
    printf '{"step":"idle"}\n'
  fi
}
record_release_metadata() {
  local release="$1" prior="$2" image config_hash
  image="$(jq -er .services.app.image "$release/image.json")"
  config_hash="$(sha256sum "$release/manifest.sha256" | awk '{print $1}')"
  jq --arg image "$image" --arg configHash "$config_hash" --arg priorRelease "$prior" '.image=$image | .configHash=$configHash | .priorRelease=$priorRelease' "$STATE/operation.json" > "$STATE/operation.next.json"
  mv "$STATE/operation.next.json" "$STATE/operation.json"
}
ensure_backup_id() {
  local prior_id
  prior_id="$(jq -r '.backupId // ""' "$STATE/operation.json")"
  [[ -n "$BACKUP_ID" ]] || BACKUP_ID="$ENVIRONMENT-$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 8)"
  jq --arg backupId "$BACKUP_ID" --arg priorId "$prior_id" '.backupHistory=((.backupHistory // []) + (if $priorId=="" or $priorId==$backupId then [] else [$priorId] end) | unique) | .backupId=$backupId' "$STATE/operation.json" > "$STATE/operation.next.json"
  mv "$STATE/operation.next.json" "$STATE/operation.json"
}
recover_interrupted_rotation() {
  local current=''
  [[ "$ACTION" == rotate-secrets && -f "$SECRETS/$ENVIRONMENT/secrets.previous.json" ]] || return 0
  [[ -f "$STATE/releases/$ENVIRONMENT/current" ]] || die 'Cannot recover interrupted rotation without a current release'
  read -r current < "$STATE/releases/$ENVIRONMENT/current"
  set_step recovering-previous-secrets
  stop_application "$current"
  install -m 600 "$SECRETS/$ENVIRONMENT/secrets.previous.json" "$SECRETS/$ENVIRONMENT/secrets.json"
  compose "$current" up -d --no-deps app
  verify_application "$current"
  maintenance "$current" deployment-control disable
  rm -f "$SECRETS/$ENVIRONMENT/secrets.previous.json"
}
validate_compose() {
  local release="$1" resolved
  # Do not print this output: it includes secrets. Only jq's exit status is used.
  private_temp
  resolved="$TEMP_DIR/resolved-compose.json"
  compose "$release" config --format json > "$resolved"
  chmod 600 "$resolved"
  application_secret_override_is_valid "$resolved" resolved || die 'Resolved Compose secrets do not satisfy the application secret contract'
}
prepare_release() {
  local release="$STATE/releases/$ENVIRONMENT/$COMMIT"
  mkdir -p "$release"
  if [[ -f "$release/image.json" ]]; then
    [[ "$(jq -r .services.app.image "$release/image.json")" == "$IMAGE_DIGEST" ]] || die 'Commit already refers to another image digest'
  else
    cp "$ROOT/deploy/compose.yml" "$release/compose.yml"
    cp "$ROOT/deploy/compose.$ENVIRONMENT.yml" "$release/environment.yml"
    jq -n --arg image "$IMAGE_DIGEST" '{services:{app:{image:$image}}}' > "$release/image.json"
    jq -r --arg e "$ENVIRONMENT" --arg image "$IMAGE_DIGEST" '. as $c | .environments[$e] + {DEPLOYMENT_ENV:("_"+$e),IMAGE_DIGEST:$image,APP_PORT:(if $e=="staging" then "3100" else "3200" end),OBJECT_STORE_ENDPOINT:("https://"+$c.cloudflare_account_id+".r2.cloudflarestorage.com")} | to_entries[] | "\(.key)=\(.value)"' "$CONFIG_FILE" > "$release/runtime.env"
    chmod 600 "$release"/*
    (cd "$release" && sha256sum compose.yml environment.yml runtime.env image.json > manifest.sha256)
  fi
  (cd "$release" && sha256sum -c manifest.sha256 >/dev/null)
  validate_compose "$release"
}
stop_application() {
  local seconds
  seconds="$(remaining_operation_seconds 60)" || return 124
  COMPOSE_TIMEOUT_SECONDS="$seconds" compose "$1" stop --timeout 50 app
  [[ -z "$(timeout 5s docker ps -q --filter "label=com.docker.compose.project=kids-booklet-$ENVIRONMENT" --filter 'label=com.docker.compose.service=app')" ]] || die 'Old application or maintenance container is still running'
}
verify_application() {
  local release="$1" url
  url="https://$(jq -r --arg e "$ENVIRONMENT" '.environments[$e].APP_HOSTNAME' "$CONFIG_FILE")"
  DEPLOYMENT_URL="$url" maintenance "$release" check-deployment-readiness
}
drain_application() {
  verify_drain_support "$1"
  maintenance "$1" deployment-control drain deployment
  if ! maintenance "$1" wait-for-deployment-drain; then
    maintenance "$1" deployment-control disable
    die 'Drain timed out; original application continues with normal admission'
  fi
}
verify_drain_support() {
  local release="$1" id image expected
  expected="$(jq -er .services.app.image "$release/image.json")"
  id="$(timeout 5s docker ps -q --filter "label=com.docker.compose.project=kids-booklet-$ENVIRONMENT" \
    --filter 'label=com.docker.compose.service=app' --filter 'label=com.docker.compose.oneoff=False')"
  [[ "$id" =~ ^[a-f0-9]{12,64}$ ]] || die 'Drain bootstrap requires exactly one running selected application'
  image="$(timeout 5s docker inspect --format '{{.Config.Image}}' "$id")"
  [[ "$image" == "$expected" ]] || die 'Drain bootstrap selected image differs from running application'
  if ! timeout --kill-after=1s 10s docker exec -w /app "$id" node -e '
    const fs=require("node:fs");
    const script=fs.readFileSync("scripts/deployment-control.ts","utf8");
    const control=fs.readFileSync("lib/application/deployment-control.ts","utf8");
    if(!script.includes("setDrainingMode") || !control.includes("export async function finishDraining") || !control.includes("export async function setDrainingMode")) process.exit(78);
  ' >/dev/null 2>&1; then
    die 'Selected image lacks two-stage drain support; explicit reviewed bootstrap is required. No maintenance fallback or deployment performed'
  fi
}
save_success() {
  local release="$1" rotate_release="${2:-false}"
  if [[ "$rotate_release" == true ]]; then
    if [[ -f "$STATE/releases/$ENVIRONMENT/current" ]]; then cp "$STATE/releases/$ENVIRONMENT/current" "$STATE/releases/$ENVIRONMENT/previous"; fi
    printf '%s\n' "$release" > "$STATE/releases/$ENVIRONMENT/current"
  fi
  set_step complete
  mv "$STATE/operation.json" "$STATE/operations/$REQUEST_ID.json"
}
run_lifecycle() {
  local current='' candidate='' previous='' bootstrapped=false recovered=false
  [[ ! -f "$STATE/releases/$ENVIRONMENT/current" ]] || read -r current < "$STATE/releases/$ENVIRONMENT/current"
  case "$ACTION" in
    retire-staging-artifact-index) retire_staging_artifact_index_host; return;;
    deploy)
      if [[ -e "$STATE/staging-bootstrap.json" ]]; then bootstrap_ready_for_deploy "$current"; bootstrapped=true; fi
      if [[ "$ENVIRONMENT" == staging && -e "$STATE/recovery-handoff-staging.json" ]]; then recovered=true; fi
      prepare_release
      candidate="$STATE/releases/$ENVIRONMENT/$COMMIT"
      record_release_metadata "$candidate" "$current"
      verify_release_capacity
      # Anonymous pull: a private GHCR package must fail before maintenance begins.
      private_temp; mkdir -p "$TEMP_DIR/docker"
      set_step pulling
      local pull_seconds
      pull_seconds="$(remaining_operation_seconds 1800)"
      record_operation_command pull "$pull_seconds"
      DOCKER_CONFIG="$TEMP_DIR/docker" timeout --kill-after=5s "${pull_seconds}s" docker pull "$IMAGE_DIGEST"
      if [[ -n "$current" ]]; then
        set_step draining
        if [[ "$bootstrapped" == true ]]; then bootstrap_ready_for_deploy "$current"; elif [[ "$recovered" == true ]]; then recovery_ready_for_deploy "$current"; else drain_application "$current"; fi
        set_step stopping; stop_application "$current"
        set_step backup; ensure_backup_id; maintenance "$current" recovery backup
      fi
      set_step initializing
      maintenance "$candidate" deployment-control enable deployment
      maintenance "$candidate" initialize-deployment
      set_step starting
      compose "$candidate" up -d --no-deps app
      if ! verify_application "$candidate"; then
        stop_application "$candidate"
        if [[ -n "$current" ]]; then
          set_step recovering-previous
          compose "$current" up -d --no-deps app
          verify_application "$current"
          if [[ "$bootstrapped" == false && "$recovered" == false ]]; then maintenance "$current" deployment-control disable; fi
        fi
        die 'Readiness failed; database was not restored. Inspect and resume the operation'
      fi
      maintenance "$candidate" deployment-control disable
      save_success "$candidate" true
      if [[ "$recovered" == true ]]; then mv "$STATE/recovery-handoff-staging.json" "$STATE/operations/recovery-handoff-$REQUEST_ID.json"; fi
      if [[ "$bootstrapped" == true ]]; then mv "$STATE/staging-bootstrap.json" "$STATE/operations/bootstrap-$REQUEST_ID.json"; fi ;;
    backup|restore|reset-staging|rollback|rotate-secrets)
      [[ -n "$current" ]] || die 'Environment has no recorded release'
      record_release_metadata "$current" "$current"
      if [[ "$ACTION" == reset-staging ]]; then
        prepare_staging_reset_profile "$current"
        maintenance "$current" read-staging-reset-readiness
      fi
      if [[ "$ACTION" == rotate-secrets ]]; then
        [[ -f "$SECRETS/$ENVIRONMENT/secrets.pending.json" ]] || die 'No staged secret rotation found'
        COMPOSE_SECRET_FILE="$SECRETS/$ENVIRONMENT/secrets.pending.json"; validate_compose "$current"; COMPOSE_SECRET_FILE=''
      fi
      set_step draining; drain_application "$current"
      set_step stopping; stop_application "$current"
      if [[ "$ACTION" != restore ]]; then set_step backup; ensure_backup_id; maintenance "$current" recovery backup; fi
      case "$ACTION" in
        restore) set_step restoring; maintenance "$current" recovery restore;;
        reset-staging)
          set_step resetting
          if [[ -f "$SECRETS/staging/secrets.reset.json" ]]; then COMPOSE_SECRET_FILE="$SECRETS/staging/secrets.reset.json"; fi
          maintenance "$current" reset-staging-deployment
          maintenance "$current" deployment-control enable reset
          if [[ -n "$COMPOSE_SECRET_FILE" ]]; then
            install -m 600 "$SECRETS/staging/secrets.json" "$SECRETS/staging/secrets.reset.previous.json"
            install -m 600 "$COMPOSE_SECRET_FILE" "$SECRETS/staging/secrets.json"
            COMPOSE_SECRET_FILE=''
          fi;;
        rollback)
          [[ -f "$STATE/releases/$ENVIRONMENT/previous" ]] || die 'No previous release recorded'
          read -r previous < "$STATE/releases/$ENVIRONMENT/previous"
          [[ "$previous" == "$STATE/releases/$ENVIRONMENT/"* && -d "$previous" ]] || die 'Invalid previous release'
          current="$previous";;
        rotate-secrets)
          set_step rotating-secrets
          cp "$SECRETS/$ENVIRONMENT/secrets.json" "$SECRETS/$ENVIRONMENT/secrets.previous.json"
          install -m 600 "$SECRETS/$ENVIRONMENT/secrets.pending.json" "$SECRETS/$ENVIRONMENT/secrets.json"
          ;;
      esac
      if [[ "$ACTION" == reset-staging ]]; then set_step reset-verifying; fi
      compose "$current" up -d --no-deps app
      if ! verify_application "$current"; then
        if [[ "$ACTION" == rotate-secrets && -f "$SECRETS/$ENVIRONMENT/secrets.previous.json" ]]; then
          stop_application "$current"
          install -m 600 "$SECRETS/$ENVIRONMENT/secrets.previous.json" "$SECRETS/$ENVIRONMENT/secrets.json"
          compose "$current" up -d --no-deps app
          verify_application "$current"
          maintenance "$current" deployment-control disable
        fi
        die 'Maintenance verification failed; operation journal retained'
      fi
      maintenance "$current" deployment-control disable
      if [[ "$ACTION" == rotate-secrets ]]; then rm -f "$SECRETS/$ENVIRONMENT/secrets.pending.json" "$SECRETS/$ENVIRONMENT/secrets.previous.json"; fi
      if [[ "$ACTION" == reset-staging ]]; then rm -f "$SECRETS/staging/secrets.reset.json"; fi
      if [[ "$ACTION" == rollback ]]; then save_success "$current" true; else save_success "$current"; fi ;;
    *) die 'Unsupported host lifecycle operation';;
  esac
}
verify_artifact_retirement_release() {
  local release="$1" expected_commit="$2" image revision
  [[ "$release" == "$STATE/releases/staging/$expected_commit" && "$expected_commit" =~ ^[a-f0-9]{40}$ && -d "$release" && ! -L "$release" ]] || die 'Index retirement release path is invalid'
  (cd "$release" && sha256sum -c manifest.sha256 >/dev/null) || die 'Index retirement release manifest changed'
  image="$(jq -er .services.app.image "$release/image.json")"
  [[ "$image" == "$(jq -r .image "$CONFIG_FILE")"@sha256:* && "$image" =~ @sha256:[a-f0-9]{64}$ ]] || die 'Index retirement image repository or digest is invalid'
  revision="$(timeout 10s docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image")"
  [[ "$revision" == "$expected_commit" ]] || die 'Index retirement image revision differs from the release'
}
verify_artifact_retirement_rollback() {
  local previous commit image pair
  [[ -f "$STATE/releases/staging/previous" ]] || die 'Index retirement requires a verified compatible rollback release'
  read -r previous < "$STATE/releases/staging/previous"
  commit="${previous##*/}"
  verify_artifact_retirement_release "$previous" "$commit"
  image="$(jq -er .services.app.image "$previous/image.json")"
  pair="$commit:${image##*@}"
  # Exact reviewed startup-compatibility evidence from PR #114, #120 and #126.
  # Unknown pairs require a reviewed table update, never a pointer rewrite.
  case "$pair" in
    ae2a2f767a2da8ef9e0bc372bd26199ee0c75e3e:sha256:4a2a97daa4075aad90ad1837b0ed6a1298aa37ec445322f0cac68c236e28119d|fac55e0730e0a7e297a2fbdf28fb888b87baf57a:sha256:959dee0035f80890b4851ed27f2652bc5ee9617cb2e692fae2c0069350d7c571|d88dfe308b809e019123f554fa5f43cbcf097c91:sha256:ee85f85aec0111fc488297faf507ef90ee593442c5d0d973f2b358443e26263c) :;;
    *) die 'Rollback release lacks reviewed absent-legacy-index compatibility evidence';;
  esac
}
retire_staging_artifact_index_host() {
  local current checkpoint saved_image rollback_release rollback_image
  [[ "$ENVIRONMENT" == staging && "$CONFIRMATION" == kids_booklet && -n "$COMMIT" ]] || die 'Index retirement requires the exact staging confirmation and commit'
  [[ -f "$STATE/releases/staging/current" ]] || die 'Index retirement requires a deployed staging release'
  read -r current < "$STATE/releases/staging/current"
  verify_artifact_retirement_release "$current" "$COMMIT"
  verify_artifact_retirement_rollback
  checkpoint="$(jq -r '.step // "queued"' "$STATE/operation.json")"
  saved_image="$(jq -r '.image // ""' "$STATE/operation.json")"
  [[ -z "$saved_image" || "$saved_image" == "$(jq -er .services.app.image "$current/image.json")" ]] || die 'Retained index operation refers to a different release image'
  record_release_metadata "$current" "$current"
  read -r rollback_release < "$STATE/releases/staging/previous"
  rollback_image="$(jq -er .services.app.image "$rollback_release/image.json")"
  jq --arg release "$rollback_release" --arg image "$rollback_image" '.rollbackRelease=$release | .rollbackImage=$image' "$STATE/operation.json" > "$STATE/operation.next.json"
  mv "$STATE/operation.next.json" "$STATE/operation.json"
  if [[ "$checkpoint" == draining ]]; then
    # No stop/removal checkpoint was reached. A crash may have bypassed the
    # compensating ledger check, so make callback reconciliation possible first.
    [[ -n "$(docker ps -q --filter 'label=com.docker.compose.project=kids-booklet-staging' --filter 'label=com.docker.compose.service=app' --filter 'label=com.docker.compose.oneoff=False' --filter 'status=running')" ]] || die 'Interrupted drain has no running original application; inspect host state before resume'
    maintenance "$current" deployment-control disable
    set_step reconciliation-required
    checkpoint=reconciliation-required
  fi
  case "$checkpoint" in
    index-finalizing)
      # A crash may occur on either side of reopening admission. Do not stop
      # the already-ready app or replay the backup/removal in either case.
      verify_application "$current"
      maintenance "$current" deployment-control disable
      save_success "$current"
      return;;
    complete)
      # Admission may already be open. Finalize the completed journal only.
      verify_application "$current"
      save_success "$current"
      return;;
    backup-verified|retiring-index|index-verified|index-restarting)
      [[ -n "$BACKUP_ID" ]] || die 'Retained index operation lost its pre-change backup'
      stop_application "$current"
      maintenance "$current" retire-staging-artifact-index --verify-backup;;
    *)
      # Reject unresolved work while callbacks can still complete it.
      maintenance "$current" retire-staging-artifact-index --preview
      set_step draining; drain_application "$current"
      if ! maintenance "$current" retire-staging-artifact-index --preview; then
        maintenance "$current" deployment-control disable
        set_step reconciliation-required
        die 'Experiment work appeared during admission closure; original service remains running. Reconcile before resume'
      fi
      set_step stopping; stop_application "$current"
      maintenance "$current" retire-staging-artifact-index --preview
      set_step backup; ensure_backup_id; maintenance "$current" recovery backup
      maintenance "$current" retire-staging-artifact-index --verify-backup
      set_step backup-verified;;
  esac
  # Persist before removal: resume accepts absence and never replaces this backup.
  verify_artifact_retirement_release "$current" "$COMMIT"
  verify_artifact_retirement_rollback
  set_step retiring-index
  maintenance "$current" retire-staging-artifact-index --apply
  set_step index-verified
  set_step index-restarting
  compose "$current" up -d --no-deps app
  verify_application "$current"
  set_step index-finalizing
  maintenance "$current" deployment-control disable
  save_success "$current"
}
dify_compose() {
  docker compose --project-name booklet-dify --env-file "$DIFY_ENV" -f "$DIFY_RELEASE/docker/docker-compose.yaml" -f "$ROOT/dify/compose.override.yml" "$@"
}
dify_service_records() {
  dify_compose ps --all --format json | jq -sc '
    if length == 1 and (.[0] | type) == "array" then .[0] else . end
  '
}
dify_service_records_are_ready() {
  jq -e '
    length > 0 and all(.[];
      (.Service == "init_permissions" and .State == "exited" and .ExitCode == 0) or
      (.Service != "init_permissions" and .State == "running" and ((.Health // "") == "" or .Health == "healthy"))
    )
  ' >/dev/null
}
dify_install_preflight() {
  local cpu_count memory_mib available_mib free_gib expected_host required_available_mib=4096
  for name in docker curl tar sha256sum jq python3 awk df nproc flock ss stat readlink install hostname uname sort; do need_command "$name"; done
  [[ -f "$ROOT/dify/release.json" && -f "$ROOT/dify/compose.override.yml" ]] || die 'Reviewed Dify release artifacts have not been synchronized to the host'
  jq -e '.release == "1.17.1" and (.source_commit | test("^[a-f0-9]{40}$")) and (.source_archive_sha256 | test("^[a-f0-9]{64}$"))' "$ROOT/dify/release.json" >/dev/null || die 'Invalid Dify release manifest'
  expected_host="$(jq -er '.host_observation.hostname | select(type == "string" and length > 0)' "$CONFIG_FILE")"
  [[ "$(hostname -f)" == "$expected_host" && "$(uname -m)" == x86_64 ]] || die 'Dify target host or architecture differs from the recorded capacity observation'
  if [[ ! -f "$DIFY_DATA/current" ]]; then
    jq -e '.dify_public_enabled == false' "$CONFIG_FILE" >/dev/null || die 'Initial Dify installation requires the public Tunnel route to remain in maintenance'
  fi
  cpu_count="$(nproc)"
  memory_mib="$(awk '/^MemTotal:/ {print int($2 / 1024)}' /proc/meminfo)"
  available_mib="$(awk '/^MemAvailable:/ {print int($2 / 1024)}' /proc/meminfo)"
  free_gib="$(df -Pk "$STATE" | awk 'NR==2 {print int($4 / 1048576)}')"
  [[ "$cpu_count" -ge 4 && "$memory_mib" -ge 15000 ]] || die 'Shared-host CPU or RAM is below the measured Dify installation checkpoint'
  if [[ ! -f "$DIFY_DATA/current" ]]; then
    [[ "$available_mib" -ge 8192 && "$free_gib" -ge 60 ]] || die 'Shared-host available RAM or disk is below the initial Dify installation checkpoint'
  else
    # This targeted repair adds 768 MiB; leave at least 2 GiB for the shared host.
    [[ "$ACTION" != dify-repair-sandbox ]] || required_available_mib=2816
    [[ "$ACTION" != dify-repair-scheduler ]] || required_available_mib=3328
    [[ "$available_mib" -ge "$required_available_mib" && "$free_gib" -ge 20 ]] || die 'Insufficient headroom to resume or verify Dify installation'
  fi
  docker compose version --short | awk -F. '{exit !($1 > 2 || ($1 == 2 && $2 >= 28))}' || die 'Docker Compose 2.28 or newer is required for port overrides'
  if [[ ! -f "$DIFY_DATA/current" && "$(ss -lnt '( sport = :3300 )' | wc -l)" -gt 1 ]]; then
    [[ -n "$(docker ps -q --filter 'label=com.docker.compose.project=booklet-dify' --filter 'label=com.docker.compose.service=nginx')" ]] || die 'Port 3300 is already listening outside the Dify installation'
  fi
}
dify_prepare_directories() {
  local path
  install -d -m 755 "$ROOT/dify/releases" "$DIFY_DATA"
  install -d -m 700 "$SECRETS/dify"
  for path in app/storage postgres redis sandbox/dependencies sandbox/conf agent/home agent/workspace plugin_daemon nginx/ssl nginx/certbot/live nginx/certbot/conf nginx/certbot/www weaviate; do
    install -d -m 755 "$DIFY_DATA/$path"
  done
}
dify_prepare_persistent_files() {
  local sandbox_config="$DIFY_RELEASE/docker/volumes/sandbox/conf/config.yaml"
  [[ -f "$sandbox_config" && ! -L "$sandbox_config" ]] || die 'Pinned Dify sandbox configuration is missing'
  if [[ ! -e "$DIFY_DATA/sandbox/conf/config.yaml" && ! -L "$DIFY_DATA/sandbox/conf/config.yaml" ]]; then
    install -m 644 "$sandbox_config" "$DIFY_DATA/sandbox/conf/config.yaml"
    printf 'created: pinned Dify sandbox configuration\n'
  fi
  [[ -f "$DIFY_DATA/sandbox/conf/config.yaml" && ! -L "$DIFY_DATA/sandbox/conf/config.yaml" ]] || die 'Persistent Dify sandbox configuration is not a regular file'
  chown -R 1000:1000 "$DIFY_DATA/agent/home" "$DIFY_DATA/agent/workspace"
}
dify_prepare_release() {
  local source_url source_hash archive prepared
  source_url="$(jq -er .source_archive "$ROOT/dify/release.json")"
  source_hash="$(jq -er .source_archive_sha256 "$ROOT/dify/release.json")"
  [[ "$source_url" == 'https://github.com/langgenius/dify/archive/8387590ace4a094de812b7847fc6a4c3a27cd52b.tar.gz' ]] || die 'Dify source URL differs from the reviewed release'
  if [[ -d "$DIFY_RELEASE" ]]; then
    [[ -f "$DIFY_RELEASE/docker/docker-compose.yaml" && -f "$DIFY_RELEASE/source-archive.sha256" && "$(<"$DIFY_RELEASE/source-archive.sha256")" == "$source_hash" ]] || die 'Existing Dify release directory has unverified or incomplete contents'
    return
  fi
  private_temp
  archive="$TEMP_DIR/dify.tar.gz"
  curl -fsSL --retry 4 --retry-all-errors --retry-delay 2 --max-time 180 "$source_url" --output "$archive"
  printf '%s  %s\n' "$source_hash" "$archive" | sha256sum --check --status || die 'Dify source archive checksum mismatch'
  prepared="$TEMP_DIR/release"
  mkdir -m 700 "$prepared"
  tar -xzf "$archive" --strip-components=1 -C "$prepared"
  [[ -f "$prepared/docker/docker-compose.yaml" && -f "$prepared/docker/.env.example" ]] || die 'Pinned Dify source is missing its Compose or environment template'
  printf '%s\n' "$source_hash" > "$prepared/source-archive.sha256"
  mv "$prepared" "$DIFY_RELEASE"
  printf 'created: verified Dify 1.17.1 release files\n'
}
dify_prepare_environment() {
  local candidate
  [[ -f "$DIFY_ENV" ]] || {
    private_temp
    candidate="$TEMP_DIR/dify-runtime.env"
    python3 - "$DIFY_RELEASE/docker/.env.example" "$candidate" "$(jq -er .dify_hostname "$CONFIG_FILE")" <<'PY'
from pathlib import Path
import base64
import os
import re
import secrets
import sys

source, destination, hostname = sys.argv[1:]
text = Path(source).read_text()
origin = f"https://{hostname}"
values = {
    "SECRET_KEY": secrets.token_urlsafe(48),
    "DB_PASSWORD": secrets.token_hex(32),
    "REDIS_PASSWORD": secrets.token_hex(32),
    "WEAVIATE_API_KEY": secrets.token_hex(32),
    "CODE_EXECUTION_API_KEY": secrets.token_hex(32),
    "PLUGIN_DAEMON_KEY": secrets.token_hex(32),
    "PLUGIN_DIFY_INNER_API_KEY": secrets.token_hex(32),
    "DIFY_AGENT_API_TOKEN": secrets.token_hex(32),
    "DIFY_AGENT_LOCAL_SANDBOX_AUTH_TOKEN": secrets.token_hex(32),
    "DIFY_AGENT_SERVER_SECRET_KEY": base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("="),
    "CONSOLE_API_URL": origin,
    "CONSOLE_WEB_URL": origin,
    "SERVICE_API_URL": origin,
    "TRIGGER_URL": origin,
    "APP_API_URL": origin,
    "APP_WEB_URL": origin,
    "FILES_URL": origin,
    "NEXT_PUBLIC_SOCKET_URL": f"wss://{hostname}",
    "CELERY_WORKER_AMOUNT": "1",
    "WEAVIATE_AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED": "false",
    "WEAVIATE_AUTHENTICATION_APIKEY_USERS": "booklet-dify",
    "WEAVIATE_AUTHORIZATION_ADMINLIST_USERS": "booklet-dify",
    "COMPOSE_PROFILES": "weaviate,postgresql,collaboration",
    "FORCE_VERIFYING_SIGNATURE": "true",
}
values["SANDBOX_API_KEY"] = values["CODE_EXECUTION_API_KEY"]
values["WEAVIATE_AUTHENTICATION_APIKEY_ALLOWED_KEYS"] = values["WEAVIATE_API_KEY"]
values["CELERY_BROKER_URL"] = f"redis://:{values['REDIS_PASSWORD']}@redis:6379/1"
for key, value in values.items():
    pattern = rf"(?m)^{re.escape(key)}=.*$"
    text, count = re.subn(pattern, lambda _: f"{key}={value}", text)
    if count != 1:
        raise SystemExit(f"Dify environment template is missing or duplicates {key}")
text += "\nOPENAPI_ENABLED=true\nENABLE_OAUTH_BEARER=true\nOPENAPI_KNOWN_CLIENT_IDS=difyctl,difywf\nDIFY_AGENT_REDIS_PREFIX=dify-agent\n"
Path(destination).write_text(text)
PY
    install -m 600 "$candidate" "$DIFY_ENV"
    printf 'created: protected Dify runtime configuration\n'
  }
  [[ -f "$DIFY_ENV" && ! -L "$DIFY_ENV" && "$(stat -c %a "$DIFY_ENV")" == 600 && "$(stat -c %u "$DIFY_ENV")" == 0 ]] || die 'Dify runtime configuration must be a root-owned mode-600 file'
  if [[ -L "$DIFY_RELEASE/docker/.env" ]]; then
    [[ "$(readlink "$DIFY_RELEASE/docker/.env")" == "$DIFY_ENV" ]] || die 'Dify release environment link targets another file'
  elif [[ ! -e "$DIFY_RELEASE/docker/.env" ]]; then
    ln -s "$DIFY_ENV" "$DIFY_RELEASE/docker/.env"
  else
    die 'Dify release contains an unexpected environment file'
  fi
}
dify_validate_compose() {
  local resolved
  private_temp
  resolved="$TEMP_DIR/dify-compose.json"
  dify_compose config --format json > "$resolved"
  chmod 600 "$resolved"
  jq -e --slurpfile release "$ROOT/dify/release.json" '
    ([.services | to_entries[] | {key, value: .value.image}] | from_entries) == $release[0].images and
    (.services.plugin_daemon.ports // [] | length == 0) and
    (.services.nginx.ports | length == 1 and .[0].host_ip == "127.0.0.1" and (.[0].published | tostring) == "3300" and .[0].target == 80) and
    ([.services | to_entries[] | select(.key != "nginx") | .value.ports[]?] | length == 0)
  ' "$resolved" >/dev/null || die 'Resolved Dify Compose configuration has unpinned images or exposed internal ports'
}
dify_socket_responds() {
  # Validate the Engine.IO open packet without printing its session identifier.
  curl -fsS --max-time 8 'http://127.0.0.1:3300/socket.io/?EIO=4&transport=polling' 2>/dev/null |
    python3 -c 'import json, sys; body = sys.stdin.read(4097); assert len(body) <= 4096 and body.startswith("0"); assert json.loads(body[1:]).get("sid")' >/dev/null 2>&1
}
dify_verify_services() {
  local expected_services actual_services records deadline
  [[ -f "$DIFY_ENV" && -f "$DIFY_RELEASE/docker/docker-compose.yaml" ]] || die 'Dify configuration or release files are missing'
  dify_validate_compose
  expected_services="$(dify_compose config --services | sort)"
  [[ -n "$expected_services" ]] || die 'Resolved Dify service set is empty'
  deadline=$((SECONDS + 180))
  while ((SECONDS < deadline)); do
    records="$(dify_service_records)"
    actual_services="$(jq -r '.[].Service' <<< "$records" | sort)"
    if [[ "$actual_services" == "$expected_services" ]] &&
      dify_service_records_are_ready <<< "$records" &&
      curl -fsS --max-time 15 --output /dev/null http://127.0.0.1:3300/ && dify_socket_responds; then
      printf 'verified: Dify 1.17.1 responds on localhost:3300 with selected containers running and collaboration socket ready\n'
      return
    fi
    sleep 3
  done
  printf 'failed: Dify readiness state %s\n' "$(jq -c '[.[] | {service:.Service,state:.State,health:(.Health // ""),exitCode:(.ExitCode // null)}]' <<< "$records")" >&2
  die 'Dify did not become ready within 180 seconds'
}
dify_collaboration_is_ready() {
  local container
  container="$(dify_compose ps -q api_websocket)" || return 1
  [[ -n "$container" ]] || return 1
  docker inspect "$container" | jq -e 'length == 1 and .[0].HostConfig.Memory == 1610612736 and .[0].State.Health.Status == "healthy"' >/dev/null || return 1
  dify_socket_responds
}
dify_repair_collaboration_host() {
  [[ -f "$DIFY_DATA/current" && "$(<"$DIFY_DATA/current")" == 1.17.1 ]] || die 'Pinned Dify installation is not recorded'
  dify_install_preflight || return 1
  dify_validate_compose || return 1
  dify_idle_host || return 1
  if dify_collaboration_is_ready; then
    printf 'exists: Dify collaboration has the reviewed memory limit and responds\n'
    save_success ''
    return
  fi
  set_step restarting
  dify_compose up -d --no-deps --force-recreate api_websocket >/dev/null || return 1
  dify_verify_services || return 1
  dify_collaboration_is_ready || die 'Dify collaboration memory, health or socket check failed'
  printf 'verified: Dify collaboration repaired with 1536 MiB and a responsive socket\n'
  save_success ''
}
dify_check_host() {
  [[ -f "$DIFY_DATA/current" && "$(<"$DIFY_DATA/current")" == 1.17.1 ]] || die 'Dify 1.17.1 is not recorded as installed'
  dify_verify_services
}

dify_diagnostic_identity() {
  [[ "$(hostname -f)" == "$(jq -er '.host_observation.hostname' "$CONFIG_FILE")" ]] || die 'Diagnostic host identity differs'
  for command in docker jq timeout python3; do need_command "$command"; done
}
dify_service_diagnostics() {
  local service="$1" container
  [[ "$service" == sandbox || "$service" == worker_beat ]] || die 'Unsupported diagnostic service'
  container="$(docker ps -aq --filter label=com.docker.compose.project=booklet-dify --filter "label=com.docker.compose.service=$service")"
  [[ -n "$container" ]] || return 0
  # A restart can race exec. Report the gap without exposing Docker errors.
  if ! timeout 10s docker exec "$container" sh -c 'if [ -r /sys/fs/cgroup/memory.events ]; then cat /sys/fs/cgroup/memory.events; else exit 1; fi' 2>/dev/null |
    awk -v service="$service" '/^(low|high|max|oom|oom_kill|oom_group_kill) [0-9]+$/ {print "result: " service "_memory " $0}'; then
    printf 'result: %s_memory unavailable\n' "$service"
  fi
  timeout 15s docker logs --since 2h --tail 2000 "$container" 2>&1 | python3 -c '
import collections, json, sys
counts = collections.Counter()
for line in sys.stdin:
    for term in ("timeout", "signal: killed", "out of memory", "permission denied", "permissionerror", "connection refused", "noauth", "wrongpass", "authenticationerror", "modulenotfounderror", "memoryerror", "operationalerror", "programmingerror", "runtimeerror", "importerror", "attributeerror", "valueerror", "typeerror", "filenotfounderror", "traceback (most recent call last)", "running migrations", "migrations completed", "starting beat", "beat: starting"):
        if term in line.lower(): counts[term] += 1
print("result: " + sys.argv[1] + "_errors " + json.dumps(dict(counts)))' "$service"
}

dify_staging_api_diagnostic() {
  local container="$1" run_id="$2"
  if ! timeout 20s docker exec -i -w /app "$container" node - "$run_id" 2>/dev/null <<'NODE'
(async () => {
  if (process.env.DEPLOYMENT_ENV !== '_staging') throw Error('TargetDiffers');
  const password = process.env.ACCESS_GATE_PASSWORD;
  const runId = process.argv[2];
  if (!password || password.length < 16 || !/^[a-f0-9-]{36}$/.test(runId)) throw Error('ConfigurationInvalid');
  const response = await fetch('https://booklet-staging.uniwares.co.uk/api/diagnostics/logs?limit=1&runId=' + runId, {
    headers: {Authorization: 'Basic ' + Buffer.from('booklet:' + password).toString('base64')},
    redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json')) throw Error('ResponseInvalid');
  const reader = response.body?.getReader();
  if (!reader) throw Error('BodyMissing');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65_536) throw Error('BodyTooLarge');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!Array.isArray(body?.data?.events) || body.data.events.length > 1) throw Error('SchemaInvalid');
  console.log('result: staging_api ' + JSON.stringify({authenticated:true,status:200,eventCount:body.data.events.length}));
})().catch(() => {
  // Never return fetch errors, headers, response bodies or credential material.
  console.log('result: staging_api ' + JSON.stringify({authenticated:false,outcome:'unverified'}));
});
NODE
  then
    printf 'result: staging_api {"authenticated":false,"outcome":"unverified"}\n'
  fi
}

dify_diagnostics_host() {
  dify_diagnostic_identity
  local dispatcher_hash=unavailable
  [[ ! -f "$ROOT/vps-deployment.sh" ]] || dispatcher_hash="$(sha256sum "$ROOT/vps-deployment.sh" | awk '{print $1}')"
  printf 'result: dispatcher %s\n' "$dispatcher_hash"
  printf 'result: dispatcher_capabilities operation-status operation-stop backup-verify bounded-units staging-bootstrap-reconcile\n'
  if [[ -f "$STATE/staging-bootstrap.json" ]]; then
    printf 'result: bootstrap_checkpoint %s\n' "$(jq -c '{oldRequest,oldRelease,oldImage,commit,image,backupId,phase,superseded}' "$STATE/staging-bootstrap.json")"
  fi
  printf 'result: host %s\n' "$(python3 -c 'import json; m={k:int(v.split()[0]) for k,v in (line.split(":",1) for line in open("/proc/meminfo"))}; print(json.dumps({k:m[k]//1024 for k in ["MemTotal","MemAvailable","SwapTotal","SwapFree"]}))')"
  printf 'result: disk %s\n' "$(df -Pk "$STATE" | awk 'NR==2 {printf "availableKiB=%s usedPercent=%s", $4, $5}')"
  show_operation_status
  local ids=() container records
  mapfile -t ids < <(docker ps -aq --filter label=com.docker.compose.project=booklet-dify)
  [[ "${#ids[@]}" -le 30 ]] || die 'Unexpected Dify container count'
  for container in "${ids[@]}"; do
    records="$(timeout 10s docker inspect "$container" | jq -c '.[0] | {name:.Name,status:.State.Status,health:(.State.Health.Status // null),oomKilled:.State.OOMKilled,exitCode:.State.ExitCode,startedAt:.State.StartedAt,finishedAt:.State.FinishedAt,restarts:.RestartCount,memoryLimitBytes:.HostConfig.Memory}')"
    printf 'result: container %s\n' "$records"
  done
  if [[ "${#ids[@]}" -gt 0 ]]; then
    timeout 15s docker stats --no-stream --format 'result: resources {{.Name}} cpu={{.CPUPerc}} memory={{.MemUsage}} pids={{.PIDs}}' "${ids[@]}"
  fi
  dify_service_diagnostics sandbox
  dify_service_diagnostics worker_beat
  [[ -n "$RUN_ID" ]] || return 0
  mapfile -t ids < <(docker ps -q --filter label=com.docker.compose.project=kids-booklet-staging --filter label=com.docker.compose.service=app --filter label=com.docker.compose.oneoff=False)
  [[ "${#ids[@]}" == 1 ]] || die 'Expected one staging application'
  container="${ids[0]}"
  dify_staging_api_diagnostic "$container" "$RUN_ID"
  printf 'result: staging_release %s\n' "$(< "$STATE/releases/staging/current")"
  timeout 45s docker exec -i -w /app "$container" node --import tsx - "$RUN_ID" <<'NODE'
(async () => {
  if (process.env.DEPLOYMENT_ENV !== '_staging') throw Error('UnexpectedTarget');
  const {getDatabase} = require('./db/client.ts');
  const db = getDatabase();
  try {
    const runId = process.argv[2];
    const run = await db.collections.experiment_runs.findOne({_id: runId});
    if (!run) throw Error('RunNotFound');
    const ops = await db.collections.experiment_operations.aggregate([
      {$match:{runId}}, {$sort:{createdAtMs:1,_id:1}}, {$limit:301},
      {$project:{_id:1,role:1,taskId:1,state:1,safeFailure:1,workflowRunId:1,workflowTaskId:1,verifiedWorkflowId:1,reservationCount:1,deadlineAtMs:1,
        remoteStatus:1,dispatchStartedAtMs:1,updatedAtMs:1,
        'lifecycle.startedAtMs':1,'lifecycle.lastProgressAtMs':1,'lifecycle.ownerId':1,'lifecycle.phase':1,
        'lifecycle.attemptOutcome':1,'lifecycle.unresolved':1,'lifecycle.endedAtMs':1,'lifecycle.timeoutAtMs':1,'lifecycle.recoveredAtMs':1,
        'lifecycle.stop.requestedAtMs':1,'lifecycle.stop.reason':1,'lifecycle.stop.delivery':1,
        referenceUploadsSaved:{$eq:[{$type:'$referenceUploadsJson'},'string']},referenceUploadJournalSaved:{$eq:[{$type:'$referenceUploadJournalJson'},'string']},
        resultSaved:{$eq:[{$type:'$resultJson'},'string']},materializationSaved:{$eq:[{$type:'$materializationJson'},'string']}}},
    ]).toArray();
    if (ops.length > 300) throw Error('OperationLimit');
    console.log('result: run ' + JSON.stringify({id:run._id,status:run.status,revision:run.revision,activeOperationId:run.activeOperationId,safeFailure:run.safeFailure,counters:run.counters,
      preparation:run.preparation ? {ownerId:run.preparation.ownerId,startedAtMs:run.preparation.startedAtMs,deadlineAtMs:run.preparation.deadlineAtMs,outcome:run.preparation.outcome,unresolved:run.preparation.unresolved}:null,operations:ops}));
  } finally { await db.client.close(); }
})().catch(() => {console.error('error: staging run diagnostic failed');process.exitCode=1;});
NODE
  timeout 20s docker logs --since 24h --tail 20000 "$container" 2>&1 | python3 -c '
import collections, json, math, sys
groups = collections.defaultdict(list)
for line in sys.stdin:
    try: row = json.loads(line[line.index("{"):])
    except (ValueError, TypeError): continue
    if not isinstance(row, dict): continue
    if row.get("event") != "booklet_callback_phase" or row.get("runId") != sys.argv[1]: continue
    if row.get("phase") not in ("authorization","claim","context","source_verification","fixture_authorization","image_callback","image_claim","image_decode","image_finalize","image_preflight","image_storage","result_finalization","authorization_transaction","result_transaction"): continue
    value = row.get("elapsedMs")
    if isinstance(value, (int,float)) and math.isfinite(value) and value >= 0: groups[row["phase"]].append(value)
for phase, values in sorted(groups.items()):
    print("result: timings " + json.dumps({"phase":phase,"count":len(values),"firstMs":values[0],"p95Ms":sorted(values)[math.ceil(len(values)*.95)-1],"maxMs":max(values)}))
print("result: timing_scope " + json.dumps({"windowHours":24,"tailLines":20000,"recordCount":sum(map(len,groups.values()))}))' "$RUN_ID"
}
dify_sandbox_is_ready() {
  local container
  container="$(dify_compose ps -q sandbox)"
  [[ -n "$container" ]] && docker inspect "$container" | jq -e 'length==1 and .[0].State.Status=="running" and .[0].State.Health.Status=="healthy" and .[0].HostConfig.Memory==1073741824' >/dev/null
}
dify_sandbox_preflight() {
  dify_diagnostic_identity
  dify_install_preflight
  dify_validate_compose
  private_temp
  dify_compose config --format json > "$TEMP_DIR/sandbox-compose.json"
  jq -e '(.services.sandbox.mem_limit | tonumber) == 1073741824' "$TEMP_DIR/sandbox-compose.json" >/dev/null || die 'Reviewed sandbox configuration must specify 1024 MiB'
  local available
  available="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  [[ "$available" -ge 2883584 ]] || die 'Sandbox increase requires 2816 MiB available memory (768 MiB increase plus 2 GiB headroom)'
}
dify_repair_sandbox_host() {
  dify_sandbox_preflight
  if dify_sandbox_is_ready; then printf 'exists: sandbox has 1024 MiB and is healthy\n'; save_success ''; return; fi
  dify_idle_host
  set_step restarting
  dify_compose up -d --no-deps --force-recreate sandbox >/dev/null
  dify_verify_services
  dify_sandbox_is_ready || die 'Sandbox memory or health verification failed'
  printf 'verified: sandbox has 1024 MiB and is healthy\n'
  save_success ''
}
dify_scheduler_preflight() {
  dify_diagnostic_identity
  dify_install_preflight
  dify_validate_compose
  private_temp
  dify_compose config --format json > "$TEMP_DIR/scheduler-compose.json"
  jq -e '(.services.worker_beat.mem_limit | tonumber) == 1610612736' "$TEMP_DIR/scheduler-compose.json" >/dev/null || die 'Reviewed scheduler configuration must specify 1536 MiB'
  local available
  available="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  [[ "$available" -ge 3407872 ]] || die 'Scheduler increase requires 3328 MiB available memory (1280 MiB increase plus 2 GiB headroom)'
}

dify_scheduler_snapshot() {
  local container
  container="$(dify_compose ps -q worker_beat)" || return 1
  [[ -n "$container" ]] || return 1
  timeout 10s docker inspect "$container" | jq -cer '
    select(length == 1) | .[0] |
    select(.State.Status == "running" and .HostConfig.Memory == 1610612736) |
    {id:.Id,startedAt:.State.StartedAt,restarts:.RestartCount}'
}

dify_scheduler_has_started() {
  local snapshot="$1"
  # Use only this start interval. Return a predicate, never raw log text.
  timeout 15s docker logs --since "$(jq -r .startedAt <<< "$snapshot")" --tail 2000 "$(jq -r .id <<< "$snapshot")" 2>&1 |
    python3 -c 'import sys; found = any("beat: starting" in line.lower() for line in sys.stdin.read().splitlines()); sys.exit(0 if found else 1)'
}

dify_verify_scheduler() {
  local initial current attempt started=false
  initial="$(dify_scheduler_snapshot)" || die 'Scheduler is not running with the reviewed memory limit'
  for ((attempt=0; attempt<36; attempt++)); do
    current="$(dify_scheduler_snapshot)" || die 'Scheduler stopped during startup'
    [[ "$current" == "$initial" ]] || die 'Scheduler restarted during startup'
    if dify_scheduler_has_started "$initial"; then started=true; break; fi
    sleep 5
  done
  [[ "$started" == true ]] || die 'Scheduler did not report beat startup within the bounded check'
  for ((attempt=0; attempt<24; attempt++)); do
    sleep 5
    current="$(dify_scheduler_snapshot)" || die 'Scheduler stopped during stability check'
    [[ "$current" == "$initial" ]] || die 'Scheduler restarted during stability check'
  done
  printf 'verified: worker_beat reached beat startup with 1536 MiB and no restarts for 120 seconds\n'
}

dify_repair_scheduler_host() {
  dify_scheduler_preflight
  if dify_scheduler_snapshot >/dev/null; then
    dify_verify_scheduler
    dify_verify_services
    printf 'exists: scheduler already has the reviewed memory limit and is stable\n'
    save_success ''
    return
  fi
  dify_idle_host
  set_step restarting
  dify_compose up -d --no-deps --force-recreate worker_beat >/dev/null
  dify_verify_scheduler
  dify_verify_services
  save_success ''
}

dify_idle_host() {
  local workflow_count agent_count=0 key record status
  [[ -f "$DIFY_ENV" && -f "$DIFY_DATA/current" ]] || die 'Dify is not installed or configured'
  grep -Fxq 'DIFY_AGENT_REDIS_PREFIX=dify-agent' "$DIFY_ENV" || die 'Dify Agent Redis prefix differs from the reviewed idle contract'
  need_command jq
  workflow_count="$(dify_compose exec -T db_postgres sh -c 'psql -X -A -t -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' sh "SELECT count(*) FROM workflow_runs WHERE status = 'running'")" || die 'Cannot inspect Dify workflow activity'
  [[ "$workflow_count" =~ ^[0-9]+$ ]] || die 'Dify workflow activity returned an invalid count'
  private_temp
  dify_compose exec -T redis redis-cli -n 2 --raw --scan --pattern 'dify-agent:runs:*:record' > "$TEMP_DIR/dify-agent-keys" || die 'Cannot enumerate Dify Agent run records'
  while IFS= read -r key; do
    [[ "$key" =~ ^dify-agent:runs:[a-f0-9-]+:record$ ]] || die 'Dify Agent run key differs from the reviewed contract'
    record="$(dify_compose exec -T redis redis-cli -n 2 --raw GET "$key")" || die 'Cannot inspect a Dify Agent run record'
    status="$(jq -er '.status | select(. == "running" or . == "succeeded" or . == "failed" or . == "cancelled")' <<< "$record")" || die 'Dify Agent run record has an unknown status'
    [[ "$status" != running ]] || agent_count=$((agent_count + 1))
  done < "$TEMP_DIR/dify-agent-keys"
  printf 'exists: Dify active workflows=%s active New Agent runs=%s\n' "$workflow_count" "$agent_count"
  [[ "$workflow_count" == 0 && "$agent_count" == 0 ]] || die 'Dify still has active work; defer maintenance'
  printf 'verified: no active Dify workflow or New Agent records at the observation point\n'
}
dify_install_host() {
  dify_install_preflight
  if [[ -f "$DIFY_DATA/current" ]]; then
    dify_check_host
    save_success ''
    return
  fi
  set_step preparing
  dify_prepare_directories
  dify_prepare_release
  dify_prepare_persistent_files
  dify_prepare_environment
  dify_validate_compose
  set_step pulling
  jq -r '.images[]' "$ROOT/dify/release.json" | sort -u | while IFS= read -r image; do docker pull "$image" >/dev/null; done
  set_step starting
  dify_compose up -d >/dev/null
  dify_verify_services
  printf '%s\n' 1.17.1 > "$DIFY_DATA/current.next"
  mv "$DIFY_DATA/current.next" "$DIFY_DATA/current"
  save_success ''
}
dify_broker_environment() {
  local mode="$1"
  python3 - "$DIFY_ENV" "$mode" <<'PY'
from pathlib import Path
import os
import re
import sys

path, mode = Path(sys.argv[1]), sys.argv[2]
if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o777 != 0o600 or path.stat().st_uid != os.geteuid():
    raise SystemExit("Dify runtime configuration is not a protected owner-only file")
text = path.read_text()
def value(name):
    matches = re.findall(rf"(?m)^{re.escape(name)}=(.*)$", text)
    if len(matches) != 1:
        raise SystemExit(f"Dify runtime configuration has missing or duplicate {name}")
    return matches[0]
password = value("REDIS_PASSWORD")
if not re.fullmatch(r"[a-f0-9]{64}", password):
    raise SystemExit("Dify Redis password differs from the generated format")
current = value("CELERY_BROKER_URL")
expected = f"redis://:{password}@redis:6379/1"
if current == expected:
    print("exists: Dify Celery broker credential matches Redis")
elif current != "redis://:difyai123456@redis:6379/1":
    raise SystemExit("Dify Celery broker differs from the known first-install mismatch; inspect privately")
elif mode == "preview":
    print("would update: Dify Celery broker credential")
elif mode == "apply":
    backup = path.with_name("runtime.env.broker-before-repair")
    candidate = path.with_name("runtime.env.broker-next")
    if backup.exists() or backup.is_symlink():
        raise SystemExit("Protected Dify broker backup already exists; inspect before retry")
    if candidate.exists() or candidate.is_symlink():
        raise SystemExit("Protected Dify broker candidate already exists; inspect before retry")
    backup.write_text(text)
    backup.chmod(0o600)
    corrected, count = re.subn(r"(?m)^CELERY_BROKER_URL=.*$", lambda _: f"CELERY_BROKER_URL={expected}", text)
    if count != 1:
        raise SystemExit("Dify runtime configuration has an ambiguous broker setting")
    candidate.write_text(corrected)
    candidate.chmod(0o600)
    os.replace(candidate, path)
    print("updated: Dify Celery broker credential")
else:
    raise SystemExit("Invalid Dify broker operation mode")
PY
}
dify_api_broker_authenticates() {
  dify_compose exec -T api python -c 'import os, redis; assert redis.Redis.from_url(os.environ["CELERY_BROKER_URL"]).ping()' >/dev/null 2>&1
}
dify_repair_broker_host() {
  [[ -f "$DIFY_DATA/current" && "$(<"$DIFY_DATA/current")" == 1.17.1 ]] || die 'Pinned Dify installation is not recorded'
  dify_idle_host
  if [[ "$(dify_broker_environment preview)" == 'exists: Dify Celery broker credential matches Redis' ]] && dify_api_broker_authenticates; then
    printf 'exists: Dify API Celery broker authentication already succeeds\n'
    save_success ''
    return
  fi
  set_step repairing
  dify_broker_environment apply
  set_step restarting
  dify_compose up -d --no-deps --force-recreate api worker worker_beat >/dev/null
  dify_verify_services
  dify_api_broker_authenticates || die 'Dify API cannot authenticate to its Celery broker'
  printf 'verified: Dify API broker authentication succeeds after service recreation\n'
  save_success ''
}
dify_admin_api_state() {
  python3 - "$DIFY_ENV" <<'PY'
from pathlib import Path
import os
import re
import sys

path = Path(sys.argv[1])
if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o777 != 0o600 or path.stat().st_uid != os.geteuid():
    raise SystemExit("Dify runtime configuration is not a protected owner-only file")
text = path.read_text()
def setting(name):
    matches = re.findall(rf"(?m)^{name}=(.*)$", text)
    if len(matches) > 1:
        raise SystemExit(f"Dify runtime configuration duplicates {name}")
    return matches[0] if matches else None

enabled = setting("ADMIN_API_KEY_ENABLE")
key = setting("ADMIN_API_KEY")
if enabled == "true" and key and re.fullmatch(r"[a-f0-9]{64}", key):
    print("exists: Dify admin API configuration is enabled with a generated-format key")
elif enabled in (None, "false") and key in (None, ""):
    print("would update: Dify admin API configuration")
else:
    raise SystemExit("Dify admin API configuration has unexpected state; inspect privately")
PY
}
dify_admin_api_active() {
  dify_compose exec -T api python -c 'import os, re, sys; text = sys.stdin.read(); keys = re.findall(r"(?m)^ADMIN_API_KEY=(.*)$", text); assert os.environ.get("ADMIN_API_KEY_ENABLE") == "true" and len(keys) == 1 and re.fullmatch("[a-f0-9]{64}", keys[0]) and os.environ.get("ADMIN_API_KEY") == keys[0]' < "$DIFY_ENV" >/dev/null 2>&1
}
dify_prompt_admin_api_key() {
  local admin_key
  [[ -t 0 && -t 1 ]] || die 'Admin API setup requires a private interactive VPS terminal'
  IFS= read -r -s -p 'Paste the 64-character Dify admin API key: ' admin_key
  printf '\n' >&2
  [[ "$admin_key" =~ ^[a-f0-9]{64}$ ]] || die 'Admin API key must be 32 random bytes encoded as lowercase hexadecimal'
  private_temp
  ADMIN_API_KEY_FILE="$TEMP_DIR/admin-api-key"
  printf '%s' "$admin_key" > "$ADMIN_API_KEY_FILE"
  admin_key=''; unset admin_key
}
dify_admin_api_environment() {
  python3 - "$DIFY_ENV" "$ADMIN_API_KEY_FILE" <<'PY'
from pathlib import Path
import os
import re
import sys

path, key_path = map(Path, sys.argv[1:])
text = path.read_text()
key = key_path.read_text()
if not re.fullmatch(r"[a-f0-9]{64}", key):
    raise SystemExit("Admin API key has an invalid format")
backup = path.with_name("runtime.env.admin-api-before-enable")
candidate = path.with_name("runtime.env.admin-api-next")
settings = {}
for name in ("ADMIN_API_KEY_ENABLE", "ADMIN_API_KEY"):
    matches = re.findall(rf"(?m)^{name}=(.*)$", text)
    if len(matches) > 1:
        raise SystemExit("Admin API settings changed after preview; inspect privately")
    settings[name] = matches[0] if matches else None
if settings["ADMIN_API_KEY_ENABLE"] not in (None, "false") or settings["ADMIN_API_KEY"] not in (None, ""):
    raise SystemExit("Admin API settings changed after preview; inspect privately")
if backup.is_symlink() or (backup.exists() and (backup.stat().st_mode & 0o777 != 0o600 or backup.read_text() != text)):
    raise SystemExit("Protected admin API backup differs from the current pre-enable configuration")
if not backup.exists():
    with backup.open("x") as file:
        file.write(text)
    backup.chmod(0o600)
text = re.sub(r"(?m)^ADMIN_API_KEY(?:_ENABLE)?=.*\n?", "", text)
updated = text.rstrip("\n") + "\nADMIN_API_KEY_ENABLE=true\nADMIN_API_KEY=" + key + "\n"
if candidate.is_symlink() or (candidate.exists() and (candidate.stat().st_mode & 0o777 != 0o600 or candidate.read_text() != updated)):
    raise SystemExit("Protected admin API candidate differs from this request; inspect privately")
if not candidate.exists():
    with candidate.open("x") as file:
        file.write(updated)
    candidate.chmod(0o600)
os.replace(candidate, path)
print("updated: protected Dify admin API configuration")
PY
}
dify_enable_admin_api_host() {
  require_root
  need_command flock; need_command python3; need_command docker
  CONFIG_FILE="$ROOT/config.json"; load_config
  dify_install_preflight
  [[ -f "$DIFY_DATA/current" && "$(<"$DIFY_DATA/current")" == 1.17.1 ]] || die 'Pinned Dify installation is not recorded'
  if [[ "$APPLY" == false ]]; then dify_admin_api_state; return; fi
  exec 9>"$STATE/operation.lock"
  flock -n 9 || die 'Another host operation is running'
  local state
  state="$(dify_admin_api_state)"
  if [[ -f "$STATE/operation.json" ]]; then
    jq -e '.action == "dify-enable-admin-api" and .environment == "dify" and (.step == "queued" or .step == "configuring" or .step == "configured" or .step == "restarting")' "$STATE/operation.json" >/dev/null || die 'Another unresolved host operation exists; inspect its status first'
    REQUEST_ID="$(jq -er .requestId "$STATE/operation.json")"
    printf 'exists: resuming Dify admin API operation %s\n' "$REQUEST_ID"
  else
    if [[ "$state" == exists:* ]] && dify_admin_api_active; then
      dify_verify_services
      printf 'exists: Dify admin API settings are active in the API service\n'
      return
    fi
    dify_idle_host
    if [[ "$state" != exists:* ]]; then dify_prompt_admin_api_key; fi
    REQUEST_ID="${REQUEST_ID:-$(date +%s)-$$}"
    [[ ! -f "$STATE/operations/$REQUEST_ID.json" ]] || die 'Request ID already completed'
    jq -n --arg requestId "$REQUEST_ID" '{requestId:$requestId,action:"dify-enable-admin-api",environment:"dify",image:"",commit:"",backupId:"",confirmation:"",step:"queued"}' > "$STATE/operation.json"
  fi
  dify_idle_host
  if [[ "$state" != exists:* ]]; then
    [[ -n "$ADMIN_API_KEY_FILE" ]] || dify_prompt_admin_api_key
    set_step configuring
    dify_admin_api_environment
    set_step configured
  fi
  set_step restarting
  dify_compose up -d --no-deps --force-recreate api api_websocket >/dev/null
  dify_verify_services
  dify_admin_api_active || die 'Dify API process did not receive admin API configuration'
  printf 'verified: Dify admin API settings reached the API service; complete a private bearer request before claiming authentication works\n'
  save_success ''
}
host_run() {
  require_root; need_command flock; need_command docker; need_command jq
  exec 9>"$STATE/operation.lock"
  flock -n 9 || die 'Another host operation is running'
  [[ -f "$STATE/operation.json" ]] || die 'Operation journal is missing'
  [[ "$(jq -r .requestId "$STATE/operation.json")" == "$REQUEST_ID" ]] || die 'Operation journal does not match request'
  ACTION="$(jq -r .action "$STATE/operation.json")"
  ENVIRONMENT="$(jq -r .environment "$STATE/operation.json")"
  IMAGE_DIGEST="$(jq -r .image "$STATE/operation.json")"
  COMMIT="$(jq -r .commit "$STATE/operation.json")"
  BACKUP_ID="$(jq -r .backupId "$STATE/operation.json")"
  CONFIRMATION="$(jq -r .confirmation "$STATE/operation.json")"
  if [[ "$ACTION" == restore && "$(jq -r .step "$STATE/operation.json")" == restoring ]]; then
    die 'Restore may have changed data; reconcile the exact backup and output before any new restore. Do not replay restoration blindly'
  fi
  if [[ "$ACTION" == reset-staging ]]; then
    case "$(jq -r .step "$STATE/operation.json")" in
      resetting|reset-verifying) die 'Reset may have changed data; inspect the backup and database before explicit restore. Do not replay reset';;
    esac
  fi
  recover_interrupted_rotation
  if [[ "$ACTION" != restore && -n "$BACKUP_ID" ]]; then
    case "$ACTION:$(jq -r .step "$STATE/operation.json")" in
      retire-staging-artifact-index:backup-verified|retire-staging-artifact-index:retiring-index|retire-staging-artifact-index:index-verified|retire-staging-artifact-index:index-restarting|retire-staging-artifact-index:index-finalizing|retire-staging-artifact-index:complete) :;;
      *) BACKUP_ID='';;
    esac
  fi
  validate_arguments
  if [[ "$ACTION" == dify-install ]]; then dify_install_host; return; fi
  if [[ "$ACTION" == dify-repair-broker ]]; then dify_repair_broker_host; return; fi
  if [[ "$ACTION" == dify-repair-collaboration ]]; then dify_repair_collaboration_host; return; fi
  if [[ "$ACTION" == dify-repair-sandbox ]]; then dify_repair_sandbox_host; return; fi
  if [[ "$ACTION" == dify-repair-scheduler ]]; then dify_repair_scheduler_host; return; fi
  [[ "$ACTION" != dify-enable-admin-api ]] || die 'Resume Dify admin API setup from the private VPS terminal with its local apply action'
  run_lifecycle
}
dify_discover_host() {
  for name in docker ss df nproc awk wc hostname uname paste; do need_command "$name"; done
  local os_name memory_mib available_mib swap_mib free_gib free_inodes
  # shellcheck disable=SC1091
  os_name="$(. /etc/os-release; printf '%s' "${PRETTY_NAME:-unknown}")"
  memory_mib="$(awk '/^MemTotal:/ {print int($2 / 1024)}' /proc/meminfo)"
  available_mib="$(awk '/^MemAvailable:/ {print int($2 / 1024)}' /proc/meminfo)"
  swap_mib="$(awk '/^SwapTotal:/ {print int($2 / 1024)}' /proc/meminfo)"
  free_gib="$(df -Pk "$STATE" | awk 'NR==2 {print int($4 / 1048576)}')"
  free_inodes="$(df -Pi "$STATE" | awk 'NR==2 {print $4}')"
  printf 'exists: Dify candidate host %s (%s, %s, %s CPU, %s MiB RAM, %s MiB available, %s MiB swap, %s GiB free and %s inodes free at state root)\n' "$(hostname -f)" "$os_name" "$(uname -m)" "$(nproc)" "$memory_mib" "$available_mib" "$swap_mib" "$free_gib" "$free_inodes"
  printf 'exists: Docker %s; Compose %s\n' "$(docker --version)" "$(docker compose version --short)"
  if [[ "$(ss -lnt '( sport = :3300 )' | wc -l)" -gt 1 ]]; then
    printf 'failed: Dify loopback port 3300 is already listening\n'
    return 1
  fi
  printf 'available: Dify loopback port 3300\n'
  printf 'exists: running container names: '
  docker ps --format '{{.Names}}' | paste -sd, -
  printf 'exists: container resource observations (name, memory, restart count, OOM flag):\n'
  docker ps -q | while IFS= read -r container_id; do
    docker inspect --format '{{.Name}} memory_limit={{.HostConfig.Memory}} restart_count={{.RestartCount}} oom_killed={{.State.OOMKilled}}' "$container_id"
  done
}
host_dispatch() {
  require_root
  local original="${SSH_ORIGINAL_COMMAND:-}" token
  [[ -n "$original" && "$original" != *$'\n'* && "$original" != *$'\r'* ]] || die 'Invalid remote request'
  local -a args=()
  read -r -a args <<< "$original"
  for token in "${args[@]}"; do [[ "$token" =~ ^[a-zA-Z0-9_./:@-]+$ ]] || die 'Invalid remote argument'; done
  SEEN=(); ACTION=''; APPLY=false; SECRET_NAME=''
  parse_arguments "${args[@]}"; validate_arguments
  case "$ACTION" in deploy|dify-discover|dify-check|dify-idle|dify-diagnostics|dify-repair-sandbox|dify-repair-scheduler|dify-install|dify-repair-broker|dify-repair-collaboration|check|backup|backup-verify|staging-bootstrap-reconcile|candidate-reconcile|expired-deployment-recover|restore|rollback|rotate-secrets|repair-first-activation-secrets|stage-secrets|reset-staging|retire-staging-artifact-index|resume|status|operation-status|operation-stop|infra-lock|infra-unlock|sync-host) :;; *) die 'Operation is not available remotely';; esac
  CONFIG_FILE="$ROOT/config.json"; load_config
  if [[ "$ACTION" == operation-status ]]; then operation_status_host; exit 0; fi
  if [[ "$ACTION" == operation-stop ]]; then operation_stop_host; exit 0; fi
  if [[ "$ACTION" == backup-verify ]]; then backup_verify_host; exit 0; fi
  if [[ "$ACTION" == staging-bootstrap-reconcile ]]; then staging_bootstrap_reconcile_host; exit 0; fi
  if [[ "$ACTION" == candidate-reconcile || "$ACTION" == expired-deployment-recover ]]; then supported_recovery_host; exit 0; fi
  if [[ "$ACTION" == dify-discover ]]; then dify_discover_host; exit 0; fi
  if [[ "$ACTION" == dify-check ]]; then dify_check_host; exit 0; fi
  if [[ "$ACTION" == dify-idle ]]; then dify_idle_host; exit 0; fi
  if [[ "$ACTION" == dify-diagnostics ]]; then dify_diagnostics_host; exit 0; fi
  if [[ "$ENVIRONMENT" == staging && "$ACTION" != status ]]; then recovery_unresolved_guard; fi
  if [[ "$ENVIRONMENT" == staging && -e "$STATE/recovery-handoff-staging.json" && "$ACTION" != status ]]; then
    [[ "$ACTION" == deploy && "$ENVIRONMENT" == staging ]] || die 'Recovery admission requires the exact separate staging deployment'
  fi
  if [[ -e "$STATE/staging-bootstrap.json" ]]; then
    [[ "$ACTION" == deploy && "$ENVIRONMENT" == staging ]] || die 'Retained bootstrap maintenance requires its exact separate staging deployment; inspect status'
  fi
  if [[ "$ACTION" == dify-repair-scheduler && "$APPLY" == false ]]; then
    dify_scheduler_preflight
    printf 'would update: Dify worker_beat only, 1536 MiB; apply requires idle work and verifies 120 seconds of scheduler stability\n'
    exit 0
  fi
  if [[ "$ACTION" == dify-repair-sandbox && "$APPLY" == false ]]; then
    dify_sandbox_preflight
    printf 'would update: Dify Python sandbox only, 1024 MiB; apply requires idle work\n'
    exit 0
  fi
  if [[ "$ACTION" == dify-install && "$APPLY" == false ]]; then
    dify_install_preflight
    if [[ -f "$DIFY_DATA/current" ]]; then printf 'exists: pinned Dify 1.17.1 installation\n'; else printf 'would create: pinned Dify 1.17.1 installation\n'; fi
    exit 0
  fi
  if [[ "$ACTION" == dify-repair-broker && "$APPLY" == false ]]; then
    dify_broker_environment preview
    exit 0
  fi
  if [[ "$ACTION" == dify-repair-collaboration && "$APPLY" == false ]]; then
    dify_install_preflight
    dify_validate_compose
    printf 'would update: Dify collaboration only, 1536 MiB and healthcheck; apply requires idle work\n'
    exit 0
  fi
  if [[ "$ACTION" == status ]]; then
    show_operation_status
    exit 0
  fi
  if [[ "$ACTION" == stage-secrets ]]; then
    [[ "$APPLY" == true ]] || { printf 'would update: staged %s secret rotation\n' "$ENVIRONMENT"; exit 0; }
    exec 9>"$STATE/operation.lock"; flock -n 9 || die 'Another host operation is running'
    [[ ! -f "$STATE/operation.json" ]] || die 'Unresolved operation exists; use resume'
    private_temp
    dd of="$TEMP_DIR/secrets.json" bs=64K count=1 iflag=fullblock status=none
    if IFS= read -r -n 1; then die 'Staged secret override exceeds 64 KiB'; fi
    if [[ -n "$SECRET_NAME" ]]; then
      if [[ "$SECRET_NAME" == DIFY_COMMUNITY_PROBE ]]; then
        community_probe_patch_is_valid "$TEMP_DIR/secrets.json" || die 'Community probe bundle is invalid'
      elif [[ "$SECRET_NAME" == DIFY_BOOKLET_RUNNER ]]; then
        booklet_runner_patch_is_valid "$TEMP_DIR/secrets.json" || die 'Booklet runner bundle is invalid'
      else
        jq -e --arg name "$SECRET_NAME" '.services.app.environment as $e | (($e|type)=="object") and (($e|keys)==[$name]) and (($e[$name]|type)=="string") and (($e[$name]|length)>0)' "$TEMP_DIR/secrets.json" >/dev/null || die 'Single-secret rotation payload is invalid'
      fi
      jq -s '.[0] * .[1]' "$SECRETS/$ENVIRONMENT/secrets.json" "$TEMP_DIR/secrets.json" > "$TEMP_DIR/merged-secrets.json"
    else
      cp "$TEMP_DIR/secrets.json" "$TEMP_DIR/merged-secrets.json"
    fi
    application_secret_override_is_valid "$TEMP_DIR/merged-secrets.json" || die 'Staged secret override does not satisfy the application secret contract'
    install -m 600 "$TEMP_DIR/merged-secrets.json" "$SECRETS/$ENVIRONMENT/secrets.pending.json"
    printf 'updated: staged %s secret rotation\n' "$ENVIRONMENT"; exit 0
  fi
  if [[ "$ACTION" == repair-first-activation-secrets ]]; then
    [[ "$APPLY" == true ]] || { printf 'would update: %s failed first-activation secrets\n' "$ENVIRONMENT"; exit 0; }
    exec 9>"$STATE/operation.lock"; flock -n 9 || die 'Another host operation is running'
    local failed_id='' interrupted=false
    [[ ! -f "$STATE/releases/$ENVIRONMENT/current" ]] || die 'Secret repair is unavailable after a successful release'
    if [[ -f "$STATE/operation.json" ]]; then
      interrupted=true
      failed_id="$(jq -r .requestId "$STATE/operation.json")"
      jq -e --arg environment "$ENVIRONMENT" '.action=="deploy" and .environment==$environment and .step=="initializing"' "$STATE/operation.json" >/dev/null || die 'Secret repair is limited to a failed first deployment at initialization'
      ! systemctl is-active --quiet "kids-booklet-operation-$failed_id.service" || die 'Previous service remains active'
    fi
    [[ -z "$(docker ps -q --filter "label=com.docker.compose.project=kids-booklet-$ENVIRONMENT" --filter 'label=com.docker.compose.service=app')" ]] || die 'Application container remains active'
    private_temp
    dd of="$TEMP_DIR/secrets.json" bs=64K count=1 iflag=fullblock status=none
    if IFS= read -r -n 1; then die 'Secret override exceeds 64 KiB'; fi
    if [[ -n "$SECRET_NAME" ]]; then
      jq -e --arg name "$SECRET_NAME" '.services.app.environment as $e | (($e|type)=="object") and (($e|keys)==[$name]) and (($e[$name]|type)=="string") and (($e[$name]|length)>0)' "$TEMP_DIR/secrets.json" >/dev/null || die 'Single-secret repair payload is invalid'
      jq -s '.[0] * .[1]' "$SECRETS/$ENVIRONMENT/secrets.json" "$TEMP_DIR/secrets.json" > "$TEMP_DIR/merged-secrets.json"
    else
      cp "$TEMP_DIR/secrets.json" "$TEMP_DIR/merged-secrets.json"
    fi
    application_secret_override_is_valid "$TEMP_DIR/merged-secrets.json" || die 'Secret override does not satisfy the application secret contract'
    install -m 600 "$TEMP_DIR/merged-secrets.json" "$SECRETS/$ENVIRONMENT/secrets.json"
    if [[ "$interrupted" == true ]]; then
      printf 'updated: %s failed first-activation secrets; operation remains ready for explicit resume\n' "$ENVIRONMENT"
    else
      printf 'updated: %s pre-activation secrets\n' "$ENVIRONMENT"
    fi
    exit 0
  fi
  if [[ "$ACTION" == sync-host ]]; then
    [[ "$APPLY" == true && -n "$REQUEST_ID" && -f "$STATE/operation.json" ]] || die 'Host synchronization requires the active infrastructure request'
    jq -e --arg id "$REQUEST_ID" '.requestId==$id and .action=="infrastructure"' "$STATE/operation.json" >/dev/null || die 'Infrastructure lock belongs to another operation'
    private_temp
    dd of="$TEMP_DIR/host-bundle.tar" bs=1M count=5 iflag=fullblock status=none
    if IFS= read -r -n 1; then die 'Host configuration bundle exceeds 5 MiB'; fi
    tar -tf "$TEMP_DIR/host-bundle.tar" | sort > "$TEMP_DIR/contents"
    local includes_dify=false
    printf '%s\n' deploy/compose.prod.yml deploy/compose.staging.yml deploy/compose.yml infra/config/vps.json scripts/deploy/vps-deployment.sh | sort > "$TEMP_DIR/legacy-expected"
    printf '%s\n' deploy/compose.prod.yml deploy/compose.staging.yml deploy/compose.yml deploy/dify/compose.override.yml deploy/dify/release.json infra/config/vps.json scripts/deploy/vps-deployment.sh | sort > "$TEMP_DIR/expected"
    if cmp -s "$TEMP_DIR/contents" "$TEMP_DIR/expected"; then includes_dify=true
    else cmp -s "$TEMP_DIR/contents" "$TEMP_DIR/legacy-expected" || die 'Host configuration bundle has unexpected contents'; fi
    tar -xf "$TEMP_DIR/host-bundle.tar" -C "$TEMP_DIR"
    bash -n "$TEMP_DIR/scripts/deploy/vps-deployment.sh"
    if [[ "$includes_dify" == true ]]; then
      jq -e '.release == "1.17.1" and (.source_commit | test("^[a-f0-9]{40}$")) and (.source_archive_sha256 | test("^[a-f0-9]{64}$")) and (.images | all(.[]; test("@sha256:[a-f0-9]{64}$")))' "$TEMP_DIR/deploy/dify/release.json" >/dev/null || die 'Invalid pinned Dify release manifest'
    fi
    local staged_config="$TEMP_DIR/infra/config/vps.json" original_config="$CONFIG_FILE"
    CONFIG_FILE="$staged_config"; load_config; CONFIG_FILE="$original_config"
    install -m 755 "$TEMP_DIR/scripts/deploy/vps-deployment.sh" "$ROOT/vps-deployment.sh.next"
    mv "$ROOT/vps-deployment.sh.next" "$ROOT/vps-deployment.sh"
    local compose_file
    for compose_file in "$TEMP_DIR/deploy/"*.yml; do install -m 644 "$compose_file" "$ROOT/deploy/$(basename "$compose_file").next"; mv "$ROOT/deploy/$(basename "$compose_file").next" "$ROOT/deploy/$(basename "$compose_file")"; done
    if [[ "$includes_dify" == true ]]; then
      install -d -m 755 "$ROOT/dify"
      install -m 644 "$TEMP_DIR/deploy/dify/release.json" "$ROOT/dify/release.json.next"; mv "$ROOT/dify/release.json.next" "$ROOT/dify/release.json"
      install -m 644 "$TEMP_DIR/deploy/dify/compose.override.yml" "$ROOT/dify/compose.override.yml.next"; mv "$ROOT/dify/compose.override.yml.next" "$ROOT/dify/compose.override.yml"
    fi
    install -m 600 "$staged_config" "$ROOT/config.json.next"; mv "$ROOT/config.json.next" "$ROOT/config.json"
    printf 'updated: reviewed host configuration installed\n'; exit 0
  fi
  local current=''
  if [[ "$ACTION" == retire-staging-artifact-index && "$APPLY" == false ]]; then
    [[ -f "$STATE/releases/staging/current" ]] || die 'No staging release recorded'
    read -r current < "$STATE/releases/staging/current"
    verify_artifact_retirement_release "$current" "$COMMIT"
    verify_artifact_retirement_rollback
    maintenance "$current" retire-staging-artifact-index --preview
    exit 0
  fi
  if [[ "$ACTION" == reset-staging && "$APPLY" == false ]]; then
    [[ -f "$STATE/releases/staging/current" ]] || die 'No staging release recorded'
    read -r current < "$STATE/releases/staging/current"
    maintenance "$current" read-staging-reset-readiness
    exit 0
  fi
  if [[ "$ACTION" == check ]]; then
    [[ -f "$STATE/releases/$ENVIRONMENT/current" ]] || die 'No release recorded'
    read -r current < "$STATE/releases/$ENVIRONMENT/current"
    # Read-only HTTPS readiness; write probes are release/maintenance-only.
    compose "$current" run --rm --no-deps -T -e RUNNER_ENABLED=false app node --import tsx scripts/read-deployment-readiness.ts
    exit 0
  fi
  [[ "$APPLY" == true ]] || { printf 'would update: %s %s\n' "$ACTION" "$ENVIRONMENT"; exit 0; }
  exec 9>"$STATE/operation.lock"; flock -n 9 || die 'Another host operation is running'
  if [[ "$ACTION" == infra-lock ]]; then
    [[ -n "$REQUEST_ID" && ! -f "$STATE/operation.json" ]] || die 'Infrastructure needs a request ID and no unresolved operation'
    jq -n --arg id "$REQUEST_ID" --arg commit "$COMMIT" '{requestId:$id,action:"infrastructure",environment:"shared",commit:$commit,step:"terraform"}' > "$STATE/operation.json"
    printf 'updated: infrastructure lock acquired\n'; exit 0
  fi
  if [[ "$ACTION" == infra-unlock ]]; then
    [[ -n "$REQUEST_ID" && -f "$STATE/operation.json" ]] || die 'No infrastructure lock found'
    jq -e --arg id "$REQUEST_ID" '.requestId==$id and .action=="infrastructure"' "$STATE/operation.json" >/dev/null || die 'Lock belongs to another operation'
    mv "$STATE/operation.json" "$STATE/operations/$REQUEST_ID.json"
    printf 'updated: infrastructure lock released\n'; exit 0
  fi
  if [[ "$ACTION" == resume ]]; then
    [[ -f "$STATE/operation.json" ]] || die 'No interrupted operation recorded'
    local old_id
    old_id="$(jq -r .requestId "$STATE/operation.json")"
    if systemctl is-active --quiet "kids-booklet-operation-$old_id.service"; then die 'Previous service remains active'; fi
    [[ "$(jq -r .environment "$STATE/operation.json")" == "$ENVIRONMENT" ]] || die 'Interrupted operation belongs to another environment'
    local compose_project="kids-booklet-$ENVIRONMENT"
    [[ "$ENVIRONMENT" != dify ]] || compose_project=booklet-dify
    [[ -z "$(docker ps -q --filter "label=com.docker.compose.project=$compose_project" --filter 'label=com.docker.compose.oneoff=True')" ]] || die 'Maintenance containers remain active'
    # Retry the exact recorded operation. In particular, never clear maintenance
    # over a partially restored database merely because the old image starts.
    REQUEST_ID="$old_id"
    local remaining
    remaining="$(ensure_operation_budget)" || die 'Original operation budget expired; reconcile outputs before a new approved attempt'
    flock -u 9
    if systemctl cat "kids-booklet-operation-$old_id.service" >/dev/null 2>&1; then
      local unit_bound
      unit_bound="$(systemctl show --property=RuntimeMaxUSec --value "kids-booklet-operation-$old_id.service")"
      [[ -n "$unit_bound" && "$unit_bound" != infinity ]] || die 'Legacy operation unit has no runtime bound; inspect and replace the inactive unit before resume'
      systemctl set-property --runtime "kids-booklet-operation-$old_id.service" "RuntimeMaxSec=${remaining}s"
      systemctl restart "kids-booklet-operation-$old_id.service"
    else
      start_operation_unit
    fi
    wait_operation
    exit 0
  fi
  if [[ "$ACTION" == restore && -f "$STATE/operation.json" ]]; then
    jq -e --arg backup "$BACKUP_ID" '.action=="reset-staging" and .environment=="staging" and (.step=="resetting" or .step=="reset-verifying") and .backupId==$backup' "$STATE/operation.json" >/dev/null || die 'Retained operation does not permit this restore; inspect status'
    [[ "$ENVIRONMENT" == staging && "$CONFIRMATION" == kids_booklet ]] || die 'Reset recovery requires the exact staging confirmation'
    local reset_request
    reset_request="$(jq -er .requestId "$STATE/operation.json")"
    ! systemctl is-active --quiet "kids-booklet-operation-$reset_request.service" || die 'Reset service remains active'
    [[ -z "$(docker ps -q --filter 'label=com.docker.compose.project=kids-booklet-staging' --filter 'label=com.docker.compose.oneoff=True')" ]] || die 'Reset maintenance containers remain active'
    [[ ! -f "$STATE/operations/$reset_request-failed.json" ]] || die 'Reset recovery journal already exists; inspect status'
    mv "$STATE/operation.json" "$STATE/operations/$reset_request-failed.json"
    printf 'updated: retained failed reset journal; explicit matching-backup restore authorized\n'
  fi
  [[ ! -f "$STATE/operation.json" ]] || die 'Unresolved operation exists; use resume or the exact failed-reset backup restore'
  [[ "$ACTION" != deploy || "${IMAGE_DIGEST%@*}" == "$(jq -r .image "$CONFIG_FILE")" ]] || die 'Image repository does not match configured project'
  REQUEST_ID="${REQUEST_ID:-$(date +%s)-$$}"
  [[ ! -f "$STATE/operations/$REQUEST_ID.json" ]] || die 'Request ID already completed'
  jq -n --arg requestId "$REQUEST_ID" --arg action "$ACTION" --arg environment "$ENVIRONMENT" --arg image "$IMAGE_DIGEST" --arg commit "$COMMIT" --arg backupId "$BACKUP_ID" --arg confirmation "$CONFIRMATION" '{requestId:$requestId,action:$action,environment:$environment,image:$image,commit:$commit,backupId:$backupId,confirmation:$confirmation,step:"queued"}' > "$STATE/operation.json"
  flock -u 9
  start_operation_unit
  wait_operation
}
wait_operation() {
  local active completed_journal started=$SECONDS previous='' last_progress=$SECONDS
  while :; do
    active="$(timeout 5s systemctl show --property=ActiveState --value "kids-booklet-operation-$REQUEST_ID.service")" || die 'Operation status unavailable; request may still be running'
    case "$active" in active|activating|reloading|deactivating) :;; inactive|failed) break;; *) die 'Operation service returned an unsupported state';; esac
    if [[ -f "$STATE/operation.json" ]]; then
      local phase
      phase="$(jq -er --arg id "$REQUEST_ID" 'select(.requestId==$id) | .step' "$STATE/operation.json")" || die 'Operation journal changed; inspect exact request'
      if [[ "$phase" != "$previous" || "$((SECONDS - last_progress))" -ge 30 ]]; then
        printf 'result: operation progress request=%s phase=%s elapsedSeconds=%s\n' "$REQUEST_ID" "$phase" "$((SECONDS - started))"
        previous="$phase"
        last_progress=$SECONDS
      fi
    fi
    sleep 5
    if [[ "$((SECONDS - started))" -ge 300 ]]; then
      printf 'result: operation still running request=%s service=%s; client wait expired, no stop or replay sent\n' "$REQUEST_ID" "$active"
      return 124
    fi
  done
  completed_journal="$STATE/operations/$REQUEST_ID.json"
  [[ "$active" != failed ]] || die 'Operation unit failed; inspect exact request and owned cleanup even if completion output was saved'
  [[ -f "$completed_journal" ]] || die 'Operation failed; journal retained. Use status and resume'
  printf 'updated: %s %s\n' "$ACTION" "$ENVIRONMENT"
  printf 'result: '
  jq -c '{requestId,action,environment,commit,backupId,image,configHash,priorRelease,rollbackRelease,rollbackImage,step}' "$completed_journal"
}
backend_init() {
  local directory="$1" key="$2"
  [[ -n "${R2_STATE_BUCKET:-}" && -n "${R2_ENDPOINT:-}" ]] || die 'R2_STATE_BUCKET and R2_ENDPOINT required'
  [[ "$R2_ENDPOINT" =~ ^https://[a-f0-9]{32}\.r2\.cloudflarestorage\.com$ ]] || die 'Invalid R2 backend endpoint'
  terraform -chdir="$directory" init -input=false -lockfile=readonly "-backend-config=bucket=$R2_STATE_BUCKET" "-backend-config=key=$key" -backend-config=region=auto "-backend-config=endpoints={s3=\"$R2_ENDPOINT\"}" -backend-config=skip_credentials_validation=true -backend-config=skip_requesting_account_id=true -backend-config=skip_region_validation=true -backend-config=skip_s3_checksum=true -backend-config=use_lockfile=true
}
r2_state_snapshot() {
  local directory="$1" label="$2"
  local state_file="$TEMP_DIR/state-$label.json" key config status downloaded
  terraform -chdir="$directory" state pull > "$state_file"
  jq -e 'type=="object" and (.version | type=="number")' "$state_file" >/dev/null || die 'Terraform state snapshot is invalid'
  key="snapshots/$label-$(date -u +%Y%m%dT%H%M%SZ)-${GITHUB_SHA:-manual}-$(openssl rand -hex 4).tfstate"
  config="$TEMP_DIR/r2-curl.conf"
  [[ "$AWS_ACCESS_KEY_ID$AWS_SECRET_ACCESS_KEY" != *$'\n'* && "$AWS_ACCESS_KEY_ID$AWS_SECRET_ACCESS_KEY" != *$'\r'* && "$AWS_ACCESS_KEY_ID$AWS_SECRET_ACCESS_KEY" != *'"'* ]] || die 'Invalid R2 state credentials'
  printf 'silent\nshow-error\naws-sigv4 = "aws:amz:auto:s3"\nuser = "%s:%s"\nrequest = "PUT"\nupload-file = "%s"\n' "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" "$state_file" > "$config"
  chmod 600 "$config" "$state_file"
  status="$(curl --config "$config" --output "$TEMP_DIR/r2-upload-response" --write-out '%{http_code}' "$R2_ENDPOINT/$R2_STATE_BUCKET/$key")"
  [[ "$status" == 200 ]] || die "R2 state snapshot upload failed (HTTP $status)"
  downloaded="$TEMP_DIR/state-$label-verified.json"
  printf 'silent\nshow-error\naws-sigv4 = "aws:amz:auto:s3"\nuser = "%s:%s"\n' "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" > "$config"
  curl --config "$config" --output "$downloaded" "$R2_ENDPOINT/$R2_STATE_BUCKET/$key"
  cmp -s "$state_file" "$downloaded" || die 'R2 state snapshot verification failed'
  printf 'updated: verified protected Terraform state snapshot %s\n' "$label"
}
validate_plan() {
  local json="$1"
  jq -e '[.resource_changes[]? | select(.change.actions | index("delete"))] | length == 0' "$json" >/dev/null || die 'Plan deletes or replaces resources; administrator review required'
  jq -e '[.resource_changes[]? | select(.type | startswith("cloudflare_zero_trust_access")) | select(.change.actions | index("update"))] | length == 0' "$json" >/dev/null || die 'Access boundary updates require separate administrator review'
  jq -e '[.resource_changes[]? | select(.type=="cloudflare_ruleset") | .change.before.rules[]? | select(.ref != "application_bypass" and .ref != "next_static" and .ref != "dify_bypass" and .ref != "application_api_rate")] | length == 0' "$json" >/dev/null || die 'Ruleset contains unrelated rules; preserve them through an administrator-reviewed change'
}
secret_value_is_valid() {
  local value="$1"
  [[ -n "$value" && "$value" != *$'\n'* && "$value" != *$'\r'* && "$value" != *'"'* ]]
}
prompt_secret_variable() {
  local name="$1" label="$2" value
  value="${!name:-}"
  while ! secret_value_is_valid "$value"; do
    [[ -z "$value" ]] || printf 'error: Enter a valid %s\n' "$label" >&2
    [[ -t 0 ]] || die "$label is required through the protected runtime environment"
    IFS= read -r -s -p "$label: " value; printf '\n' >&2
  done
  printf -v "$name" '%s' "$value"
  export "${name?}"
}
load_cloudflare_api_token() {
  prompt_secret_variable CLOUDFLARE_API_TOKEN 'Cloudflare API token'
  TF_VAR_cloudflare_api_token="$CLOUDFLARE_API_TOKEN"
  export TF_VAR_cloudflare_api_token
}
load_r2_state_credentials() {
  local value="${AWS_ACCESS_KEY_ID:-}" secret="${AWS_SECRET_ACCESS_KEY:-}"
  while [[ ! "$value" =~ ^[A-Za-z0-9]{32}$ ]]; do
    [[ -z "$value" ]] || printf 'error: R2 Terraform access key ID must be 32 letters or digits\n' >&2
    [[ -t 0 ]] || die 'R2 Terraform access key ID is required through the protected runtime environment'
    IFS= read -r -s -p 'R2 Terraform access key ID: ' value; printf '\n' >&2
  done
  AWS_ACCESS_KEY_ID="$value"
  export AWS_ACCESS_KEY_ID
  while [[ ! "$secret" =~ ^[A-Fa-f0-9]{64}$ ]]; do
    [[ -z "$secret" ]] || printf 'error: R2 Terraform secret access key must be 64 hexadecimal characters\n' >&2
    [[ -t 0 ]] || die 'R2 Terraform secret access key is required through the protected runtime environment'
    IFS= read -r -s -p 'R2 Terraform secret access key: ' secret; printf '\n' >&2
  done
  AWS_SECRET_ACCESS_KEY="$secret"
  export AWS_SECRET_ACCESS_KEY
}
load_cloudflare_access_credentials() {
  prompt_secret_variable CF_ACCESS_CLIENT_ID 'Cloudflare Access service token ID'
  prompt_secret_variable CF_ACCESS_CLIENT_SECRET 'Cloudflare Access service token secret'
}
is_sourced() { [[ "$SCRIPT_IS_SOURCED" == true ]]; }
interactive_terminal() { [[ -t 0 && -t 1 ]]; }
start_credential_session() {
  local restore_xtrace=false
  is_sourced || die 'credential-session must be sourced into the current SSH shell'
  interactive_terminal || die 'credential-session requires an interactive SSH terminal'
  case "$-" in *e*) SESSION_RESTORE_ERREXIT=true; set +e;; esac
  SESSION_ACTIVE=true
  case "$-" in *x*) restore_xtrace=true; set +x;; esac
  load_cloudflare_api_token
  load_r2_state_credentials
  load_github_admin_token
  load_atlas_admin_credentials
  [[ "$restore_xtrace" == true ]] && set -x
  printf 'loaded: deployment credentials remain in this SSH shell until logout or clear-credential-session\n'
  printf 'next: bash scripts/deploy/vps-deployment.sh --action access-check --config infra/config/vps.json\n'
}
clear_credential_session() {
  local restore_errexit="$SESSION_RESTORE_ERREXIT"
  is_sourced || die 'clear-credential-session must be sourced into the current SSH shell'
  cleanup
  SESSION_ACTIVE=false
  SESSION_RESTORE_ERREXIT=false
  trap - EXIT
  [[ "$restore_errexit" == true ]] && set -e
  printf 'cleared: deployment credentials from this SSH shell\n'
}
cloudflare_get() {
  local path="$1" token error_codes access_hint=''
  load_cloudflare_api_token
  token="$CLOUDFLARE_API_TOKEN"
  private_temp
  local config="$TEMP_DIR/cloudflare-curl.conf"
  printf 'silent\nshow-error\nheader = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\n' "$token" > "$config"
  chmod 600 "$config"
  CF_RESPONSE="$TEMP_DIR/cloudflare-response.json"
  CF_STATUS="$(curl --config "$config" --output "$CF_RESPONSE" --write-out '%{http_code}' "https://api.cloudflare.com/client/v4/$path")"
  if [[ "$CF_STATUS" != 200 && "$CF_STATUS" != 404 ]]; then
    error_codes="$(jq -r '[.errors[]?.code | tostring] | unique | join(",")' "$CF_RESPONSE" 2>/dev/null || true)"
    [[ -n "$error_codes" ]] || error_codes=unavailable
    case "$path" in
      accounts/*/access/organizations)
        access_hint=' Complete Cloudflare Zero Trust onboarding for this account, then confirm the active token has Access: Organizations, Identity Providers, and Groups Read.'
        ;;
      accounts/*/access/apps)
        access_hint=' Confirm the active token is scoped to this account and has Access: Apps and Policies Read or Write.'
        ;;
    esac
    die "Cloudflare discovery failed for $path (HTTP $CF_STATUS; API error code(s): $error_codes).$access_hint"
  fi
  if [[ "$CF_STATUS" == 200 ]]; then jq -e '.success == true' "$CF_RESPONSE" >/dev/null || die "Cloudflare rejected discovery for $path"; fi
}
github_get() {
  local path="$1" token config
  load_github_admin_token
  token="$GITHUB_ADMIN_TOKEN"
  private_temp
  config="$TEMP_DIR/github-curl.conf"
  printf 'silent\nshow-error\nheader = "Authorization: Bearer %s"\nheader = "Accept: application/vnd.github+json"\nheader = "X-GitHub-Api-Version: 2026-03-10"\n' "$token" > "$config"
  chmod 600 "$config"
  GITHUB_RESPONSE="$TEMP_DIR/github-response.json"
  GITHUB_STATUS="$(curl --config "$config" --output "$GITHUB_RESPONSE" --write-out '%{http_code}' "https://api.github.com/$path")"
  [[ "$GITHUB_STATUS" == 200 ]] || die "GitHub access check failed for $path (HTTP $GITHUB_STATUS)"
}
verify_cloudflare_token() {
  local account_id="$1" token_status
  [[ "$account_id" =~ ^[a-f0-9]{32}$ ]] || die 'A valid Cloudflare account ID is required for token verification'
  cloudflare_get "accounts/$account_id/tokens/verify"
  CLOUDFLARE_TOKEN_ID="$(jq -er '.result.id | select(type == "string" and test("^[a-f0-9]{32}$"))' "$CF_RESPONSE")" || die 'Cloudflare did not return a valid token metadata ID'
  token_status="$(jq -er '.result.status' "$CF_RESPONSE")" || die 'Cloudflare did not return a token status'
  [[ "$token_status" == active ]] || die "Cloudflare API token is $token_status"
  printf 'verified: Cloudflare API token metadata ID %s\n' "$CLOUDFLARE_TOKEN_ID"
}
cloudflare_policy_allows() {
  local aliases="$1" scope="$2" account_id="$3" zone_id="$4" token_file="$5" permission_file="$6"
  jq -e --slurpfile available "$permission_file" --argjson aliases "$aliases" --arg scope "$scope" --arg account "$account_id" --arg zone "$zone_id" '
    any(.result.policies[]?;
      (.effect == "allow") and
      any(.permission_groups[]?;
        . as $assigned |
        ($assigned.name // ([$available[0].result[]? | select(.id==$assigned.id) | .name][0])) as $name |
        $aliases | index($name)) and
      ((.resources | tostring) as $resources |
        if $scope == "zone" then
          ($resources | contains($zone)) or (($resources | contains($account)) and ($resources | contains("zone.*")))
        else
          ($resources | contains($account))
        end))
  ' "$token_file" >/dev/null
}
verify_cloudflare_token_permissions() {
  local account_id="$1" zone_id="$2" joined='' token_file permission_file
  local -a missing=()
  [[ "$CLOUDFLARE_TOKEN_ID" =~ ^[a-f0-9]{32}$ ]] || die 'Verify the Cloudflare token before checking its permissions'
  private_temp; token_file="$TEMP_DIR/cloudflare-token-details.json"; permission_file="$TEMP_DIR/cloudflare-token-permissions.json"
  cloudflare_get "accounts/$account_id/tokens/$CLOUDFLARE_TOKEN_ID"
  cp "$CF_RESPONSE" "$token_file"
  cloudflare_get "accounts/$account_id/tokens/permission_groups"
  cp "$CF_RESPONSE" "$permission_file"
  chmod 600 "$token_file" "$permission_file"
  cloudflare_policy_allows '["DNS Write","DNS Edit"]' zone "$account_id" "$zone_id" "$token_file" "$permission_file" || missing+=('DNS Write')
  cloudflare_policy_allows '["Cache Settings Write","Cache Rules Edit"]' zone "$account_id" "$zone_id" "$token_file" "$permission_file" || missing+=('Cache Settings Write')
  cloudflare_policy_allows '["Zone WAF Write","Zone WAF Edit"]' zone "$account_id" "$zone_id" "$token_file" "$permission_file" || missing+=('Zone WAF Write')
  cloudflare_policy_allows '["Workers R2 Storage Write","Workers R2 Storage Edit"]' account "$account_id" "$zone_id" "$token_file" "$permission_file" || missing+=('Workers R2 Storage Write')
  cloudflare_policy_allows '["Cloudflare Tunnel Write","Cloudflare Tunnel Edit"]' account "$account_id" "$zone_id" "$token_file" "$permission_file" || missing+=('Cloudflare Tunnel Write')
  cloudflare_policy_allows '["Access: Apps and Policies Write","Access: Apps and Policies Edit"]' account "$account_id" "$zone_id" "$token_file" "$permission_file" || missing+=('Access: Apps and Policies Write')
  cloudflare_policy_allows '["Access: Service Tokens Write","Access: Service Tokens Edit"]' account "$account_id" "$zone_id" "$token_file" "$permission_file" || missing+=('Access: Service Tokens Write')
  if [[ "${#missing[@]}" -gt 0 ]]; then
    printf -v joined '%s, ' "${missing[@]}"
    die "Cloudflare API token lacks required permissions for the configured resources: ${joined%, }"
  fi
  printf 'verified: Cloudflare API token has required account and zone write permissions\n'
}
verify_cloudflare_zero_trust() {
  local account_id="$1"
  [[ "$account_id" =~ ^[a-f0-9]{32}$ ]] || die 'A valid Cloudflare account ID is required for Zero Trust verification'
  cloudflare_get "accounts/$account_id/access/organizations"
  [[ "$CF_STATUS" == 200 ]] || die 'Cloudflare Zero Trust is not enrolled for this account. In the Cloudflare dashboard, open Zero Trust, choose a team name, select the Free plan, and complete billing consent. Then retry setup.'
  cloudflare_get "accounts/$account_id/access/apps"
  [[ "$CF_STATUS" == 200 ]] || die 'Cloudflare Access applications are unavailable for this account'
  printf 'verified: Cloudflare Zero Trust organization and Access application API\n'
}
verify_r2_state_access() {
  local config status detail
  private_temp
  config="$TEMP_DIR/r2-access-curl.conf"
  printf 'silent\nshow-error\naws-sigv4 = "aws:amz:auto:s3"\nuser = "%s:%s"\n' "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" > "$config"
  chmod 600 "$config"
  status="$(curl --config "$config" --output "$TEMP_DIR/r2-access-response" --write-out '%{http_code}' "$R2_ENDPOINT/$R2_STATE_BUCKET?list-type=2&max-keys=1")"
  case "$status" in
    200) printf 'verified: R2 Terraform state credentials\n';;
    404) printf 'verified: R2 Terraform state credentials; state bucket is not created\n';;
    *)
      detail="$(tr '\n' ' ' < "$TEMP_DIR/r2-access-response" | sed -n 's#.*<Code>\([^<]*\)</Code>.*<Message>\([^<]*\)</Message>.*#\1: \2#p')"
      [[ -n "$detail" ]] || detail='response did not contain an R2 error code and message'
      die "R2 Terraform state credential check failed (HTTP $status; $detail)"
      ;;
  esac
}
access_check_cloudflare() {
  load_config
  load_terraform_configuration
  load_cloudflare_api_token
  verify_cloudflare_token "$TF_VAR_cloudflare_account_id"
  verify_cloudflare_token_permissions "$TF_VAR_cloudflare_account_id" "$TF_VAR_cloudflare_zone_id"
  verify_cloudflare_zero_trust "$TF_VAR_cloudflare_account_id"
}
access_check_r2() {
  load_config
  load_terraform_configuration
  load_r2_state_credentials
  verify_r2_state_access
}
access_check_atlas() {
  local project
  load_config
  load_atlas_admin_credentials
  project="$(jq -r .atlas_project_id "$CONFIG_FILE")"
  verify_atlas_admin_access "$project"
  atlas_request GET "groups/$project"
  atlas_request GET "groups/$project/accessList?itemsPerPage=1"
  printf 'verified: Atlas project and access-list API\n'
}
access_check_github() {
  local repository owner
  load_config
  repository="$(jq -r .repository "$CONFIG_FILE")"; owner="${repository%%/*}"
  github_get "repos/$repository"
  jq -e '.permissions.admin == true' "$GITHUB_RESPONSE" >/dev/null || die 'GitHub token lacks repository administration'
  github_get "organizations/$owner/settings/billing/budgets?per_page=1"
  printf 'verified: GitHub repository administration and billing API\n'
}
run_access_probe() {
  local name="$1" output
  shift
  if output="$("$@" 2>&1)"; then
    [[ -z "$output" ]] || printf '%s\n' "$output"
    printf 'passed: %s access check\n' "$name"
  else
    [[ -z "$output" ]] || printf '%s\n' "$output" >&2
    printf 'failed: %s access check; continuing\n' "$name" >&2
    return 1
  fi
}
access_check() {
  local failures=0
  load_config
  need_command curl; need_command jq
  run_access_probe Cloudflare access_check_cloudflare || failures=$((failures + 1))
  run_access_probe R2 access_check_r2 || failures=$((failures + 1))
  run_access_probe Atlas access_check_atlas || failures=$((failures + 1))
  run_access_probe GitHub access_check_github || failures=$((failures + 1))
  [[ "$failures" == 0 ]] || die "Access check found $failures failure(s); no changes were made"
  printf 'verified: all provider access checks\n'
}
load_atlas_admin_credentials() {
  prompt_secret_variable ATLAS_PUBLIC_KEY 'Atlas temporary public API key'
  prompt_secret_variable ATLAS_PRIVATE_KEY 'Atlas temporary private API key'
  export ATLAS_ADMIN_PUBLIC_KEY="$ATLAS_PUBLIC_KEY" ATLAS_ADMIN_PRIVATE_KEY="$ATLAS_PRIVATE_KEY"
}
load_github_admin_token() {
  GITHUB_ADMIN_TOKEN="${GITHUB_ADMIN_TOKEN:-${GH_TOKEN:-}}"
  prompt_secret_variable GITHUB_ADMIN_TOKEN 'GitHub temporary administrator token'
  export GH_TOKEN="$GITHUB_ADMIN_TOKEN"
}
atlas_request() {
  local method="$1" path="$2" payload="${3:-}" config detail
  private_temp; config="$TEMP_DIR/atlas-curl.conf"
  printf 'silent\nshow-error\ndigest\nuser = "%s:%s"\nheader = "Accept: application/vnd.atlas.2025-03-12+json"\nheader = "Content-Type: application/json"\n' "$ATLAS_PUBLIC_KEY" "$ATLAS_PRIVATE_KEY" > "$config"
  chmod 600 "$config"
  ATLAS_RESPONSE="$TEMP_DIR/atlas-response.json"
  local -a args=(--config "$config" --request "$method" --output "$ATLAS_RESPONSE" --write-out '%{http_code}')
  [[ -z "$payload" ]] || args+=(--data-binary "@$payload")
  ATLAS_STATUS="$(curl "${args[@]}" "https://cloud.mongodb.com/api/atlas/v2/$path")"
  if [[ "$ATLAS_STATUS" != 200 && "$ATLAS_STATUS" != 201 ]]; then
    detail="$(jq -r '[.errorCode, .reason, .detail] | map(select(type=="string" and length>0)) | unique | join(": ")' "$ATLAS_RESPONSE" 2>/dev/null || true)"
    [[ -n "$detail" ]] || detail='response did not contain an Atlas error code or reason'
    die "Atlas $method request failed for $path (HTTP $ATLAS_STATUS; $detail)"
  fi
}
verify_atlas_admin_access() {
  local project="$1"
  atlas_request GET "groups/$project/apiKeys?itemsPerPage=100"
  jq -e --arg public_key "$ATLAS_PUBLIC_KEY" --arg project "$project" '.results[]? | select(.publicKey==$public_key) | .roles[]? | select((.groupId==$project and .roleName=="GROUP_OWNER") or .roleName=="ORG_OWNER")' "$ATLAS_RESPONSE" >/dev/null || die 'Atlas temporary API key must have Project Owner access to the configured project'
  printf 'verified: Atlas temporary API key has Project Owner access\n'
}
normalize_discovery_output() {
  local directory filename
  directory="${CONFIG_OUTPUT%/*}"
  filename="${CONFIG_OUTPUT##*/}"
  if [[ "$CONFIG_OUTPUT" != /* ]]; then directory="$REPO_ROOT/$directory"; fi
  [[ "$directory" != "$CONFIG_OUTPUT" ]] || directory="$REPO_ROOT"
  directory="$(cd "$directory" && pwd -P)" || die 'Discovery output directory does not exist'
  CONFIG_OUTPUT="$directory/$filename"
  [[ "$CONFIG_OUTPUT" == "$REPO_ROOT/infra/config/vps.json" ]] || die 'discover-config can write only infra/config/vps.json in this checkout'
}
read_discovery_cloudflare_token() { load_cloudflare_api_token; }
report_discovery_command() {
  if command -v "$1" >/dev/null; then printf 'exists: %s\n' "$1"; else printf 'missing: %s\n' "$1"; fi
}
select_atlas_project() {
  local count choice
  count="$(jq -r '.results | length' "$TEMP_DIR/atlas-projects.json")"
  [[ "$count" -gt 0 ]] || die 'The Atlas API credentials cannot read any projects'
  if [[ "$count" == 1 ]]; then jq -er '.results[0].id' "$TEMP_DIR/atlas-projects.json"; return; fi
  printf 'Available Atlas projects:\n' >&2
  jq -r '.results | to_entries[] | "\(.key + 1). \(.value.name) [\(.value.id)]"' "$TEMP_DIR/atlas-projects.json" >&2
  read -r -p 'Atlas project number: ' choice
  [[ "$choice" =~ ^[1-9][0-9]*$ && "$choice" -le "$count" ]] || die 'Select a listed Atlas project number'
  jq -er --argjson index "$((choice - 1))" '.results[$index].id' "$TEMP_DIR/atlas-projects.json"
}
select_atlas_cluster() {
  local count choice
  count="$(jq -r '.results | length' "$TEMP_DIR/atlas-clusters.json")"
  [[ "$count" -gt 0 ]] || die 'The selected Atlas project has no clusters'
  if [[ "$count" == 1 ]]; then jq -er '.results[0].name' "$TEMP_DIR/atlas-clusters.json"; return; fi
  printf 'Available Atlas clusters:\n' >&2
  jq -r '.results | to_entries[] | "\(.key + 1). \(.value.name)"' "$TEMP_DIR/atlas-clusters.json" >&2
  read -r -p 'Atlas cluster number: ' choice
  [[ "$choice" =~ ^[1-9][0-9]*$ && "$choice" -le "$count" ]] || die 'Select a listed Atlas cluster number'
  jq -er --argjson index "$((choice - 1))" '.results[$index].name' "$TEMP_DIR/atlas-clusters.json"
}
report_discovery_cloudflare_state() {
  local hostname phase
  for hostname in "$STAGING_HOSTNAME" "$PROD_HOSTNAME" "$DEPLOY_HOSTNAME"; do
    cloudflare_get "zones/$TF_VAR_cloudflare_zone_id/dns_records?name=$hostname"
    [[ "$CF_STATUS" == 200 ]] || die "Cloudflare DNS discovery failed for $hostname"
    if [[ "$(jq '.result | length' "$CF_RESPONSE")" == 0 ]]; then printf 'available: DNS record %s\n' "$hostname"; else printf 'exists: DNS record %s; setup preview will require ownership review\n' "$hostname"; fi
  done
  for phase in http_request_cache_settings http_ratelimit; do
    cloudflare_get "zones/$TF_VAR_cloudflare_zone_id/rulesets/phases/$phase/entrypoint"
    case "$CF_STATUS" in
      404) printf 'available: Cloudflare %s entrypoint\n' "$phase";;
      200) printf 'exists: Cloudflare %s entrypoint; setup preview will require ownership review\n' "$phase";;
      *) die "Cloudflare ruleset discovery failed for $phase";;
    esac
  done
  cloudflare_get "accounts/$TF_VAR_cloudflare_account_id/r2/buckets/$R2_STATE_BUCKET"
  case "$CF_STATUS" in
    404) printf 'available: R2 Terraform state bucket name\n';;
    200) printf 'exists: R2 Terraform state bucket; setup will verify ownership\n';;
    *) die 'Cloudflare R2 discovery failed';;
  esac
}
discover_configuration() {
  local zone_response project cluster candidate os_name public_ip
  for name in curl jq uname nproc awk df; do need_command "$name"; done
  [[ "$APPLY" == false ]] || need_command install
  if [[ ! -f /etc/os-release ]] || ! grep -q '^ID=ubuntu$' /etc/os-release; then die 'Discovery requires Ubuntu'; fi
  [[ "$(uname -m)" == x86_64 ]] || die 'This kit currently requires an x86_64 Ubuntu VPS'
  validate_host_capacity
  for name in docker git gh openssl python3 ssh systemctl sudo; do report_discovery_command "$name"; done
  if command -v docker >/dev/null; then docker compose version >/dev/null 2>&1 && printf 'exists: docker compose v2\n' || printf 'missing: docker compose v2\n'; fi
  # shellcheck disable=SC1091
  os_name="$(. /etc/os-release; printf '%s' "${PRETTY_NAME:-Ubuntu}")"
  public_ip="$(curl -fsS --max-time 15 https://api.ipify.org || true)"
  printf 'exists: VPS %s, x86_64, %s CPU cores, %s MiB RAM, %s MiB free disk, public IP %s\n' "$os_name" "$(nproc)" "$(awk '/^MemTotal:/ {print int($2 / 1024)}' /proc/meminfo)" "$(df -Pk / | awk 'NR==2 {print int($4 / 1024)}')" "${public_ip:-unavailable}"
  ZONE_NAME="${ZONE_NAME,,}"
  STAGING_HOSTNAME="${STAGING_HOSTNAME:-staging.$ZONE_NAME}"; STAGING_HOSTNAME="${STAGING_HOSTNAME,,}"
  PROD_HOSTNAME="${PROD_HOSTNAME:-booklet.$ZONE_NAME}"; PROD_HOSTNAME="${PROD_HOSTNAME,,}"
  DEPLOY_HOSTNAME="${DEPLOY_HOSTNAME:-deploy.$ZONE_NAME}"; DEPLOY_HOSTNAME="${DEPLOY_HOSTNAME,,}"
  [[ "$STAGING_HOSTNAME" != "$PROD_HOSTNAME" && "$STAGING_HOSTNAME" != "$DEPLOY_HOSTNAME" && "$PROD_HOSTNAME" != "$DEPLOY_HOSTNAME" ]] || die 'Discovery hostnames must be distinct'
  normalize_discovery_output
  read_discovery_cloudflare_token
  cloudflare_get "zones?name=$ZONE_NAME&status=active"
  [[ "$CF_STATUS" == 200 && "$(jq '.result | length' "$CF_RESPONSE")" == 1 ]] || die "Cloudflare could not find exactly one active zone for $ZONE_NAME"
  zone_response="$TEMP_DIR/discovery-zone.json"; cp "$CF_RESPONSE" "$zone_response"
  TF_VAR_cloudflare_zone_id="$(jq -er '.result[0].id' "$zone_response")"
  TF_VAR_cloudflare_account_id="$(jq -er '.result[0].account.id' "$zone_response")"
  verify_cloudflare_token "$TF_VAR_cloudflare_account_id"
  verify_cloudflare_zero_trust "$TF_VAR_cloudflare_account_id"
  R2_STATE_BUCKET=kids-booklet-terraform-state
  export TF_VAR_cloudflare_zone_id TF_VAR_cloudflare_account_id R2_STATE_BUCKET
  printf 'discovered: Cloudflare account ID %s\n' "$TF_VAR_cloudflare_account_id"
  printf 'discovered: Cloudflare zone ID %s\n' "$TF_VAR_cloudflare_zone_id"
  report_discovery_cloudflare_state
  load_atlas_admin_credentials
  atlas_request GET 'groups?itemsPerPage=100'; cp "$ATLAS_RESPONSE" "$TEMP_DIR/atlas-projects.json"
  project="$(select_atlas_project)"
  atlas_request GET "groups/$project/clusters?itemsPerPage=100"; cp "$ATLAS_RESPONSE" "$TEMP_DIR/atlas-clusters.json"
  cluster="$(select_atlas_cluster)"
  candidate="$TEMP_DIR/vps.json"
  jq -n --arg account "$TF_VAR_cloudflare_account_id" --arg zone "$TF_VAR_cloudflare_zone_id" --arg deploy "$DEPLOY_HOSTNAME" --arg project "$project" --arg cluster "$cluster" --arg staging "$STAGING_HOSTNAME" --arg prod "$PROD_HOSTNAME" --arg dify "dify.$ZONE_NAME" '{repository:"karpishe-experiments/agentic-poc",image:"ghcr.io/karpishe-experiments/agentic-poc",cloudflare_account_id:$account,cloudflare_zone_id:$zone,deploy_hostname:$deploy,dify_hostname:$dify,dify_public_enabled:false,dify_backup_bucket:"kids-booklet-dify-backups",state_bucket:"kids-booklet-terraform-state",atlas_project_id:$project,atlas_cluster_name:$cluster,environments:{staging:{APP_HOSTNAME:$staging,ASSETS_BUCKET:"kids-booklet-staging-assets",DIAGNOSTICS_BUCKET:"kids-booklet-staging-diagnostics",RECOVERY_BUCKET:"kids-booklet-staging-recovery"},prod:{APP_HOSTNAME:$prod,ASSETS_BUCKET:"kids-booklet-prod-assets",DIAGNOSTICS_BUCKET:"kids-booklet-prod-diagnostics",RECOVERY_BUCKET:"kids-booklet-prod-recovery"}}}' > "$candidate"
  if [[ -e "$CONFIG_OUTPUT" ]]; then
    [[ "$(jq -Sc 'del(.host_observation)' "$candidate")" == "$(jq -Sc 'del(.host_observation)' "$CONFIG_OUTPUT")" ]] && { printf 'exists: non-secret deployment configuration (host observation is informational)\n'; return; }
    die 'Existing infra/config/vps.json differs; inspect it and resolve the configuration drift'
  fi
  if [[ "$APPLY" == false ]]; then
    printf 'would create: non-secret deployment configuration at %s\n' "$CONFIG_OUTPUT"
    jq . "$candidate"
  else
    install -m 600 "$candidate" "$CONFIG_OUTPUT"
    printf 'created: non-secret deployment configuration at %s\n' "$CONFIG_OUTPUT"
  fi
}
plan_atlas_configuration() {
  local project cluster outbound_ip environment database username srv access_action user_action roles
  project="$(jq -r .atlas_project_id "$CONFIG_FILE")"; cluster="$(jq -r .atlas_cluster_name "$CONFIG_FILE")"
  outbound_ip="$(curl -fsS --max-time 15 https://api.ipify.org)"
  [[ "$outbound_ip" =~ ^[0-9a-fA-F:.]+$ ]] || die 'Could not verify the VPS outbound IP'
  private_temp; ATLAS_PLAN_FILE="$TEMP_DIR/atlas-plan.json"
  atlas_request GET "groups/$project/accessList?itemsPerPage=100"
  if jq -e --arg ip "$outbound_ip" '.results[]? | select(.ipAddress==$ip)' "$ATLAS_RESPONSE" >/dev/null; then
    access_action=exists
  else access_action=create; fi
  atlas_request GET "groups/$project/clusters/$cluster"
  srv="$(jq -er '.connectionStrings.standardSrv' "$ATLAS_RESPONSE")"
  srv="${srv#mongodb+srv://}"
  jq -n --arg project "$project" --arg cluster "$cluster" --arg ip "$outbound_ip" --arg srv "$srv" --arg access "$access_action" '{project:$project,cluster:$cluster,outbound_ip:$ip,srv:$srv,access_action:$access,users:{}}' > "$ATLAS_PLAN_FILE"
  for environment in staging prod; do
    database=kids_booklet; [[ "$environment" == staging ]] || database=kids_booklet_prod
    username="kids_booklet_$environment"
    atlas_request GET "groups/$project/databaseUsers?itemsPerPage=100"
    if jq -e --arg username "$username" '.results[]? | select(.username==$username and .databaseName=="admin")' "$ATLAS_RESPONSE" >/dev/null; then
      jq -e --arg username "$username" --arg cluster "$cluster" '.results[] | select(.username==$username and .databaseName=="admin") | ([.scopes[]?] | length)==1 and ([.scopes[]? | select(.type=="CLUSTER" and .name==$cluster)] | length)==1' "$ATLAS_RESPONSE" >/dev/null || die "$environment Atlas user exists with incompatible cluster scope"
      roles="$(jq -r --arg username "$username" --arg database "$database" '.results[] | select(.username==$username and .databaseName=="admin") | if ([.roles[]? | select(.databaseName!=$database or (.collectionName? != null))] | length)>0 then "incompatible" else ([.roles[]?.roleName] | sort | join(",")) end' "$ATLAS_RESPONSE")"
      case "$roles" in
        dbAdmin,readWrite) user_action=exists;;
        readWrite) user_action=update;;
        *) die "$environment Atlas user exists with incompatible database roles";;
      esac
      if [[ -f "$STATE/atlas-$environment-uri.pending" ]]; then GENERATED_MONGODB_URI[$environment]="$(<"$STATE/atlas-$environment-uri.pending")"; fi
    else user_action=create; fi
    jq --arg environment "$environment" --arg database "$database" --arg username "$username" --arg action "$user_action" '.users[$environment]={database:$database,username:$username,action:$action}' "$ATLAS_PLAN_FILE" > "$TEMP_DIR/atlas-plan.next.json"
    mv "$TEMP_DIR/atlas-plan.next.json" "$ATLAS_PLAN_FILE"
  done
}
report_atlas_plan() {
  local environment action
  [[ "$(jq -r .access_action "$ATLAS_PLAN_FILE")" == exists ]] && printf 'exists: exact VPS Atlas access-list entry\n' || printf 'would create: exact VPS Atlas access-list entry\n'
  for environment in staging prod; do
    action="$(jq -r --arg environment "$environment" '.users[$environment].action' "$ATLAS_PLAN_FILE")"
    case "$action" in
      exists) printf 'exists: %s Atlas database user with recovery scope\n' "$environment";;
      update) printf 'would update: %s Atlas database user with database recovery privilege\n' "$environment";;
      create) printf 'would create: %s Atlas database user\n' "$environment";;
    esac
  done
}
apply_atlas_plan() {
  local project cluster expected_ip current_ip environment database username password srv payload action
  [[ -n "$ATLAS_PLAN_FILE" && -f "$ATLAS_PLAN_FILE" ]] || die 'Atlas apply requires a successful setup preview; rerun setup'
  project="$(jq -r .project "$ATLAS_PLAN_FILE")"; cluster="$(jq -r .cluster "$ATLAS_PLAN_FILE")"
  expected_ip="$(jq -r .outbound_ip "$ATLAS_PLAN_FILE")"
  current_ip="$(curl -fsS --max-time 15 https://api.ipify.org)"
  [[ "$current_ip" == "$expected_ip" ]] || die 'VPS outbound IP changed after Atlas preview; rerun setup'
  action="$(jq -r .access_action "$ATLAS_PLAN_FILE")"
  if [[ "$action" == create ]]; then
    payload="$TEMP_DIR/atlas-access.json"
    jq -n --arg ip "$expected_ip" '[{ipAddress:$ip,comment:"kids-booklet VPS"}]' > "$payload"
    atlas_request POST "groups/$project/accessList" "$payload"
    printf 'created: exact VPS Atlas access-list entry\n'
  else printf 'exists: exact VPS Atlas access-list entry\n'; fi
  srv="$(jq -r .srv "$ATLAS_PLAN_FILE")"
  for environment in staging prod; do
    action="$(jq -r --arg environment "$environment" '.users[$environment].action' "$ATLAS_PLAN_FILE")"
    database="$(jq -r --arg environment "$environment" '.users[$environment].database' "$ATLAS_PLAN_FILE")"
    username="$(jq -r --arg environment "$environment" '.users[$environment].username' "$ATLAS_PLAN_FILE")"
    if [[ "$action" == create ]]; then
      password="$(openssl rand -hex 24)"
      payload="$TEMP_DIR/atlas-user-$environment.json"
      jq -n --arg username "$username" --arg password "$password" --arg database "$database" --arg cluster "$cluster" '{databaseName:"admin",username:$username,password:$password,roles:[{databaseName:$database,roleName:"readWrite"},{databaseName:$database,roleName:"dbAdmin"}],scopes:[{name:$cluster,type:"CLUSTER"}]}' > "$payload"
      atlas_request POST "groups/$project/databaseUsers" "$payload"
      GENERATED_MONGODB_URI[$environment]="mongodb+srv://$username:$password@$srv/$database?retryWrites=true&w=majority"
      printf '%s' "${GENERATED_MONGODB_URI[$environment]}" > "$STATE/atlas-$environment-uri.pending"
      chmod 600 "$STATE/atlas-$environment-uri.pending"
      unset password
      printf 'created: %s Atlas database user\n' "$environment"
    else
      if [[ "$action" == update ]]; then
        payload="$TEMP_DIR/atlas-user-$environment.json"
        jq -n --arg username "$username" --arg database "$database" --arg cluster "$cluster" '{databaseName:"admin",username:$username,roles:[{databaseName:$database,roleName:"readWrite"},{databaseName:$database,roleName:"dbAdmin"}],scopes:[{name:$cluster,type:"CLUSTER"}]}' > "$payload"
        atlas_request PATCH "groups/$project/databaseUsers/admin/$username" "$payload"
        printf 'updated: %s Atlas database user with database recovery privilege\n' "$environment"
      else
        printf 'exists: %s Atlas database user with recovery scope\n' "$environment"
      fi
      if [[ -f "$STATE/atlas-$environment-uri.pending" ]]; then GENERATED_MONGODB_URI[$environment]="$(<"$STATE/atlas-$environment-uri.pending")"; fi
    fi
  done
}
configure_atlas() {
  if [[ "$APPLY" == true ]]; then apply_atlas_plan; else plan_atlas_configuration; report_atlas_plan; fi
}
reconcile_atlas() {
  local requested_apply="$APPLY" project environment action
  load_config; need_command curl; need_command jq
  load_atlas_admin_credentials
  project="$(jq -r .atlas_project_id "$CONFIG_FILE")"
  verify_atlas_admin_access "$project"
  plan_atlas_configuration
  [[ "$(jq -r .access_action "$ATLAS_PLAN_FILE")" == exists ]] || die 'Atlas reconciliation requires the existing exact VPS access-list entry; run setup instead'
  for environment in staging prod; do
    action="$(jq -r --arg environment "$environment" '.users[$environment].action' "$ATLAS_PLAN_FILE")"
    [[ "$action" == exists || "$action" == update ]] || die "Atlas reconciliation cannot create the missing $environment user; run setup instead"
  done
  if [[ "$requested_apply" == true ]]; then
    APPLY=false; report_atlas_plan
    APPLY=true; apply_atlas_plan
  else
    report_atlas_plan
  fi
}
assert_no_unmanaged_cloudflare_resources() {
  local allow_r2_adoption="${1:-false}" account="$TF_VAR_cloudflare_account_id" zone="$TF_VAR_cloudflare_zone_id" name environment kind hostname phase
  if [[ "$allow_r2_adoption" == false ]]; then
    for environment in staging prod; do
      for kind in assets diagnostics recovery; do
        name="kids-booklet-$environment-$kind"
        cloudflare_get "accounts/$account/r2/buckets/$name"
        [[ "$CF_STATUS" == 404 ]] || die "R2 bucket $name exists without Terraform state; import or choose a clean project"
      done
    done
    cloudflare_get "accounts/$account/r2/buckets/$TF_VAR_dify_backup_bucket"
    [[ "$CF_STATUS" == 404 ]] || die 'Dify backup bucket exists without Terraform state; verify ownership before installation'
  fi
  cloudflare_get "accounts/$account/cfd_tunnel?name=kids-booklet-vps&is_deleted=false"
  [[ "$CF_STATUS" == 200 && "$(jq '.result | length' "$CF_RESPONSE")" == 0 ]] || die 'A kids-booklet Tunnel exists without Terraform state; verify ownership and import it'
  for hostname in "$TF_VAR_staging_hostname" "$TF_VAR_prod_hostname" "$TF_VAR_deploy_hostname" "$TF_VAR_dify_hostname"; do
    cloudflare_get "zones/$zone/dns_records?name=$hostname"
    [[ "$(jq '.result | length' "$CF_RESPONSE")" == 0 ]] || die "DNS record $hostname already exists without Terraform state"
  done
  cloudflare_get "accounts/$account/access/apps"
  [[ "$(jq --arg hostname "$TF_VAR_deploy_hostname" '[.result[]? | select(.domain==$hostname)] | length' "$CF_RESPONSE")" == 0 ]] || die 'A deployment Access application exists without Terraform state; verify ownership and import it'
  for phase in http_request_cache_settings http_ratelimit; do
    cloudflare_get "zones/$zone/rulesets/phases/$phase/entrypoint"
    [[ "$CF_STATUS" == 404 ]] || die "The Cloudflare $phase entrypoint already exists; verify all rules and import it before setup"
  done
}
r2_bucket_address() {
  local name="$1"
  printf 'cloudflare_r2_bucket.bucket["%s"]' "$name"
}
adopt_existing_r2_buckets() {
  # A failed first apply can leave a bucket created remotely but absent from the
  # application state. Only the six fixed project bucket addresses are eligible
  # for state adoption; every other Cloudflare resource remains a hard drift.
  local directory="$1" state address name environment kind imported=false
  state="$(terraform -chdir="$directory" state list 2>/dev/null || true)"
  for environment in staging prod; do
    for kind in assets diagnostics recovery; do
      name="kids-booklet-$environment-$kind"
      address="$(r2_bucket_address "$name")"
      cloudflare_get "accounts/$TF_VAR_cloudflare_account_id/r2/buckets/$name"
      if grep -Fqx "$address" <<< "$state"; then
        [[ "$CF_STATUS" == 200 ]] || die "Terraform tracks missing R2 bucket $name"
      elif [[ "$CF_STATUS" == 404 ]]; then
        :
      elif [[ "$CF_STATUS" == 200 ]]; then
        if [[ "$APPLY" == false ]]; then
          printf 'would update: adopt existing R2 bucket %s into Terraform state\n' "$name"
        else
          if [[ "$imported" == false ]]; then
            r2_state_snapshot "$directory" infrastructure-before-r2-adoption
            imported=true
          fi
          terraform -chdir="$directory" import -input=false "$address" "$TF_VAR_cloudflare_account_id/$name/default"
          terraform -chdir="$directory" state show "$address" >/dev/null || die "Terraform did not adopt R2 bucket $name"
          printf 'updated: adopted existing R2 bucket %s into Terraform state\n' "$name"
          state+=$'\n'"$address"
        fi
      else
        die "Cloudflare returned HTTP $CF_STATUS while checking R2 bucket $name"
      fi
    done
  done
  name="$TF_VAR_dify_backup_bucket"
  address='cloudflare_r2_bucket.dify_backup'
  cloudflare_get "accounts/$TF_VAR_cloudflare_account_id/r2/buckets/$name"
  if grep -Fqx "$address" <<< "$state"; then
    [[ "$CF_STATUS" == 200 ]] || die "Terraform tracks missing Dify backup bucket $name"
  elif [[ "$CF_STATUS" == 404 ]]; then
    :
  elif [[ "$CF_STATUS" == 200 ]]; then
    if [[ "$APPLY" == false ]]; then
      printf 'would update: adopt existing R2 bucket %s into Terraform state\n' "$name"
    else
      if [[ "$imported" == false ]]; then r2_state_snapshot "$directory" infrastructure-before-r2-adoption; imported=true; fi
      terraform -chdir="$directory" import -input=false "$address" "$TF_VAR_cloudflare_account_id/$name/default"
      terraform -chdir="$directory" state show "$address" >/dev/null || die "Terraform did not adopt R2 bucket $name"
      printf 'updated: adopted existing R2 bucket %s into Terraform state\n' "$name"
    fi
  else
    die "Cloudflare returned HTTP $CF_STATUS while checking R2 bucket $name"
  fi
}
verify_cloudflare_ownership() {
  local directory="$1" state phase address expected environment kind name hostname key present
  state="$(terraform -chdir="$directory" state list 2>/dev/null || true)"
  if [[ -z "$state" ]]; then assert_no_unmanaged_cloudflare_resources true; return; fi
  for environment in staging prod; do
    for kind in assets diagnostics recovery; do
      name="kids-booklet-$environment-$kind"; address="cloudflare_r2_bucket.bucket[\"$name\"]"
      cloudflare_get "accounts/$TF_VAR_cloudflare_account_id/r2/buckets/$name"; present=false; [[ "$CF_STATUS" == 404 ]] || present=true
      if grep -Fqx "$address" <<< "$state"; then [[ "$present" == true ]] || die "Terraform tracks missing R2 bucket $name"; else [[ "$present" == false ]] || die "R2 bucket $name exists outside Terraform state"; fi
    done
  done
  name="$TF_VAR_dify_backup_bucket"; address='cloudflare_r2_bucket.dify_backup'
  cloudflare_get "accounts/$TF_VAR_cloudflare_account_id/r2/buckets/$name"; present=false; [[ "$CF_STATUS" == 404 ]] || present=true
  if grep -Fqx "$address" <<< "$state"; then [[ "$present" == true ]] || die "Terraform tracks missing R2 bucket $name"; else [[ "$present" == false ]] || die "R2 bucket $name exists outside Terraform state"; fi
  cloudflare_get "accounts/$TF_VAR_cloudflare_account_id/cfd_tunnel?name=kids-booklet-vps&is_deleted=false"; present=false; [[ "$(jq '.result | length' "$CF_RESPONSE")" == 0 ]] || present=true
  if grep -qx 'cloudflare_zero_trust_tunnel_cloudflared.vps' <<< "$state"; then [[ "$present" == true ]] || die 'Terraform tracks a missing Tunnel'; else [[ "$present" == false ]] || die 'The project Tunnel exists outside Terraform state'; fi
  cloudflare_get "accounts/$TF_VAR_cloudflare_account_id/access/apps"; present=false
  [[ "$(jq --arg hostname "$TF_VAR_deploy_hostname" '[.result[]? | select(.domain==$hostname)] | length' "$CF_RESPONSE")" == 0 ]] || present=true
  if grep -qx 'cloudflare_zero_trust_access_application.deployment' <<< "$state"; then [[ "$present" == true ]] || die 'Terraform tracks a missing deployment Access application'; else [[ "$present" == false ]] || die 'The deployment Access application exists outside Terraform state'; fi
  for key in staging prod deploy dify; do
    case "$key" in staging) hostname="$TF_VAR_staging_hostname";; prod) hostname="$TF_VAR_prod_hostname";; deploy) hostname="$TF_VAR_deploy_hostname";; dify) hostname="$TF_VAR_dify_hostname";; esac
    address="cloudflare_dns_record.application[\"$key\"]"
    cloudflare_get "zones/$TF_VAR_cloudflare_zone_id/dns_records?name=$hostname"; present=false; [[ "$(jq '.result | length' "$CF_RESPONSE")" == 0 ]] || present=true
    if grep -Fqx "$address" <<< "$state"; then [[ "$present" == true ]] || die "Terraform tracks missing DNS record $hostname"; else [[ "$present" == false ]] || die "DNS record $hostname exists outside Terraform state"; fi
  done
  for phase in http_request_cache_settings http_ratelimit; do
    address=cloudflare_ruleset.cache; expected='["application_bypass","next_static"]'
    if [[ "$phase" == http_ratelimit ]]; then address=cloudflare_ruleset.rate_limit; expected='["application_api_rate"]'; fi
    cloudflare_get "zones/$TF_VAR_cloudflare_zone_id/rulesets/phases/$phase/entrypoint"
    if grep -qx "$address" <<< "$state"; then
      [[ "$CF_STATUS" == 200 ]] || die "Terraform tracks $phase but its Cloudflare entrypoint is missing"
      if [[ "$phase" == http_request_cache_settings ]]; then
        jq -e '([.result.rules[]?.ref] | sort) as $refs | $refs == (["application_bypass","next_static"] | sort) or $refs == (["application_bypass","next_static","dify_bypass"] | sort)' "$CF_RESPONSE" >/dev/null || die "The $phase entrypoint contains rules outside this project"
      else
        jq -e --argjson expected "$expected" '([.result.rules[]?.ref] | sort) == ($expected | sort)' "$CF_RESPONSE" >/dev/null || die "The $phase entrypoint contains rules outside this project"
      fi
    else
      [[ "$CF_STATUS" == 404 ]] || die "The $phase entrypoint exists outside Terraform state; verify ownership and import it"
    fi
  done
}
preview_terraform_root() {
  local source="$1" name="$2" directory
  directory="$TEMP_DIR/preview-$name"
  mkdir -p "$directory"
  cp "$source/"*.tf "$directory/"
  cp "$source/.terraform.lock.hcl" "$directory/"
  # A first-setup preview uses local state; the remote bucket does not exist yet.
  sed -i '/^[[:space:]]*backend "s3" {}[[:space:]]*$/d' "$directory/"*.tf
  terraform -chdir="$directory" init -backend=false -input=false >/dev/null
  terraform -chdir="$directory" plan -input=false -out=preview.tfplan >/dev/null
  terraform -chdir="$directory" show -json preview.tfplan > "$directory/plan.json"
  validate_plan "$directory/plan.json"
  printf 'would create: %s Terraform resources\n' "$name"
}
preview_setup() {
  local account="$TF_VAR_cloudflare_account_id"
  cloudflare_get "accounts/$account/r2/buckets/$R2_STATE_BUCKET"
  if [[ "$CF_STATUS" == 200 ]]; then
    printf 'exists: R2 Terraform state bucket\n'
    if interrupted_bootstrap_state_is_resumable; then
      printf 'would update: resume interrupted bootstrap state migration\n'
    else verify_bootstrap_state_ownership; fi
    terraform_operation
  else
    assert_no_unmanaged_cloudflare_resources
    preview_terraform_root "$REPO_ROOT/infra/terraform/bootstrap" bootstrap
    preview_terraform_root "$REPO_ROOT/infra/terraform" infrastructure
  fi
  [[ ! -e "$ROOT/vps-deployment.sh" ]] || printf 'exists: installed host dispatcher\n'
  [[ ! -e "$SECRETS/staging/secrets.json" ]] || printf 'exists: staging host secret override\n'
  [[ ! -e "$SECRETS/prod/secrets.json" ]] || printf 'exists: production host secret override\n'
}
write_s3_backend_block() {
  local destination="$1"
  printf 'terraform {\n  backend "s3" {}\n}\n' > "$destination"
  chmod 600 "$destination"
}
interrupted_bootstrap_state_is_resumable() {
  local directory="$STATE/bootstrap" generated="$STATE/bootstrap/backend.generated.tf"
  [[ -f "$generated" && "$(<"$generated")" == 'terraform { backend "s3" {} }' ]] || return 1
  [[ -f "$directory/terraform.tfstate" && -f "$directory/local-state.backup" ]] || die 'Interrupted bootstrap is missing its recoverable local state or backup'
  cmp -s "$directory/terraform.tfstate" "$directory/local-state.backup" || die 'Interrupted bootstrap local state differs from its backup'
  jq -e --arg account "$TF_VAR_cloudflare_account_id" --arg bucket "$R2_STATE_BUCKET" '.resources[]? | select(.type=="cloudflare_r2_bucket" and .name=="state") | .instances[]? | select(.attributes.account_id==$account and .attributes.name==$bucket)' "$directory/terraform.tfstate" >/dev/null || die 'Interrupted bootstrap local state does not own the configured R2 state bucket'
}
repair_generated_s3_backend_block() {
  local destination="$1" content
  [[ -f "$destination" ]] || return 0
  content="$(<"$destination")"
  case "$content" in
    $'terraform {\n  backend "s3" {}\n}') ;;
    'terraform { backend "s3" {} }')
      write_s3_backend_block "$destination"
      printf 'updated: repaired interrupted bootstrap backend configuration\n'
      ;;
    *) die 'Generated bootstrap backend configuration contains incompatible drift' ;;
  esac
}
verify_bootstrap_state_ownership() {
  local directory="$TEMP_DIR/bootstrap-remote"
  mkdir -p "$directory"
  cp "$REPO_ROOT/infra/terraform/bootstrap/"*.tf "$directory/"
  cp "$REPO_ROOT/infra/terraform/bootstrap/.terraform.lock.hcl" "$directory/"
  write_s3_backend_block "$directory/backend.generated.tf"
  backend_init "$directory" bootstrap.tfstate
  terraform -chdir="$directory" state pull > "$directory/state.json"
  jq -e '.resources[]? | select(.type=="cloudflare_r2_bucket" and .name=="state")' "$directory/state.json" >/dev/null || die 'The R2 state bucket exists without matching bootstrap state; verify ownership before continuing'
}
preview_github_setup() {
  local repository owner name current expected branch
  repository="$(jq -r .repository "$CONFIG_FILE")"; owner="${repository%%/*}"
  gh secret list --repo "$repository" --json name > "$TEMP_DIR/github-secrets.json"
  for name in DEPLOY_SSH_PRIVATE_KEY DEPLOY_SSH_HOST_KEY CF_ACCESS_CLIENT_ID CF_ACCESS_CLIENT_SECRET CLOUDFLARE_API_TOKEN R2_TERRAFORM_ACCESS_KEY_ID R2_TERRAFORM_SECRET_ACCESS_KEY; do
    if jq -e --arg name "$name" '.[] | select(.name==$name)' "$TEMP_DIR/github-secrets.json" >/dev/null; then printf 'would update: GitHub secret %s\n' "$name"; else printf 'would create: GitHub secret %s\n' "$name"; fi
  done
  gh variable list --repo "$repository" --json name,value > "$TEMP_DIR/github-variables.json"
  for name in VPS_HOST R2_STATE_BUCKET R2_ENDPOINT CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_ZONE_ID STAGING_HOSTNAME PROD_HOSTNAME DEPLOY_HOSTNAME; do
    case "$name" in
      VPS_HOST) expected="$VPS_HOST";; R2_STATE_BUCKET) expected="$R2_STATE_BUCKET";; R2_ENDPOINT) expected="$R2_ENDPOINT";;
      CLOUDFLARE_ACCOUNT_ID) expected="$TF_VAR_cloudflare_account_id";; CLOUDFLARE_ZONE_ID) expected="$TF_VAR_cloudflare_zone_id";;
      STAGING_HOSTNAME) expected="$TF_VAR_staging_hostname";; PROD_HOSTNAME) expected="$TF_VAR_prod_hostname";; DEPLOY_HOSTNAME) expected="$TF_VAR_deploy_hostname";;
    esac
    current="$(jq -r --arg name "$name" '.[] | select(.name==$name) | .value' "$TEMP_DIR/github-variables.json")"
    if [[ "$current" == "$expected" ]]; then printf 'exists: GitHub variable %s\n' "$name"; elif [[ -n "$current" ]]; then printf 'would update: GitHub variable %s\n' "$name"; else printf 'would create: GitHub variable %s\n' "$name"; fi
  done
  gh api -H 'X-GitHub-Api-Version: 2026-03-10' "organizations/$owner/settings/billing/budgets?per_page=100" > "$TEMP_DIR/budgets.json" || die 'GitHub billing-manager access is required to inspect the Actions spending guard'
  if jq -e --arg repository "$repository" '.budgets[]? | select(.budget_scope=="repository" and .budget_entity_name==$repository and .budget_amount==0 and .prevent_further_usage==true)' "$TEMP_DIR/budgets.json" >/dev/null; then printf 'exists: GitHub Actions zero-dollar overage budget\n'; else printf 'would create: GitHub Actions zero-dollar overage budget\n'; fi
  printf 'exists: deployment configuration loaded from checkout\n'
  for branch in _staging _prod; do if gh api "repos/$repository/git/ref/heads/$branch" >/dev/null 2>&1; then printf 'exists: %s branch (finalize will preserve it)\n' "$branch"; fi; done
}
verify_infrastructure_head() {
  [[ -n "${GITHUB_ACTIONS:-}" ]] || return 0
  need_command git; need_command gh
  [[ -n "${GITHUB_SHA:-}" && -n "${GITHUB_REPOSITORY:-}" && -n "${GH_TOKEN:-}" ]] || die 'Workflow commit verification is not configured'
  [[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || die 'Checked-out infrastructure commit does not match the workflow commit'
  [[ "$(gh api "repos/$GITHUB_REPOSITORY/commits/master" --jq .sha)" == "$GITHUB_SHA" ]] || die 'A newer master commit superseded this infrastructure operation'
}
sync_host_configuration() {
  private_temp
  [[ -f "$REPO_ROOT/infra/config/vps.json" ]] || die 'Reviewed infra/config/vps.json is required for host synchronization'
  configure_ssh
  local remote_command
  local -a remote=(--action sync-host --request-id "$REQUEST_ID" --apply)
  printf -v remote_command ' %s' "${remote[@]}"
  # The installed dispatcher must accept the first bundle before it can upgrade
  # itself. Both transfers retain the same infrastructure journal and lock.
  local phase
  local -a files=(scripts/deploy/vps-deployment.sh deploy/compose.yml deploy/compose.staging.yml deploy/compose.prod.yml infra/config/vps.json)
  for phase in dispatcher artifacts; do
    if [[ "$phase" == artifacts ]]; then files+=(deploy/dify/compose.override.yml deploy/dify/release.json); fi
    tar -C "$REPO_ROOT" -cf "$TEMP_DIR/host-bundle.tar" "${files[@]}"
    ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o 'ProxyCommand=cloudflared access ssh --hostname %h' "$VPS_USER@$VPS_HOST" "$remote_command" < "$TEMP_DIR/host-bundle.tar" || return $?
  done
}
terraform_operation() {
  local directory
  need_command terraform; need_command jq
  load_config
  load_terraform_configuration
  verify_infrastructure_head
  private_temp
  directory="$TEMP_DIR/infrastructure"
  mkdir -p "$directory"
  cp "$REPO_ROOT/infra/terraform/"*.tf "$directory/"
  cp "$REPO_ROOT/infra/terraform/.terraform.lock.hcl" "$directory/"
  chmod 600 "$directory"/*
  backend_init "$directory" infrastructure.tfstate
  adopt_existing_r2_buckets "$directory"
  verify_cloudflare_ownership "$directory"
  terraform -chdir="$directory" plan -input=false -out="$TEMP_DIR/plan"
  terraform -chdir="$directory" show -json "$TEMP_DIR/plan" > "$TEMP_DIR/plan.json"
  # Keep the mode-700 workspace and its directories traversable. Only these
  # sensitive files need a mode change here.
  chmod 600 "$TEMP_DIR/plan" "$TEMP_DIR/plan.json"
  validate_plan "$TEMP_DIR/plan.json"
  if [[ "$APPLY" == true ]]; then
    verify_infrastructure_head
    if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
      [[ -n "$VPS_HOST" && -n "$REQUEST_ID" ]] || die 'Workflow apply requires VPS host and request ID'
      COMMIT="$GITHUB_SHA"
      ACTION=infra-lock; host_call; ACTION=infrastructure
    fi
    r2_state_snapshot "$directory" infrastructure-before
    terraform -chdir="$directory" apply -input=false "$TEMP_DIR/plan"
    terraform -chdir="$directory" state list >/dev/null
    r2_state_snapshot "$directory" infrastructure-after
    if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
      sync_host_configuration
      ACTION=infra-unlock; host_call; ACTION=infrastructure
    fi
    printf 'updated: infrastructure (state verified)\n'
  else printf 'would update: reviewed infrastructure plan\n'; fi
}
bootstrap_state() {
  # The durable workspace survives failed applies; never put state in
  # the cleanup-trapped temporary directory.
  local directory="$STATE/bootstrap"
  mkdir -p "$directory"
  cp "$REPO_ROOT/infra/terraform/bootstrap/"*.tf "$directory/"
  cp "$REPO_ROOT/infra/terraform/bootstrap/.terraform.lock.hcl" "$directory/"
  repair_generated_s3_backend_block "$directory/backend.generated.tf"
  if [[ ! -f "$directory/backend.generated.tf" ]]; then
    cloudflare_get "accounts/$TF_VAR_cloudflare_account_id/r2/buckets/$R2_STATE_BUCKET"
    if [[ "$CF_STATUS" == 200 ]]; then
      verify_bootstrap_state_ownership
      write_s3_backend_block "$directory/backend.generated.tf"
    else
      terraform -chdir="$directory" init -input=false
      terraform -chdir="$directory" plan -input=false -out=bootstrap.tfplan
      terraform -chdir="$directory" show -json bootstrap.tfplan > "$directory/plan.json"
      validate_plan "$directory/plan.json"
      terraform -chdir="$directory" apply -input=false bootstrap.tfplan
      cp "$directory/terraform.tfstate" "$directory/local-state.backup"
      write_s3_backend_block "$directory/backend.generated.tf"
    fi
  fi
  terraform -chdir="$directory" init -input=false -migrate-state -force-copy "-backend-config=bucket=$R2_STATE_BUCKET" -backend-config=key=bootstrap.tfstate -backend-config=region=auto "-backend-config=endpoints={s3=\"$R2_ENDPOINT\"}" -backend-config=skip_credentials_validation=true -backend-config=skip_requesting_account_id=true -backend-config=skip_region_validation=true -backend-config=skip_s3_checksum=true -backend-config=use_lockfile=true
  terraform -chdir="$directory" plan -input=false -out=bootstrap-remote.tfplan
  terraform -chdir="$directory" show -json bootstrap-remote.tfplan > "$directory/bootstrap-remote-plan.json"
  validate_plan "$directory/bootstrap-remote-plan.json"
  r2_state_snapshot "$directory" bootstrap-before
  terraform -chdir="$directory" apply -input=false bootstrap-remote.tfplan
  terraform -chdir="$directory" state pull > "$directory/verified-state.json"
  jq -e '.resources | length > 0' "$directory/verified-state.json" >/dev/null || die 'Remote bootstrap state verification failed'
  r2_state_snapshot "$directory" bootstrap-after
  chmod 600 "$directory"/*
}
build_secret_override() {
  local environment="$1" destination="$2" name value secret_input='' runner_input=''
  private_temp
  if [[ -n "${DEPLOYMENT_SECRETS_DIR:-}" ]]; then
    [[ "$GENERATE_PASSWORD" == false ]] || die '--generate-password cannot be combined with DEPLOYMENT_SECRETS_DIR'
    secret_input="$DEPLOYMENT_SECRETS_DIR/$environment.json"
    [[ -d "$DEPLOYMENT_SECRETS_DIR" && "$(stat -c %a "$DEPLOYMENT_SECRETS_DIR")" == 700 && -f "$secret_input" && "$(stat -c %a "$secret_input")" == 600 ]] || die 'DEPLOYMENT_SECRETS_DIR must be mode 700 with a mode-600 environment JSON file'
    if jq -e 'keys|any(startswith("DIFY_BOOKLET_"))' "$secret_input" >/dev/null 2>&1; then
      [[ "$environment" == staging ]] || die 'Booklet runner settings are staging-only'
      booklet_runner_settings_are_valid "$secret_input" || die 'Private Booklet runner settings are invalid'
      runner_input="$secret_input"
      # Keep the existing legacy schema check; restore the complete input before serialization.
      jq 'with_entries(select(.key|startswith("DIFY_BOOKLET_")|not))' "$secret_input" > "$TEMP_DIR/legacy-secret-input.json"
      secret_input="$TEMP_DIR/legacy-secret-input.json"
    fi
    jq -e 'type=="object" and ["OPENAI_API_KEY","MONGODB_URI","ACCESS_GATE_PASSWORD","AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY"] as $required | ["DIFY_API_KEY","DIFY_TOOL_KEY","DIFY_IMAGE_OPENAI_API_KEY","DIFY_COMMUNITY_PROBE_ENABLED","DIFY_COMMUNITY_BASE_URL","DIFY_COMMUNITY_WORKFLOW_API_KEY","DIFY_COMMUNITY_CALLBACK_KEY"] as $optional | (($required - keys)|length==0) and ((keys - ($required + $optional))|length==0) and (.OPENAI_API_KEY|length>0) and (.MONGODB_URI|test("^mongodb(\\+srv)?://")) and (.ACCESS_GATE_PASSWORD|length>=16) and (.AWS_ACCESS_KEY_ID|test("^[A-Za-z0-9]{32}$")) and (.AWS_SECRET_ACCESS_KEY|test("^[A-Fa-f0-9]{64}$")) and ((has("DIFY_API_KEY")|not) or (.DIFY_API_KEY|type=="string" and length>0)) and ((has("DIFY_TOOL_KEY")|not) or (.DIFY_TOOL_KEY|type=="string" and utf8bytelength>=32)) and ((has("DIFY_IMAGE_OPENAI_API_KEY")|not) or (.DIFY_IMAGE_OPENAI_API_KEY|type=="string" and length>0)) and ((has("DIFY_COMMUNITY_PROBE_ENABLED")|not) or (.DIFY_COMMUNITY_PROBE_ENABLED == "true" or .DIFY_COMMUNITY_PROBE_ENABLED == "false")) and ((has("DIFY_COMMUNITY_BASE_URL")|not) or .DIFY_COMMUNITY_BASE_URL == "https://dify.uniwares.co.uk") and ((has("DIFY_COMMUNITY_WORKFLOW_API_KEY")|not) or (.DIFY_COMMUNITY_WORKFLOW_API_KEY|type=="string" and length>0)) and ((has("DIFY_COMMUNITY_CALLBACK_KEY")|not) or (.DIFY_COMMUNITY_CALLBACK_KEY|type=="string" and utf8bytelength>=32)) and ((.DIFY_COMMUNITY_PROBE_ENABLED // "false") != "true" or (has("DIFY_COMMUNITY_BASE_URL") and has("DIFY_COMMUNITY_WORKFLOW_API_KEY") and has("DIFY_COMMUNITY_CALLBACK_KEY")))' "$secret_input" >/dev/null || die 'Secret input file does not satisfy the application secret contract'
    [[ -z "$runner_input" ]] || secret_input="$runner_input"
    jq '{services:{app:{environment:(with_entries(.value |= gsub("\\$";"$$")))}}}' "$secret_input" > "$destination"
    if [[ -n "${GENERATED_MONGODB_URI[$environment]:-}" ]]; then jq --arg value "${GENERATED_MONGODB_URI[$environment]}" '.services.app.environment.MONGODB_URI=$value' "$destination" > "$TEMP_DIR/next.json"; mv "$TEMP_DIR/next.json" "$destination"; fi
    chmod 600 "$destination"
    return
  fi
  printf '{"services":{"app":{"environment":{}}}}\n' > "$destination"
  for name in OPENAI_API_KEY MONGODB_URI ACCESS_GATE_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
    if [[ "$name" == MONGODB_URI && -n "${GENERATED_MONGODB_URI[$environment]:-}" ]]; then
      value="${GENERATED_MONGODB_URI[$environment]}"
      application_secret_value_is_valid "$name" "$value" || die 'Generated MONGODB_URI is invalid'
    else
      prompt_application_secret "$environment" "$name" value
    fi
    printf '%s' "$value" > "$TEMP_DIR/value"
    # JSON is valid Compose YAML. Escape dollars for Compose interpolation.
    jq --arg name "$name" --rawfile value "$TEMP_DIR/value" '.services.app.environment[$name]=($value | gsub("\\$";"$$"))' "$destination" > "$TEMP_DIR/next.json"
    mv "$TEMP_DIR/next.json" "$destination"
    unset value
  done
  chmod 600 "$destination"
}
application_secret_value_is_valid() {
  local name="$1" value="$2"
  case "$name" in
    OPENAI_API_KEY) [[ -n "$value" ]];;
    MONGODB_URI) [[ "$value" =~ ^mongodb(\+srv)?:// ]];;
    ACCESS_GATE_PASSWORD) [[ ${#value} -ge 16 ]];;
    AWS_ACCESS_KEY_ID) [[ "$value" =~ ^[A-Za-z0-9]{32}$ ]];;
    AWS_SECRET_ACCESS_KEY) [[ "$value" =~ ^[A-Fa-f0-9]{64}$ ]];;
    DIFY_API_KEY|DIFY_IMAGE_OPENAI_API_KEY) [[ -n "$value" ]];;
    DIFY_TOOL_KEY|DIFY_COMMUNITY_CALLBACK_KEY) [[ "$(printf %s "$value" | LC_ALL=C wc -c)" -ge 32 ]];;
    DIFY_COMMUNITY_WORKFLOW_API_KEY) [[ -n "$value" ]];;
    *) return 1;;
  esac
}
application_secret_requirement() {
  case "$1" in
    OPENAI_API_KEY) printf 'must not be empty';;
    MONGODB_URI) printf 'must begin with mongodb:// or mongodb+srv://';;
    ACCESS_GATE_PASSWORD) printf 'must contain at least 16 characters';;
    AWS_ACCESS_KEY_ID) printf 'must be a 32-character R2 access key ID';;
    AWS_SECRET_ACCESS_KEY) printf 'must be a 64-character hexadecimal R2 secret key';;
    DIFY_API_KEY|DIFY_IMAGE_OPENAI_API_KEY) printf 'must not be empty';;
    DIFY_TOOL_KEY|DIFY_COMMUNITY_CALLBACK_KEY) printf 'must contain at least 32 bytes';;
    DIFY_COMMUNITY_WORKFLOW_API_KEY) printf 'must not be empty';;
  esac
}
display_generated_password() {
  printf 'generated %s ACCESS_GATE_PASSWORD: %s\n' "$1" "$2" > /dev/tty
}
prompt_application_secret() {
  local environment="$1" name="$2" destination="$3" entered=''
  if [[ "$name" == ACCESS_GATE_PASSWORD && "$GENERATE_PASSWORD" == true ]]; then
    interactive_terminal || die '--generate-password requires an interactive terminal'
    need_command openssl
    entered="$(openssl rand -base64 24)"
    application_secret_value_is_valid "$name" "$entered" || die 'Generated access password is invalid'
    display_generated_password "$environment" "$entered"
    printf -v "$destination" '%s' "$entered"
    unset entered
    return
  fi
  while :; do
    IFS= read -r -s -p "$environment $name: " entered
    printf '\n' >&2
    if application_secret_value_is_valid "$name" "$entered"; then
      printf -v "$destination" '%s' "$entered"
      return
    fi
    printf 'error: %s %s; re-enter only this value\n' "$name" "$(application_secret_requirement "$name")" >&2
  done
}
application_secret_override_is_valid() {
  # The public Compose default is not a protected settings bundle. Permit only
  # that exact disabled default when validating resolved Compose, not secret input.
  if [[ "${2:-}" == resolved ]] && jq -e '.services.app.environment | with_entries(select(.key|startswith("DIFY_BOOKLET_"))) | .=={"DIFY_BOOKLET_RUNNER_ENABLED":"false"}' "$1" >/dev/null 2>&1; then
    legacy_application_secret_override_is_valid "$1"
    return
  fi
  if [[ "${ENVIRONMENT:-}" == prod ]] && jq -e '.services.app.environment|keys|any(startswith("DIFY_BOOKLET_"))' "$1" >/dev/null 2>&1; then return 1; fi
  legacy_application_secret_override_is_valid "$1" && booklet_runner_settings_are_valid "$1" override
}
legacy_application_secret_override_is_valid() {
  jq -e '.services.app.environment as $e | ($e.OPENAI_API_KEY|type=="string" and length>0) and ($e.MONGODB_URI|type=="string" and test("^mongodb(\\+srv)?://")) and ($e.ACCESS_GATE_PASSWORD|type=="string" and length>=16) and ($e.AWS_ACCESS_KEY_ID|type=="string" and test("^[A-Za-z0-9]{32}$")) and ($e.AWS_SECRET_ACCESS_KEY|type=="string" and test("^[A-Fa-f0-9]{64}$")) and ((($e|has("DIFY_API_KEY"))|not) or ($e.DIFY_API_KEY|type=="string" and length>0)) and ((($e|has("DIFY_TOOL_KEY"))|not) or ($e.DIFY_TOOL_KEY|type=="string" and utf8bytelength>=32)) and ((($e|has("DIFY_IMAGE_OPENAI_API_KEY"))|not) or ($e.DIFY_IMAGE_OPENAI_API_KEY|type=="string" and length>0)) and ((($e|has("DIFY_COMMUNITY_PROBE_ENABLED"))|not) or ($e.DIFY_COMMUNITY_PROBE_ENABLED == "true" or $e.DIFY_COMMUNITY_PROBE_ENABLED == "false")) and ((($e|has("DIFY_COMMUNITY_BASE_URL"))|not) or $e.DIFY_COMMUNITY_BASE_URL == "https://dify.uniwares.co.uk") and ((($e|has("DIFY_COMMUNITY_WORKFLOW_API_KEY"))|not) or ($e.DIFY_COMMUNITY_WORKFLOW_API_KEY|type=="string" and length>0)) and ((($e|has("DIFY_COMMUNITY_CALLBACK_KEY"))|not) or ($e.DIFY_COMMUNITY_CALLBACK_KEY|type=="string" and utf8bytelength>=32)) and (($e.DIFY_COMMUNITY_PROBE_ENABLED // "false") != "true" or (($e|has("DIFY_COMMUNITY_BASE_URL")) and ($e|has("DIFY_COMMUNITY_WORKFLOW_API_KEY")) and ($e|has("DIFY_COMMUNITY_CALLBACK_KEY"))))' "$1" >/dev/null
}
community_probe_patch_is_valid() {
  jq -e 'keys==["services"] and (.services|keys)==["app"] and (.services.app|keys)==["environment"] and (.services.app.environment as $e | ($e|keys)==["DIFY_COMMUNITY_BASE_URL","DIFY_COMMUNITY_CALLBACK_KEY","DIFY_COMMUNITY_PROBE_ENABLED","DIFY_COMMUNITY_WORKFLOW_API_KEY"] and $e.DIFY_COMMUNITY_PROBE_ENABLED=="true" and $e.DIFY_COMMUNITY_BASE_URL=="https://dify.uniwares.co.uk" and ($e.DIFY_COMMUNITY_WORKFLOW_API_KEY|type=="string" and length>0) and ($e.DIFY_COMMUNITY_CALLBACK_KEY|type=="string" and utf8bytelength>=32))' "$1" >/dev/null
}
booklet_runner_settings_are_valid() {
  # Validate stored Compose values as well as the private flat input. No values are printed.
  jq -e --arg source "${2:-flat}" '
    def uuid: type=="string" and test("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$");
    (if $source=="override" then .services.app.environment else . end) as $all |
    ($all | with_entries(select(.key|startswith("DIFY_BOOKLET_")))) as $e |
    if ($e|length)==0 then true else
      ($e.DIFY_BOOKLET_BINDINGS_JSON|fromjson) as $bindings |
      ($e|keys)==["DIFY_BOOKLET_BASE_URL","DIFY_BOOKLET_BINDINGS_JSON","DIFY_BOOKLET_PUBLIC_ORIGIN","DIFY_BOOKLET_RUNNER_ENABLED","DIFY_BOOKLET_TOOL_KEY"] and
      ($e.DIFY_BOOKLET_RUNNER_ENABLED=="false" or $e.DIFY_BOOKLET_RUNNER_ENABLED=="true") and
      $e.DIFY_BOOKLET_BASE_URL=="https://dify.uniwares.co.uk" and
      $e.DIFY_BOOKLET_PUBLIC_ORIGIN=="https://booklet-staging.uniwares.co.uk" and
      ($e.DIFY_BOOKLET_TOOL_KEY|type=="string" and length>=32) and
      ($e.DIFY_BOOKLET_BINDINGS_JSON|type=="string") and
      ($bindings|type=="array" and (length==6 or length==11 or length==13 or length==15 or length==16 or length==17 or length==18)) and
      all($bindings[];
        type=="object" and
        (keys==["apiKey","appId","persona","publishedWorkflowId","role","taskId","toolProviderId"] or
          (keys==["apiKey","appId","finalPageIllustration","persona","publishedWorkflowId","role","taskId","toolProviderId"] and
            .finalPageIllustration==true and .role=="image" and .taskId==null and .persona==null and ($bindings|length)>=17)) and
        (.appId|uuid) and (.publishedWorkflowId|uuid) and
        (.toolProviderId==null or (.toolProviderId|uuid)) and
        (.apiKey|type=="string" and length>0)) and
      ([$bindings[].appId]|unique|length)==($bindings|length) and
      (($bindings|length)!=18 or any($bindings[]; .role=="image" and .finalPageIllustration==true)) and
      ([$bindings[] | [.role,.taskId,.persona]] | sort)==
        ([["manager",null,null],["specialist","J01",null],["specialist","J02",null],["tester",null,"playful_kid"],["tester",null,"enthusiast_parent"],["tester",null,"professional_creator"]] +
          (if ($bindings|length)>=11 then ["J03","J04","J05","J06","J07"]|map(["specialist",.,null]) else [] end) +
          (if ($bindings|length)>=13 then [["specialist","J08",null],["image",null,null]] else [] end) +
          (if ($bindings|length)>=15 then [["specialist","J09",null],["specialist","J10",null]] else [] end) +
          (if ($bindings|length)>=16 then [["specialist","J11",null]] else [] end) +
          (if ($bindings|length)>=17 then [["specialist","J12",null]] else [] end) +
          (if ($bindings|length)==18 then [["judge",null,null]] else [] end)|sort)
    end' "$1" >/dev/null 2>&1
}
booklet_runner_patch_is_valid() {
  jq -e 'keys==["services"] and (.services|keys)==["app"] and (.services.app|keys)==["environment"] and (.services.app.environment|keys)==["DIFY_BOOKLET_BASE_URL","DIFY_BOOKLET_BINDINGS_JSON","DIFY_BOOKLET_PUBLIC_ORIGIN","DIFY_BOOKLET_RUNNER_ENABLED","DIFY_BOOKLET_TOOL_KEY"]' "$1" >/dev/null 2>&1 &&
    booklet_runner_settings_are_valid "$1" override
}
build_booklet_runner_patch() {
  local environment="$1" destination="$2" settings=''
  [[ "$environment" == staging ]] || die 'Booklet runner bundle is staging-only'
  while true; do
    if [[ "${GITHUB_ACTIONS:-}" == true ]]; then
      settings="${DIFY_BOOKLET_RUNNER_SETTINGS_JSON:-}"
    else
      interactive_terminal || die 'Booklet runner setup requires a private terminal or protected workflow secret'
      IFS= read -r -s -p 'Paste the private Booklet runner settings JSON: ' settings < /dev/tty
      printf '\n' > /dev/tty
    fi
    printf '%s' "$settings" > "$TEMP_DIR/booklet-runner-settings.json"
    chmod 600 "$TEMP_DIR/booklet-runner-settings.json"
    if [[ "$(wc -c < "$TEMP_DIR/booklet-runner-settings.json")" -le 49152 ]] &&
      jq -e 'type=="object" and keys==["DIFY_BOOKLET_BASE_URL","DIFY_BOOKLET_BINDINGS_JSON","DIFY_BOOKLET_PUBLIC_ORIGIN","DIFY_BOOKLET_RUNNER_ENABLED","DIFY_BOOKLET_TOOL_KEY"]' "$TEMP_DIR/booklet-runner-settings.json" >/dev/null 2>&1 &&
      booklet_runner_settings_are_valid "$TEMP_DIR/booklet-runner-settings.json"; then break; fi
    [[ "${GITHUB_ACTIONS:-}" != true ]] || die 'Protected Booklet runner settings are invalid or exceed 48 KiB'
    printf 'error: invalid runner bundle; re-enter only this bundle, not existing host secrets\n' >&2
  done
  jq '{services:{app:{environment:with_entries(.value |= gsub("\\$";"$$"))}}}' "$TEMP_DIR/booklet-runner-settings.json" > "$destination"
  chmod 600 "$destination"
  [[ "$(wc -c < "$destination")" -le 65536 ]] || die 'Booklet runner patch exceeds 64 KiB'
  booklet_runner_patch_is_valid "$destination" || die 'Booklet runner bundle is invalid'
  unset settings
}
build_community_probe_patch() {
  local environment="$1" destination="$2" workflow_value='' callback_value=''
  [[ "$environment" == staging ]] || die 'Community probe bundle is staging-only'
  if [[ "${GITHUB_ACTIONS:-}" == true ]]; then
    workflow_value="${DIFY_COMMUNITY_WORKFLOW_API_KEY:-}"
    callback_value="${DIFY_COMMUNITY_CALLBACK_KEY:-}"
    application_secret_value_is_valid DIFY_COMMUNITY_WORKFLOW_API_KEY "$workflow_value" || die 'Protected Community workflow key is invalid'
    application_secret_value_is_valid DIFY_COMMUNITY_CALLBACK_KEY "$callback_value" || die 'Protected Community callback key is invalid'
  else
    prompt_application_secret "$environment" DIFY_COMMUNITY_WORKFLOW_API_KEY workflow_value
    prompt_application_secret "$environment" DIFY_COMMUNITY_CALLBACK_KEY callback_value
  fi
  printf '%s' "$workflow_value" > "$TEMP_DIR/workflow-key"
  printf '%s' "$callback_value" > "$TEMP_DIR/callback-key"
  chmod 600 "$TEMP_DIR/workflow-key" "$TEMP_DIR/callback-key"
  jq -n --rawfile workflow "$TEMP_DIR/workflow-key" --rawfile callback "$TEMP_DIR/callback-key" '{services:{app:{environment:{DIFY_COMMUNITY_PROBE_ENABLED:"true",DIFY_COMMUNITY_BASE_URL:"https://dify.uniwares.co.uk",DIFY_COMMUNITY_WORKFLOW_API_KEY:($workflow|gsub("\\$";"$$")),DIFY_COMMUNITY_CALLBACK_KEY:($callback|gsub("\\$";"$$"))}}}}' > "$destination"
  chmod 600 "$destination"
  community_probe_patch_is_valid "$destination" || die 'Community probe bundle is invalid'
  unset workflow_value callback_value
}
build_secret_patch() {
  local environment="$1" name="$2" destination="$3" value
  if [[ "$name" == DIFY_BOOKLET_RUNNER ]]; then
    build_booklet_runner_patch "$environment" "$destination"
    return
  fi
  if [[ "$name" == DIFY_COMMUNITY_PROBE ]]; then
    build_community_probe_patch "$environment" "$destination"
    return
  fi
  printf '{"services":{"app":{"environment":{}}}}\n' > "$destination"
  prompt_application_secret "$environment" "$name" value
  printf '%s' "$value" > "$TEMP_DIR/value"
  jq --arg name "$name" --rawfile value "$TEMP_DIR/value" '.services.app.environment[$name]=($value | gsub("\\$";"$$"))' "$destination" > "$TEMP_DIR/next.json"
  mv "$TEMP_DIR/next.json" "$destination"
  chmod 600 "$destination"
  unset value
}
repair_first_activation_secrets() {
  load_config
  [[ "$APPLY" == true ]] || { printf 'would update: %s failed first-activation secrets\n' "$ENVIRONMENT"; return; }
  need_command jq; private_temp
  local outbound_payload="$TEMP_DIR/outbound-secrets.json"
  if [[ -n "$SECRET_NAME" ]]; then
    build_secret_patch "$ENVIRONMENT" "$SECRET_NAME" "$outbound_payload"
  else
    build_secret_override "$ENVIRONMENT" "$outbound_payload"
  fi
  local remote_command
  local -a remote=(--action repair-first-activation-secrets --environment "$ENVIRONMENT" --apply)
  [[ -z "$SECRET_NAME" ]] || remote+=(--secret-name "$SECRET_NAME")
  printf -v remote_command ' %s' "${remote[@]}"
  if [[ "$EUID" == 0 && -f "$ROOT/config.json" ]]; then
    (TEMP_DIR=''; SSH_ORIGINAL_COMMAND="$remote_command" host_dispatch) < "$outbound_payload"
  else
    configure_ssh
    ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o 'ProxyCommand=cloudflared access ssh --hostname %h' "$VPS_USER@$VPS_HOST" "$remote_command" < "$outbound_payload"
  fi
  printf 'next: run Maintenance with action=resume for %s\n' "$ENVIRONMENT"
}
write_secret_override() {
  local environment="$1" destination="$SECRETS/$1/secrets.json"
  if [[ -f "$destination" ]]; then
    application_secret_override_is_valid "$destination" || die "$environment host secret override does not satisfy the application secret contract"
    printf 'exists: %s valid host secret override\n' "$environment"
    return
  fi
  private_temp; build_secret_override "$environment" "$TEMP_DIR/secrets.json"
  install -d -m 700 "$SECRETS/$environment"
  install -m 600 "$TEMP_DIR/secrets.json" "$destination"
  rm -f "$STATE/atlas-$environment-uri.pending"
}
stage_and_trigger_rotation() {
  load_config
  [[ "$APPLY" == true ]] || { printf 'would update: staged %s secrets followed by serialized Maintenance rotation\n' "$ENVIRONMENT"; return; }
  need_command gh; need_command jq; private_temp
  configure_ssh
  load_github_admin_token
  gh workflow view maintenance.yml --repo "$(jq -r .repository "$CONFIG_FILE")" >/dev/null
  if [[ -n "$SECRET_NAME" ]]; then
    build_secret_patch "$ENVIRONMENT" "$SECRET_NAME" "$TEMP_DIR/rotation.json"
  else
    build_secret_override "$ENVIRONMENT" "$TEMP_DIR/rotation.json"
  fi
  local remote_command
  local -a remote=(--action stage-secrets --environment "$ENVIRONMENT" --apply)
  [[ -z "$SECRET_NAME" ]] || remote+=(--secret-name "$SECRET_NAME")
  printf -v remote_command ' %s' "${remote[@]}"
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o 'ProxyCommand=cloudflared access ssh --hostname %h' "$VPS_USER@$VPS_HOST" "$remote_command" < "$TEMP_DIR/rotation.json"
  gh workflow run maintenance.yml --repo "$(jq -r .repository "$CONFIG_FILE")" --ref "_$ENVIRONMENT" -f "environment=$ENVIRONMENT" -f action=rotate-secrets
  printf 'updated: secrets staged; Maintenance rotation queued\n'
}
rotate_protected_dify_key() {
  [[ "${GITHUB_ACTIONS:-}" == true ]] || die 'rotate-protected-dify-key is available only through GitHub Actions'
  [[ "$ENVIRONMENT" == staging && "$APPLY" == true && -n "$REQUEST_ID" ]] || die 'rotate-protected-dify-key requires staging, --apply, and a request ID'
  [[ "$SECRET_NAME" =~ ^(DIFY_TOOL_KEY|DIFY_API_KEY|DIFY_COMMUNITY_PROBE|DIFY_BOOKLET_RUNNER)$ ]] || die 'rotate-protected-dify-key accepts only Cloud keys or staging Dify bundles'
  load_config
  need_command jq; private_temp
  local value="${!SECRET_NAME:-}" payload="$TEMP_DIR/rotation.json" remote_command
  if [[ "$SECRET_NAME" == DIFY_COMMUNITY_PROBE ]]; then
    build_community_probe_patch staging "$payload"
  elif [[ "$SECRET_NAME" == DIFY_BOOKLET_RUNNER ]]; then
    build_booklet_runner_patch staging "$payload"
  else
    application_secret_value_is_valid "$SECRET_NAME" "$value" || die "Protected $SECRET_NAME is invalid"
    printf '%s' "$value" > "$TEMP_DIR/value"
    chmod 600 "$TEMP_DIR/value"
    jq -n --arg name "$SECRET_NAME" --rawfile value "$TEMP_DIR/value" '{services:{app:{environment:{($name):($value | gsub("\\$";"$$"))}}}}' > "$payload"
  fi
  chmod 600 "$payload"
  configure_ssh
  printf -v remote_command ' %s' --action stage-secrets --environment staging --secret-name "$SECRET_NAME" --apply
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o 'ProxyCommand=cloudflared access ssh --hostname %h' "$VPS_USER@$VPS_HOST" "$remote_command" < "$payload"
  value=''; unset value DIFY_TOOL_KEY DIFY_API_KEY DIFY_COMMUNITY_WORKFLOW_API_KEY DIFY_COMMUNITY_CALLBACK_KEY DIFY_BOOKLET_RUNNER_SETTINGS_JSON
  ACTION=rotate-secrets; SECRET_NAME=''
  host_call
}
setup_host() {
  load_config
  for name in curl jq docker python3 systemctl ssh-keygen visudo uname openssl nproc awk df base64 cmp tr git sha256sum tar; do need_command "$name"; done
  if [[ ! -f /etc/os-release ]] || ! grep -q '^ID=ubuntu$' /etc/os-release; then die 'Setup requires Ubuntu'; fi
  [[ "$(uname -m)" == x86_64 ]] || die 'This kit currently requires an x86_64 Ubuntu VPS'
  validate_host_capacity
  load_terraform_configuration
  load_cloudflare_api_token
  verify_cloudflare_token "$TF_VAR_cloudflare_account_id"
  verify_cloudflare_token_permissions "$TF_VAR_cloudflare_account_id" "$TF_VAR_cloudflare_zone_id"
  verify_cloudflare_zero_trust "$TF_VAR_cloudflare_account_id"
  docker compose version >/dev/null
  load_r2_state_credentials
  if [[ "$APPLY" == true ]]; then require_root; fi
  install_auxiliary_tools
  for name in terraform gh cloudflared; do need_command "$name"; done
  load_github_admin_token
  local repository requested_apply="$APPLY"
  repository="$(jq -r .repository "$CONFIG_FILE")"
  [[ "$(gh api "repos/$repository" --jq .permissions.admin)" == true ]] || die 'GitHub repository administration is required'
  private_temp
  gh api -H 'X-GitHub-Api-Version: 2026-03-10' "organizations/${repository%%/*}/settings/billing/budgets?per_page=100" > "$TEMP_DIR/billing-preflight.json" || die 'GitHub billing-manager access is required before setup can configure the Actions spending guard'
  load_atlas_admin_credentials
  verify_atlas_admin_access "$(jq -r .atlas_project_id "$CONFIG_FILE")"
  if [[ "$requested_apply" == true ]]; then
    APPLY=false
    configure_atlas
    preview_setup
    APPLY=true
    commit_auxiliary_tools
    install -d -m 700 "$STATE" "$STATE/operations" "$STATE/releases/staging" "$STATE/releases/prod" "$SECRETS"
    need_command flock
    exec 8>"$STATE/operation.lock"; flock -n 8 || die 'Another deployment operation is active'
    [[ ! -f "$STATE/operation.json" ]] || die 'Resolve the existing operation before setup'
    configure_atlas
  else
    configure_atlas
    preview_setup
    preview_github_setup
    return
  fi
  bootstrap_state
  terraform_operation
  # Root owns all executable code and configuration. The deploy user can only
  # request the closed host dispatcher via sudo; it never joins the docker group.
  install -d -m 755 "$ROOT" "$ROOT/deploy"
  install -m 755 "$SCRIPT_DIR/vps-deployment.sh" "$ROOT/vps-deployment.sh"
  install -m 644 "$REPO_ROOT/deploy/"*.yml "$ROOT/deploy/"
  install -m 600 "$CONFIG_FILE" "$ROOT/config.json"
  id kids-booklet-deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash kids-booklet-deploy
  [[ ! -f "$STATE/deploy-key" ]] || printf 'exists: deployment SSH key\n'
  if [[ ! -f "$STATE/deploy-key" ]]; then ssh-keygen -q -t ed25519 -N '' -f "$STATE/deploy-key"; fi
  install -d -m 755 /home/kids-booklet-deploy/.ssh
  printf 'restrict,command="sudo /opt/kids-booklet/vps-deployment.sh --action host-dispatch" %s\n' "$(cat "$STATE/deploy-key.pub")" > /home/kids-booklet-deploy/.ssh/authorized_keys
  chown root:root /home/kids-booklet-deploy /home/kids-booklet-deploy/.ssh /home/kids-booklet-deploy/.ssh/authorized_keys
  chmod 755 /home/kids-booklet-deploy; chmod 644 /home/kids-booklet-deploy/.ssh/authorized_keys
  printf 'Defaults:kids-booklet-deploy env_keep += "SSH_ORIGINAL_COMMAND"\nkids-booklet-deploy ALL=(root) NOPASSWD: /opt/kids-booklet/vps-deployment.sh --action host-dispatch\n' > "$STATE/sudoers"
  visudo -cf "$STATE/sudoers" >/dev/null
  install -m 440 "$STATE/sudoers" /etc/sudoers.d/kids-booklet-deploy
  write_secret_override staging; write_secret_override prod
  terraform -chdir="$TEMP_DIR/infrastructure" output -raw tunnel_token > "$SECRETS/tunnel.token"
  chmod 600 "$SECRETS/tunnel.token"
  cat > /etc/systemd/system/kids-booklet-tunnel.service <<'UNIT'
[Unit]
Description=Kids booklet Cloudflare Tunnel
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=/usr/local/bin/cloudflared tunnel --no-autoupdate run --token-file /etc/kids-booklet/tunnel.token
Restart=always
RestartSec=5
UMask=0077
[Install]
WantedBy=multi-user.target
UNIT
  # Pin the installed binary path instead of assuming the package installation path.
  sed -i "s|/usr/local/bin/cloudflared|$(PATH=/usr/local/bin:/usr/bin:/bin command -v cloudflared)|" /etc/systemd/system/kids-booklet-tunnel.service
  systemctl daemon-reload; systemctl enable kids-booklet-tunnel.service; systemctl restart kids-booklet-tunnel.service
  systemctl is-active --quiet kids-booklet-tunnel.service || die 'Tunnel connector failed to start'
  configure_github
  printf 'updated: host installed; services remain stopped until activation. Firewall was preserved.\n'
}
install_auxiliary_tools() {
  local tool version architecture=x86_64 asset expected
  [[ "$(uname -m)" == "$architecture" ]] || die 'This kit currently requires an x86_64 Ubuntu VPS'
  for tool in curl sha256sum tar python3; do need_command "$tool"; done
  # Preview downloads verified tools only into its disposable workspace.
  # commit_auxiliary_tools installs them on the host only during apply.
  private_temp; mkdir -p "$TEMP_DIR/bin"
  if ! command -v terraform >/dev/null || [[ "$(terraform version -json | jq -r .terraform_version)" != 1.11.4 ]]; then
    version=1.11.4; asset="terraform_${version}_linux_amd64.zip"
    curl -fsSL "https://releases.hashicorp.com/terraform/$version/$asset" -o "$TEMP_DIR/$asset"
    curl -fsSL "https://releases.hashicorp.com/terraform/$version/terraform_${version}_SHA256SUMS" -o "$TEMP_DIR/checksums"
    (cd "$TEMP_DIR" && grep " $asset$" checksums | sha256sum -c -)
    mkdir -p "$TEMP_DIR/terraform"
    python3 - "$TEMP_DIR/$asset" "$TEMP_DIR/terraform" <<'PY'
import sys
import zipfile

with zipfile.ZipFile(sys.argv[1]) as archive:
    archive.extractall(sys.argv[2])
PY
    install -m 755 "$TEMP_DIR/terraform/terraform" "$TEMP_DIR/bin/terraform"
  fi
  if ! command -v gh >/dev/null || ! gh --version | head -1 | grep -q '2.78.0'; then
    version=2.78.0; asset="gh_${version}_linux_amd64.tar.gz"
    curl -fsSL "https://github.com/cli/cli/releases/download/v$version/$asset" -o "$TEMP_DIR/$asset"
    curl -fsSL "https://github.com/cli/cli/releases/download/v$version/gh_${version}_checksums.txt" -o "$TEMP_DIR/checksums"
    (cd "$TEMP_DIR" && grep " $asset$" checksums | sha256sum -c -)
    tar -xzf "$TEMP_DIR/$asset" -C "$TEMP_DIR"
    install -m 755 "$TEMP_DIR/gh_${version}_linux_amd64/bin/gh" "$TEMP_DIR/bin/gh"
  fi
  if ! command -v cloudflared >/dev/null || ! cloudflared --version | grep -q '2025.8.1'; then
    version=2025.8.1
    curl -fsSL --retry 4 --retry-all-errors --retry-delay 2 "https://api.github.com/repos/cloudflare/cloudflared/releases/tags/$version" -o "$TEMP_DIR/release.json"
    expected="$(jq -er '.assets[] | select(.name=="cloudflared-linux-amd64") | .digest | select(startswith("sha256:"))' "$TEMP_DIR/release.json")"
    curl -fsSL --retry 4 --retry-all-errors --retry-delay 2 "https://github.com/cloudflare/cloudflared/releases/download/$version/cloudflared-linux-amd64" -o "$TEMP_DIR/cloudflared"
    printf '%s  %s\n' "${expected#sha256:}" "$TEMP_DIR/cloudflared" | sha256sum -c -
    install -m 755 "$TEMP_DIR/cloudflared" "$TEMP_DIR/bin/cloudflared"
  fi
  export PATH="$TEMP_DIR/bin:$PATH"
}
commit_auxiliary_tools() {
  local tool
  for tool in terraform cloudflared; do
    if [[ -f "$TEMP_DIR/bin/$tool" ]]; then install -m 755 "$TEMP_DIR/bin/$tool" "/usr/local/bin/$tool"; printf 'updated: pinned %s installed\n' "$tool"; fi
  done
}
configure_github() {
  local repository environment name expected current credential_hash secrets_complete=true variables_complete=true
  repository="$(jq -r .repository "$CONFIG_FILE")"
  # GitHub Free may not support environment protections on a private repository.
  # Repository secrets remain usable under the explicitly accepted writer-trust model.
  terraform -chdir="$TEMP_DIR/infrastructure" output -raw deployment_client_id > "$TEMP_DIR/deployment-client-id"
  terraform -chdir="$TEMP_DIR/infrastructure" output -raw deployment_client_secret > "$TEMP_DIR/deployment-client-secret"
  chmod 600 "$TEMP_DIR/deployment-client-"*
  {
    printf '%s\n' "$VPS_HOST" "$R2_STATE_BUCKET" "$R2_ENDPOINT" "$TF_VAR_cloudflare_account_id" "$TF_VAR_cloudflare_zone_id" "$TF_VAR_staging_hostname" "$TF_VAR_prod_hostname" "$TF_VAR_deploy_hostname" "$CLOUDFLARE_API_TOKEN" "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY"
    cat "$STATE/deploy-key" /etc/ssh/ssh_host_ed25519_key.pub "$TEMP_DIR/deployment-client-id" "$TEMP_DIR/deployment-client-secret"
  } > "$TEMP_DIR/github-credentials"
  chmod 600 "$TEMP_DIR/github-credentials"
  credential_hash="$(sha256sum "$TEMP_DIR/github-credentials" | awk '{print $1}')"
  gh secret list --repo "$repository" --json name > "$TEMP_DIR/github-secrets.json"
  for name in DEPLOY_SSH_PRIVATE_KEY DEPLOY_SSH_HOST_KEY CF_ACCESS_CLIENT_ID CF_ACCESS_CLIENT_SECRET CLOUDFLARE_API_TOKEN R2_TERRAFORM_ACCESS_KEY_ID R2_TERRAFORM_SECRET_ACCESS_KEY; do
    jq -e --arg name "$name" '.[] | select(.name==$name)' "$TEMP_DIR/github-secrets.json" >/dev/null || secrets_complete=false
  done
  gh variable list --repo "$repository" --json name,value > "$TEMP_DIR/github-variables.json"
  for name in VPS_HOST R2_STATE_BUCKET R2_ENDPOINT CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_ZONE_ID STAGING_HOSTNAME PROD_HOSTNAME DEPLOY_HOSTNAME; do
    case "$name" in
      VPS_HOST) expected="$VPS_HOST";; R2_STATE_BUCKET) expected="$R2_STATE_BUCKET";; R2_ENDPOINT) expected="$R2_ENDPOINT";;
      CLOUDFLARE_ACCOUNT_ID) expected="$TF_VAR_cloudflare_account_id";; CLOUDFLARE_ZONE_ID) expected="$TF_VAR_cloudflare_zone_id";;
      STAGING_HOSTNAME) expected="$TF_VAR_staging_hostname";; PROD_HOSTNAME) expected="$TF_VAR_prod_hostname";; DEPLOY_HOSTNAME) expected="$TF_VAR_deploy_hostname";;
    esac
    current="$(jq -r --arg name "$name" '.[] | select(.name==$name) | .value' "$TEMP_DIR/github-variables.json")"
    [[ "$current" == "$expected" ]] || variables_complete=false
  done
  if [[ "$secrets_complete" == true && "$variables_complete" == true && -f "$STATE/github-credentials.sha256" && "$(<"$STATE/github-credentials.sha256")" == "$credential_hash" ]]; then
    printf 'exists: GitHub deployment credentials and variables\n'
  else
    gh secret set DEPLOY_SSH_PRIVATE_KEY --repo "$repository" < "$STATE/deploy-key"
    printf '%s %s\n' "$VPS_HOST" "$(cat /etc/ssh/ssh_host_ed25519_key.pub)" | gh secret set DEPLOY_SSH_HOST_KEY --repo "$repository"
    gh secret set CF_ACCESS_CLIENT_ID --repo "$repository" < "$TEMP_DIR/deployment-client-id"
    gh secret set CF_ACCESS_CLIENT_SECRET --repo "$repository" < "$TEMP_DIR/deployment-client-secret"
    printf '%s' "$CLOUDFLARE_API_TOKEN" | gh secret set CLOUDFLARE_API_TOKEN --repo "$repository"
    printf '%s' "$AWS_ACCESS_KEY_ID" | gh secret set R2_TERRAFORM_ACCESS_KEY_ID --repo "$repository"
    printf '%s' "$AWS_SECRET_ACCESS_KEY" | gh secret set R2_TERRAFORM_SECRET_ACCESS_KEY --repo "$repository"
    gh variable set VPS_HOST --repo "$repository" --body "$VPS_HOST"
    gh variable set R2_STATE_BUCKET --repo "$repository" --body "$R2_STATE_BUCKET"
    gh variable set R2_ENDPOINT --repo "$repository" --body "$R2_ENDPOINT"
    for name in cloudflare_account_id cloudflare_zone_id staging_hostname prod_hostname deploy_hostname; do
      local var="TF_VAR_$name"
      gh variable set "${name^^}" --repo "$repository" --body "${!var}"
    done
    printf '%s\n' "$credential_hash" > "$STATE/github-credentials.sha256"; chmod 600 "$STATE/github-credentials.sha256"
    printf 'updated: GitHub deployment credentials and variables\n'
  fi
  for environment in staging prod; do
    if ! gh api --method PUT "repos/$repository/environments/$environment" --silent 2> "$TEMP_DIR/environment-error"; then
      if grep -Eq 'HTTP (403|404)' "$TEMP_DIR/environment-error"; then printf 'exists: repository secrets configured; private environment protections unavailable\n'
      else die "GitHub environment configuration failed for $environment"; fi
    fi
  done
  configure_actions_budget "$repository"
}
configure_actions_budget() {
  local repository="$1" owner endpoint budget_id payload
  owner="${repository%%/*}"; endpoint="organizations/$owner/settings/billing/budgets"
  gh api -H 'X-GitHub-Api-Version: 2026-03-10' "$endpoint?per_page=100" > "$TEMP_DIR/budgets.json" || die 'GitHub billing-manager access is required to configure the Actions spending guard'
  budget_id="$(jq -r --arg repository "$repository" '.budgets[]? | select(.budget_scope=="repository" and .budget_entity_name==$repository and .budget_type=="ProductPricing" and (.budget_product_sku=="actions" or (.budget_product_skus // [] | index("actions")))) | .id' "$TEMP_DIR/budgets.json" | head -1)"
  payload="$TEMP_DIR/actions-budget.json"
  jq -n --arg repository "$repository" '{budget_amount:0,prevent_further_usage:true,budget_scope:"repository",budget_entity_name:$repository,budget_type:"ProductPricing",budget_product_sku:"actions",budget_alerting:{will_alert:false,alert_recipients:[]}}' > "$payload"
  if [[ -n "$budget_id" ]]; then
    if jq -e --arg id "$budget_id" '.budgets[] | select(.id==$id) | .budget_amount==0 and .prevent_further_usage==true' "$TEMP_DIR/budgets.json" >/dev/null; then
      printf 'exists: GitHub Actions zero-dollar overage budget\n'
    else
      gh api --method PATCH -H 'X-GitHub-Api-Version: 2026-03-10' "$endpoint/$budget_id" --input "$payload" >/dev/null
      printf 'updated: GitHub Actions zero-dollar overage budget\n'
    fi
  else
    gh api --method POST -H 'X-GitHub-Api-Version: 2026-03-10' "$endpoint" --input "$payload" >/dev/null
    printf 'created: GitHub Actions zero-dollar overage budget\n'
  fi
}
protect_branch() {
  local repository="$1" branch="$2" payload="$TEMP_DIR/protection-$2.json"
  if gh api "repos/$repository/branches/$branch/protection" > "$TEMP_DIR/protection-current.json" 2> "$TEMP_DIR/protection-error"; then
    if jq -e '(.required_status_checks.contexts | index("Validate / validate")) and .required_pull_request_reviews.required_approving_review_count >= 1 and .enforce_admins.enabled==true and .allow_force_pushes.enabled==false and .allow_deletions.enabled==false' "$TEMP_DIR/protection-current.json" >/dev/null; then
      printf 'exists: %s branch protection\n' "$branch"; return
    fi
  elif ! grep -Eq 'HTTP (403|404)' "$TEMP_DIR/protection-error"; then die "Could not inspect $branch branch protection"; fi
  if [[ "$APPLY" == false ]]; then printf 'would update: %s branch protection where supported\n' "$branch"; return; fi
  jq -n '{required_status_checks:{strict:true,contexts:["Validate / validate"]},enforce_admins:true,required_pull_request_reviews:{required_approving_review_count:1,dismiss_stale_reviews:true},restrictions:null,allow_force_pushes:false,allow_deletions:false}' > "$payload"
  if gh api --method PUT "repos/$repository/branches/$branch/protection" --input "$payload" >/dev/null 2> "$TEMP_DIR/protection-error"; then
    printf 'updated: %s branch protection\n' "$branch"
  elif grep -Eq 'HTTP (403|404)' "$TEMP_DIR/protection-error"; then printf 'exists: %s protection unavailable on this GitHub plan; workflow and host checks remain active\n' "$branch"
  else die "Could not configure $branch branch protection"; fi
}
finalize_repository() {
  load_config; need_command git; need_command jq; need_command base64; private_temp
  install_auxiliary_tools; need_command gh; load_github_admin_token
  local repository master_sha branch payload
  repository="$(jq -r .repository "$CONFIG_FILE")"
  [[ "$(gh api "repos/$repository" --jq .permissions.admin)" == true ]] || die 'GitHub repository administration is required'
  master_sha="$(gh api "repos/$repository/commits/master" --jq .sha)"
  gh api "repos/$repository/contents/infra/config/vps.json?ref=master" --jq .content | tr -d '\n' | base64 -d > "$TEMP_DIR/master-vps.json"
  cmp -s "$CONFIG_FILE" "$TEMP_DIR/master-vps.json" || die 'Local configuration does not match the reviewed configuration merged to master'
  for branch in _staging _prod; do
    if gh api "repos/$repository/git/ref/heads/$branch" >/dev/null 2>&1; then printf 'exists: %s branch\n' "$branch"
    elif [[ "$APPLY" == false ]]; then printf 'would create: %s branch at reviewed master\n' "$branch"
    else
      payload="$TEMP_DIR/ref-${branch#_}.json"
      jq -n --arg ref "refs/heads/$branch" --arg sha "$master_sha" '{ref:$ref,sha:$sha}' > "$payload"
      gh api --method POST "repos/$repository/git/refs" --input "$payload" >/dev/null
      printf 'created: %s branch\n' "$branch"
    fi
  done
  protect_branch "$repository" master
  for branch in _staging _prod; do
    if [[ "$APPLY" == true ]] || gh api "repos/$repository/git/ref/heads/$branch" >/dev/null 2>&1; then protect_branch "$repository" "$branch"
    else printf 'would update: %s branch protection after creation where supported\n' "$branch"; fi
  done
}
main() {
  parse_arguments "$@"; validate_arguments
  case "$ACTION" in
    discover-config) discover_configuration;;
    access-check) access_check;;
    host-dispatch) host_dispatch;;
    host-run) CONFIG_FILE="$ROOT/config.json"; load_config; host_run;;
    host-cleanup) CONFIG_FILE="$ROOT/config.json"; load_config; host_cleanup;;
    credential-session) start_credential_session;;
    clear-credential-session) clear_credential_session;;
    status|operation-status|operation-stop|backup-verify|staging-bootstrap-reconcile|candidate-reconcile|expired-deployment-recover)
      if [[ "$EUID" == 0 && -f "$ROOT/config.json" ]]; then
        CONFIG_FILE="$ROOT/config.json"; load_config
        case "$ACTION" in operation-status) operation_status_host;; operation-stop) operation_stop_host;; backup-verify) backup_verify_host;; staging-bootstrap-reconcile) staging_bootstrap_reconcile_host;; candidate-reconcile|expired-deployment-recover) supported_recovery_host;; *) show_operation_status;; esac
      else
        if [[ -f "$CONFIG_FILE" ]]; then load_config; fi
        [[ -n "$VPS_HOST" ]] || die 'Supply --vps-host or configuration'
        host_call
      fi;;
    setup) setup_host;;
    atlas-reconcile) reconcile_atlas;;
    finalize) finalize_repository;;
    dify-enable-admin-api) dify_enable_admin_api_host;;
    rotate-secrets)
      if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
        if [[ -f "$CONFIG_FILE" ]]; then load_config; fi
        [[ -n "$VPS_HOST" ]] || die 'Supply --vps-host or configuration'
        host_call
      else stage_and_trigger_rotation; fi;;
    rotate-protected-dify-key) rotate_protected_dify_key;;
    repair-first-activation-secrets) repair_first_activation_secrets;;
    infrastructure) terraform_operation;;
    *)
      if [[ -f "$CONFIG_FILE" ]]; then load_config; fi
      [[ -n "$VPS_HOST" ]] || die 'Supply --vps-host or configuration'
      if [[ "$APPLY" == false && "$ACTION" != reset-staging && "$ACTION" != retire-staging-artifact-index && "$ACTION" != check && "$ACTION" != status && "$ACTION" != dify-discover && "$ACTION" != dify-check && "$ACTION" != dify-idle && "$ACTION" != dify-diagnostics && "$ACTION" != dify-repair-sandbox && "$ACTION" != dify-repair-scheduler && "$ACTION" != dify-install && "$ACTION" != dify-repair-broker && "$ACTION" != dify-repair-collaboration ]]; then
        printf 'would update: %s %s\n' "$ACTION" "$ENVIRONMENT"
      else host_call; fi;;
  esac
}
if [[ "${VPS_DEPLOYMENT_LIBRARY_ONLY:-false}" != true ]]; then main "$@"; fi
