# TeamClaw MVP — Team Mode Self-Service Management

## Goal

Enable enterprise employees to self-service login and use OpenClaw via Team mode, with IT admin only doing initial config setup.

## Core Flow

```
Employee SSO Login (Chat App)
       ↓
POST /user/session (JWT)
       ↓
Backend checks DynamoDB user record
       ↓
┌─ exists + running    → return WebSocket endpoint
├─ exists + stopped    → Lifecycle start → "Starting up..."
├─ exists + provisioned → same as above
└─ no record →
      check email domain ∈ allowedDomains?
      → yes: create user + assign defaultTeam + provision + start
             → "First time setup, please wait..."
      → no:  403 "Contact your IT admin"
```

## Global Config Keys

| Key | Default | Description |
|-----|---------|-------------|
| `allowedDomains` | `[]` | Email domains allowed for self-service login |
| `defaultTeamId` | `""` | Team to auto-assign new users |
| `idleTimeoutMinutes` | `30` | Idle auto-stop threshold |

Team/User level can override `idleTimeoutMinutes`. Other config (SOUL.md etc.) uses existing config system.

## Changes Required

### Backend — New Lambda

`POST /user/session` — called by Chat App (not admin API):
- Extract email + sub from JWT
- Query DynamoDB user record
- No record → check domain → create user + assign team + Lifecycle provision+start
- Exists but stopped → Lifecycle start
- Return `{ status: "ready"|"starting"|"provisioning", wsEndpoint?, estimatedWaitSeconds? }`

### Backend — Admin Config

- Seed default config entries: `allowedDomains`, `defaultTeamId`, `idleTimeoutMinutes`

### Frontend — Chat App

- After login, call `POST /user/session`
- If not `ready` → show waiting screen (spinner + message)
- Poll `/user/session` until `ready` → connect WebSocket

### Frontend — Admin Panel

- Config page: add "New Config Entry" button
- Team Detail: add "Add Member" feature
- Replace native `confirm()` with existing `ConfirmDialogComponent`

## Out of Scope (YAGNI)

- No `resourceProfile` — single task definition for now
- No `maxConcurrentUsers` — no limit for now
- No `allowedProviders` — global key pool only
- No container logs viewer
- No analytics charts
