# TeamClaw - Architecture Reference

## 1. Product Vision

TeamClaw is an **enterprise team AI collaboration product** — not managed hosting, not an infra layer. It wraps OpenClaw into a turnkey SaaS with zero source code modifications.

**5 Core Features:**
1. **Shared API Key Pool** — Company-managed keys, per-user usage tracking, round-robin proxy
2. **SSO Chat Window** — Angular web UI with Cognito auth, embedded WebSocket chat
3. **Per-User Bot** — Isolated OpenClaw container per user (ECS Fargate, EFS storage)
4. **Team Bots** — Shared OpenClaw instances for team-scoped workflows
5. **Enterprise Collaboration** — SOUL.md/MEMORY.md layering, shared knowledge base, config hierarchy

**Critical Constraint:** Zero OpenClaw source code modifications. All customization via config, environment variables, plugin hooks, and the provider proxy pattern.

---

## 2. OpenClaw Native Features (No Fork Needed)

| Feature | Mechanism | How We Use It |
|---------|-----------|---------------|
| Multi-agent | `agents.list` in `openclaw.json` | Team-specific agent rosters |
| Session isolation | `session.dmScope: "per-channel-peer"` | Per-user conversation separation |
| Provider proxy | `models.providers.*.baseUrl` | Point all AI calls to Key Pool Proxy |
| Plugin system | `before_model_resolve`, `before_prompt_build` hooks | Inject enterprise context, enforce policies |
| Config hot-reload | File watcher on `openclaw.json` | Update config on EFS, container picks it up |
| WebSocket Chat API | `chat.send`, `chat.history`, `chat.inject` | Angular frontend integration |
| Built-in WebChat | `/webchat` endpoint | Fallback/simple deployment option |
| OpenResponses HTTP API | `POST /v1/responses` | Programmatic access for integrations |
| CronJobs | `cron` config | Scheduled tasks with EventBridge wakeup |

---

## 3. Architecture

### 3.1 Monorepo & Stack Layout

Nx monorepo following Affiora patterns: `StackPropsWithEnv`, SSM Parameter cross-stack refs, `@TeamClaw/*` path aliases.

**3 CDK Stacks:**
- **Foundation** — VPC, EFS, ECR, Secrets Manager base
- **Cluster** — ECS Fargate cluster, ALB with WebSocket support, security groups
- **Control Plane** — Cognito, Key Pool Proxy Lambda, Lifecycle Lambda, EventBridge cron wakeup, DynamoDB

### 3.2 Frontend

Angular 21 + Angular Material chat UI. Connects to OpenClaw WebSocket `chat.*` protocol (structured JSON).

### 3.3 Container Design

Hardened Docker container with entrypoint wrapper that:
- Strips API keys from environment
- Forces safe defaults (`OPENCLAW_TUNNEL=false`)
- Merges config hierarchy (Global → Team → User)
- Layers SOUL.md / MEMORY.md files
- Starts OpenClaw Gateway with merged config

### 3.4 Scale-to-Zero with Cron-Aware Wakeup

Containers idle-stop after 30 minutes. For users with OpenClaw CronJobs, EventBridge Scheduler fires 2 minutes before cron time to wake the container. OpenClaw's native cron mechanism fires naturally once the container is running.

---

## 4. Security

| Requirement | Implementation |
|-------------|---------------|
| User isolation | Container-per-user mandatory; zero intra-gateway auth surface |
| API key protection | Keys in Secrets Manager; never exposed to containers |
| Storage isolation | EFS Access Points per user (POSIX UID/GID enforcement) |
| Network | Private subnets only; NAT gateway egress |
| Auth | Cognito with TOTP MFA, admin-only user creation, 12+ char passwords |
| Container hardening | Non-root, curl/wget/netcat removed, tunnel disabled |
| Audit | Transcripts and audit logs persisted to EFS |
| Compliance | SOC 2 achievable; HIPAA partially blocked (provider BAA) |

---

## 5. Monorepo Structure

```
libs/
  core/
    constants/          # ENVIRONMENT enum
    cloud-config/       # StackPropsWithEnv, SSM registry, secrets policy
    types/              # UserConfig, TeamConfig, TeamClawConfig interfaces
  teamclaw/
    cloud-config/       # Lambda and Fargate default props
    backend-infra/      # CDK stacks, Lambda handlers
    container/          # Dockerfile, entrypoint wrapper, config merger

apps/
  00-foundation/teamclaw-foundation-infra/
  10-cluster/teamclaw-cluster-infra/
  20-control-plane/teamclaw-control-plane-infra/
  enterprise-chat/     # Angular 21 + Material chat frontend
```

---

## 6. Cost Model

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

---

## 7. Competitors

| Product | Differentiator | Gap |
|---------|---------------|-----|
| **KiloClaw** | Single-user managed hosting | No team features |
| **Lobu** | Developer cloud IDE | Not enterprise-oriented |
| **Agents Plane** | Multi-agent orchestration | No per-user isolation |
| **openclaw-multitenant** | Open source fork | Shared-process, no container isolation |
| **ChatGPT Enterprise** | OpenAI ecosystem | Vendor lock-in, no self-host |

**Our edge:** Container-per-user isolation + zero-fork OpenClaw + team collaboration + config hierarchy.

---

## 8. Risks

**OpenClaw Foundation Transition** — Creator joined OpenAI. Project may shift direction. *Mitigation:* Zero-fork design; pin to known-good versions.

**Zero-Fork Technical Debt** — We depend on config/protocol stability (`openclaw.json` schema, WebSocket API). *Mitigation:* Pin container image versions, maintain integration tests against OpenClaw APIs.
