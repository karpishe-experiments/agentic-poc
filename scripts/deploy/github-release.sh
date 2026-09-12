#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
load_config
: "${STACK:?}" "${MODE:?}"
directory="$(stack_dir "$STACK")"
terraform -chdir="$directory" output -json deployment > "$DEPLOY_ROOT/.deploy/deployment.json"
export DEPLOYMENT_JSON="$DEPLOY_ROOT/.deploy/deployment.json"
cluster="$(jq -r .cluster "$DEPLOYMENT_JSON")"; service="$(jq -r .service "$DEPLOYMENT_JSON")"

case "$MODE" in
  prepare)
    description="$(aws ecs describe-services --cluster "$cluster" --services "$service" --query 'services[0]' --output json)"
    previous=""; if [[ "$(jq -r '.desiredCount // 0' <<<"$description")" -gt 0 ]]; then previous="$(jq -r '.taskDefinition // ""' <<<"$description")"; fi
    if [[ "$STACK" == "staging" && "$(jq -r '.desiredCount // 0' <<<"$description")" -eq 0 ]]; then
      aws s3api head-object --bucket "$(jq -r .buckets.recovery "$DEPLOYMENT_JSON")" --key migration/verified.json >/dev/null \
        || { echo "First staging activation requires a verified asset migration." >&2; exit 1; }
    fi
    echo "previous=$previous" >> "${GITHUB_OUTPUT:-/dev/null}"
    if [[ "$(jq -r '.desiredCount // 0' <<<"$description")" -gt 0 ]]; then
      "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" update preparing
      "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/deployment-control.ts enable "GitHub deployment ${GITHUB_RUN_ID:-local}"
      "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/wait-for-deployment-drain.ts
      aws ecs update-service --cluster "$cluster" --service "$service" --desired-count 0 >/dev/null
      aws ecs wait services-stable --cluster "$cluster" --services "$service"
      "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/recovery.ts backup
    fi
    ;;
  register-app)
    : "${IMAGE_URI:?}"
    jq --arg image "$IMAGE_URI" '.task_definition_template.containerDefinitions[0].image=$image | .task_definition_template.containerDefinitions[0].environment += [{name:"RELEASE_IMAGE_DIGEST",value:$image}]' "$DEPLOYMENT_JSON" > "$DEPLOY_ROOT/.deploy/task-definition.json"
    revision="$(aws ecs register-task-definition --cli-input-json "file://$DEPLOY_ROOT/.deploy/task-definition.json" --query 'taskDefinition.taskDefinitionArn' --output text)"
    echo "revision=$revision" >> "${GITHUB_OUTPUT:-/dev/null}"
    ;;
  register-maintenance)
    : "${IMAGE_URI:?}"
    jq --arg image "$IMAGE_URI" '.maintenance_task_definition_template.containerDefinitions[0].image=$image | .maintenance_task_definition_template.containerDefinitions[0].environment += [{name:"RELEASE_IMAGE_DIGEST",value:$image}]' "$DEPLOYMENT_JSON" > "$DEPLOY_ROOT/.deploy/maintenance-task-definition.json"
    revision="$(aws ecs register-task-definition --cli-input-json "file://$DEPLOY_ROOT/.deploy/maintenance-task-definition.json" --query 'taskDefinition.taskDefinitionArn' --output text)"
    echo "revision=$revision" >> "${GITHUB_OUTPUT:-/dev/null}"
    ;;
  activate)
    : "${APP_TASK_DEFINITION:?}" "${MAINTENANCE_TASK_DEFINITION:?}"
    jq --arg revision "$MAINTENANCE_TASK_DEFINITION" '.maintenance_task_definition=$revision' "$DEPLOYMENT_JSON" > "$DEPLOY_ROOT/.deploy/deployment.next.json"
    mv "$DEPLOY_ROOT/.deploy/deployment.next.json" "$DEPLOYMENT_JSON"
    "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" update initializing
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/initialize-deployment.ts
    rollback_previous() {
      set +e
      if [[ -n "${PREVIOUS_TASK_DEFINITION:-}" ]]; then
        aws ecs update-service --cluster "$cluster" --service "$service" --task-definition "$PREVIOUS_TASK_DEFINITION" --desired-count 1 >/dev/null
        if aws ecs wait services-stable --cluster "$cluster" --services "$service" \
          && "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/check-deployment-readiness.ts; then
          "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/deployment-control.ts disable
        fi
      else
        aws ecs update-service --cluster "$cluster" --service "$service" --desired-count 0 >/dev/null
      fi
      echo "Release verification failed. Maintenance and the operation lock remain active." >&2
    }
    trap rollback_previous ERR
    aws ecs update-service --cluster "$cluster" --service "$service" --task-definition "$APP_TASK_DEFINITION" --desired-count 1 --force-new-deployment >/dev/null
    aws ecs wait services-stable --cluster "$cluster" --services "$service"
    url="$(jq -r .url "$DEPLOYMENT_JSON")"
    curl --fail --silent --show-error --retry 12 --retry-delay 10 "$url/api/health/live" >/dev/null
    test "$(curl --silent --output /dev/null --write-out '%{http_code}' "$url/")" = "401"
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/check-deployment-readiness.ts
    "$DEPLOY_ROOT/scripts/deploy/ecs-task.sh" ./node_modules/.bin/tsx scripts/deployment-control.ts disable
    "$DEPLOY_ROOT/scripts/deploy/operation-lock.sh" update verified
    trap - ERR
    ;;
  *) echo "MODE must be prepare, register-app, register-maintenance, or activate." >&2; exit 2 ;;
esac
