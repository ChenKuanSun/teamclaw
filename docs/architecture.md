# TeamClaw Architecture

> Enterprise team AI collaboration platform built on [OpenClaw](https://github.com/anthropics/openclaw).
> Zero OpenClaw source code modifications — all customization via config, env vars, and proxy patterns.

## Overview

TeamClaw wraps upstream OpenClaw into an enterprise-grade product with:

1. **Shared API Key Pool** — Centrally managed keys, per-user usage tracking, round-robin proxy
2. **SSO Chat Window** — Angular web UI with Cognito auth, WebSocket chat
3. **Per-User Bot** — Isolated OpenClaw container per user (ECS Fargate + EFS)
4. **Team Bots** — Shared OpenClaw instances for team-scoped workflows
5. **Enterprise Collaboration** — Config hierarchy, SOUL.md/MEMORY.md layering, shared knowledge base

---

## Stack Layout

```
┌─────────────────────────────────────────────────────┐
│  Angular Chat UI (web-chat)                  │
│  Cognito Auth → WebSocket → OpenClaw Gateway :18789 │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  Control Plane                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Cognito  │  │ Key Pool     │  │ Lifecycle     │  │
│  │ User Pool│  │ Proxy Lambda │  │ Lambda        │  │
│  └──────────┘  └──────┬───────┘  └───────┬───────┘  │
│                       │                  │          │
│  ┌──────────┐  ┌──────▼───────┐  ┌───────▼───────┐  │
│  │ DynamoDB │  │ Secrets Mgr  │  │ EventBridge   │  │
│  │ users +  │  │ API key pool │  │ Cron Wakeup   │  │
│  │ usage    │  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  Cluster                                            │
│  ┌─────────────┐  ┌────────────────────────────┐    │
│  │ ECS Fargate │  │ ALB (WebSocket support)    │    │
│  │ per-user    │  └────────────────────────────┘    │
│  │ containers  │                                    │
│  └──────┬──────┘                                    │
└─────────┼───────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────┐
│  Foundation                                         │
│  ┌─────┐  ┌──────────┐  ┌─────┐  ┌──────────────┐  │
│  │ VPC │  │ EFS      │  │ ECR │  │ Secrets Mgr  │  │
│  │     │  │ per-user │  │     │  │ API keys     │  │
│  └─────┘  └──────────┘  └─────┘  └──────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 3 CDK Stacks (deployed in order)

| Stack | Resources | Purpose |
|-------|-----------|---------|
| **Foundation** (`infra-foundation`) | VPC, EFS, ECR, Secrets Manager | Shared base infrastructure |
| **Cluster** (`infra-cluster`) | ECS Cluster, ALB, Security Groups | Container orchestration layer |
| **Control Plane** (`infra-control-plane`) | Cognito, Key Pool Proxy, Lifecycle Lambda, DynamoDB, EventBridge | User management and API routing |

---

## Key Design Decisions

### 1. Container-Per-User Isolation

Each user gets a dedicated ECS Fargate task running the hardened OpenClaw container. This provides:
- Process-level isolation (no shared memory, no shared state)
- Network-level isolation (per-task ENI, security group rules)
- Storage isolation (EFS Access Points with POSIX UID/GID enforcement)

**Trade-off:** Higher cost per user vs. shared-process multi-tenancy, but eliminates entire classes of security vulnerabilities.

### 2. Zero Source Code Modification

All customization happens outside OpenClaw's codebase:

| Mechanism | What It Controls |
|-----------|-----------------|
| `openclaw.json` config | Agents, models, session behavior, plugins |
| Environment variables | `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_TUNNEL`, audit paths |
| Docker entrypoint wrapper | Security hardening, config merge, key stripping |
| Provider `baseUrl` proxy | API key injection without exposing keys to containers |
| SOUL.md / MEMORY.md files | Agent personality and knowledge layering |

This means you can upgrade OpenClaw versions without merge conflicts.

### 3. API Key Pool Proxy

Containers never see real API keys. Instead:

```
Container (ANTHROPIC_API_KEY unset)
  → models.providers.anthropic.baseUrl = "https://key-pool-proxy.example.com/anthropic"
    → Key Pool Proxy Lambda picks key via round-robin
      → Forwards to real provider API with injected key
        → Tracks usage per user in DynamoDB
```

### 4. Config Hierarchy (Global → Team → User)

```
/efs/system/global-config.json     # Enterprise defaults
/efs/teams/{teamId}/team-config.json  # Team overrides
/efs/users/{userId}/user-config.json  # User preferences
```

At container startup, `generate-config.js` deep-merges these into a single `openclaw.json`. Each level can only be more restrictive than the level above.

SOUL.md follows the same pattern but concatenates (not merges):
```
Enterprise SOUL.md  (compliance rules, company identity)
+ Team SOUL.md      (domain expertise, team conventions)
+ User SOUL.md      (personal style preferences)
= Final SOUL.md in container workspace
```

### 5. Scale-to-Zero with Cron-Aware Wakeup

Containers idle-stop after 30 minutes to reduce costs. For users with OpenClaw CronJobs:

```
User's cron schedule stored in DynamoDB
  → EventBridge Scheduler rule (fires 2 min before cron time)
    → Lifecycle Lambda starts the container
      → OpenClaw boots, reads config, internal cron scheduler fires naturally
        → Task completes → container idles → scale-to-zero
```

This preserves OpenClaw's native cron mechanism — we only ensure the container is running when cron needs to fire.

---

## Monorepo Structure

```
libs/
  core/
    constants/          # ENVIRONMENT enum
    cloud-config/       # StackPropsWithEnv, SSM registry, secrets policy
    types/              # UserConfig, TeamConfig, TeamClawConfig interfaces
  teamclaw/
    cloud-config/       # TC_LAMBDA_DEFAULT_PROPS, TC_FARGATE_DEFAULTS
    backend-infra/      # CDK stacks, Lambda handlers
    container/          # Dockerfile, entrypoint.sh, generate-config.js

apps/
  infra-foundation/teamclaw-foundation-infra/   # VPC, EFS, ECR, Secrets
  infra-cluster/teamclaw-cluster-infra/         # ECS Cluster, ALB
  infra-control-plane/teamclaw-control-plane-infra/  # Cognito, Lambdas, DynamoDB
  web-chat/                           # Angular 21 + Material chat UI
```

Path aliases: `@TeamClaw/core/*`, `@TeamClaw/teamclaw/*`

---

## Security Model

| Requirement | Implementation |
|-------------|---------------|
| User isolation | Container-per-user; EFS Access Points with UID/GID |
| API key protection | Keys in Secrets Manager, never exposed to containers |
| Network | Private subnets, NAT gateway egress only |
| Auth | Cognito with MFA (TOTP), admin-only user creation |
| Password policy | 12+ chars, upper/lower/digit/symbol required |
| Audit | Transcripts + audit logs persisted to EFS |
| Container hardening | `curl`/`wget`/`netcat` removed, non-root user |
| Compliance | SOC 2 achievable; HIPAA partially blocked (provider BAA) |

---

## OpenClaw Features We Leverage (No Fork Needed)

| Feature | Config Key | How TeamClaw Uses It |
|---------|-----------|---------------------|
| Multi-agent | `agents.list` in `openclaw.json` | Team-specific agent rosters |
| Session isolation | `session.dmScope: "per-channel-peer"` | Per-user conversation separation |
| Provider proxy | `models.providers.*.baseUrl` | Route all AI calls through Key Pool Proxy |
| Plugin hooks | `before_model_resolve`, `before_prompt_build` | Inject enterprise context, enforce policies |
| Config hot-reload | File watcher on `openclaw.json` | Update config on EFS, container picks it up |
| WebSocket Chat API | `chat.send`, `chat.history`, `chat.inject` | Angular frontend integration |
| Built-in WebChat | `/webchat` endpoint | Fallback/simple deployment option |
| OpenResponses HTTP API | `POST /v1/responses` | Programmatic access for integrations |
| CronJobs | `cron` config in `openclaw.json` | Scheduled tasks with EventBridge wakeup |

---

## Cost Model

| Component | 10 users | 100 users | 1000 users |
|-----------|----------|-----------|------------|
| ECS Fargate (0.5 vCPU, 1GB, 8hr/day) | $44 | $440 | $4,400 |
| EFS (5GB/user) | $15 | $150 | $1,500 |
| ALB + data transfer | $25 | $50 | $150 |
| Key Pool Proxy (API GW + Lambda) | $5 | $20 | $100 |
| Control Plane (Lambda, DynamoDB, Cognito) | $15 | $30 | $80 |
| Secrets Manager | $8 | $15 | $30 |
| **Total** | **$112** | **$705** | **$6,260** |
| **Per-user** | **$11.20** | **$7.05** | **$6.26** |
