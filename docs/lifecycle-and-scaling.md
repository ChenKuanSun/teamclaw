# Lifecycle Management & Scale-to-Zero

## Container Lifecycle

Each user's OpenClaw container goes through these states:

```
[not provisioned] → provision → [provisioned/stopped]
                                      ↓ start
                                [running]
                                      ↓ idle 30min / manual stop
                                [stopped]
                                      ↓ cron wakeup / user request
                                [running]
```

### Lifecycle Lambda

The Lifecycle Lambda handles 4 actions:

| Action | What It Does |
|--------|-------------|
| `provision` | Creates EFS Access Point for user (UID/GID 1000, path `/users/{userId}`), stores record in DynamoDB |
| `start` | `ecs:RunTask` with user-specific env vars (`USER_ID`, `TEAM_ID`, `KEY_POOL_PROXY_URL`) |
| `stop` | `ecs:StopTask` with reason, updates DynamoDB status |
| `status` | Returns current state and task ARN from DynamoDB |

### Container Environment Variables

Set via ECS task `containerOverrides`:

| Variable | Source | Purpose |
|----------|--------|---------|
| `USER_ID` | DynamoDB | Identifies user's EFS directory |
| `TEAM_ID` | DynamoDB | Identifies team config on EFS |
| `KEY_POOL_PROXY_URL` | API Gateway URL | Provider proxy endpoint |

## Scale-to-Zero

### Idle Detection

After 30 minutes of no WebSocket activity, the container is stopped:

1. ALB health checks continue (container is "healthy" but idle)
2. CloudWatch metric on WebSocket message count → alarm when zero for 30 min
3. Alarm triggers SNS → Lifecycle Lambda `stop` action
4. Container receives SIGTERM → OpenClaw graceful shutdown
5. State persisted to EFS (conversation history, MEMORY.md, audit logs)

### Cron-Aware Wakeup

OpenClaw supports CronJobs in its config. If a user has scheduled tasks and their container is stopped, the cron would never fire.

**Solution: EventBridge pre-wakeup**

```
DynamoDB (user record)
  └─ cronSchedules: [{ cron: "0 9 * * MON-FRI", ... }]

EventBridge Scheduler
  └─ Rule: fire 2 minutes before each cron time
    └─ Target: Lifecycle Lambda (action: start, userId: xxx)

Lifecycle Lambda
  └─ Starts the container

OpenClaw boots → reads openclaw.json → internal cron scheduler activates
  └─ Cron fires at scheduled time (native OpenClaw behavior)
    └─ Task executes
      └─ Container idles → 30 min timeout → scale-to-zero
```

**Key principle:** We don't inject or simulate the cron task externally. We simply ensure the container is awake when OpenClaw's native cron scheduler needs to fire. This maintains zero source code modification.

### EventBridge Rule Management

When a user updates their OpenClaw config with cron schedules:

1. Config is saved to EFS via admin API
2. Admin API parses cron schedules from the config
3. Creates/updates EventBridge Scheduler rules for each schedule
4. Each rule targets the Lifecycle Lambda with `{ action: "start", userId: "..." }`

When a user removes cron schedules:
1. Corresponding EventBridge rules are deleted
2. Container falls back to normal idle-stop behavior

### Cost Impact

| Scenario | Without scale-to-zero | With scale-to-zero |
|----------|----------------------|-------------------|
| 8 hrs active / day | $88/user/mo | $88/user/mo |
| 2 hrs active / day | $88/user/mo | $22/user/mo |
| Cron only (5 min/day) | $88/user/mo | $3/user/mo |
| Inactive user | $88/user/mo | $0/user/mo |

Scale-to-zero typically saves 60-80% on compute costs for enterprise deployments where most users are active only part of the day.

## Graceful Shutdown

When a container receives SIGTERM (from `ecs:StopTask`):

1. OpenClaw Gateway stops accepting new WebSocket connections
2. In-progress conversations complete (or timeout after 30s)
3. Audit logs flushed to EFS
4. Process exits cleanly

On next start, OpenClaw reads state from EFS:
- Conversation history is preserved
- MEMORY.md is intact
- CronJob schedules are re-registered from config
- No data loss between stop/start cycles
