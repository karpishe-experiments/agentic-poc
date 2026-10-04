#!/usr/bin/env bash
# Variables below are read by the sourced host functions.
# shellcheck disable=SC2034
set -euo pipefail
# Each scenario runs in a separate Bash process so expected-failure assertions
# cannot accidentally disable errexit inside the lifecycle being tested.
if [[ $# -eq 0 ]]; then
  for scenario in release first-release rollback-on-readiness maintenance-preserves-rollback backup-history operation-result secret-rotation interrupted-secret-rotation stale-infrastructure secret-serialization secret-prompt secret-schema booklet-runner-staging community-probe-staging first-activation-secret-repair preactivation-secret-repair dispatch-rejection journal-retention reset-profile reset-recovery reset-guard plan-guard; do
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
# The sourced host lifecycle calls this stub with arguments.
# shellcheck disable=SC2120
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
  booklet-runner-staging)
    require_root() { :; }; load_config() { :; }; flock() { :; }
    rm "$STATE/operation.json"
    bindings="$(jq -cn '[["manager",null,null],["specialist","J01",null],["specialist","J02",null],["tester",null,"playful_kid"],["tester",null,"enthusiast_parent"],["tester",null,"professional_creator"]]|to_entries|map({role:.value[0],taskId:.value[1],persona:.value[2],appId:("00000000-0000-4000-8000-00000000000"+(.key+1|tostring)),publishedWorkflowId:"00000000-0000-4000-8000-000000000099",toolProviderId:null,apiKey:"private$fixture"})')"
    export GITHUB_ACTIONS=true
    DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$(jq -cn --arg bindings "$bindings" '{DIFY_BOOKLET_RUNNER_ENABLED:"false",DIFY_BOOKLET_BASE_URL:"https://dify.uniwares.co.uk",DIFY_BOOKLET_PUBLIC_ORIGIN:"https://booklet-staging.uniwares.co.uk",DIFY_BOOKLET_TOOL_KEY:("x"*32),DIFY_BOOKLET_BINDINGS_JSON:$bindings}')"
    export DIFY_BOOKLET_RUNNER_SETTINGS_JSON
    build_booklet_runner_patch staging "$TEMP_DIR/runner.json"
    booklet_runner_patch_is_valid "$TEMP_DIR/runner.json"
    expanded_bindings="$(jq -c '. + (["J03","J04","J05","J06","J07"]|to_entries|map({role:"specialist",taskId:.value,persona:null,appId:("00000000-0000-4000-8000-0000000000"+(.key+10|tostring)),publishedWorkflowId:"00000000-0000-4000-8000-000000000099",toolProviderId:null,apiKey:"private$fixture"}))' <<< "$bindings")"
    expanded_settings="$(jq -c --arg bindings "$expanded_bindings" '.DIFY_BOOKLET_BINDINGS_JSON=$bindings' <<< "$DIFY_BOOKLET_RUNNER_SETTINGS_JSON")"
    (DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$expanded_settings" build_booklet_runner_patch staging "$TEMP_DIR/expanded-runner.json")
    booklet_runner_patch_is_valid "$TEMP_DIR/expanded-runner.json"
    jq -e '.services.app.environment.DIFY_BOOKLET_BINDINGS_JSON|fromjson|length==11' "$TEMP_DIR/expanded-runner.json" >/dev/null
    for mutation in '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[0:10]|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[10].taskId="J03"|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[10].appId=.[0].appId|tojson)'; do
      invalid="$(jq -c "$mutation" <<< "$expanded_settings")"
      if (DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$invalid" build_booklet_runner_patch staging "$TEMP_DIR/rejected.json") >/dev/null 2>&1; then echo 'accepted invalid expanded runner settings'; exit 1; fi
    done
    jq -e '.services.app.environment.DIFY_BOOKLET_BINDINGS_JSON|fromjson|all(.apiKey=="private$$fixture")' "$TEMP_DIR/runner.json" >/dev/null
    for mutation in '.DIFY_BOOKLET_TOOL_KEY="short"' '.DIFY_BOOKLET_TOOL_KEY=("$"*16)' '.DIFY_BOOKLET_BINDINGS_JSON="bad"' '.DIFY_BOOKLET_RUNNER_ENABLED="maybe"' '.DIFY_BOOKLET_BASE_URL="https://other.example"' '.DIFY_BOOKLET_PUBLIC_ORIGIN="http://localhost"' '.DIFY_BOOKLET_UNKNOWN="extra"' 'del(.DIFY_BOOKLET_TOOL_KEY)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[1].appId=.[0].appId|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[0].role="tester"|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[0].appId="not-a-uuid"|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[0].extra=true|tojson)'; do
      invalid="$(jq -c "$mutation" <<< "$DIFY_BOOKLET_RUNNER_SETTINGS_JSON")"
      if (DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$invalid" build_booklet_runner_patch staging "$TEMP_DIR/rejected.json") >/dev/null 2>&1; then echo 'accepted invalid runner settings'; exit 1; fi
    done
    if (DIFY_BOOKLET_RUNNER_SETTINGS_JSON='' build_booklet_runner_patch staging "$TEMP_DIR/rejected.json") >/dev/null 2>&1; then echo 'accepted missing runner settings'; exit 1; fi
    if (build_booklet_runner_patch prod "$TEMP_DIR/rejected.json") >/dev/null 2>&1; then echo 'accepted production runner bundle'; exit 1; fi
    original="$(jq -cn '{services:{app:{environment:{OPENAI_API_KEY:"existing-provider",MONGODB_URI:"mongodb://db",ACCESS_GATE_PASSWORD:"sixteen-chars-ok!",AWS_ACCESS_KEY_ID:("a"*32),AWS_SECRET_ACCESS_KEY:("a"*64),DIFY_API_KEY:"existing-cloud",DIFY_TOOL_KEY:("c"*32),DIFY_COMMUNITY_PROBE_ENABLED:"true",DIFY_COMMUNITY_BASE_URL:"https://dify.uniwares.co.uk",DIFY_COMMUNITY_WORKFLOW_API_KEY:"community-key",DIFY_COMMUNITY_CALLBACK_KEY:("b"*32)}}}}')"
    jq '.services.app.environment.DIFY_BOOKLET_RUNNER_ENABLED="false"' <<< "$original" > "$TEMP_DIR/resolved-default.json"
    compose() { cat "$TEMP_DIR/resolved-default.json"; }
    validate_compose unused
    (ENVIRONMENT=prod; validate_compose unused)
    if application_secret_override_is_valid "$TEMP_DIR/resolved-default.json"; then echo 'accepted incomplete protected runner settings'; exit 1; fi
    jq '.services.app.environment.DIFY_BOOKLET_RUNNER_ENABLED="true"' "$TEMP_DIR/resolved-default.json" > "$TEMP_DIR/invalid-resolved.json"
    if application_secret_override_is_valid "$TEMP_DIR/invalid-resolved.json" resolved; then echo 'accepted unconfigured enabled runner'; exit 1; fi
    printf '%s' "$original" > "$SECRETS/staging/secrets.json"
    export SSH_ORIGINAL_COMMAND='--action stage-secrets --environment staging --secret-name DIFY_BOOKLET_RUNNER --apply'
    (host_dispatch) < "$TEMP_DIR/runner.json" >/dev/null
    jq -e --argjson old "$original" '.services.app.environment as $e | all($old.services.app.environment|to_entries[]; $e[.key]==.value)' "$SECRETS/staging/secrets.pending.json" >/dev/null
    booklet_runner_settings_are_valid "$SECRETS/staging/secrets.pending.json" override
    [[ "$(cat "$SECRETS/staging/secrets.json")" == "$original" ]]
    jq '.services.app.environment.DIFY_BOOKLET_RUNNER_ENABLED="true"' "$TEMP_DIR/runner.json" > "$TEMP_DIR/enabled.json"
    booklet_runner_patch_is_valid "$TEMP_DIR/enabled.json"
    jq -s '.[0]*.[1]' "$SECRETS/staging/secrets.json" "$TEMP_DIR/enabled.json" > "$TEMP_DIR/merged.json"
    application_secret_override_is_valid "$TEMP_DIR/merged.json"
    application_secret_override_is_valid "$TEMP_DIR/merged.json" resolved
    if (ENVIRONMENT=prod application_secret_override_is_valid "$TEMP_DIR/merged.json" resolved); then echo 'accepted production resolved runner settings'; exit 1; fi
    if (ENVIRONMENT=prod application_secret_override_is_valid "$TEMP_DIR/merged.json"); then echo 'accepted production runner override'; exit 1; fi
    configure_ssh() { :; }
    ssh() { [[ "$*" == *'--secret-name DIFY_BOOKLET_RUNNER'* ]]; cat > "$TEMP_DIR/outbound.json"; }
    host_call() { [[ "$ACTION" == rotate-secrets && -z "$SECRET_NAME" && -z "${DIFY_BOOKLET_RUNNER_SETTINGS_JSON:-}" ]]; }
    ACTION=rotate-protected-dify-key; SECRET_NAME=DIFY_BOOKLET_RUNNER; REQUEST_ID=123-1
    rotate_protected_dify_key
    booklet_runner_patch_is_valid "$TEMP_DIR/outbound.json"
    export SSH_ORIGINAL_COMMAND='--action stage-secrets --environment prod --secret-name DIFY_BOOKLET_RUNNER --apply'
    if (host_dispatch) < "$TEMP_DIR/runner.json" >/dev/null 2>&1; then echo 'accepted production runner staging'; exit 1; fi;;
  community-probe-staging)
    require_root() { :; }; load_config() { :; }; flock() { :; }
    rm "$STATE/operation.json"
    jq -n '{services:{app:{environment:{OPENAI_API_KEY:"existing-provider",MONGODB_URI:"mongodb://db",ACCESS_GATE_PASSWORD:"sixteen-chars-ok!",AWS_ACCESS_KEY_ID:("a"*32),AWS_SECRET_ACCESS_KEY:("a"*64),DIFY_API_KEY:"existing-cloud",DIFY_TOOL_KEY:("c"*32)}}}}' > "$SECRETS/staging/secrets.json"
    export SSH_ORIGINAL_COMMAND='--action stage-secrets --environment staging --secret-name DIFY_COMMUNITY_PROBE --apply'
    payload="$(jq -n '{services:{app:{environment:{DIFY_COMMUNITY_PROBE_ENABLED:"true",DIFY_COMMUNITY_BASE_URL:"https://dify.uniwares.co.uk",DIFY_COMMUNITY_WORKFLOW_API_KEY:"community-key",DIFY_COMMUNITY_CALLBACK_KEY:("b"*32)}}}}')"
    invalid="$(jq '.services.app.environment.DIFY_API_KEY="replacement-cloud"' <<< "$payload")"
    if (host_dispatch) <<< "$invalid" >/dev/null 2>&1; then echo 'accepted unrelated Community bundle field'; exit 1; fi
    test ! -f "$SECRETS/staging/secrets.pending.json"
    (host_dispatch) <<< "$payload" >/dev/null
    jq -e '.services.app.environment | .DIFY_COMMUNITY_PROBE_ENABLED=="true" and .DIFY_COMMUNITY_BASE_URL=="https://dify.uniwares.co.uk" and .DIFY_COMMUNITY_WORKFLOW_API_KEY=="community-key" and .DIFY_API_KEY=="existing-cloud" and .DIFY_TOOL_KEY==("c"*32) and .OPENAI_API_KEY=="existing-provider"' "$SECRETS/staging/secrets.pending.json" >/dev/null
    jq -e '.services.app.environment | .DIFY_API_KEY=="existing-cloud" and (has("DIFY_COMMUNITY_PROBE_ENABLED")|not)' "$SECRETS/staging/secrets.json" >/dev/null;;
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
  reset-profile)
    ACTION=reset-staging
    jq '.environments.staging.ASSETS_BUCKET="kids-booklet-staging-assets"' "$CONFIG_FILE" > "$TEMP_DIR/config.next"; mv "$TEMP_DIR/config.next" "$CONFIG_FILE"
    printf '{"services":{"app":{"environment":{"DIFY_BOOKLET_BINDINGS_JSON":"fixture","DIFY_BOOKLET_RUNNER_ENABLED":"false","DIFY_API_KEY":"retained-cloud"}}}}\n' > "$SECRETS/staging/secrets.json"
    application_secret_override_is_valid() { :; }
    validate_compose() { [[ "$COMPOSE_SECRET_FILE" == "$SECRETS/staging/secrets.reset.json" ]]; }
    prepare_staging_reset_profile "$STATE/releases/staging/old"
    jq -e '.services.app.environment.DIFY_BOOKLET_RUNNER_ENABLED=="false"' "$SECRETS/staging/secrets.json" >/dev/null
    maintenance() {
      printf 'maintenance %s\n' "$*" >> "$CALLS"
      if [[ "$2" == reset-staging-deployment ]]; then
        [[ "$COMPOSE_SECRET_FILE" == "$SECRETS/staging/secrets.reset.json" ]]
        jq -e '.services.app.environment.DIFY_BOOKLET_RUNNER_ENABLED=="true"' "$COMPOSE_SECRET_FILE" >/dev/null
        jq -e '.services.app.environment.DIFY_BOOKLET_RUNNER_ENABLED=="false"' "$SECRETS/staging/secrets.json" >/dev/null
      fi
    }
    run_lifecycle
    jq -e '.services.app.environment.DIFY_BOOKLET_RUNNER_ENABLED=="true" and .services.app.environment.DIFY_API_KEY=="retained-cloud"' "$SECRETS/staging/secrets.json" >/dev/null
    jq -e '.services.app.environment.DIFY_BOOKLET_RUNNER_ENABLED=="false"' "$SECRETS/staging/secrets.reset.previous.json" >/dev/null
    calls="$(cat "$CALLS")"
    [[ "$calls" == *read-staging-reset-readiness*'recovery backup'*reset-staging-deployment*'up -d'* ]]
    test ! -f "$SECRETS/staging/secrets.reset.json";;
  reset-recovery)
    require_root() { :; }; load_config() { :; }; flock() { :; }
    systemctl() { return 1; }; docker() { :; }; systemd-run() { :; }; wait_operation() { :; }
    jq -n '{requestId:"failed-reset",action:"reset-staging",environment:"staging",step:"resetting",backupId:"staging-backup"}' > "$STATE/operation.json"
    export SSH_ORIGINAL_COMMAND='--action restore --environment staging --confirmation kids_booklet --backup-id wrong-backup --request-id recovery --apply'
    if (host_dispatch) >/dev/null 2>&1; then echo 'accepted wrong reset recovery backup'; exit 1; fi
    test -f "$STATE/operation.json"
    export SSH_ORIGINAL_COMMAND='--action restore --environment staging --confirmation kids_booklet --backup-id staging-backup --request-id recovery --apply'
    host_dispatch >/dev/null
    jq -e '.requestId=="failed-reset" and .step=="resetting"' "$STATE/operations/failed-reset-failed.json" >/dev/null
    jq -e '.action=="restore" and .backupId=="staging-backup" and .requestId=="recovery"' "$STATE/operation.json" >/dev/null;;
  plan-guard)
    printf '{"resource_changes":[{"type":"cloudflare_r2_bucket","change":{"actions":["delete","create"]}}]}' > "$TEMP_DIR/plan.json"
    if (validate_plan "$TEMP_DIR/plan.json") >/dev/null 2>&1; then echo 'accepted protected replacement'; exit 1; fi
    printf '{"resource_changes":[{"type":"cloudflare_zero_trust_access_policy","change":{"actions":["update"]}}]}' > "$TEMP_DIR/plan.json"
    if (validate_plan "$TEMP_DIR/plan.json") >/dev/null 2>&1; then echo 'accepted Access boundary change'; exit 1; fi;;
  *) exit 1;;
esac
