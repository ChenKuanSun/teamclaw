# TeamClaw SaaS Architecture Plan

> Converting from self-hosted enterprise platform to multi-tenant SaaS

---

## Multi-Tenancy Model: Bridge

**Shared compute, isolated data.** Keep shared ECS clusters and ALB, isolate at the data layer.

| Layer | Current (Single-Tenant) | SaaS (Multi-Tenant) |
|-------|------------------------|---------------------|
| DynamoDB | PK: `userId` | PK: `tenantId#userId` |
| EFS | `/efs/users/{userId}/` | `/efs/tenants/{tenantId}/users/{userId}/` |
| Secrets Manager | `tc/prod/api-keys` | `tc/{tenantId}/api-keys` |
| Cognito | Single pool, domain allowlist | Single pool, `custom:tenantId` attribute |
| Container env | `USER_ID`, `TEAM_ID` | `TENANT_ID`, `USER_ID`, `TEAM_ID` |
| Sidecar usage | `userId` in DDB record | `tenantId` + `userId` in DDB record |

---

## Tenant Resolution Flow

```
User logs in (Cognito)
  → JWT contains custom:tenantId
    → Session Lambda reads tenantId from user record
      → Checks tenant tier + quota
        → Provisions container with TENANT_ID env var
          → Sidecar reads tenant-specific API keys from SM
            → Usage logged with tenantId for billing
```

**MVP:** Login-based resolution (single domain `app.teamclaw.ai`).
**Phase 2:** Subdomain resolution (`acme.teamclaw.ai` → CloudFront Function extracts tenant slug).

---

## Scope / Tier System

### Enforcement Points

```
                    ┌─────────────────────┐
                    │  API Gateway         │
                    │  Lambda Authorizer   │──→ Check: tier allows this endpoint?
                    └──────┬──────────────┘
                           │
                    ┌──────▼──────────────┐
                    │  Session Lambda      │──→ Check: user count < tier max?
                    │  (user-session.ts)   │──→ Check: daily API calls < quota?
                    └──────┬──────────────┘
                           │
                    ┌──────▼──────────────┐
                    │  Lifecycle Lambda    │──→ Check: provider allowed for tier?
                    │  (lifecycle/index.ts)│──→ Route to shared or dedicated cluster
                    └──────┬──────────────┘
                           │
                    ┌──────▼──────────────┐
                    │  Sidecar Proxy       │──→ Check: API call quota remaining?
                    │  (sidecar/index.ts)  │──→ Log usage with tenantId for billing
                    └─────────────────────┘
```

### Tier Configuration (stored in Tenants DynamoDB table)

```typescript
interface TenantQuotas {
  maxUsers: number;           // 1 / 25 / unlimited
  maxProviders: number;       // 1 / 12 / unlimited
  dailyApiCallsPerUser: number; // 100 / 5000 / unlimited
  maxSkills: number;          // 3 / 6 / unlimited
  maxIntegrations: number;    // 0 / 3 / 6
  dataRetentionDays: number;  // 7 / 90 / custom
  allowCustomDomain: boolean; // false / false / true
  allowSSO: boolean;          // false / false / true
  dedicatedCompute: boolean;  // false / false / true
}
```

---

## New DynamoDB Tables

### Tenants Table

| Attribute | Type | Description |
|-----------|------|-------------|
| `tenantId` (PK) | S | UUID |
| `slug` | S | URL-safe unique identifier |
| `name` | S | Display name |
| `tier` | S | `free` / `team` / `enterprise` |
| `status` | S | `active` / `suspended` / `cancelled` |
| `ownerUserId` | S | Cognito user ID of the creator |
| `stripeCustomerId` | S | Stripe customer ID |
| `stripeSubscriptionId` | S | Stripe subscription ID |
| `quotas` | M | TenantQuotas map |
| `createdAt` | S | ISO timestamp |

GSIs: `by-slug` (PK: slug), `by-owner` (PK: ownerUserId)

### Invitations Table

| Attribute | Type | Description |
|-----------|------|-------------|
| `inviteId` (PK) | S | UUID |
| `tenantId` | S | Target tenant |
| `email` | S | Invitee email |
| `invitedBy` | S | Inviter user ID |
| `role` | S | `admin` / `member` |
| `status` | S | `pending` / `accepted` / `expired` |
| `expiresAt` | N | TTL timestamp |

GSIs: `by-email` (PK: email), `by-tenant` (PK: tenantId)

---

## Phase 1: MVP SaaS (8-10 weeks)

### New CDK Stack: `infra-saas`

```
apps/infra-saas/teamclaw-saas-infra/
├── cdk/
│   ├── app.ts
│   └── main.ts
```

