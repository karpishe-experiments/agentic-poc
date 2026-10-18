#!/usr/bin/env bash
# Variables below are read by the sourced host functions.
# shellcheck disable=SC2034
set -euo pipefail
# Each scenario runs in a separate Bash process so expected-failure assertions
# cannot accidentally disable errexit inside the lifecycle being tested.
if [[ $# -eq 0 ]]; then
  for scenario in legacy-recovery-claims candidate-recovery-unapplied-abort candidate-recovery-unapplied-changed candidate-recovery-backup-abort candidate-recovery-backup-failed candidate-recovery-readiness-failed candidate-recovery-preview candidate-recovery-apply candidate-recovery-failure candidate-recovery-mismatch candidate-recovery-repeat candidate-recovery-resume expired-recovery-resume expired-recovery-preview expired-recovery-apply expired-recovery-drift bootstrap-preview bootstrap-backup-failed bootstrap-repair bootstrap-candidate backup-verify operation-control operation-control-bounds operation-stop-guard operation-oneoff-guard operation-unit-bounds operation-budget operation-maintenance-bounds operation-client-timeout operation-progress operation-output-inspection operation-compose-bounds drain-bootstrap release first-release rollback-on-readiness maintenance-preserves-rollback backup-history operation-result operation-result-failed secret-rotation interrupted-secret-rotation stale-infrastructure secret-serialization secret-prompt secret-schema booklet-runner-staging community-probe-staging first-activation-secret-repair preactivation-secret-repair dispatch-rejection journal-retention reset-profile reset-recovery reset-guard plan-guard index-retirement index-retirement-resume index-retirement-rollback index-finalize-before index-finalize-after index-admission-race index-drain-resume; do
    bash "$0" "$scenario"
  done
  echo 'host lifecycle, secret serialization, dispatch and plan contracts passed'
  exit 0
fi
export VPS_DEPLOYMENT_LIBRARY_ONLY=true
# shellcheck source=../../scripts/deploy/vps-deployment.sh
source scripts/deploy/vps-deployment.sh
REAL_MAINTENANCE="$(declare -f maintenance)"
REAL_COMPOSE="$(declare -f compose)"
REAL_DRAIN_SUPPORT="$(declare -f verify_drain_support)"
# Stub the external timer but keep the wrapped function calls in this shell.
timeout() { while [[ "$1" == --* ]]; do shift; done; shift; "$@"; }
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
verify_drain_support() { :; }
case "$1" in
  legacy-recovery-claims)
    node --input-type=module <<'LEGACY_CLAIMS'
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
const source=readFileSync("scripts/deploy/vps-deployment.sh","utf8");
const start=source.indexOf('command=(node --import tsx --input-type=module -e');
const program=source.slice(start).split("-e '")[1].split("')")[0].replace(/^\s*import .*;$/gm,"");
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=new AsyncFunction("getDatabase","verifyMongoStructure","verifyExperimentData","verifyMongoData","readBookletRunnerConfig",program);
Object.assign(process.env,{RUNNER_ENABLED:"false",DEPLOYMENT_ENV:"_staging",MONGODB_DATABASE:"kids_booklet",ASSETS_BUCKET:"kids-booklet-staging-assets"});
for(const claim of ["authorizationClaim","resultFinalizationClaim","imageCompletionClaim"]){
  let closed=false;
  const empty={countDocuments:async()=>0};
  const collections=new Proxy({
    deployment_control:{findOne:async()=>({maintenance:true,draining:false,activeMutations:0})},
    experiment_operations:{countDocuments:async filter=>filter.$or.some(row=>row[claim]?.$exists===true && row[claim]?.$ne===null)?1:0},
  },{get:(target,key)=>target[key]??empty});
  await assert.rejects(run(()=>({collections,close:async()=>{closed=true;}}),async()=>{},async()=>{},async()=>{},()=>({enabled:true})),/Unresolved operation/);
  assert.equal(closed,true);
}
process.env.MONGODB_DATABASE="kids_booklet_prod";
await assert.rejects(run(()=>{throw new Error("Database must not be accessed");},async()=>{},async()=>{},async()=>{},()=>({enabled:true})),/Wrong recovery environment/);
console.log("legacy recovery retains expired claims and rejects cross-environment access");
LEGACY_CLAIMS
    ;;
  candidate-recovery-*|expired-recovery-*)
    if command -v cygpath >/dev/null; then
      # Native jq on Windows serializes paths in drive form. Keep fixture
      # identities in that form so byte identity checks match Linux semantics.
      TEMP_DIR="$(cygpath -m "$TEMP_DIR")"; ROOT="$(cygpath -m "$ROOT")"; STATE="$(cygpath -m "$STATE")"
      SECRETS="$(cygpath -m "$SECRETS")"; CONFIG_FILE="$(cygpath -m "$CONFIG_FILE")"; CALLS="$(cygpath -m "$CALLS")"
    fi
    scenario="$1"
    require_root() { :; }; dify_diagnostic_identity() { :; }; flock() { :; }
    cleanup() { :; }
    rm "$STATE/operation.json"
    prior="$STATE/releases/staging/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    mv "$STATE/releases/staging/old" "$prior"
    printf '%s\n' "$prior" > "$STATE/releases/staging/current"
    for file in compose.yml environment.yml runtime.env; do printf 'fixture\n' > "$prior/$file"; done
    (cd "$prior" && sha256sum compose.yml environment.yml runtime.env image.json > manifest.sha256)
    printf '{}\n' > "$SECRETS/staging/secrets.json"
    REQUEST_ID=recovery-one RUN_ID=11111111-1111-1111-1111-111111111111 OPERATION_ID=22222222-2222-2222-2222-222222222222 EXPECTED_REVISION=212
    ACTION=candidate-reconcile APPLY=false BACKUP_ID='' CONFIRMATION=kids_booklet
    maintenance() {
      printf 'maintenance %s\n' "$*" >> "$CALLS"
      [[ ! "$scenario" =~ ^candidate-recovery-backup-(failed|abort)$ || "$2:${3:-}" != recovery:backup ]] || return 1
      if [[ "$2:${3:-}" == deployment-control:status ]]; then printf '{"maintenance":true,"draining":false,"activeMutations":0}\n'; fi
      if [[ "$2:${3:-}" == deployment-control:disable ]]; then printf '{"maintenance":false,"draining":false,"activeMutations":0}\n'; fi
    }
    verify_application() { printf 'verify %s\n' "$1" >> "$CALLS"; [[ "$scenario" != candidate-recovery-readiness-failed ]]; }
    docker() {
      printf 'docker %s\n' "$*" >> "$CALLS"
      if [[ "$1:$2" == image:inspect ]]; then if [[ "$*" == *source-tree* ]]; then printf '%040d\n' 3; else printf '%s\n' "$COMMIT"; fi; fi
    }
    recovery_oneoff() {
      printf 'recovery %s\n' "$3" >> "$CALLS"
      case "$3" in
        capabilities) printf '{"contract":"booklet-recovery-v1","environment":"_staging","schemaVersion":"1","initializationRequired":false}\n';;
        preview) printf '{"verified":true,"previewDigest":"%064d"}\n' 1;;
        verify-unapplied) if [[ "$scenario" == candidate-recovery-unapplied-changed ]]; then printf '{"verified":false,"phase":"verify-unapplied","code":"snapshot_changed"}\n'; return 1; fi; printf '{"verified":true,"outcome":"unapplied","providerPosts":0}\n';;
        apply) if [[ "$scenario" == candidate-recovery-unapplied-* ]]; then printf '{"phase":"started","retained":"original"}\n' > "$2/application-recovery.json"; return 1; fi; if [[ "$scenario" == candidate-recovery-failure ]]; then printf '{"verified":false,"phase":"apply","code":"snapshot_changed","privateMessage":"do-not-print"}\n'; return 1; fi; printf '{"verified":true}\n';;
        *) printf '{"verified":true}\n';;
      esac
    }
    if [[ "$scenario" == expired-recovery-* ]]; then
      ACTION=expired-deployment-recover ORIGINAL_REQUEST_ID=old-deploy RUN_ID='' OPERATION_ID='' EXPECTED_REVISION='' COMMIT=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
      jq -n --arg image "$IMAGE_DIGEST" --arg prior "$prior" '{requestId:"old-deploy",action:"deploy",environment:"staging",priorRelease:$prior,budgetDeadlineAtSeconds:1,step:"initializing",image:$image,backupId:"retained-backup"}' > "$STATE/operation.json"
      cp "$STATE/operation.json" "$TEMP_DIR/original.json"
      systemctl() { printf 'failed\n'; }
      recovery_schema_digest() { printf '%064d\n' 2; }
      if [[ "$scenario" == expired-recovery-drift ]]; then
        recovery_schema_digest() { printf '%s\n' "$RANDOM"; }
        if (supported_recovery_host); then exit 1; fi
        [[ ! -e "$STATE/recoveries" ]]
        exit 0
      fi
    fi
    supported_recovery_host > "$TEMP_DIR/preview-output"
    rm -rf "$TEMP_DIR/candidate"
    [[ ! -e "$STATE/recoveries" && ! -e "$STATE/recovery-handoff-staging.json" ]]
    ! grep -q 'deployment-control enable' "$CALLS"
    PREVIEW_DIGEST="$(sed -n 's/.*digest=//p' "$TEMP_DIR/preview-output")"
    if [[ "$scenario" == *-preview ]]; then exit 0; fi
    APPLY=true
    if [[ "$scenario" == candidate-recovery-mismatch ]]; then
      PREVIEW_DIGEST="$(printf '%064d' 9)"
      if (supported_recovery_host); then exit 1; fi
      [[ ! -e "$STATE/recoveries" ]]
    elif [[ "$scenario" =~ ^candidate-recovery-backup-(failed|abort)$ || "$scenario" == candidate-recovery-readiness-failed ]]; then
      if (supported_recovery_host); then exit 1; fi
      ! grep -q 'deployment-control disable' "$CALLS"
      if [[ "$scenario" =~ ^candidate-recovery-backup-(failed|abort)$ ]]; then
        ! grep -q '^recovery apply$' "$CALLS"
        [[ "$(jq -r .phase "$STATE/recoveries/$REQUEST_ID/host.json")" == backup ]]
        if [[ "$scenario" == candidate-recovery-backup-abort ]]; then
          ABORT_RECOVERY=true
          supported_recovery_host
          [[ "$(jq -r .phase "$STATE/recoveries/$REQUEST_ID/host.json")" == aborted-closed ]]
          ! grep -q '^recovery apply$' "$CALLS"
          ! grep -q 'deployment-control disable' "$CALLS"
          recovery_unresolved_guard
        fi
      else
        [[ "$(jq -r .phase "$STATE/recoveries/$REQUEST_ID/host.json")" == restoring-closed ]]
      fi
    elif [[ "$scenario" == candidate-recovery-unapplied-* ]]; then
      if (supported_recovery_host); then exit 1; fi
      [[ "$(jq -r .phase "$STATE/recoveries/$REQUEST_ID/host.json")" == reconciling ]]
      cp "$STATE/recoveries/$REQUEST_ID/application-recovery.json" "$TEMP_DIR/original-checkpoint.json"
      ABORT_RECOVERY=true
      if [[ "$scenario" == candidate-recovery-unapplied-changed ]]; then
        if (supported_recovery_host); then exit 1; fi
        [[ "$(jq -r .phase "$STATE/recoveries/$REQUEST_ID/host.json")" == reconciling ]]
        ! grep -q 'compose .*up ' "$CALLS"
      else
        supported_recovery_host
        [[ "$(jq -r .phase "$STATE/recoveries/$REQUEST_ID/host.json")" == aborted-closed ]]
        # Interrupted abort must re-prove unchanged state, not reuse a cached verdict.
        recovery_phase "$STATE/recoveries/$REQUEST_ID/host.json" aborting-closed
        supported_recovery_host
        [[ "$(grep -c '^recovery verify-unapplied$' "$CALLS")" == 2 ]]
      fi
      cmp -s "$TEMP_DIR/original-checkpoint.json" "$STATE/recoveries/$REQUEST_ID/application-recovery.json"
      [[ "$(grep -c '^recovery apply$' "$CALLS")" == 1 ]]
      ! grep -q 'deployment-control disable' "$CALLS"
    elif [[ "$scenario" == candidate-recovery-failure ]]; then
      if (supported_recovery_host) > "$TEMP_DIR/sanitized-error" 2>&1; then exit 1; fi
      grep -q '"code":"snapshot_changed"' "$TEMP_DIR/sanitized-error"
      ! grep -q 'do-not-print' "$TEMP_DIR/sanitized-error"
      [[ "$(jq -r .phase "$STATE/recoveries/$REQUEST_ID/host.json")" == reconciling ]]
      ! grep -q 'deployment-control disable' "$CALLS"
      ! grep -q 'compose .*up ' "$CALLS"
    else
      supported_recovery_host
      [[ "$(jq -r .phase "$STATE/recoveries/$REQUEST_ID/host.json")" == complete ]]
      if [[ "$scenario" == expired-recovery-apply || "$scenario" == expired-recovery-resume ]]; then
        cmp -s "$TEMP_DIR/original.json" "$STATE/operations/old-deploy.json"
        [[ ! -e "$STATE/operation.json" ]]
        grep -q 'deployment-control disable' "$CALLS"
        if [[ "$scenario" == expired-recovery-resume ]]; then
          recovery_phase "$STATE/recoveries/$REQUEST_ID/host.json" archived-closed
          supported_recovery_host
          cmp -s "$TEMP_DIR/original.json" "$STATE/operations/old-deploy.json"
          [[ "$(jq -r .phase "$STATE/recoveries/$REQUEST_ID/host.json")" == complete ]]
        fi
      else
        [[ -e "$STATE/recovery-handoff-staging.json" ]]
        ! grep -q 'deployment-control disable' "$CALLS"
        [[ "$(grep -c '^recovery apply$' "$CALLS")" == 1 ]]
        if [[ "$scenario" == candidate-recovery-repeat || "$scenario" == candidate-recovery-resume ]]; then
          if [[ "$scenario" == candidate-recovery-resume ]]; then
            recovery_phase "$STATE/recoveries/$REQUEST_ID/host.json" reconciling
            rm "$STATE/recovery-handoff-staging.json"
            rm -rf "$TEMP_DIR/candidate"
          fi
          supported_recovery_host
          [[ "$(grep -c '^recovery apply$' "$CALLS")" == 1 ]]
        fi
      fi
    fi
    ;;
  bootstrap-preview|bootstrap-backup-failed|bootstrap-repair|bootstrap-candidate)
    scenario="$1"
    require_root() { :; }
    dify_diagnostic_identity() { :; }
    cleanup() { :; }
    original="$STATE/releases/staging/c04d7512dfaa3156eb3b81331625d1a0af4f7faf"
    mv "$STATE/releases/staging/old" "$original"
    printf '%s\n' "$original" > "$STATE/releases/staging/current"
    printf '{"requestId":"38149230374-1","step":"draining","privateEvidence":"preserve-original"}\n' > "$STATE/operation.json"
    cp "$STATE/operation.json" "$TEMP_DIR/original.json"
    staging_bootstrap_guard() { :; }
    verify_artifact_retirement_release() { :; }
    flock() { :; }
    legacy_staging_node() { printf 'legacy %s\n' "$2" >> "$CALLS"; }
    maintenance() { printf 'maintenance %s\n' "$*" >> "$CALLS"; [[ "$scenario" != bootstrap-backup-failed || "$2:${3:-}" != recovery:backup ]]; }
    ACTION=staging-bootstrap-reconcile REQUEST_ID=38149230374-1 CONFIRMATION=kids_booklet
    if [[ "$scenario" == bootstrap-preview ]]; then
      APPLY=false
      staging_bootstrap_reconcile_host
      cmp -s "$STATE/operation.json" "$TEMP_DIR/original.json"
      [[ ! -e "$STATE/staging-bootstrap.json" && "$(< "$CALLS")" == 'legacy inspect' ]]
    elif [[ "$scenario" == bootstrap-backup-failed ]]; then
      if (staging_bootstrap_reconcile_host); then exit 1; fi
      cmp -s "$STATE/operation.json" "$TEMP_DIR/original.json"
      grep -q '^legacy reopen$' "$CALLS"
      ! grep -q '^legacy repair$' "$CALLS"
      [[ ! -e "$STATE/staging-bootstrap.json" ]]
    else
      staging_bootstrap_reconcile_host
      [[ ! -e "$STATE/operation.json" ]]
      cmp -s "$STATE/operations/38149230374-1.json" "$TEMP_DIR/original.json"
      jq -e --arg image "$IMAGE_DIGEST" --arg commit "$COMMIT" '.phase=="reconciled-maintenance" and .superseded==true and .image==$image and .commit==$commit' "$STATE/staging-bootstrap.json" >/dev/null
      ! grep -q '^legacy reopen$' "$CALLS"
      grep -q '^legacy verify-backup$' "$CALLS"
      if [[ "$scenario" == bootstrap-candidate ]]; then
        ACTION=deploy REQUEST_ID=new-request
        bootstrap_ready_for_deploy "$original"
        if (COMMIT=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; bootstrap_ready_for_deploy "$original"); then exit 1; fi
        prepare_release() {
          mkdir -p "$STATE/releases/staging/$COMMIT"
          cp "$original/image.json" "$STATE/releases/staging/$COMMIT/image.json"
          cp "$original/manifest.sha256" "$STATE/releases/staging/$COMMIT/manifest.sha256"
        }
        verify_release_capacity() { :; }
        jq -n --arg request "$REQUEST_ID" '{requestId:$request}' > "$STATE/operation.json"
        run_lifecycle
        [[ ! -e "$STATE/staging-bootstrap.json" && -f "$STATE/operations/bootstrap-new-request.json" ]]
        cmp -s "$STATE/operations/38149230374-1.json" "$TEMP_DIR/original.json"
        ! grep -q 'deployment-control drain\|wait-for-deployment-drain' "$CALLS"
      fi
    fi;;
  backup-verify)
    ACTION=backup-verify COMMIT=old BACKUP_ID=exact-backup
    require_root() { :; }
    dify_diagnostic_identity() { :; }
    flock() { :; }
    backup_verify_host
    grep -q 'recovery verify$' "$CALLS"
    [[ "$(< "$STATE/operation.json")" == '{"requestId":"test"}' ]]
    if (IMAGE_DIGEST=ghcr.io/example/kids@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; backup_verify_host); then exit 1; fi;;
  operation-progress)
    jq '.step="pulling"' "$STATE/operation.json" > "$STATE/operation.next.json"; mv "$STATE/operation.next.json" "$STATE/operation.json"
    systemctl() { if [[ "$SECONDS" -lt 65 ]]; then echo active; else echo inactive; fi; }
    sleep() { SECONDS=$((SECONDS + 5)); }
    SECONDS=0
    jq -n '{requestId:"test",step:"complete"}' > "$STATE/operations/test.json"
    wait_operation > "$TEMP_DIR/progress"
    [[ "$(grep -c 'operation progress request=test phase=pulling' "$TEMP_DIR/progress")" -eq 3 ]];;
  operation-output-inspection)
    jq -n '{requestId:"test",step:"restoring",backupId:"exact-backup",private:"never-print"}' > "$STATE/operation.json"
    docker() {
      case "$1" in ps) echo aaaaaaaaaaaa;; inspect) jq -n --arg image "$IMAGE_DIGEST" '[{State:{Status:"running",Health:{Status:"healthy"}},Config:{Image:$image,Env:["SECRET=never-print"]}}]';; *) return 1;; esac
    }
    result="$(operation_output_inspection "$STATE/operation.json")"
    [[ "$result" == *'"verification":"readback_required"'* && "$result" == *'"selectedImageMatches":true'* && "$result" == *'"health":"healthy"'* && "$result" != *never-print* ]]
    jq -e '.step=="restoring" and .backupId=="exact-backup"' "$STATE/operation.json" >/dev/null;;
  operation-compose-bounds)
    eval "$REAL_COMPOSE"
    timeout() { printf '%s\n' "$*" >> "$CALLS"; }
    compose "$STATE/releases/staging/old" up -d --no-deps app
    grep -q '^--kill-after=5s 180s docker compose .* up -d --no-deps app$' "$CALLS"
    jq -e '.command=="compose-up" and .commandDeadlineAt-.commandStartedAt==180' "$STATE/operation.json" >/dev/null;;
  drain-bootstrap)
    eval "$REAL_DRAIN_SUPPORT"
    supported=false
    docker() {
      case "$1" in ps) echo aaaaaaaaaaaa;; inspect) echo "$IMAGE_DIGEST";; exec) [[ "$supported" == true ]];; *) return 1;; esac
    }
    if (verify_drain_support "$STATE/releases/staging/old") > "$TEMP_DIR/bootstrap" 2>&1; then exit 1; fi
    grep -q 'explicit reviewed bootstrap is required' "$TEMP_DIR/bootstrap"
    ! grep -q 'maintenance\|compose' "$CALLS"
    supported=true
    verify_drain_support "$STATE/releases/staging/old";;
  operation-control)
    flock() { :; }
    jq -n '{requestId:"test",action:"restore",environment:"staging",step:"restoring",backupId:"exact-backup",private:"never-print"}' > "$STATE/operation.json"
    systemctl() {
      case "$*" in *LoadState*) echo loaded;; *ActiveState*) echo inactive;; *ExecMainStatus*) echo 143;; *Result*) echo signal;; stop*) return 0;; *) return 1;; esac
    }
    result="$(operation_status_host)"
    [[ "$result" == *'"outcome":"interrupted"'* && "$result" != *never-print* ]]
    APPLY=false
    result="$(operation_stop_host)"
    [[ "$result" == *'would update: stop exact operation test'* ]]
    jq -e '.step=="restoring" and .backupId=="exact-backup" and .stopRequestedAt==null' "$STATE/operation.json" >/dev/null
    APPLY=true
    operation_output_inspection() { printf 'inspection\n' >> "$CALLS"; }
    systemctl() {
      case "$*" in *LoadState*) echo loaded;; *ActiveState*) echo inactive;; *ExecMainStatus*) echo 143;; *Result*) echo signal;; stop*) printf 'stop\n' >> "$CALLS";; *) return 1;; esac
    }
    result="$(operation_stop_host)"
    [[ "$(grep -E '^(inspection|stop)$' "$CALLS" | head -n 2)" == $'inspection\nstop' ]]
    jq -e '.step=="restoring" and .backupId=="exact-backup" and (.stopRequestedAt|type)=="number"' "$STATE/operation.json" >/dev/null
    [[ "$result" == *'outputs and retained phase require reconciliation'* ]]
    ! grep -q '^compose\|^maintenance' "$CALLS"
    : > "$CALLS"
    operation_output_inspection() { return 1; }
    if (operation_stop_host) > "$TEMP_DIR/inspection-failure" 2>&1; then exit 1; fi
    grep -q 'Pre-stop output inspection unresolved; no stop sent' "$TEMP_DIR/inspection-failure"
    ! grep -q '^stop$' "$CALLS";;
  operation-stop-guard)
    jq -n '{requestId:"test",action:"deploy",environment:"staging",step:"backup"}' > "$STATE/operation.json"
    systemctl() { echo "systemctl $*" >> "$CALLS"; return 1; }
    if (REQUEST_ID=other; operation_stop_host) >/dev/null 2>&1; then exit 1; fi
    if (ENVIRONMENT=prod; operation_stop_host) >/dev/null 2>&1; then exit 1; fi
    test ! -s "$CALLS"
    systemctl() { case "$*" in *LoadState*) echo loaded;; *ActiveState*) echo active;; *Result*) echo success;; *ExecMainStatus*) echo 0;; stop*) return 124;; esac; }
    if (operation_stop_host) >/dev/null 2>&1; then exit 1; fi
    jq -e '.step=="backup" and .stopRequestedAt==null' "$STATE/operation.json" >/dev/null
    systemctl() { echo not-found; }
    if (operation_status_host) >/dev/null 2>&1; then exit 1; fi
    mv "$STATE/operation.json" "$STATE/operations/test.json"
    result="$(operation_status_host)"
    [[ "$result" == *'"state":"unavailable"'* && "$result" == *'"outcome":"archived"'* ]]
    result="$(operation_stop_host)"
    [[ "$result" == *'no stop sent'* ]]
    systemctl() { return 1; }
    result="$(operation_status_host)"
    [[ "$result" == *'"state":"unavailable"'* ]];;
  operation-control-bounds)
    # Zero is the disabled-budget sentinel, not an expired absolute deadline.
    SECONDS=10
    CONTROL_DEADLINE_SECONDS=$((SECONDS + 2))
    timeout() { printf '%s\n' "$*" >> "$CALLS"; }
    control_timeout 55 echo bounded
    grep -Eq '^--kill-after=1s [12]s echo bounded$' "$CALLS"
    : > "$CALLS"
    CONTROL_DEADLINE_SECONDS=$SECONDS
    if control_timeout 55 echo never; then exit 1; fi
    test ! -s "$CALLS";;
  operation-oneoff-guard)
    docker() {
      if [[ "$1" == inspect ]]; then
        jq -n '[{Config:{Labels:{"uk.co.uniwares.booklet.request":"different","uk.co.uniwares.booklet.environment":"staging","com.docker.compose.project":"kids-booklet-staging","com.docker.compose.oneoff":"True"}}}]'
      else printf '%s\n' "$*" >> "$CALLS"; fi
    }
    if stop_owned_oneoff aaaaaaaaaaaa 10; then exit 1; fi
    test ! -s "$CALLS"
    docker() {
      if [[ "$1" == inspect ]]; then
        jq -n '[{Config:{Labels:{"uk.co.uniwares.booklet.request":"test","uk.co.uniwares.booklet.environment":"staging","com.docker.compose.project":"kids-booklet-staging","com.docker.compose.oneoff":"True"}}}]'
      else printf '%s\n' "$*" >> "$CALLS"; fi
    }
    stop_owned_oneoff aaaaaaaaaaaa 10
    grep -Fxq 'stop --time 5 aaaaaaaaaaaa' "$CALLS"
    grep -Fxq 'rm aaaaaaaaaaaa' "$CALLS"
    # Named daemon-owned containers must not look absent after inspect failure.
    docker() {
      case "$1" in
        inspect) return 1;;
        ps) [[ "$*" == 'ps -aq --filter name=^/booklet-operation-staging-test$' ]] || return 1; echo aaaaaaaaaaaa;;
        *) return 1;;
      esac
    }
    if stop_owned_oneoff booklet-operation-staging-test 10; then exit 1; fi
    # A failed removal still requires exact-name absence verification.
    container_present=true
    docker() {
      case "$1" in
        inspect) jq -n '[{Config:{Labels:{"uk.co.uniwares.booklet.request":"test","uk.co.uniwares.booklet.environment":"staging","com.docker.compose.project":"kids-booklet-staging","com.docker.compose.oneoff":"True"}}}]';;
        stop) return 0;;
        rm) return 1;;
        ps) [[ "$*" == 'ps -aq --filter name=^/booklet-operation-staging-test$' ]] || return 1; if [[ "$container_present" == true ]]; then echo aaaaaaaaaaaa; fi;;
        *) return 1;;
      esac
    }
    if stop_owned_oneoff booklet-operation-staging-test 10; then exit 1; fi
    container_present=false
    stop_owned_oneoff booklet-operation-staging-test 10
    docker() { case "$1" in inspect) return 1;; ps) return 0;; *) return 1;; esac; }
    stop_owned_oneoff booklet-operation-staging-test 10;;
  operation-unit-bounds)
    date() { echo 1000; }
    jq -n '{requestId:"test",action:"deploy",environment:"staging",step:"queued"}' > "$STATE/operation.json"
    systemd-run() { printf '%s\n' "$*" >> "$CALLS"; }
    start_operation_unit
    grep -q 'RuntimeMaxSec=2700.*TimeoutStopSec=60.*KillMode=control-group.*ExecStopPost=.*host-cleanup --request-id test --environment staging --apply' "$CALLS"
    [[ "$(operation_runtime_seconds restore)" == 3600 && "$(operation_runtime_seconds backup)" == 1800 ]]
    [[ "$(operation_runtime_seconds dify-repair-sandbox)" == 300 ]];;
  operation-budget)
    clock=1000
    date() { echo "$clock"; }
    jq -n '{requestId:"test",action:"deploy",environment:"staging",step:"queued"}' > "$STATE/operation.json"
    [[ "$(ensure_operation_budget)" == 2700 ]]
    clock=3600
    [[ "$(ensure_operation_budget)" == 100 ]]
    [[ "$(remaining_operation_seconds 1800)" == 100 ]]
    jq -e '.budgetStartedAtSeconds==1000 and .budgetDeadlineAtSeconds==3700' "$STATE/operation.json" >/dev/null
    clock=3700
    if remaining_operation_seconds 1800 >/dev/null 2>&1; then exit 1; fi
    if ensure_operation_budget >/dev/null 2>&1; then exit 1; fi
    jq -e '.budgetDeadlineAtSeconds==3700' "$STATE/operation.json" >/dev/null;;
  operation-maintenance-bounds)
    eval "$REAL_MAINTENANCE"
    # shellcheck disable=SC2120
    compose() { printf '%s bound=%s\n' "$*" "$COMPOSE_TIMEOUT_SECONDS" >> "$CALLS"; return "${COMPOSE_EXIT:-0}"; }
    stop_owned_oneoff() { printf 'owned-cleanup %s\n' "$*" >> "$CALLS"; }
    maintenance "$STATE/releases/staging/old" recovery backup
    maintenance "$STATE/releases/staging/old" recovery restore
    maintenance "$STATE/releases/staging/old" wait-for-deployment-drain
    DEPLOYMENT_URL=https://staging.example.com maintenance "$STATE/releases/staging/old" check-deployment-readiness
    grep -q 'uk.co.uniwares.booklet.request=test.*DRAIN_TIMEOUT_MS=300000.*bound=1800' "$CALLS"
    grep -q 'recovery.ts restore bound=3600' "$CALLS"
    grep -q 'wait-for-deployment-drain.ts bound=300' "$CALLS"
    grep -q 'DEPLOYMENT_URL=https://staging.example.com.*check-deployment-readiness.ts bound=180' "$CALLS"
    if COMPOSE_EXIT=124 maintenance "$STATE/releases/staging/old" recovery restore >/dev/null 2>&1; then exit 1; fi
    grep -q 'owned-cleanup booklet-operation-staging-test-' "$CALLS"
    jq -e '.command=="recovery" and .commandDeadlineAt-.commandStartedAt==3600' "$STATE/operation.json" >/dev/null;;
  operation-client-timeout)
    jq '.step="draining"' "$STATE/operation.json" > "$STATE/operation.next.json"; mv "$STATE/operation.next.json" "$STATE/operation.json"
    systemctl() { echo active; }
    sleep() { SECONDS=$((SECONDS + 300)); }
    status=0
    wait_operation > "$TEMP_DIR/wait-result" || status=$?
    [[ "$status" == 124 ]]
    grep -q 'client wait expired, no stop or replay sent' "$TEMP_DIR/wait-result"
    test -f "$STATE/operation.json"
    ! grep -q 'updated:' "$TEMP_DIR/wait-result";;
  index-finalize-before|index-finalize-after|index-admission-race|index-drain-resume)
    ACTION=retire-staging-artifact-index CONFIRMATION=kids_booklet
    verify_artifact_retirement_release() { :; }
    verify_artifact_retirement_rollback() { :; }
    mkdir -p "$STATE/releases/staging/rollback"
    cp "$STATE/releases/staging/old/image.json" "$STATE/releases/staging/rollback/image.json"
    printf '%s\n' "$STATE/releases/staging/rollback" > "$STATE/releases/staging/previous"
    if [[ "$1" == index-admission-race || "$1" == index-drain-resume ]]; then
      preview_calls=0
      if [[ "$1" == index-drain-resume ]]; then
        jq '.step="draining"' "$STATE/operation.json" > "$STATE/operation.next.json"
        mv "$STATE/operation.next.json" "$STATE/operation.json"
        preview_calls=1
        docker() { printf 'running-original-app\n'; }
      fi
      maintenance() {
        printf 'maintenance %s\n' "$*" >> "$CALLS"
        if [[ "$2" == retire-staging-artifact-index && "${3:-}" == --preview ]]; then
          preview_calls=$((preview_calls + 1))
          [[ "$preview_calls" -lt 2 ]] || return 1
        fi
      }
      if (retire_staging_artifact_index_host) >/dev/null 2>&1; then exit 1; fi
      ! grep -q '^stop ' "$CALLS"
      ! grep -q 'recovery backup\|--apply' "$CALLS"
      grep -q 'deployment-control disable' "$CALLS"
      jq -e '.step=="reconciliation-required"' "$STATE/operation.json" >/dev/null
    else
      BACKUP_ID=staging-before-index
      jq --arg backup "$BACKUP_ID" '.step="index-finalizing" | .backupId=$backup' "$STATE/operation.json" > "$STATE/operation.next.json"
      mv "$STATE/operation.next.json" "$STATE/operation.json"
      # Both sides of admission reopening use the same idempotent finalizer.
      if [[ "$1" == index-finalize-after ]]; then maintenance "$STATE/releases/staging/old" deployment-control disable; fi
      retire_staging_artifact_index_host
      ! grep -q '^stop \|recovery backup\|retire-staging-artifact-index --apply' "$CALLS"
      grep -q 'deployment-control disable' "$CALLS"
      jq -e '.backupId=="staging-before-index" and .step=="complete"' "$STATE/operations/test.json" >/dev/null
    fi;;
  index-retirement|index-retirement-resume)
    ACTION=retire-staging-artifact-index CONFIRMATION=kids_booklet
    verify_artifact_retirement_release() { printf 'release-verified\n' >> "$CALLS"; }
    verify_artifact_retirement_rollback() { printf 'rollback-verified\n' >> "$CALLS"; }
    cp "$STATE/releases/staging/current" "$TEMP_DIR/current-before"
    mkdir -p "$STATE/releases/staging/rollback"
    cp "$STATE/releases/staging/old/image.json" "$STATE/releases/staging/rollback/image.json"
    printf '%s\n' "$STATE/releases/staging/rollback" > "$STATE/releases/staging/previous"
    if [[ "$1" == index-retirement-resume ]]; then
      BACKUP_ID=staging-before-index
      jq --arg backup "$BACKUP_ID" '.step="retiring-index" | .backupId=$backup' "$STATE/operation.json" > "$STATE/operation.next.json"
      mv "$STATE/operation.next.json" "$STATE/operation.json"
    fi
    retire_staging_artifact_index_host
    calls="$(cat "$CALLS")"
    [[ "$calls" == *'--verify-backup'*'--apply'*'up -d'*'verify '*'deployment-control disable'* ]]
    if [[ "$1" == index-retirement ]]; then
      [[ "$calls" == *'--preview'*'deployment-control drain'*'wait-for-deployment-drain'*'stop '*'--preview'*'recovery backup'*'--verify-backup'* ]]
    else
      ! grep -q 'recovery backup' "$CALLS"
      jq -e '.backupId=="staging-before-index"' "$STATE/operations/test.json" >/dev/null
    fi
    cmp "$STATE/releases/staging/current" "$TEMP_DIR/current-before"
    [[ "$(<"$STATE/releases/staging/previous")" == "$STATE/releases/staging/rollback" ]];;
  index-retirement-rollback)
    # Real manifest/path/table checks, with only Docker image inspection mocked.
    sha=fac55e0730e0a7e297a2fbdf28fb888b87baf57a
    image=ghcr.io/example/kids@sha256:959dee0035f80890b4851ed27f2652bc5ee9617cb2e692fae2c0069350d7c571
    release="$STATE/releases/staging/$sha"
    mkdir -p "$release"
    jq -n --arg image "$image" '{services:{app:{image:$image}}}' > "$release/image.json"
    (cd "$release" && sha256sum image.json > manifest.sha256)
    printf '%s\n' "$release" > "$STATE/releases/staging/previous"
    docker() { printf '%s\n' "$sha"; }
    verify_artifact_retirement_rollback
    if (sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; verify_artifact_retirement_rollback) >/dev/null 2>&1; then exit 1; fi
    printf 'corrupt\n' >> "$release/image.json"
    if (verify_artifact_retirement_rollback) >/dev/null 2>&1; then exit 1; fi;;
  release)
    run_lifecycle
    test -f "$STATE/operations/test.json"
    test ! -f "$STATE/operation.json"
    calls="$(cat "$CALLS")"
    [[ "$calls" == *'deployment-control drain'*'wait-for-deployment-drain'*'stop '*'recovery backup'*'initialize-deployment'*'up -d'*'verify '*'deployment-control disable'* ]]
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
timeout() { while [[ "$1" == --* ]]; do shift; done; shift; "$@"; }
compose() { printf 'compose %s\n' "$*" >> "$FIXTURE/failure-calls"; }
maintenance() { printf 'maintenance %s\n' "$*" >> "$FIXTURE/failure-calls"; }
stop_application() { printf 'stop %s\n' "$*" >> "$FIXTURE/failure-calls"; }
verify_application() { [[ "$1" == */old ]]; }
verify_drain_support() { :; }
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
  operation-result-failed)
    jq -n '{requestId:"test",action:"backup",environment:"staging",step:"complete"}' > "$STATE/operations/test.json"
    systemctl() { printf 'failed\n'; }
    if (wait_operation) > "$TEMP_DIR/wait-result" 2>&1; then exit 1; fi
    grep -q 'Operation unit failed' "$TEMP_DIR/wait-result"
    ! grep -q '^updated:' "$TEMP_DIR/wait-result";;
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
    image_bindings="$(jq -c '. + [{role:"specialist",taskId:"J08",persona:null,appId:"00000000-0000-4000-8000-000000000020",publishedWorkflowId:"00000000-0000-4000-8000-000000000099",toolProviderId:null,apiKey:"private$fixture"},{role:"image",taskId:null,persona:null,appId:"00000000-0000-4000-8000-000000000021",publishedWorkflowId:"00000000-0000-4000-8000-000000000099",toolProviderId:null,apiKey:"private$fixture"}]' <<< "$expanded_bindings")"
    image_settings="$(jq -c --arg bindings "$image_bindings" '.DIFY_BOOKLET_BINDINGS_JSON=$bindings' <<< "$DIFY_BOOKLET_RUNNER_SETTINGS_JSON")"
    (DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$image_settings" build_booklet_runner_patch staging "$TEMP_DIR/image-runner.json")
    booklet_runner_patch_is_valid "$TEMP_DIR/image-runner.json"
    jq -e '.services.app.environment.DIFY_BOOKLET_BINDINGS_JSON|fromjson|length==13' "$TEMP_DIR/image-runner.json" >/dev/null
    sheet_bindings="$(jq -c '. + [{role:"specialist",taskId:"J09",persona:null,appId:"00000000-0000-4000-8000-000000000022",publishedWorkflowId:"00000000-0000-4000-8000-000000000099",toolProviderId:null,apiKey:"private$fixture"},{role:"specialist",taskId:"J10",persona:null,appId:"00000000-0000-4000-8000-000000000023",publishedWorkflowId:"00000000-0000-4000-8000-000000000099",toolProviderId:null,apiKey:"private$fixture"}]' <<< "$image_bindings")"
    sheet_settings="$(jq -c --arg bindings "$sheet_bindings" '.DIFY_BOOKLET_BINDINGS_JSON=$bindings' <<< "$DIFY_BOOKLET_RUNNER_SETTINGS_JSON")"
    (DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$sheet_settings" build_booklet_runner_patch staging "$TEMP_DIR/sheet-runner.json")
    booklet_runner_patch_is_valid "$TEMP_DIR/sheet-runner.json"
    jq -e '.services.app.environment.DIFY_BOOKLET_BINDINGS_JSON|fromjson|length==15' "$TEMP_DIR/sheet-runner.json" >/dev/null
    layout_bindings="$(jq -c '. + [{role:"specialist",taskId:"J11",persona:null,appId:"00000000-0000-4000-8000-000000000024",publishedWorkflowId:"00000000-0000-4000-8000-000000000099",toolProviderId:null,apiKey:"private$fixture"}]' <<< "$sheet_bindings")"
    layout_settings="$(jq -c --arg bindings "$layout_bindings" '.DIFY_BOOKLET_BINDINGS_JSON=$bindings' <<< "$DIFY_BOOKLET_RUNNER_SETTINGS_JSON")"
    (DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$layout_settings" build_booklet_runner_patch staging "$TEMP_DIR/layout-runner.json")
    booklet_runner_patch_is_valid "$TEMP_DIR/layout-runner.json"
    jq -e '.services.app.environment.DIFY_BOOKLET_BINDINGS_JSON|fromjson|length==16' "$TEMP_DIR/layout-runner.json" >/dev/null
    page_bible_bindings="$(jq -c '. + [{role:"specialist",taskId:"J12",persona:null,appId:"00000000-0000-4000-8000-000000000025",publishedWorkflowId:"00000000-0000-4000-8000-000000000099",toolProviderId:null,apiKey:"private$fixture"}]' <<< "$layout_bindings")"
    page_bible_settings="$(jq -c --arg bindings "$page_bible_bindings" '.DIFY_BOOKLET_BINDINGS_JSON=$bindings' <<< "$DIFY_BOOKLET_RUNNER_SETTINGS_JSON")"
    (DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$page_bible_settings" build_booklet_runner_patch staging "$TEMP_DIR/page-bible-runner.json")
    booklet_runner_patch_is_valid "$TEMP_DIR/page-bible-runner.json"
    jq -e '.services.app.environment.DIFY_BOOKLET_BINDINGS_JSON|fromjson|length==17' "$TEMP_DIR/page-bible-runner.json" >/dev/null
    final_page_bindings="$(jq -c 'map(if .role=="image" then .finalPageIllustration=true else . end)' <<< "$page_bible_bindings")"
    final_page_settings="$(jq -c --arg bindings "$final_page_bindings" '.DIFY_BOOKLET_BINDINGS_JSON=$bindings' <<< "$DIFY_BOOKLET_RUNNER_SETTINGS_JSON")"
    (DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$final_page_settings" build_booklet_runner_patch staging "$TEMP_DIR/final-page-runner.json")
    booklet_runner_patch_is_valid "$TEMP_DIR/final-page-runner.json"
    evaluation_bindings="$(jq -c '. + [{role:"judge",taskId:null,persona:null,appId:"00000000-0000-4000-8000-000000000026",publishedWorkflowId:"00000000-0000-4000-8000-000000000099",toolProviderId:null,apiKey:"private$fixture"}]' <<< "$final_page_bindings")"
    evaluation_settings="$(jq -c --arg bindings "$evaluation_bindings" '.DIFY_BOOKLET_BINDINGS_JSON=$bindings' <<< "$DIFY_BOOKLET_RUNNER_SETTINGS_JSON")"
    (DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$evaluation_settings" build_booklet_runner_patch staging "$TEMP_DIR/evaluation-runner.json")
    booklet_runner_patch_is_valid "$TEMP_DIR/evaluation-runner.json"
    jq -e '.services.app.environment.DIFY_BOOKLET_BINDINGS_JSON|fromjson|length==18 and any(.[];.role=="image" and .finalPageIllustration==true)' "$TEMP_DIR/evaluation-runner.json" >/dev/null
    for mutation in \
      '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|map(del(.finalPageIllustration))|tojson)' \
      '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|map(if .role=="image" then .finalPageIllustration=false else . end)|tojson)' \
      '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[0].finalPageIllustration=true|tojson)' \
      '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[17].role="manager"|tojson)' \
      '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[17].taskId="J12"|tojson)' \
      '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[17].appId=.[0].appId|tojson)' \
      '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[17].extra=true|tojson)'; do
      invalid="$(jq -c "$mutation" <<< "$evaluation_settings")"
      if (DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$invalid" build_booklet_runner_patch staging "$TEMP_DIR/rejected.json") >/dev/null 2>&1; then echo 'accepted invalid final evaluation settings'; exit 1; fi
    done
    invalid="$(jq -c '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|map(if .role=="image" then .finalPageIllustration=true else . end)|tojson)' <<< "$layout_settings")"
    if (DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$invalid" build_booklet_runner_patch staging "$TEMP_DIR/rejected.json") >/dev/null 2>&1; then echo 'accepted final-page flag in pagination profile'; exit 1; fi
    for mutation in '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[16].taskId="J11"|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[15].taskId="J12"|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[16].role="tester"|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[16].appId=.[0].appId|tojson)'; do
      invalid="$(jq -c "$mutation" <<< "$page_bible_settings")"
      if (DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$invalid" build_booklet_runner_patch staging "$TEMP_DIR/rejected.json") >/dev/null 2>&1; then echo 'accepted invalid page bible runner settings'; exit 1; fi
    done
    for mutation in '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[14].taskId="J11"|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[15].taskId="J10"|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[15].role="tester"|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[15].persona="playful_kid"|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[15].appId=.[0].appId|tojson)'; do
      invalid="$(jq -c "$mutation" <<< "$layout_settings")"
      if (DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$invalid" build_booklet_runner_patch staging "$TEMP_DIR/rejected.json") >/dev/null 2>&1; then echo 'accepted invalid layout runner settings'; exit 1; fi
    done
    for mutation in '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[0:14]|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[14].taskId="J09"|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[14].appId=.[0].appId|tojson)'; do
      invalid="$(jq -c "$mutation" <<< "$sheet_settings")"
      if (DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$invalid" build_booklet_runner_patch staging "$TEMP_DIR/rejected.json") >/dev/null 2>&1; then echo 'accepted invalid sheet runner settings'; exit 1; fi
    done
    for mutation in '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[0:12]|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[12].taskId="J08"|tojson)' '.DIFY_BOOKLET_BINDINGS_JSON|=(fromjson|.[12].persona="playful_kid"|tojson)'; do
      invalid="$(jq -c "$mutation" <<< "$image_settings")"
      if (DIFY_BOOKLET_RUNNER_SETTINGS_JSON="$invalid" build_booklet_runner_patch staging "$TEMP_DIR/rejected.json") >/dev/null 2>&1; then echo 'accepted invalid image runner settings'; exit 1; fi
    done
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
