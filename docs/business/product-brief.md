# TeamClaw — Product Brief

> Enterprise AI Collaboration Platform as a Service

---

## Executive Summary

TeamClaw is a **multi-tenant SaaS platform** that enables organizations to deploy AI-powered collaboration tools for their teams. Built on [OpenClaw](https://github.com/openclaw/openclaw) (60K+ stars), TeamClaw wraps the open-source AI agent into an enterprise-grade product with centralized API key management, per-user container isolation, team configuration hierarchy, and usage-based billing.

**One-liner:** *Deploy AI agents for your team — no infrastructure, no per-user API keys, just sign up and start.*

---

## Problem

Organizations adopting AI face three operational challenges:

1. **API Key Sprawl** — Each employee needs their own AI provider keys. IT has no visibility into usage, cost, or compliance.
2. **No Isolation** — Shared AI instances leak context between users. Conversations, files, and prompts are visible across teams.
3. **No Governance** — Employees use whatever AI features they want (computer use, experimental betas), bypassing compliance controls.

---

## Solution

TeamClaw solves all three with a zero-configuration approach:

| Problem | TeamClaw Solution |
|---------|------------------|
| API Key Sprawl | **Centralized key pool** — IT manages keys; users never see them |
| No Isolation | **Container-per-user** — each user gets their own AI environment |
| No Governance | **Beta allowlist + usage logging** — IT controls which features are active |

### How It Works

```
Org signs up → Creates team → Adds API keys in admin panel
                                    ↓
        Team members sign up with company email → Get personal AI container
                                    ↓
        Each user's AI calls routed through sidecar proxy → keys injected, usage logged
```

---

## SaaS Model

### Tenant Architecture

```
                    ┌──────────────────────────────┐
                    │     app.teamclaw.ai           │
                    │  (shared Angular frontend)    │
                    └──────────┬───────────────────┘
                               │ Login → resolve tenantId
                    ┌──────────▼───────────────────┐
                    │     Shared Infrastructure     │
                    │  CloudFront → ALB → ECS       │
                    │  (bridge model: shared compute,│
                    │   isolated data)              │
                    └──────────┬───────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
    ┌─────▼─────┐       ┌─────▼─────┐       ┌─────▼─────┐
    │ Tenant A  │       │ Tenant B  │       │ Tenant C  │
    │ EFS: /t/A │       │ EFS: /t/B │       │ EFS: /t/C │
    │ SM: tc/A  │       │ SM: tc/B  │       │ SM: tc/C  │
    │ DDB: pk=A │       │ DDB: pk=B │       │ DDB: pk=C │
    └───────────┘       └───────────┘       └───────────┘
```

**Multi-tenancy model:** Bridge — shared ECS clusters and ALB, isolated data at DynamoDB partition key, EFS directory, and Secrets Manager path levels.

### Tier / Scope System

| | Free | Team | Enterprise |
|---|---|---|---|
| **Price** | $0 | $29/user/mo | Custom |
| **Users** | 1 | Up to 25 | Unlimited |
| **AI Providers** | 1 provider | All 12 providers | All + custom |
| **API Calls** | 100/day | 5,000/day/user | Unlimited |
| **Skills** | 3 bundled | All 6 + custom | All + ClawHub marketplace |
| **Integrations** | None | Notion, Slack, GitHub | + Jira, Confluence, Linear |
| **Config Hierarchy** | User only | System → Team → User | Full hierarchy |
| **Bootstrap Files** | SOUL.md only | All 6 files | All 6 + custom |
| **Support** | Community | Email (48h SLA) | Dedicated (4h SLA) |
| **Container** | Shared cluster | Shared cluster | Dedicated cluster |
| **Domain** | app.teamclaw.ai | team.teamclaw.ai | custom domain |
| **Auth** | Email/password | Email/password | SSO / SAML / OIDC |
| **Usage Analytics** | Basic | Per-user breakdown | Cost allocation + export |
| **Data Retention** | 7 days | 90 days | Custom |

### Revenue Model

- **Self-service:** Credit card → Stripe subscription → auto-billing
- **Enterprise:** Custom contract → annual billing → dedicated onboarding
- **Usage-based add-on:** $0.01/API call beyond tier limit (applied to Team + Enterprise)

---

## Competitive Landscape

| | TeamClaw | NemoClaw (NVIDIA) | Direct OpenClaw | Cursor / Windsurf |
|---|---|---|---|---|
| **Model** | SaaS / Self-hosted | Self-hosted only | Self-hosted only | SaaS |
| **Isolation** | Container-per-user | Kernel sandbox | None | None |
| **Key Pool** | Round-robin + logging | None | None | Built-in |
| **Team Config** | System→Team→User | None | None | None |
| **Multi-provider** | 12 providers | NVIDIA only | All | Limited |
| **Governance** | Beta allowlist | Egress allowlist | None | None |
| **Open Source** | Apache 2.0 | Apache 2.0 | Apache 2.0 | Proprietary |
| **Status** | GA | Alpha | GA | GA |

### Key Differentiators

1. **Only SaaS option** for OpenClaw — competitors are all self-hosted or different products
2. **Container-per-user isolation** — strongest security boundary in the market
3. **Enterprise governance** — beta allowlist, usage logging, config hierarchy
4. **Zero source modification** — upstream compatible, instant version upgrades

---

## Go-to-Market

### Phase 1: Developer Preview (Month 1-2)
- Free tier only
- Target: individual developers who want a managed OpenClaw
- Distribution: Product Hunt, Hacker News, OpenClaw community
- Goal: 500 signups, 50 daily active users

### Phase 2: Team Launch (Month 3-4)
- Team tier launch + Stripe billing
- Target: small engineering teams (5-15 people)
- Distribution: direct outreach to OpenClaw GitHub stargazers, dev tool newsletters
- Goal: 20 paying teams, $15K MRR

### Phase 3: Enterprise (Month 5-8)
- Enterprise tier + SSO/SAML + custom domains + dedicated compute
- Target: mid-market companies (50-500 employees)
- Distribution: sales team, partnerships, case studies
- Goal: 5 enterprise contracts, $50K ARR each

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Angular 21, Material Design 3, WebSocket |
| **Auth** | AWS Cognito (email + SSO/SAML for enterprise) |
| **Compute** | ECS Fargate (per-user containers) |
| **Proxy** | Sidecar (Node.js — auth, usage, governance) |
| **API** | API Gateway + Lambda (44 handlers) |
| **Storage** | DynamoDB, EFS, Secrets Manager |
| **CDN** | CloudFront (HTTPS/WSS termination) |
| **Billing** | Stripe (subscriptions + usage metering) |
| **IaC** | AWS CDK (5 stacks, deterministic deployment) |
| **Monorepo** | Nx (9 projects, 1034+ tests) |
| **AI Runtime** | OpenClaw @ 2026.4.14 (upstream, unmodified) |

---

## Cost Structure (AWS infrastructure per 100 users)

| Component | Monthly Cost |
|-----------|-------------|
| ECS Fargate (0.5 vCPU, 1GB, 8hr/day avg) | $440 |
| EFS (5GB/user) | $150 |
| ALB + CloudFront | $75 |
| Lambda + API Gateway | $30 |
| DynamoDB | $20 |
| Secrets Manager | $15 |
| **Total** | **~$730** |
| **Per-user cost** | **~$7.30** |
| **Team tier revenue (100 users × $29)** | **$2,900** |
| **Gross margin** | **~75%** |

---

## SaaS Implementation Roadmap

### Phase 1: MVP SaaS (8-10 weeks)
- Login-based tenant resolution (single domain)
- Self-service team creation + member invitations
- Tier enforcement (free/team quotas)
- Stripe billing integration
- Per-tenant API key isolation
- Tenant-scoped DynamoDB + EFS

### Phase 2: Growth (6-8 weeks)
- Subdomain routing (team.teamclaw.ai)
- Custom domains for enterprise
- SSO / SAML / OIDC
- Advanced analytics dashboard

### Phase 3: Scale (6-8 weeks)
- Dedicated compute for enterprise tenants
- Usage-based billing with Stripe metering
- Budget alerts + auto-suspension
- Tenant analytics + cost allocation export

---

## Team

| Role | Person |
|------|--------|
| Founder / Lead Engineer | CK Sun |
| Company | Affiora AI |
| Contact | cksun@affiora.ai |

---

## Links

- **GitHub (Open Source):** [github.com/ChenKuanSun/teamclaw](https://github.com/ChenKuanSun/teamclaw)
- **License:** Apache 2.0
- **Built on:** [OpenClaw](https://github.com/openclaw/openclaw)
