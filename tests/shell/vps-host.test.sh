#!/usr/bin/env bash
# Variables below are read by the sourced host functions.
# shellcheck disable=SC2034
set -euo pipefail
# Each scenario runs in a separate Bash process so expected-failure assertions
# cannot accidentally disable errexit inside the lifecycle being tested.
if [[ $# -eq 0 ]]; then
  for scenario in release first-release rollback-on-readiness maintenance-preserves-rollback backup-history operation-result secret-rotation interrupted-secret-rotation stale-infrastructure secret-serialization secret-prompt secret-schema first-activation-secret-repair preactivation-secret-repair dispatch-rejection journal-retention reset-guard plan-guard; do
    bash "$0" "$scenario"
  done
  echo 'host lifecycle, secret serialization, dispatch and plan contracts passed'
  exit 0
fi
export VPS_DEPLOYMENT_LIBRARY_ONLY=true
# shellcheck source=../../scripts/deploy/vps-deployment.sh
source scripts/deploy/vps-deployment.sh
TEMP_DIR="$(mktemp -d)"
ROOT="$TEMP_DIR/root" STATE="$TEMP_DIR/state" SECRETS="$TEMP_DIR/secrets"
ENVIRONMENT=staging COMMIT=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
IMAGE_DIGEST=ghcr.io/example/kids@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
REQUEST_ID=test ACTION=deploy APPLY=true
mkdir -p "$ROOT/deploy" "$STATE/operations" "$STATE/releases/staging/old" "$SECRETS/staging"
CALLS="$TEMP_DIR/calls"; : > "$CALLS"
CONFIG_FILE="$TEMP_DIR/config.json"
jq -n '{image:"ghcr.io/example/kids",environments:{staging:{APP_HOSTNAME:"staging.example.com"}}}' > "$CONFIG_FILE"
printf '%s\n' "$STATE/releases/staging/old" > "$STATE/releases/staging/current"
printf '{"requestId":"test"}' > "$STATE/operation.json"
jq -n --arg image "$IMAGE_DIGEST" '{services:{app:{image:$image}}}' > "$STATE/releases/staging/old/image.json"
printf 'old manifest\n' > "$STATE/releases/staging/old/manifest.sha256"
prepare_release() {
  mkdir -p "$STATE/releases/$ENVIRONMENT/$COMMIT"
  cp "$STATE/releases/staging/old/image.json" "$STATE/releases/$ENVIRONMENT/$COMMIT/image.json"
  printf 'candidate manifest\n' > "$STATE/releases/$ENVIRONMENT/$COMMIT/manifest.sha256"
  printf 'prepare\n' >> "$CALLS"
}
compose() { printf 'compose %s\n' "$*" >> "$CALLS"; }
maintenance() { printf 'maintenance %s\n' "$*" >> "$CALLS"; }
docker() { printf 'docker %s\n' "$*" >> "$CALLS"; }
verify_application() { printf 'verify %s\n' "$1" >> "$CALLS"; }
stop_application() { printf 'stop %s\n' "$1" >> "$CALLS"; }
case "$1" in
  release)
    run_lifecycle
    test -f "$STATE/operations/test.json"
    test ! -f "$STATE/operation.json"
    calls="$(cat "$CALLS")"
    [[ "$calls" == *'deployment-control enable'*'wait-for-deployment-drain'*'stop '*'recovery backup'*'initialize-deployment'*'up -d'*'verify '*'deployment-control disable'* ]]
    grep -q "$COMMIT" "$STATE/releases/staging/current";;
  first-release)
    rm "$STATE/releases/staging/current"
    run_lifecycle
    calls="$(cat "$CALLS")"
    [[ "$calls" == *initialize-deployment* ]]
    if grep -q 'recovery backup' "$CALLS"; then exit 1; fi;;
  rollback-on-readiness)
    # Run a child with real errexit to capture the failure and persisted journal.
    cat > "$TEMP_DIR/failure.sh" <<'CHILD'
