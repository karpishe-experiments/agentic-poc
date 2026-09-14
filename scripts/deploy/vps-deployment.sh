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
CONFIG_FILE='' VPS_HOST='' VPS_USER='' COMMIT='' REQUEST_ID=''
COMPOSE_SECRET_FILE=''
ZONE_NAME='' STAGING_HOSTNAME='' PROD_HOSTNAME='' DEPLOY_HOSTNAME='' CONFIG_OUTPUT=''
ROOT=/opt/kids-booklet
STATE=/var/lib/kids-booklet
SECRETS=/etc/kids-booklet
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMP_DIR=''
declare -A SEEN=()
declare -A GENERATED_MONGODB_URI=()
ATLAS_PUBLIC_KEY="${ATLAS_PUBLIC_KEY:-${ATLAS_ADMIN_PUBLIC_KEY:-}}" ATLAS_PRIVATE_KEY="${ATLAS_PRIVATE_KEY:-${ATLAS_ADMIN_PRIVATE_KEY:-}}" ATLAS_RESPONSE='' ATLAS_STATUS='' GITHUB_ADMIN_TOKEN="${GITHUB_ADMIN_TOKEN:-}"
CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-${TF_VAR_cloudflare_api_token:-}}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-}" AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-}"
SESSION_ACTIVE="${SESSION_ACTIVE:-false}" SESSION_RESTORE_ERREXIT="${SESSION_RESTORE_ERREXIT:-false}"

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
need_command() { command -v "$1" >/dev/null || die "Required command missing: $1"; }
cleanup() { ATLAS_PUBLIC_KEY=''; ATLAS_PRIVATE_KEY=''; GITHUB_ADMIN_TOKEN=''; CLOUDFLARE_API_TOKEN=''; AWS_ACCESS_KEY_ID=''; AWS_SECRET_ACCESS_KEY=''; unset ATLAS_PUBLIC_KEY ATLAS_PRIVATE_KEY ATLAS_ADMIN_PUBLIC_KEY ATLAS_ADMIN_PRIVATE_KEY GITHUB_ADMIN_TOKEN GH_TOKEN CLOUDFLARE_API_TOKEN TF_VAR_cloudflare_api_token AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY CF_ACCESS_CLIENT_ID CF_ACCESS_CLIENT_SECRET TUNNEL_SERVICE_TOKEN_ID TUNNEL_SERVICE_TOKEN_SECRET; if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then rm -rf -- "$TEMP_DIR"; fi; }
trap cleanup EXIT
usage() {
  cat <<'HELP'
Usage: bash scripts/deploy/vps-deployment.sh --action ACTION [named options] [--apply]
Actions: discover-config, access-check, setup, finalize, status, infrastructure, deploy, check, backup,
         restore, rollback, rotate-secrets, reset-staging, resume, credential-session,
         clear-credential-session, host-dispatch, host-run
Options:
  --config PATH                     non-secret JSON configuration
  --zone HOSTNAME                    required for discover-config
  --staging-hostname HOSTNAME        defaults to staging.<zone> for discover-config
  --prod-hostname HOSTNAME           defaults to booklet.<zone> for discover-config
  --deploy-hostname HOSTNAME         defaults to deploy.<zone> for discover-config
  --write-config PATH                required output for discover-config; must be infra/config/vps.json
  --environment staging|prod        target for application operations
  --image-digest ghcr.io/name@sha256:HEX  required for deploy
  --commit FULL_SHA                 required for deploy
  --backup-id ID --confirmation DB   required for restore
  --confirmation kids_booklet       required for reset-staging
  --vps-host HOST --vps-user USER    SSH destination (default user kids-booklet-deploy)
  --request-id ID                   identifies an operation; reused by resume/status
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
      --action|--config|--environment|--image-digest|--backup-id|--confirmation|--vps-host|--vps-user|--commit|--request-id|--zone|--staging-hostname|--prod-hostname|--deploy-hostname|--write-config)
        name="$1"; [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || die "$1 requires a value"
        value="$2"
        [[ -z "${SEEN[$name]+x}" || "${SEEN[$name]}" == "$value" ]] || die "Conflicting duplicate argument: $name"
        SEEN[$name]="$value"
        case "$name" in
          --action) ACTION="$value";; --config) CONFIG_FILE="$value";; --environment) ENVIRONMENT="$value";;
          --image-digest) IMAGE_DIGEST="$value";; --backup-id) BACKUP_ID="$value";; --confirmation) CONFIRMATION="$value";;
          --vps-host) VPS_HOST="$value";; --vps-user) VPS_USER="$value";; --commit) COMMIT="$value";; --request-id) REQUEST_ID="$value";;
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
  [[ "$ACTION" =~ ^(discover-config|access-check|setup|finalize|status|infrastructure|infra-lock|infra-unlock|sync-host|deploy|check|backup|restore|rollback|rotate-secrets|stage-secrets|reset-staging|resume|credential-session|clear-credential-session|host-dispatch|host-run)$ ]] || die 'Select a supported --action'
  [[ -z "$ENVIRONMENT" || "$ENVIRONMENT" =~ ^(staging|prod)$ ]] || die 'Invalid environment'
  [[ "$VPS_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || die 'Invalid SSH user'
  [[ -z "$VPS_HOST" || "$VPS_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || die 'Invalid SSH hostname'
  [[ -z "$COMMIT" || "$COMMIT" =~ ^[a-f0-9]{40}$ ]] || die 'Commit must be a full SHA'
  [[ -z "$REQUEST_ID" || "$REQUEST_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$ ]] || die 'Invalid request ID'
  [[ -z "$BACKUP_ID" || "$BACKUP_ID" =~ ^[a-zA-Z0-9_-]{1,160}$ ]] || die 'Invalid backup ID'
  [[ -z "$CONFIRMATION" || "$CONFIRMATION" =~ ^kids_booklet(_prod)?$ ]] || die 'Invalid database confirmation'
  [[ -z "$IMAGE_DIGEST" || "$IMAGE_DIGEST" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]] || die 'Invalid immutable GHCR digest'
  [[ -z "$ZONE_NAME" || "$ZONE_NAME" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || die 'Invalid Cloudflare zone hostname'
  for hostname in "$STAGING_HOSTNAME" "$PROD_HOSTNAME" "$DEPLOY_HOSTNAME"; do
    [[ -z "$hostname" || "$hostname" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || die 'Invalid application hostname'
  done
  case "$ACTION" in
    deploy) [[ -n "$ENVIRONMENT" && -n "$IMAGE_DIGEST" && -n "$COMMIT" ]] || die 'Deploy requires environment, image digest and commit';;
    check|backup|restore|rollback|rotate-secrets|stage-secrets|reset-staging|resume) [[ -n "$ENVIRONMENT" ]] || die 'Environment is required';;
  esac
  if [[ "$ACTION" == restore ]]; then
    [[ -n "$BACKUP_ID" ]] || die 'Restore requires backup ID'
    local expected=kids_booklet; [[ "$ENVIRONMENT" != prod ]] || expected=kids_booklet_prod
    [[ "$CONFIRMATION" == "$expected" ]] || die "Restore requires --confirmation $expected"
  fi
  if [[ "$ACTION" == reset-staging ]]; then
    [[ "$ENVIRONMENT" == staging && "$CONFIRMATION" == kids_booklet ]] || die 'Reset is staging-only and requires --confirmation kids_booklet'
  fi
  case "$ACTION" in status|check|access-check|credential-session|clear-credential-session) [[ "$APPLY" == false ]] || die "$ACTION rejects --apply";; esac
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
  R2_STATE_BUCKET="$(jq -r .state_bucket "$CONFIG_FILE")"
  export TF_VAR_cloudflare_account_id TF_VAR_cloudflare_zone_id TF_VAR_staging_hostname TF_VAR_prod_hostname TF_VAR_deploy_hostname R2_STATE_BUCKET
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
  local -a remote=(--action "$ACTION")
  [[ -z "$ENVIRONMENT" ]] || remote+=(--environment "$ENVIRONMENT")
  [[ -z "$IMAGE_DIGEST" ]] || remote+=(--image-digest "$IMAGE_DIGEST")
  [[ -z "$COMMIT" ]] || remote+=(--commit "$COMMIT")
  [[ -z "$BACKUP_ID" ]] || remote+=(--backup-id "$BACKUP_ID")
  [[ -z "$CONFIRMATION" ]] || remote+=(--confirmation "$CONFIRMATION")
  [[ -z "$REQUEST_ID" ]] || remote+=(--request-id "$REQUEST_ID")
  [[ "$APPLY" == false ]] || remote+=(--apply)
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o 'ProxyCommand=cloudflared access ssh --hostname %h' "$VPS_USER@$VPS_HOST" "${remote[@]}"
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
  docker compose --project-name "kids-booklet-$ENVIRONMENT" --env-file "$release/runtime.env" -f "$release/compose.yml" -f "$release/environment.yml" -f "${COMPOSE_SECRET_FILE:-$SECRETS/$ENVIRONMENT/secrets.json}" -f "$release/image.json" "$@"
}
maintenance() {
  local release="$1" command="$2"; shift 2
  local release_image
  release_image="$(jq -er .services.app.image "$release/image.json")"
  compose "$release" run --rm --no-deps -T -e RUNNER_ENABLED=false -e "RELEASE_IMAGE_DIGEST=$release_image" -e "BACKUP_ID=$BACKUP_ID" -e "CONFIRM_DATABASE=$CONFIRMATION" app node --import tsx "scripts/$command.ts" "$@"
}
set_step() {
  jq --arg step "$1" '.step=$step' "$STATE/operation.json" > "$STATE/operation.next.json"
  mv "$STATE/operation.next.json" "$STATE/operation.json"
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
  local release="$1"
  # Do not print this output: it includes secrets. Only jq's exit status is used.
  compose "$release" config --format json | jq -e '.services.app.environment | [.OPENAI_API_KEY,.MONGODB_URI,.ACCESS_GATE_PASSWORD,.AWS_ACCESS_KEY_ID,.AWS_SECRET_ACCESS_KEY] | all(type == "string" and length > 0)' >/dev/null || die 'Required host secrets are missing'
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
  compose "$1" stop --timeout 60 app
  [[ -z "$(docker ps -q --filter "label=com.docker.compose.project=kids-booklet-$ENVIRONMENT" --filter 'label=com.docker.compose.service=app')" ]] || die 'Old application or maintenance container is still running'
}
verify_application() {
  local release="$1" url
  url="https://$(jq -r --arg e "$ENVIRONMENT" '.environments[$e].APP_HOSTNAME' "$CONFIG_FILE")"
  compose "$release" run --rm --no-deps -T -e RUNNER_ENABLED=false -e "DEPLOYMENT_URL=$url" app node --import tsx scripts/check-deployment-readiness.ts
}
drain_application() {
  maintenance "$1" deployment-control enable deployment
  if ! maintenance "$1" wait-for-deployment-drain; then
    maintenance "$1" deployment-control disable
    die 'Drain timed out; original application continues with normal admission'
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
  local current='' candidate='' previous=''
  [[ ! -f "$STATE/releases/$ENVIRONMENT/current" ]] || read -r current < "$STATE/releases/$ENVIRONMENT/current"
  case "$ACTION" in
    deploy)
      prepare_release
      candidate="$STATE/releases/$ENVIRONMENT/$COMMIT"
      record_release_metadata "$candidate" "$current"
      verify_release_capacity
      # Anonymous pull: a private GHCR package must fail before maintenance begins.
      private_temp; mkdir -p "$TEMP_DIR/docker"
      DOCKER_CONFIG="$TEMP_DIR/docker" docker pull "$IMAGE_DIGEST"
      if [[ -n "$current" ]]; then
        set_step draining; drain_application "$current"
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
          maintenance "$current" deployment-control disable
        fi
        die 'Readiness failed; database was not restored. Inspect and resume the operation'
      fi
      maintenance "$candidate" deployment-control disable
      save_success "$candidate" true ;;
    backup|restore|reset-staging|rollback|rotate-secrets)
      [[ -n "$current" ]] || die 'Environment has no recorded release'
      record_release_metadata "$current" "$current"
      if [[ "$ACTION" == rotate-secrets ]]; then
        [[ -f "$SECRETS/$ENVIRONMENT/secrets.pending.json" ]] || die 'No staged secret rotation found'
        COMPOSE_SECRET_FILE="$SECRETS/$ENVIRONMENT/secrets.pending.json"; validate_compose "$current"; COMPOSE_SECRET_FILE=''
      fi
      set_step draining; drain_application "$current"
      set_step stopping; stop_application "$current"
      if [[ "$ACTION" != restore ]]; then set_step backup; ensure_backup_id; maintenance "$current" recovery backup; fi
      case "$ACTION" in
        restore) maintenance "$current" recovery restore;;
        reset-staging) maintenance "$current" reset-staging-deployment; maintenance "$current" deployment-control enable reset;;
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
      if [[ "$ACTION" == rollback ]]; then save_success "$current" true; else save_success "$current"; fi ;;
    *) die 'Unsupported host lifecycle operation';;
  esac
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
  recover_interrupted_rotation
  if [[ "$ACTION" != restore && -n "$BACKUP_ID" ]]; then BACKUP_ID=''; fi
  validate_arguments
  run_lifecycle
}
host_dispatch() {
  require_root
  local original="${SSH_ORIGINAL_COMMAND:-}" token
  [[ -n "$original" && "$original" != *$'\n'* && "$original" != *$'\r'* ]] || die 'Invalid remote request'
  local -a args=()
  read -r -a args <<< "$original"
  for token in "${args[@]}"; do [[ "$token" =~ ^[a-zA-Z0-9_./:@-]+$ ]] || die 'Invalid remote argument'; done
  SEEN=(); ACTION=''; APPLY=false
  parse_arguments "${args[@]}"; validate_arguments
  case "$ACTION" in deploy|check|backup|restore|rollback|rotate-secrets|stage-secrets|reset-staging|resume|status|infra-lock|infra-unlock|sync-host) :;; *) die 'Operation is not available remotely';; esac
  CONFIG_FILE="$ROOT/config.json"; load_config
  if [[ "$ACTION" == status ]]; then
    if [[ -f "$STATE/operation.json" ]]; then jq '{requestId,action,environment,commit,backupId,backupHistory,configHash,priorRelease,step}' "$STATE/operation.json"; else printf '{"step":"idle"}\n'; fi
    exit 0
  fi
  if [[ "$ACTION" == stage-secrets ]]; then
    [[ "$APPLY" == true ]] || { printf 'would update: staged %s secret rotation\n' "$ENVIRONMENT"; exit 0; }
    exec 9>"$STATE/operation.lock"; flock -n 9 || die 'Another host operation is running'
    [[ ! -f "$STATE/operation.json" ]] || die 'Unresolved operation exists; use resume'
    private_temp
    dd of="$TEMP_DIR/secrets.json" bs=64K count=1 iflag=fullblock status=none
    if IFS= read -r -n 1; then die 'Staged secret override exceeds 64 KiB'; fi
    jq -e '.services.app.environment | [.OPENAI_API_KEY,.MONGODB_URI,.ACCESS_GATE_PASSWORD,.AWS_ACCESS_KEY_ID,.AWS_SECRET_ACCESS_KEY] | all(type=="string" and length>0)' "$TEMP_DIR/secrets.json" >/dev/null || die 'Staged secret override is invalid'
    install -m 600 "$TEMP_DIR/secrets.json" "$SECRETS/$ENVIRONMENT/secrets.pending.json"
    printf 'updated: staged %s secret rotation\n' "$ENVIRONMENT"; exit 0
  fi
  if [[ "$ACTION" == sync-host ]]; then
    [[ "$APPLY" == true && -n "$REQUEST_ID" && -f "$STATE/operation.json" ]] || die 'Host synchronization requires the active infrastructure request'
    jq -e --arg id "$REQUEST_ID" '.requestId==$id and .action=="infrastructure"' "$STATE/operation.json" >/dev/null || die 'Infrastructure lock belongs to another operation'
    private_temp
    dd of="$TEMP_DIR/host-bundle.tar" bs=1M count=5 iflag=fullblock status=none
    if IFS= read -r -n 1; then die 'Host configuration bundle exceeds 5 MiB'; fi
    tar -tf "$TEMP_DIR/host-bundle.tar" | sort > "$TEMP_DIR/contents"
    printf '%s\n' deploy/compose.prod.yml deploy/compose.staging.yml deploy/compose.yml infra/config/vps.json scripts/deploy/vps-deployment.sh | sort > "$TEMP_DIR/expected"
    cmp -s "$TEMP_DIR/contents" "$TEMP_DIR/expected" || die 'Host configuration bundle has unexpected contents'
    tar -xf "$TEMP_DIR/host-bundle.tar" -C "$TEMP_DIR"
    bash -n "$TEMP_DIR/scripts/deploy/vps-deployment.sh"
    local staged_config="$TEMP_DIR/infra/config/vps.json" original_config="$CONFIG_FILE"
    CONFIG_FILE="$staged_config"; load_config; CONFIG_FILE="$original_config"
    install -m 755 "$TEMP_DIR/scripts/deploy/vps-deployment.sh" "$ROOT/vps-deployment.sh.next"
    mv "$ROOT/vps-deployment.sh.next" "$ROOT/vps-deployment.sh"
    local compose_file
    for compose_file in "$TEMP_DIR/deploy/"*.yml; do install -m 644 "$compose_file" "$ROOT/deploy/$(basename "$compose_file").next"; mv "$ROOT/deploy/$(basename "$compose_file").next" "$ROOT/deploy/$(basename "$compose_file")"; done
    install -m 600 "$staged_config" "$ROOT/config.json.next"; mv "$ROOT/config.json.next" "$ROOT/config.json"
    printf 'updated: reviewed host configuration installed\n'; exit 0
  fi
  local current=''
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
    [[ -z "$(docker ps -q --filter "label=com.docker.compose.project=kids-booklet-$ENVIRONMENT" --filter 'label=com.docker.compose.oneoff=True')" ]] || die 'Maintenance containers remain active'
    # Retry the exact recorded operation. In particular, never clear maintenance
    # over a partially restored database merely because the old image starts.
    REQUEST_ID="$old_id"
    flock -u 9
    if systemctl cat "kids-booklet-operation-$old_id.service" >/dev/null 2>&1; then
      systemctl restart "kids-booklet-operation-$old_id.service"
    else
      systemd-run --unit="kids-booklet-operation-$old_id" --property=Type=exec --property=UMask=0077 "$ROOT/vps-deployment.sh" --action host-run --request-id "$old_id" --apply
    fi
    wait_operation
    exit 0
  fi
  [[ ! -f "$STATE/operation.json" ]] || die 'Unresolved operation exists; use resume'
  [[ "$ACTION" != deploy || "${IMAGE_DIGEST%@*}" == "$(jq -r .image "$CONFIG_FILE")" ]] || die 'Image repository does not match configured project'
  REQUEST_ID="${REQUEST_ID:-$(date +%s)-$$}"
  [[ ! -f "$STATE/operations/$REQUEST_ID.json" ]] || die 'Request ID already completed'
  jq -n --arg requestId "$REQUEST_ID" --arg action "$ACTION" --arg environment "$ENVIRONMENT" --arg image "$IMAGE_DIGEST" --arg commit "$COMMIT" --arg backupId "$BACKUP_ID" --arg confirmation "$CONFIRMATION" '{requestId:$requestId,action:$action,environment:$environment,image:$image,commit:$commit,backupId:$backupId,confirmation:$confirmation,step:"queued"}' > "$STATE/operation.json"
  flock -u 9
  systemd-run --unit="kids-booklet-operation-$REQUEST_ID" --property=Type=exec --property=UMask=0077 "$ROOT/vps-deployment.sh" --action host-run --request-id "$REQUEST_ID" --apply
  wait_operation
}
wait_operation() {
  local active
  while :; do
    active="$(systemctl show --property=ActiveState --value "kids-booklet-operation-$REQUEST_ID.service")"
    case "$active" in active|activating|reloading|deactivating) sleep 5;; *) break;; esac
  done
  [[ -f "$STATE/operations/$REQUEST_ID.json" ]] || die 'Operation failed; journal retained. Use status and resume'
  printf 'updated: %s %s\n' "$ACTION" "$ENVIRONMENT"
}
backend_init() {
  local directory="$1" key="$2"
  [[ -n "${R2_STATE_BUCKET:-}" && -n "${R2_ENDPOINT:-}" ]] || die 'R2_STATE_BUCKET and R2_ENDPOINT required'
  [[ "$R2_ENDPOINT" =~ ^https://[a-f0-9]{32}\.r2\.cloudflarestorage\.com$ ]] || die 'Invalid R2 backend endpoint'
  terraform -chdir="$directory" init -input=false "-backend-config=bucket=$R2_STATE_BUCKET" "-backend-config=key=$key" -backend-config=region=auto "-backend-config=endpoints={s3=\"$R2_ENDPOINT\"}" -backend-config=skip_credentials_validation=true -backend-config=skip_requesting_account_id=true -backend-config=skip_region_validation=true -backend-config=skip_s3_checksum=true -backend-config=use_lockfile=true
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
  jq -e '[.resource_changes[]? | select(.type=="cloudflare_ruleset") | .change.before.rules[]? | select(.ref != "application_bypass" and .ref != "next_static" and .ref != "application_api_rate")] | length == 0' "$json" >/dev/null || die 'Ruleset contains unrelated rules; preserve them through an administrator-reviewed change'
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
  export "$name"
}
load_cloudflare_api_token() {
  prompt_secret_variable CLOUDFLARE_API_TOKEN 'Cloudflare API token'
  TF_VAR_cloudflare_api_token="$CLOUDFLARE_API_TOKEN"
  export TF_VAR_cloudflare_api_token
}
load_r2_state_credentials() {
  local value="${AWS_ACCESS_KEY_ID:-}"
  while [[ ! "$value" =~ ^[A-Za-z0-9]{32}$ ]]; do
    [[ -z "$value" ]] || printf 'error: R2 Terraform access key ID must be 32 letters or digits\n' >&2
    [[ -t 0 ]] || die 'R2 Terraform access key ID is required through the protected runtime environment'
    IFS= read -r -s -p 'R2 Terraform access key ID: ' value; printf '\n' >&2
  done
  AWS_ACCESS_KEY_ID="$value"
  export AWS_ACCESS_KEY_ID
  prompt_secret_variable AWS_SECRET_ACCESS_KEY 'R2 Terraform secret access key'
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
  local account_id="$1" token_id token_status
  [[ "$account_id" =~ ^[a-f0-9]{32}$ ]] || die 'A valid Cloudflare account ID is required for token verification'
  cloudflare_get "accounts/$account_id/tokens/verify"
  token_id="$(jq -er '.result.id | select(type == "string" and test("^[a-f0-9]{32}$"))' "$CF_RESPONSE")" || die 'Cloudflare did not return a valid token metadata ID'
  token_status="$(jq -er '.result.status' "$CF_RESPONSE")" || die 'Cloudflare did not return a token status'
  [[ "$token_status" == active ]] || die "Cloudflare API token is $token_status"
  printf 'verified: Cloudflare API token metadata ID %s\n' "$token_id"
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
  local method="$1" path="$2" payload="${3:-}" config
  private_temp; config="$TEMP_DIR/atlas-curl.conf"
  printf 'silent\nshow-error\ndigest\nuser = "%s:%s"\nheader = "Accept: application/vnd.atlas.2025-03-12+json"\nheader = "Content-Type: application/json"\n' "$ATLAS_PUBLIC_KEY" "$ATLAS_PRIVATE_KEY" > "$config"
  chmod 600 "$config"
  ATLAS_RESPONSE="$TEMP_DIR/atlas-response.json"
  local -a args=(--config "$config" --request "$method" --output "$ATLAS_RESPONSE" --write-out '%{http_code}')
  [[ -z "$payload" ]] || args+=(--data-binary "@$payload")
  ATLAS_STATUS="$(curl "${args[@]}" "https://cloud.mongodb.com/api/atlas/v2/$path")"
  [[ "$ATLAS_STATUS" == 200 || "$ATLAS_STATUS" == 201 ]] || die "Atlas request failed for $path (HTTP $ATLAS_STATUS)"
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
  jq -n --arg account "$TF_VAR_cloudflare_account_id" --arg zone "$TF_VAR_cloudflare_zone_id" --arg deploy "$DEPLOY_HOSTNAME" --arg project "$project" --arg cluster "$cluster" --arg staging "$STAGING_HOSTNAME" --arg prod "$PROD_HOSTNAME" '{repository:"karpishe-experiments/agentic-poc",image:"ghcr.io/karpishe-experiments/agentic-poc",cloudflare_account_id:$account,cloudflare_zone_id:$zone,deploy_hostname:$deploy,state_bucket:"kids-booklet-terraform-state",atlas_project_id:$project,atlas_cluster_name:$cluster,environments:{staging:{APP_HOSTNAME:$staging,ASSETS_BUCKET:"kids-booklet-staging-assets",DIAGNOSTICS_BUCKET:"kids-booklet-staging-diagnostics",RECOVERY_BUCKET:"kids-booklet-staging-recovery"},prod:{APP_HOSTNAME:$prod,ASSETS_BUCKET:"kids-booklet-prod-assets",DIAGNOSTICS_BUCKET:"kids-booklet-prod-diagnostics",RECOVERY_BUCKET:"kids-booklet-prod-recovery"}}}' > "$candidate"
  if [[ -e "$CONFIG_OUTPUT" ]]; then
    cmp -s "$candidate" "$CONFIG_OUTPUT" && { printf 'exists: non-secret deployment configuration\n'; return; }
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
configure_atlas() {
  local project cluster outbound_ip environment database username password srv payload
  project="$(jq -r .atlas_project_id "$CONFIG_FILE")"; cluster="$(jq -r .atlas_cluster_name "$CONFIG_FILE")"
  outbound_ip="$(curl -fsS --max-time 15 https://api.ipify.org)"
  [[ "$outbound_ip" =~ ^[0-9a-fA-F:.]+$ ]] || die 'Could not verify the VPS outbound IP'
  atlas_request GET "groups/$project/accessList?itemsPerPage=100"
  if jq -e --arg ip "$outbound_ip" '.results[]? | select(.ipAddress==$ip)' "$ATLAS_RESPONSE" >/dev/null; then
    printf 'exists: exact VPS Atlas access-list entry\n'
  elif [[ "$APPLY" == false ]]; then printf 'would create: exact VPS Atlas access-list entry\n'
  else
    payload="$TEMP_DIR/atlas-access.json"
    jq -n --arg ip "$outbound_ip" '[{ipAddress:$ip,comment:"kids-booklet VPS"}]' > "$payload"
    atlas_request POST "groups/$project/accessList" "$payload"
    printf 'created: exact VPS Atlas access-list entry\n'
  fi
  atlas_request GET "groups/$project/clusters/$cluster"
  srv="$(jq -er '.connectionStrings.standardSrv' "$ATLAS_RESPONSE")"
  srv="${srv#mongodb+srv://}"
  for environment in staging prod; do
    database=kids_booklet; [[ "$environment" == staging ]] || database=kids_booklet_prod
    username="kids_booklet_$environment"
    atlas_request GET "groups/$project/databaseUsers?itemsPerPage=100"
    if jq -e --arg username "$username" '.results[]? | select(.username==$username and .databaseName=="admin")' "$ATLAS_RESPONSE" >/dev/null; then
      jq -e --arg username "$username" --arg database "$database" --arg cluster "$cluster" '.results[] | select(.username==$username and .databaseName=="admin") | ([.roles[] | select(.roleName=="readWrite" and .databaseName==$database)] | length)==1 and ([.roles[] | select(.databaseName!=$database or .roleName!="readWrite")] | length)==0 and ([.scopes[]? | select(.type=="CLUSTER" and .name==$cluster)] | length)==1' "$ATLAS_RESPONSE" >/dev/null || die "$environment Atlas user exists with incompatible scope or roles"
      if [[ -f "$STATE/atlas-$environment-uri.pending" ]]; then GENERATED_MONGODB_URI[$environment]="$(<"$STATE/atlas-$environment-uri.pending")"; fi
      printf 'exists: %s Atlas database user with exact scope\n' "$environment"
    elif [[ "$APPLY" == false ]]; then printf 'would create: %s Atlas database user\n' "$environment"
    else
      password="$(openssl rand -hex 24)"
      payload="$TEMP_DIR/atlas-user-$environment.json"
      jq -n --arg username "$username" --arg password "$password" --arg database "$database" --arg cluster "$cluster" '{databaseName:"admin",username:$username,password:$password,roles:[{databaseName:$database,roleName:"readWrite"}],scopes:[{name:$cluster,type:"CLUSTER"}]}' > "$payload"
      atlas_request POST "groups/$project/databaseUsers" "$payload"
      GENERATED_MONGODB_URI[$environment]="mongodb+srv://$username:$password@$srv/$database?retryWrites=true&w=majority"
      printf '%s' "${GENERATED_MONGODB_URI[$environment]}" > "$STATE/atlas-$environment-uri.pending"
      chmod 600 "$STATE/atlas-$environment-uri.pending"
      unset password
      printf 'created: %s Atlas database user\n' "$environment"
    fi
  done
}
assert_no_unmanaged_cloudflare_resources() {
  local account="$TF_VAR_cloudflare_account_id" zone="$TF_VAR_cloudflare_zone_id" name environment kind hostname phase
  for environment in staging prod; do
    for kind in assets diagnostics recovery; do
      name="kids-booklet-$environment-$kind"
      cloudflare_get "accounts/$account/r2/buckets/$name"
      [[ "$CF_STATUS" == 404 ]] || die "R2 bucket $name exists without Terraform state; import or choose a clean project"
    done
  done
  cloudflare_get "accounts/$account/cfd_tunnel?name=kids-booklet-vps&is_deleted=false"
  [[ "$CF_STATUS" == 200 && "$(jq '.result | length' "$CF_RESPONSE")" == 0 ]] || die 'A kids-booklet Tunnel exists without Terraform state; verify ownership and import it'
  for hostname in "$TF_VAR_staging_hostname" "$TF_VAR_prod_hostname" "$TF_VAR_deploy_hostname"; do
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
verify_cloudflare_ownership() {
  local state phase address expected environment kind name hostname key present
  state="$(terraform -chdir="$REPO_ROOT/infra/terraform" state list 2>/dev/null || true)"
  if [[ -z "$state" ]]; then assert_no_unmanaged_cloudflare_resources; return; fi
  for environment in staging prod; do
    for kind in assets diagnostics recovery; do
      name="kids-booklet-$environment-$kind"; address="cloudflare_r2_bucket.bucket[\"$name\"]"
      cloudflare_get "accounts/$TF_VAR_cloudflare_account_id/r2/buckets/$name"; present=false; [[ "$CF_STATUS" == 404 ]] || present=true
      if grep -Fqx "$address" <<< "$state"; then [[ "$present" == true ]] || die "Terraform tracks missing R2 bucket $name"; else [[ "$present" == false ]] || die "R2 bucket $name exists outside Terraform state"; fi
    done
  done
  cloudflare_get "accounts/$TF_VAR_cloudflare_account_id/cfd_tunnel?name=kids-booklet-vps&is_deleted=false"; present=false; [[ "$(jq '.result | length' "$CF_RESPONSE")" == 0 ]] || present=true
  if grep -qx 'cloudflare_zero_trust_tunnel_cloudflared.vps' <<< "$state"; then [[ "$present" == true ]] || die 'Terraform tracks a missing Tunnel'; else [[ "$present" == false ]] || die 'The project Tunnel exists outside Terraform state'; fi
  cloudflare_get "accounts/$TF_VAR_cloudflare_account_id/access/apps"; present=false
  [[ "$(jq --arg hostname "$TF_VAR_deploy_hostname" '[.result[]? | select(.domain==$hostname)] | length' "$CF_RESPONSE")" == 0 ]] || present=true
  if grep -qx 'cloudflare_zero_trust_access_application.deployment' <<< "$state"; then [[ "$present" == true ]] || die 'Terraform tracks a missing deployment Access application'; else [[ "$present" == false ]] || die 'The deployment Access application exists outside Terraform state'; fi
  for key in staging prod deploy; do
    case "$key" in staging) hostname="$TF_VAR_staging_hostname";; prod) hostname="$TF_VAR_prod_hostname";; deploy) hostname="$TF_VAR_deploy_hostname";; esac
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
      jq -e --argjson expected "$expected" '([.result.rules[]?.ref] | sort) == ($expected | sort)' "$CF_RESPONSE" >/dev/null || die "The $phase entrypoint contains rules outside this project"
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
    verify_bootstrap_state_ownership
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
verify_bootstrap_state_ownership() {
  local directory="$TEMP_DIR/bootstrap-remote"
  mkdir -p "$directory"
  cp "$REPO_ROOT/infra/terraform/bootstrap/"*.tf "$directory/"
  cp "$REPO_ROOT/infra/terraform/bootstrap/.terraform.lock.hcl" "$directory/"
  printf 'terraform { backend "s3" {} }\n' > "$directory/backend.generated.tf"
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
  if gh api "repos/$repository/contents/infra/config/vps.json?ref=master" > "$TEMP_DIR/master-config.json" 2>/dev/null; then
    jq -r .content "$TEMP_DIR/master-config.json" | tr -d '\n' | base64 -d > "$TEMP_DIR/master-vps.json"
    if cmp -s "$CONFIG_FILE" "$TEMP_DIR/master-vps.json"; then printf 'exists: reviewed configuration merged to master\n'; return; fi
  fi
  if [[ "$(gh pr list --repo "$repository" --head agent/deployment-config --base master --state open --json number --jq length)" -gt 0 ]]; then printf 'would update: existing configuration pull request\n'; else printf 'would create: configuration pull request\n'; fi
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
  tar -C "$REPO_ROOT" -cf "$TEMP_DIR/host-bundle.tar" scripts/deploy/vps-deployment.sh deploy/compose.yml deploy/compose.staging.yml deploy/compose.prod.yml infra/config/vps.json
  configure_ssh
  local -a remote=(--action sync-host --request-id "$REQUEST_ID" --apply)
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o 'ProxyCommand=cloudflared access ssh --hostname %h' "$VPS_USER@$VPS_HOST" "${remote[@]}" < "$TEMP_DIR/host-bundle.tar"
}
terraform_operation() {
  need_command terraform; need_command jq
  verify_infrastructure_head
  private_temp
  backend_init "$REPO_ROOT/infra/terraform" infrastructure.tfstate
  verify_cloudflare_ownership
  terraform -chdir="$REPO_ROOT/infra/terraform" plan -input=false -out="$TEMP_DIR/plan"
  terraform -chdir="$REPO_ROOT/infra/terraform" show -json "$TEMP_DIR/plan" > "$TEMP_DIR/plan.json"
  chmod 600 "$TEMP_DIR"/*
  validate_plan "$TEMP_DIR/plan.json"
  if [[ "$APPLY" == true ]]; then
    verify_infrastructure_head
    if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
      [[ -n "$VPS_HOST" && -n "$REQUEST_ID" ]] || die 'Workflow apply requires VPS host and request ID'
      COMMIT="$GITHUB_SHA"
      ACTION=infra-lock; host_call; ACTION=infrastructure
    fi
    r2_state_snapshot "$REPO_ROOT/infra/terraform" infrastructure-before
    terraform -chdir="$REPO_ROOT/infra/terraform" apply -input=false "$TEMP_DIR/plan"
    terraform -chdir="$REPO_ROOT/infra/terraform" state list >/dev/null
    r2_state_snapshot "$REPO_ROOT/infra/terraform" infrastructure-after
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
  if [[ ! -f "$directory/backend.generated.tf" ]]; then
    cloudflare_get "accounts/$TF_VAR_cloudflare_account_id/r2/buckets/$R2_STATE_BUCKET"
    if [[ "$CF_STATUS" == 200 ]]; then
      verify_bootstrap_state_ownership
      printf 'terraform { backend "s3" {} }\n' > "$directory/backend.generated.tf"
    else
      terraform -chdir="$directory" init -input=false
      terraform -chdir="$directory" plan -input=false -out=bootstrap.tfplan
      terraform -chdir="$directory" show -json bootstrap.tfplan > "$directory/plan.json"
      validate_plan "$directory/plan.json"
      terraform -chdir="$directory" apply -input=false bootstrap.tfplan
      cp "$directory/terraform.tfstate" "$directory/local-state.backup"
      printf 'terraform { backend "s3" {} }\n' > "$directory/backend.generated.tf"
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
  local environment="$1" destination="$2" name value secret_input=''
  private_temp
  if [[ -n "${DEPLOYMENT_SECRETS_DIR:-}" ]]; then
    secret_input="$DEPLOYMENT_SECRETS_DIR/$environment.json"
    [[ -d "$DEPLOYMENT_SECRETS_DIR" && "$(stat -c %a "$DEPLOYMENT_SECRETS_DIR")" == 700 && -f "$secret_input" && "$(stat -c %a "$secret_input")" == 600 ]] || die 'DEPLOYMENT_SECRETS_DIR must be mode 700 with a mode-600 environment JSON file'
    jq -e 'type=="object" and ["OPENAI_API_KEY","MONGODB_URI","ACCESS_GATE_PASSWORD","AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY"] as $names | (keys|sort)==($names|sort) and ([.[$names[]]] | all(type=="string" and length>0))' "$secret_input" >/dev/null || die 'Secret input file must contain exactly the required non-empty strings'
    jq '{services:{app:{environment:(with_entries(.value |= gsub("\\$";"$$")))}}}' "$secret_input" > "$destination"
    if [[ -n "${GENERATED_MONGODB_URI[$environment]:-}" ]]; then jq --arg value "${GENERATED_MONGODB_URI[$environment]}" '.services.app.environment.MONGODB_URI=$value' "$destination" > "$TEMP_DIR/next.json"; mv "$TEMP_DIR/next.json" "$destination"; fi
    chmod 600 "$destination"
    return
  fi
  printf '{"services":{"app":{"environment":{}}}}\n' > "$destination"
  for name in OPENAI_API_KEY MONGODB_URI ACCESS_GATE_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
    if [[ "$name" == MONGODB_URI && -n "${GENERATED_MONGODB_URI[$environment]:-}" ]]; then value="${GENERATED_MONGODB_URI[$environment]}"
    else IFS= read -r -s -p "$environment $name: " value; printf '\n' >&2; fi
    [[ -n "$value" ]] || die "$name cannot be empty"
    printf '%s' "$value" > "$TEMP_DIR/value"
    # JSON is valid Compose YAML. Escape dollars for Compose interpolation.
    jq --arg name "$name" --rawfile value "$TEMP_DIR/value" '.services.app.environment[$name]=($value | gsub("\\$";"$$"))' "$destination" > "$TEMP_DIR/next.json"
    mv "$TEMP_DIR/next.json" "$destination"
    unset value
  done
  chmod 600 "$destination"
}
write_secret_override() {
  local environment="$1" destination="$SECRETS/$1/secrets.json"
  [[ ! -f "$destination" ]] || { printf 'exists: %s host secret override\n' "$environment"; return; }
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
  build_secret_override "$ENVIRONMENT" "$TEMP_DIR/rotation.json"
  local -a remote=(--action stage-secrets --environment "$ENVIRONMENT" --apply)
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o 'ProxyCommand=cloudflared access ssh --hostname %h' "$VPS_USER@$VPS_HOST" "${remote[@]}" < "$TEMP_DIR/rotation.json"
  gh workflow run maintenance.yml --repo "$(jq -r .repository "$CONFIG_FILE")" --ref "_$ENVIRONMENT" -f "environment=$ENVIRONMENT" -f action=rotate-secrets
  printf 'updated: secrets staged; Maintenance rotation queued\n'
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
  terraform -chdir="$REPO_ROOT/infra/terraform" output -raw tunnel_token > "$SECRETS/tunnel.token"
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
    curl -fsSL "https://api.github.com/repos/cloudflare/cloudflared/releases/tags/$version" -o "$TEMP_DIR/release.json"
    expected="$(jq -er '.assets[] | select(.name=="cloudflared-linux-amd64") | .digest | select(startswith("sha256:"))' "$TEMP_DIR/release.json")"
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/download/$version/cloudflared-linux-amd64" -o "$TEMP_DIR/cloudflared"
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
  terraform -chdir="$REPO_ROOT/infra/terraform" output -raw deployment_client_id > "$TEMP_DIR/deployment-client-id"
  terraform -chdir="$REPO_ROOT/infra/terraform" output -raw deployment_client_secret > "$TEMP_DIR/deployment-client-secret"
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
  create_configuration_pr "$repository"
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
create_configuration_pr() {
  local repository="$1" branch=agent/deployment-config base_sha encoded existing_sha payload
  if gh api "repos/$repository/contents/infra/config/vps.json?ref=master" > "$TEMP_DIR/master-config.json" 2>/dev/null; then
    jq -r .content "$TEMP_DIR/master-config.json" | tr -d '\n' | base64 -d > "$TEMP_DIR/master-vps.json"
    if cmp -s "$CONFIG_FILE" "$TEMP_DIR/master-vps.json"; then printf 'exists: reviewed configuration merged to master\n'; return; fi
  fi
  base_sha="$(git rev-parse HEAD)"
  if gh api "repos/$repository/git/ref/heads/$branch" >/dev/null 2>&1; then
    gh api "repos/$repository/compare/master...$branch" > "$TEMP_DIR/config-compare.json"
    jq -e '[.files[]?.filename | select(. != "infra/config/vps.json")] | length == 0' "$TEMP_DIR/config-compare.json" >/dev/null || die 'The existing configuration branch contains unrelated changes'
  else
    payload="$TEMP_DIR/config-ref.json"
    jq -n --arg ref "refs/heads/$branch" --arg sha "$base_sha" '{ref:$ref,sha:$sha}' > "$payload"
    gh api --method POST "repos/$repository/git/refs" --input "$payload" >/dev/null
    printf 'created: configuration branch\n'
  fi
  encoded="$(base64 -w 0 "$CONFIG_FILE")"
  existing_sha=''
  if gh api "repos/$repository/contents/infra/config/vps.json?ref=$branch" > "$TEMP_DIR/existing-config.json" 2>/dev/null; then
    existing_sha="$(jq -r .sha "$TEMP_DIR/existing-config.json")"
    jq -r .content "$TEMP_DIR/existing-config.json" | tr -d '\n' | base64 -d > "$TEMP_DIR/existing-vps.json"
    if cmp -s "$CONFIG_FILE" "$TEMP_DIR/existing-vps.json"; then printf 'exists: reviewed configuration content\n'; encoded=''; fi
  fi
  if [[ -n "$encoded" ]]; then
    payload="$TEMP_DIR/config-content.json"
    jq -n --arg message 'Configure VPS deployment' --arg content "$encoded" --arg branch "$branch" --arg sha "$existing_sha" '{message:$message,content:$content,branch:$branch} + (if $sha=="" then {} else {sha:$sha} end)' > "$payload"
    gh api --method PUT "repos/$repository/contents/infra/config/vps.json" --input "$payload" >/dev/null
    printf 'updated: configuration branch content\n'
  fi
  if [[ "$(gh pr list --repo "$repository" --head "$branch" --base master --state open --json number --jq length)" == 0 ]]; then
    gh pr create --repo "$repository" --head "$branch" --base master --title 'Configure VPS deployment' --body 'Adds the reviewed, non-secret VPS and provider resource identifiers required by the deployment workflows.' >/dev/null
    printf 'created: configuration pull request\n'
  else printf 'exists: configuration pull request\n'; fi
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
    credential-session) start_credential_session;;
    clear-credential-session) clear_credential_session;;
    setup) setup_host;;
    finalize) finalize_repository;;
    rotate-secrets)
      if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
        if [[ -f "$CONFIG_FILE" ]]; then load_config; fi
        [[ -n "$VPS_HOST" ]] || die 'Supply --vps-host or configuration'
        host_call
      else stage_and_trigger_rotation; fi;;
    infrastructure) terraform_operation;;
    *)
      if [[ -f "$CONFIG_FILE" ]]; then load_config; fi
      [[ -n "$VPS_HOST" ]] || die 'Supply --vps-host or configuration'
      if [[ "$APPLY" == false && "$ACTION" != check && "$ACTION" != status ]]; then
        printf 'would update: %s %s\n' "$ACTION" "$ENVIRONMENT"
      else host_call; fi;;
  esac
}
if [[ "${VPS_DEPLOYMENT_LIBRARY_ONLY:-false}" != true ]]; then main "$@"; fi