Resources:
- Tenants DynamoDB table
- Invitations DynamoDB table
- SaaS API Gateway (separate from admin API)
- 12 new Lambda handlers
- Stripe webhook endpoint
- SES email sending (for invitations)

### New Lambda Handlers (12)

| Handler | Method | Path | Purpose |
|---------|--------|------|---------|
| `create-tenant` | POST | `/saas/tenants` | Create team + SM secret + EFS dirs |
| `get-tenant` | GET | `/saas/tenants/:id` | Tenant details |
| `update-tenant` | PUT | `/saas/tenants/:id` | Update name/settings |
| `get-quota` | GET | `/saas/tenants/:id/quota` | Current usage vs limits |
| `invite-member` | POST | `/saas/tenants/:id/invites` | Send email invite |
| `accept-invite` | POST | `/saas/invites/:id/accept` | Link user to tenant |
| `list-members` | GET | `/saas/tenants/:id/members` | List tenant members |
| `remove-member` | DELETE | `/saas/tenants/:id/members/:uid` | Remove member |
| `add-tenant-key` | POST | `/saas/tenants/:id/api-keys` | Add API key to tenant pool |
| `list-tenant-keys` | GET | `/saas/tenants/:id/api-keys` | List masked keys |
| `create-checkout` | POST | `/saas/billing/checkout` | Stripe Checkout session |
| `stripe-webhook` | POST | `/saas/billing/webhook` | Handle Stripe events |

### Files to Modify (existing)

| File | Changes |
|------|---------|
| `libs/core/types/src/index.ts` | Add `TenantConfig`, `TenantTier`, `InvitationConfig` |
| `libs/core/cloud-config/src/ssm/ssm.ts` | Add SaaS SSM parameters |
| `control-plane.stack.ts` | Add `tenantId` GSI to users/usage tables, Cognito `custom:tenantId` |
| `lambda/session/user-session.ts` | Resolve tenant, check quota, pass `TENANT_ID` |
| `lambda/lifecycle/index.ts` | Tenant-scoped EFS paths, tenant-specific SM ARN |
| `sidecar/src/usage.ts` | Add `tenantId` to DDB usage items |
| `container/scripts/generate-config.js` | Read `TENANT_ID` for EFS paths |
| `container/entrypoint.sh` | `OPENCLAW_STATE_DIR` → `/efs/tenants/$TENANT_ID/users/$USER_ID/...` |

### Angular Changes

**web-chat** — new pages:
- `pages/create-team/` — Team creation form (name, slug)
- `pages/team-settings/` — Member management, API keys, billing
- `pages/invite/` — Accept invitation flow
- `pages/billing/` — Stripe billing portal
- `services/tenant.service.ts` — Tenant context (tenantId, tier, role)

**web-admin** — super-admin additions:
- `features/tenants/` — List/manage all tenants (platform admin only)
- `features/tenant-detail/` — Edit tenant tier/quota, view usage

---

## Phase 2: Growth (6-8 weeks)

- **Subdomain routing** — CloudFront Function extracts tenant slug from `Host` header
- **Custom domains** — ACM certificate per enterprise tenant, DNS verification flow
- **SSO/SAML** — Per-tenant SAML IdP in shared Cognito pool
- **Advanced analytics** — Per-tenant cost allocation, usage export

---

## Phase 3: Scale (6-8 weeks)

- **Dedicated compute** — Enterprise tenants get isolated ECS cluster
- **Usage-based billing** — Stripe Metering API, per-API-call charges
- **Budget alerts** — Per-tenant spend thresholds, auto-suspension
- **Tenant analytics** — Aggregation Lambda + dashboard

---

## Migration Strategy (Existing → SaaS)

1. Create "default" tenant for current org
2. Backfill `tenantId` on all user/usage records
3. Migrate EFS: symlink `/efs/tenants/{defaultTenantId}/users/` → `/efs/users/`
4. Copy Secrets Manager: `tc/prod/api-keys` → `tc/{defaultTenantId}/api-keys`
5. Deploy SaaS stack
6. Set `SAAS_MODE=true` — codebase supports both modes via env flag

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Cognito pools | Single shared pool | Per-tenant pools are expensive ($0.0055/MAU × N tenants) |
| Tenant resolution | Login-based (MVP) | Simplest; no infra changes for routing |
| Data isolation | DDB partition key + EFS dirs | Strong isolation without separate infrastructure |
| Billing | Stripe Subscriptions | Industry standard, self-service, webhooks |
| Backward compat | `SAAS_MODE` env flag | Same codebase for self-hosted and SaaS |