export VPS_DEPLOYMENT_LIBRARY_ONLY=true
source scripts/deploy/vps-deployment.sh
ROOT="$FIXTURE/root" STATE="$FIXTURE/state" SECRETS="$FIXTURE/secrets"
ENVIRONMENT=staging COMMIT=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa REQUEST_ID=test ACTION=deploy
IMAGE_DIGEST=ghcr.io/example/kids@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
prepare_release() {
  mkdir -p "$STATE/releases/staging/$COMMIT"
  cp "$STATE/releases/staging/old/image.json" "$STATE/releases/staging/$COMMIT/image.json"
  printf 'candidate manifest\n' > "$STATE/releases/staging/$COMMIT/manifest.sha256"
}
docker() { :; }
compose() { printf 'compose %s\n' "$*" >> "$FIXTURE/failure-calls"; }
maintenance() { printf 'maintenance %s\n' "$*" >> "$FIXTURE/failure-calls"; }
stop_application() { printf 'stop %s\n' "$*" >> "$FIXTURE/failure-calls"; }
verify_application() { [[ "$1" == */old ]]; }
run_lifecycle
CHILD
    export FIXTURE="$TEMP_DIR"
    if bash "$TEMP_DIR/failure.sh" >/dev/null 2>&1; then echo 'failed readiness returned success'; exit 1; fi
    test -f "$STATE/operation.json"
    grep -q '/old up -d' "$TEMP_DIR/failure-calls"
    grep -q '/old deployment-control disable' "$TEMP_DIR/failure-calls";;
  maintenance-preserves-rollback)
    mkdir -p "$STATE/releases/staging/release-a" "$STATE/releases/staging/release-b"
    printf '%s\n' "$STATE/releases/staging/release-a" > "$STATE/releases/staging/previous"
    printf '%s\n' "$STATE/releases/staging/release-b" > "$STATE/releases/staging/current"
    REQUEST_ID=maintenance-preserves-rollback
    save_success "$STATE/releases/staging/release-b"
    [[ "$(<"$STATE/releases/staging/previous")" == "$STATE/releases/staging/release-a" ]]
    [[ "$(<"$STATE/releases/staging/current")" == "$STATE/releases/staging/release-b" ]];;
  backup-history)
    jq '.backupId="staging-prior"' "$STATE/operation.json" > "$STATE/operation.next.json"; mv "$STATE/operation.next.json" "$STATE/operation.json"
    BACKUP_ID=''
    ensure_backup_id
    jq -e '.backupId!="staging-prior" and (.backupHistory | index("staging-prior"))' "$STATE/operation.json" >/dev/null;;
  operation-result)
    jq -n '{requestId:"test",action:"backup",environment:"staging",backupId:"staging-backup",step:"complete"}' > "$STATE/operations/test.json"
    ACTION=backup
    systemctl() { printf 'inactive\n'; }
    result="$(wait_operation)"
    [[ "$result" == *'updated: backup staging'* ]]
    result_json="${result##*result: }"
    jq -e '.requestId=="test" and .action=="backup" and .environment=="staging" and .backupId=="staging-backup" and .step=="complete"' <<< "$result_json" >/dev/null;;
  secret-rotation)
    ACTION=rotate-secrets
    mkdir -p "$STATE/releases/staging/release-a"
    printf '%s\n' "$STATE/releases/staging/release-a" > "$STATE/releases/staging/previous"
    printf '{"services":{"app":{"environment":{"OPENAI_API_KEY":"old"}}}}\n' > "$SECRETS/staging/secrets.json"
    printf '{"services":{"app":{"environment":{"OPENAI_API_KEY":"new"}}}}\n' > "$SECRETS/staging/secrets.pending.json"
    validate_compose() { :; }
    run_lifecycle
    test ! -f "$SECRETS/staging/secrets.pending.json"
    jq -e '.services.app.environment.OPENAI_API_KEY=="new"' "$SECRETS/staging/secrets.json" >/dev/null
    [[ "$(<"$STATE/releases/staging/previous")" == "$STATE/releases/staging/release-a" ]];;
  interrupted-secret-rotation)
    ACTION=rotate-secrets
    printf '{"services":{"app":{"environment":{"OPENAI_API_KEY":"new"}}}}\n' > "$SECRETS/staging/secrets.json"
    printf '{"services":{"app":{"environment":{"OPENAI_API_KEY":"old"}}}}\n' > "$SECRETS/staging/secrets.previous.json"
    recover_interrupted_rotation
    test ! -f "$SECRETS/staging/secrets.previous.json"
    jq -e '.services.app.environment.OPENAI_API_KEY=="old"' "$SECRETS/staging/secrets.json" >/dev/null
    grep -q 'stop ' "$CALLS";;
  stale-infrastructure)
    export GITHUB_ACTIONS=true GITHUB_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa GITHUB_REPOSITORY=example/kids GH_TOKEN=test
    git() { printf '%s\n' "$GITHUB_SHA"; }
    gh() { printf '%s\n' bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; }
    if (verify_infrastructure_head) >/dev/null 2>&1; then echo 'accepted stale infrastructure commit'; exit 1; fi;;
  secret-serialization)
    if [[ "$(uname -s)" == MINGW* ]]; then
      # Windows Git Bash cannot apply Unix ownership; CI exercises real install.
      install() { if [[ "$1" == -d ]]; then mkdir -p "$4"; else cp "$3" "$4"; fi; }
    fi
    printf '%s\n' 'key$with$dollars' 'mongodb://user:p@db' 'long-password-"quoted"' '0123456789abcdef0123456789abcdef' '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' | write_secret_override staging
    jq -e '.services.app.environment.OPENAI_API_KEY == "key$$with$$dollars" and .services.app.environment.ACCESS_GATE_PASSWORD == "long-password-\"quoted\""' "$SECRETS/staging/secrets.json" >/dev/null
    [[ "$(stat -c %a "$SECRETS/staging/secrets.json")" == 600 ]] || [[ "$(uname -s)" == MINGW* ]];;
  secret-prompt)
    value=''
    prompt_output="$(printf '%s\n' short sixteen-chars-ok! | { prompt_application_secret staging ACCESS_GATE_PASSWORD value; printf '%s' "$value"; } 2>&1)"
    grep -q 're-enter only this value' <<< "$prompt_output"
    grep -q 'sixteen-chars-ok!' <<< "$prompt_output"
    GENERATE_PASSWORD=true
    interactive_terminal() { :; }
    openssl() { printf '%s\n' generated-password-value-123456; }
    display_generated_password() { printf 'displayed %s %s\n' "$1" "$2" >> "$CALLS"; }
    generated=''
    prompt_application_secret staging ACCESS_GATE_PASSWORD generated
    [[ "$generated" == generated-password-value-123456 ]]
    grep -q 'displayed staging generated-password-value-123456' "$CALLS";;
  secret-schema)
    compose() { printf '%s\n' '{"services":{"app":{"environment":{"OPENAI_API_KEY":"key","MONGODB_URI":"mongodb://db","ACCESS_GATE_PASSWORD":"short","AWS_ACCESS_KEY_ID":"0123456789abcdef0123456789abcdef","AWS_SECRET_ACCESS_KEY":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}}}}'; }
    if (validate_compose unused) >/dev/null 2>&1; then echo 'accepted short access password'; exit 1; fi
    compose() { printf '%s\n' '{"services":{"app":{"environment":{"OPENAI_API_KEY":"key","MONGODB_URI":"mongodb://db","ACCESS_GATE_PASSWORD":"sixteen-chars-ok!","AWS_ACCESS_KEY_ID":"0123456789abcdef0123456789abcdef","AWS_SECRET_ACCESS_KEY":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}}}}'; }
    validate_compose unused
    compose > "$SECRETS/staging/secrets.json"
    application_secret_override_is_valid "$SECRETS/staging/secrets.json"
    jq '.services.app.environment.DIFY_TOOL_KEY="0123456789abcdef0123456789abcdef" | .services.app.environment.DIFY_API_KEY="dify-test-key" | .services.app.environment.DIFY_IMAGE_OPENAI_API_KEY="image-test-key"' "$SECRETS/staging/secrets.json" > "$TEMP_DIR/optional.json"
    application_secret_override_is_valid "$TEMP_DIR/optional.json"
    jq '.services.app.environment.DIFY_TOOL_KEY="short"' "$TEMP_DIR/optional.json" > "$TEMP_DIR/invalid-optional.json"
    if application_secret_override_is_valid "$TEMP_DIR/invalid-optional.json"; then echo 'accepted a short Dify tool key'; exit 1; fi
    jq -n '{services:{app:{environment:{DIFY_TOOL_KEY:"0123456789abcdef0123456789abcdef"}}}}' > "$TEMP_DIR/optional-patch.json"
    jq -s '.[0] * .[1]' "$SECRETS/staging/secrets.json" "$TEMP_DIR/optional-patch.json" > "$TEMP_DIR/merged-optional.json"
    application_secret_override_is_valid "$TEMP_DIR/merged-optional.json"
    mkdir -m 700 "$TEMP_DIR/secret-input"
    jq '.services.app.environment' "$TEMP_DIR/optional.json" > "$TEMP_DIR/secret-input/staging.json"
    chmod 600 "$TEMP_DIR/secret-input/staging.json"
    DEPLOYMENT_SECRETS_DIR="$TEMP_DIR/secret-input" build_secret_override staging "$TEMP_DIR/generated-optional.json"
    application_secret_override_is_valid "$TEMP_DIR/generated-optional.json"
    jq '.DIFY_TOOL_KEY="short"' "$TEMP_DIR/secret-input/staging.json" > "$TEMP_DIR/secret-input/invalid.json"
    mv "$TEMP_DIR/secret-input/invalid.json" "$TEMP_DIR/secret-input/staging.json"
    chmod 600 "$TEMP_DIR/secret-input/staging.json"
    if (DEPLOYMENT_SECRETS_DIR="$TEMP_DIR/secret-input" build_secret_override staging "$TEMP_DIR/rejected-optional.json") >/dev/null 2>&1; then echo 'accepted a short Dify tool key in flat input'; exit 1; fi
    printf '%s\n' '{"services":{"app":{"environment":{"OPENAI_API_KEY":"key","MONGODB_URI":"uri","ACCESS_GATE_PASSWORD":"short","AWS_ACCESS_KEY_ID":"access","AWS_SECRET_ACCESS_KEY":"secret"}}}}' > "$SECRETS/staging/secrets.json"
    if (write_secret_override staging) >/dev/null 2>&1; then echo 'accepted existing invalid host secret override'; exit 1; fi;;
  first-activation-secret-repair)
    require_root() { :; }; load_config() { :; }; flock() { :; }
    systemctl() { return 1; }
    docker() { :; }
    rm -f "$STATE/releases/staging/current"
    jq -n '{requestId:"failed",action:"deploy",environment:"staging",step:"initializing"}' > "$STATE/operation.json"
    export SSH_ORIGINAL_COMMAND='--action repair-first-activation-secrets --environment staging --apply'
    secret_payload='{"services":{"app":{"environment":{"OPENAI_API_KEY":"key","MONGODB_URI":"mongodb://db","ACCESS_GATE_PASSWORD":"sixteen-chars-ok!","AWS_ACCESS_KEY_ID":"0123456789abcdef0123456789abcdef","AWS_SECRET_ACCESS_KEY":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}}}}'
    (host_dispatch) <<< "$secret_payload" >/dev/null
    jq -e '.services.app.environment.ACCESS_GATE_PASSWORD=="sixteen-chars-ok!"' "$SECRETS/staging/secrets.json" >/dev/null
    jq -e '.requestId=="failed" and .step=="initializing"' "$STATE/operation.json" >/dev/null
    export SSH_ORIGINAL_COMMAND='--action repair-first-activation-secrets --environment staging --secret-name ACCESS_GATE_PASSWORD --apply'
    outbound_payload="$TEMP_DIR/outbound-secrets.json"
    printf '%s\n' '{"services":{"app":{"environment":{"ACCESS_GATE_PASSWORD":"replacement-pass!"}}}}' > "$outbound_payload"
    (TEMP_DIR=''; host_dispatch) < "$outbound_payload" >/dev/null
    jq -e '.services.app.environment.ACCESS_GATE_PASSWORD=="replacement-pass!" and .services.app.environment.OPENAI_API_KEY=="key"' "$SECRETS/staging/secrets.json" >/dev/null;;
  preactivation-secret-repair)
    require_root() { :; }; load_config() { :; }; flock() { :; }
    systemctl() { return 1; }
    docker() { :; }
    rm -f "$STATE/releases/staging/current" "$STATE/operation.json"
    printf '%s\n' '{"services":{"app":{"environment":{"OPENAI_API_KEY":"key","MONGODB_URI":"mongodb://db","ACCESS_GATE_PASSWORD":"short-password","AWS_ACCESS_KEY_ID":"0123456789abcdef0123456789abcdef","AWS_SECRET_ACCESS_KEY":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}}}}' > "$SECRETS/staging/secrets.json"
    export SSH_ORIGINAL_COMMAND='--action repair-first-activation-secrets --environment staging --secret-name ACCESS_GATE_PASSWORD --apply'
    outbound_payload="$TEMP_DIR/outbound-secrets.json"
    printf '%s\n' '{"services":{"app":{"environment":{"ACCESS_GATE_PASSWORD":"replacement-pass!"}}}}' > "$outbound_payload"
    repair_output="$(TEMP_DIR=''; host_dispatch < "$outbound_payload")"
    grep -q 'updated: staging pre-activation secrets' <<< "$repair_output"
    jq -e '.services.app.environment.ACCESS_GATE_PASSWORD=="replacement-pass!" and .services.app.environment.OPENAI_API_KEY=="key"' "$SECRETS/staging/secrets.json" >/dev/null
    test ! -f "$STATE/operation.json";;
  dispatch-rejection)
    require_root() { :; }
    export SSH_ORIGINAL_COMMAND='--action deploy;id'
    if (host_dispatch) >/dev/null 2>&1; then echo 'accepted command injection'; exit 1; fi
    export SSH_ORIGINAL_COMMAND='--action host-run --request-id injected --apply'
    if (host_dispatch) >/dev/null 2>&1; then echo 'accepted privileged action'; exit 1; fi;;
  journal-retention)
    require_root() { :; }; load_config() { :; }; flock() { :; }
    export SSH_ORIGINAL_COMMAND='--action backup --environment staging --apply'
    if (host_dispatch) >/dev/null 2>&1; then echo 'overwrote unresolved journal'; exit 1; fi
    jq -e '.requestId=="test"' "$STATE/operation.json" >/dev/null;;
  reset-guard)
    ACTION=reset-staging ENVIRONMENT=prod CONFIRMATION=kids_booklet
    if (validate_arguments) >/dev/null 2>&1; then echo 'accepted production reset'; exit 1; fi;;
  plan-guard)
    printf '{"resource_changes":[{"type":"cloudflare_r2_bucket","change":{"actions":["delete","create"]}}]}' > "$TEMP_DIR/plan.json"
    if (validate_plan "$TEMP_DIR/plan.json") >/dev/null 2>&1; then echo 'accepted protected replacement'; exit 1; fi
    printf '{"resource_changes":[{"type":"cloudflare_zero_trust_access_policy","change":{"actions":["update"]}}]}' > "$TEMP_DIR/plan.json"
    if (validate_plan "$TEMP_DIR/plan.json") >/dev/null 2>&1; then echo 'accepted Access boundary change'; exit 1; fi;;
  *) exit 1;;
esac
