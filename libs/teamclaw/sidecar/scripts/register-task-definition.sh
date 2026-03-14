#!/bin/bash
# Register ECS task definition with sidecar proxy container
# Usage: ./register-task-definition.sh <env> <account-id> <region>

set -euo pipefail

ENV="${1:?Usage: $0 <env> <account-id> <region>}"
ACCOUNT_ID="${2:?Usage: $0 <env> <account-id> <region>}"
REGION="${3:-us-west-1}"

TEAMCLAW_REPO="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/teamclaw-enterprise-${ENV}"
SIDECAR_REPO="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/teamclaw-sidecar-${ENV}"

aws ecs register-task-definition \
  --region "${REGION}" \
  --family "teamclaw-user-${ENV}" \
  --requires-compatibilities FARGATE \
  --network-mode awsvpc \
  --cpu 1024 --memory 2048 \
  --task-role-arn "arn:aws:iam::${ACCOUNT_ID}:role/teamclaw-task-role-${ENV}" \
  --execution-role-arn "arn:aws:iam::${ACCOUNT_ID}:role/teamclaw-execution-role-${ENV}" \
  --container-definitions "[
    {
      \"name\": \"teamclaw\",
      \"image\": \"${TEAMCLAW_REPO}:latest\",
      \"essential\": true,
      \"portMappings\": [{\"containerPort\": 18789}],
      \"dependsOn\": [{\"containerName\": \"proxy-sidecar\", \"condition\": \"HEALTHY\"}],
      \"logConfiguration\": {
        \"logDriver\": \"awslogs\",
        \"options\": {
          \"awslogs-group\": \"/ecs/teamclaw-${ENV}\",
          \"awslogs-region\": \"${REGION}\",
          \"awslogs-stream-prefix\": \"teamclaw\"
        }
      }
    },
    {
      \"name\": \"proxy-sidecar\",
      \"image\": \"${SIDECAR_REPO}:latest\",
      \"essential\": true,
      \"portMappings\": [{\"containerPort\": 3000}],
      \"healthCheck\": {
        \"command\": [\"CMD-SHELL\", \"wget -qO- http://localhost:3000/health || exit 1\"],
        \"interval\": 10,
        \"timeout\": 3,
        \"retries\": 3
      },
      \"logConfiguration\": {
        \"logDriver\": \"awslogs\",
        \"options\": {
          \"awslogs-group\": \"/ecs/teamclaw-${ENV}\",
          \"awslogs-region\": \"${REGION}\",
          \"awslogs-stream-prefix\": \"sidecar\"
        }
      }
    }
  ]"

echo "Task definition teamclaw-user-${ENV} registered with sidecar container."
