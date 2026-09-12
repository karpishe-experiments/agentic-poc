#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_config
: "${STACK:?}" "${ACTION:?}"
init_stack "$STACK"
terraform -chdir="$(stack_dir "$STACK")" output -json deployment > "$DEPLOY_ROOT/.deploy/deployment.json"
export DEPLOYMENT_JSON="$DEPLOY_ROOT/.deploy/deployment.json"
cluster="$(jq -r .cluster "$DEPLOYMENT_JSON")"; service="$(jq -r .service "$DEPLOYMENT_JSON")"

case "$ACTION" in
  drain-shared)
    if [[ "${LOCK_HELD:-false}" != "true" ]]; then "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" acquire; fi
    desired="$(aws ecs describe-services --cluster "$cluster" --services "$service" --query 'services[0].desiredCount' --output text)"
    checkpoint="$(mktemp)"; trap 'rm -f "$checkpoint"' EXIT
    jq -n --argjson desired "$desired" '{desiredCount:$desired}' > "$checkpoint"
    aws s3 cp "$checkpoint" "s3://$OPERATIONS_BUCKET/operations/shared-drain/$STACK.json" >/dev/null
    if [[ "$desired" -gt 0 ]]; then
      "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/deployment-control.ts enable "shared infrastructure change"
      "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/wait-for-deployment-drain.ts
      aws ecs update-service --cluster "$cluster" --service "$service" --desired-count 0 >/dev/null
      aws ecs wait services-stable --cluster "$cluster" --services "$service"
    fi
    ;;
  restart-shared)
    checkpoint="$(aws s3 cp "s3://$OPERATIONS_BUCKET/operations/shared-drain/$STACK.json" -)"
    if [[ "$(jq -r .desiredCount <<<"$checkpoint")" -gt 0 ]]; then
      aws ecs update-service --cluster "$cluster" --service "$service" --desired-count 1 >/dev/null
      aws ecs wait services-stable --cluster "$cluster" --services "$service"
      "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/check-deployment-readiness.ts
      "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/deployment-control.ts disable
    fi
    aws s3 rm "s3://$OPERATIONS_BUCKET/operations/shared-drain/$STACK.json" >/dev/null
    if [[ "${RELEASE_LOCK:-false}" == "true" ]]; then "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" release; fi
    ;;
  check)
    curl --fail --silent --show-error "$(jq -r .url "$DEPLOYMENT_JSON")/api/health/live"
    test "$(curl --silent --output /dev/null --write-out '%{http_code}' "$(jq -r .url "$DEPLOYMENT_JSON")/")" = "401"
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/check-deployment-readiness.ts
    ;;
  backup)
    "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" acquire
    "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" update draining
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/deployment-control.ts enable "manual backup"
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/wait-for-deployment-drain.ts
    aws ecs update-service --cluster "$cluster" --service "$service" --desired-count 0 >/dev/null
    aws ecs wait services-stable --cluster "$cluster" --services "$service"
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/recovery.ts backup
    aws ecs update-service --cluster "$cluster" --service "$service" --desired-count 1 >/dev/null
    aws ecs wait services-stable --cluster "$cluster" --services "$service"
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/check-deployment-readiness.ts
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/deployment-control.ts disable
    "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" release
    ;;
  restore)
    : "${BACKUP_ID:?}" "${CONFIRM_DATABASE:?}"
    "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" acquire
    "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" update draining
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/deployment-control.ts enable "database restore"
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/wait-for-deployment-drain.ts
    aws ecs update-service --cluster "$cluster" --service "$service" --desired-count 0 >/dev/null
    aws ecs wait services-stable --cluster "$cluster" --services "$service"
    BACKUP_ID="$BACKUP_ID" CONFIRM_DATABASE="$CONFIRM_DATABASE" "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/recovery.ts restore
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/initialize-deployment.ts
    aws ecs update-service --cluster "$cluster" --service "$service" --desired-count 1 >/dev/null
    aws ecs wait services-stable --cluster "$cluster" --services "$service"
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/check-deployment-readiness.ts
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/deployment-control.ts disable
    "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" release
    ;;
  rollback)
    : "${TASK_DEFINITION:?Provide an exact prior task-definition ARN.}"
    "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" acquire
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/deployment-control.ts enable "application rollback"
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/wait-for-deployment-drain.ts
    aws ecs update-service --cluster "$cluster" --service "$service" --desired-count 0 >/dev/null
    aws ecs wait services-stable --cluster "$cluster" --services "$service"
    aws ecs update-service --cluster "$cluster" --service "$service" --task-definition "$TASK_DEFINITION" --desired-count 1 >/dev/null
    aws ecs wait services-stable --cluster "$cluster" --services "$service"
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/check-deployment-readiness.ts
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/deployment-control.ts disable
    "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" release
    ;;
  reset-staging)
    [[ "$STACK" == "staging" && "${CONFIRM_DATABASE:-}" == "kids_booklet" ]] || { echo "Reset requires staging and CONFIRM_DATABASE=kids_booklet." >&2; exit 1; }
    "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" acquire
    "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" update draining
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/deployment-control.ts enable "staging reset"
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/wait-for-deployment-drain.ts
    aws ecs update-service --cluster "$cluster" --service "$service" --desired-count 0 >/dev/null
    aws ecs wait services-stable --cluster "$cluster" --services "$service"
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/recovery.ts backup
    CONFIRM_DATABASE="$CONFIRM_DATABASE" "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/reset-staging-deployment.ts
    aws ecs update-service --cluster "$cluster" --service "$service" --desired-count 1 >/dev/null
    aws ecs wait services-stable --cluster "$cluster" --services "$service"
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/check-deployment-readiness.ts
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/deployment-control.ts disable
    "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" release
    ;;
  resume)
    lock_json="$(aws s3 cp "s3://$OPERATIONS_BUCKET/operations/current.json" -)"
    [[ "$(jq -r .environment <<<"$lock_json")" == "_$STACK" ]] || { echo "The recorded lock belongs to another environment." >&2; exit 1; }
    recorded_run="$(jq -r .run <<<"$lock_json")"
    if [[ "$recorded_run" =~ ^[0-9]+$ ]]; then
      [[ "$(gh api "repos/$REPOSITORY/actions/runs/$recorded_run" --jq .status)" == "completed" ]] || { echo "The recorded workflow is still active." >&2; exit 1; }
    fi
    family="$(jq -r '.maintenance_task_definition | split("/")[-1] | split(":")[0]' "$DEPLOYMENT_JSON")"
    test "$(aws ecs list-tasks --cluster "$cluster" --family "$family" --desired-status RUNNING --query 'length(taskArns)' --output text)" = "0"
    aws ecs wait services-stable --cluster "$cluster" --services "$service"
    "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" release
    ;;
  *) echo "Unknown maintenance action." >&2; exit 2 ;;
esac
