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
| Environment variables | `OPENCLAW_STATE_DIR` (state on EFS), integration env vars via `/tmp/integration-env.sh` |
| Docker entrypoint wrapper | Security hardening, config merge, key stripping |
| Provider `baseUrl` proxy | API key injection without exposing keys to containers |
| SOUL.md / MEMORY.md files | Agent personality and knowledge layering |

This means you can upgrade OpenClaw versions without merge conflicts.

### 3. Sidecar Proxy (API Key Pool)

Containers never see real API keys. A co-located sidecar proxy handles credential injection:

```
OpenClaw (ANTHROPIC_API_KEY = "proxy-managed")
  → models.providers.anthropic.baseUrl = "http://localhost:3000/anthropic"
    → Sidecar resolves real key from Secrets Manager (round-robin across pool)
      → Injects auth headers + anthropic-beta (governed by BETA_ALLOWLIST)
        → Forwards to real provider API
          → Logs usage to DynamoDB (provider, model, timestamp, downgradeReason)
```

The sidecar provides: round-robin key rotation, OAuth token refresh with expiry detection, per-request usage logging, and beta header governance.

### 4. Config Hierarchy (Global → Team → User)

```
/efs/system/global-config.json     # Enterprise defaults
/efs/teams/{teamId}/team-config.json  # Team overrides
/efs/users/{userId}/user-config.json  # User preferences
```

At container startup, `generate-config.js` deep-merges these into a single `openclaw.json`. Each level can only be more restrictive than the level above.

Six workspace bootstrap files follow the same pattern but concatenate (not merge):
```
Enterprise {AGENTS,SOUL,TOOLS,BOOTSTRAP,IDENTITY,USER}.md
+ Team {AGENTS,SOUL,TOOLS,BOOTSTRAP,IDENTITY,USER}.md
+ User {AGENTS,SOUL,TOOLS,BOOTSTRAP,IDENTITY,USER}.md
= Final files in container /workspace/
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
    backend-infra/      # CDK stacks, Lambda handlers (44 handlers)
    container/          # Dockerfile, entrypoint.sh, generate-config.js, skills/
    sidecar/            # API key pool proxy (auth, usage logging, beta governance)

apps/
  infra-foundation/     # VPC, EFS, ECR, Secrets Manager
  infra-cluster/        # ECS Cluster, ALB, CloudFront, Task Definition
  infra-control-plane/  # Cognito, Lifecycle Lambda, DynamoDB
  infra-admin/          # API Gateway, 44 Lambda handlers
  web-chat/             # Angular 21 + Material chat UI (WebSocket)
  web-admin/            # Angular 21 admin dashboard (Skills, Integrations, Config)
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
| Container hardening | Non-root user, `initProcessEnabled`, sidecar `readonlyRootFilesystem` |
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

## Skills System

TeamClaw bundles 3 custom skills and leverages 3 upstream OpenClaw skills:

| Skill | Source | Credential | API |
|-------|--------|-----------|-----|
| Notion | Upstream | `NOTION_API_KEY` (aliased from `NOTION_TOKEN`) | REST v2025 |
| Slack | Upstream | `channels.slack.botToken` config | Events API |
| GitHub | Upstream | `GH_TOKEN` (aliased from `GITHUB_TOKEN`) | `gh` CLI |
| Jira | Bundled | `JIRA_TOKEN` + `JIRA_BASEURL` | Atlassian REST v3 |
| Confluence | Bundled | `CONFLUENCE_TOKEN` + `CONFLUENCE_BASEURL` | Atlassian REST v2 |
| Linear | Bundled | `LINEAR_TOKEN` | GraphQL |

Skills are loaded from multiple directories (in priority order):
1. `/skills/` — bundled in container image
2. `/efs/system/approved-skills/` — admin-installed, available to all users
3. `/efs/teams/{teamId}/team-skills/` — team-scoped
4. `/efs/users/{userId}/user-skills/` — user-created

Integration credentials flow: Admin panel → Secrets Manager → `generate-config.js` loads at boot → writes `/tmp/integration-env.sh` → entrypoint.sh sources before `exec openclaw`.

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
