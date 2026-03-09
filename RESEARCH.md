# OpenClaw Enterprise - Architecture Reference

## 1. Product Vision

OpenClaw Enterprise is an **enterprise team AI collaboration product** — not managed hosting, not an infra layer. It wraps OpenClaw into a turnkey SaaS with zero source code modifications.

**5 Core Features:**
1. **Shared API Key Pool** — Company-managed keys, per-user usage tracking, round-robin proxy
2. **SSO Chat Window** — Angular web UI with Cognito auth, embedded WebSocket chat
3. **Per-User Bot** — Isolated OpenClaw container per user (ECS Fargate, EFS storage)
4. **Team Bots** — Shared OpenClaw instances for team-scoped workflows
5. **Enterprise Collaboration** — SOUL.md/MEMORY.md layering, shared knowledge base, config hierarchy

**Critical Constraint:** Zero OpenClaw source code modifications. All customization via config, environment variables, plugin hooks, and the provider proxy pattern.

---

## 2. OpenClaw Native Features (No Fork Needed)

These built-in capabilities eliminate the need to fork:

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

---

## 3. Architecture

### 3.1 Monorepo & Stack Layout

Nx monorepo following Affiora patterns: `StackPropsWithEnv`, SSM Parameter cross-stack refs, `@openclaw/*` path aliases.

**3 CDK Stacks:**
- **Foundation** — VPC, EFS, ECR, Secrets Manager base
- **Cluster** — ECS Fargate cluster, ALB with WebSocket support, security groups
- **Control Plane** — Cognito (admin + user pools), Key Pool Proxy Lambda, Lifecycle Lambda

### 3.2 Frontend

Angular 21 + Angular Material chat UI. **Not Nebular** — Nebular is incompatible with Angular 21.

### 3.3 Container Design

Hardened Docker container with entrypoint wrapper that:
- Mounts user-specific EFS directory to `~/.openclaw/`
- Mounts shared read-only EFS to `/shared/`
- Merges config hierarchy before starting OpenClaw Gateway
- Sets `BB_SKIP_PERMISSIONS=false`

### 3.4 Config Hierarchy

Global (enterprise) -> Team -> User, applied via JSON merge on EFS:

```
/efs/global/openclaw.json        # Enterprise defaults (models, policies)
/efs/teams/{team}/openclaw.json  # Team overrides (agents, tools)
/efs/users/{user}/openclaw.json  # User preferences
```

Entrypoint wrapper merges these into final `openclaw.json` before Gateway starts.

### 3.5 SOUL.md + MEMORY.md Layering

Same merge pattern: enterprise SOUL.md (company identity, compliance rules) + team SOUL.md (domain expertise) + user SOUL.md (personal style). Concatenated at container start.

---

## 4. Security (CISO Review)

| Requirement | Implementation |
|-------------|---------------|
| User isolation | Container-per-user mandatory; zero intra-gateway auth surface |
| Permission enforcement | `BB_SKIP_PERMISSIONS=false` enforced via entrypoint |
| Storage isolation | EFS Access Points per user (POSIX UID/GID enforcement) |
| Network | Private subnets only; restrictive egress (AI provider IPs + package registries) |
| API keys | Never in containers; Key Pool Proxy holds keys, containers see only proxy URL |
| Audit | Audit log externalized to CloudWatch/S3 via sidecar |
| Compliance | SOC 2 achievable with current design; HIPAA partially blocked (EFS encryption at rest OK, but BAA coverage for AI providers unclear) |

---

## 5. Monorepo Structure

```
libs/
  core/
    constants/          # Shared constants (SSM paths, naming conventions)
    cloud-config/       # StackPropsWithEnv, SSM registry, shared CDK utilities
    types/              # Cross-package TypeScript types
  openclaw/
    cloud-config/       # OpenClaw-specific CDK constructs (task def, ALB rules)
    backend-infra/      # Shared infra constructs (EFS access points, SGs)
    container/          # Dockerfile, entrypoint wrapper, config merger

apps/
  00-foundation/
    openclaw-foundation-infra/   # VPC, EFS, ECR, Secrets Manager
  10-cluster/
    openclaw-cluster-infra/      # ECS Cluster, ALB, Service Discovery
  20-control-plane/
    openclaw-control-plane-infra/ # Cognito, Key Pool Proxy, Lifecycle Lambda
  enterprise-chat/               # Angular 21 chat frontend
```

---

## 6. Cost Model

| Component | 10 users | 100 users | 1000 users |
|-----------|----------|-----------|------------|
| ECS Fargate (0.5 vCPU, 1GB, 8hr/day, scale-to-zero) | $44 | $440 | $4,400 |
| EFS (5GB/user) | $15 | $150 | $1,500 |
| ALB + data transfer | $25 | $50 | $150 |
| Key Pool Proxy (API GW + Lambda) | $5 | $20 | $100 |
| Control Plane (Lambda, DynamoDB, Cognito) | $15 | $30 | $80 |
| Secrets Manager | $8 | $15 | $30 |
| **Total** | **$112** | **$705** | **$6,260** |
| **Per-user cost** | **$11.20** | **$7.05** | **$6.26** |

**Pricing Recommendation:**
- **Starter ($39/user/mo)** — Per-user bot, shared key pool, web chat
- **Team ($69/user/mo)** — + Team bots, SOUL.md layering, priority support
- **Enterprise ($149/user/mo)** — + SSO, audit logs, custom integrations, SLA

---

## 7. Competitors

| Product | Model | Differentiator | Gap |
|---------|-------|---------------|-----|
| **KiloClaw** | Managed OpenClaw hosting | Single-user focus | No team features |
| **Lobu** | OpenClaw cloud IDE | Developer-focused | Not enterprise/team oriented |
| **Agents Plane** | Agent orchestration platform | Multi-agent workflows | No per-user isolation |
| **openclaw-multitenant** | Community multi-tenant fork | Open source | Shared-process, no container isolation |
| **ChatGPT Enterprise** | OpenAI's enterprise offering | Brand, ecosystem | Vendor lock-in, no self-host, limited customization |

**Our edge:** Container-per-user isolation + zero-fork OpenClaw + team collaboration features + config hierarchy. No competitor offers all four.

---

## 8. Risks

### Risk 1: OpenClaw Foundation Transition
OpenClaw's creator joined OpenAI. Project may shift direction, slow down, or change licensing. **Mitigation:** Zero-fork design means we can pin to a known-good version. Container image is our boundary. Monitor upstream, contribute selectively.

### Risk 2: Zero-Fork Technical Debt
We depend on config/protocol stability (`openclaw.json` schema, WebSocket API, `/v1/responses`). Breaking changes upstream force container image version pinning and potential feature lag. **Mitigation:** Pin container base image versions. Maintain integration test suite against OpenClaw APIs. Abstract OpenClaw-specific config behind our merger layer.
