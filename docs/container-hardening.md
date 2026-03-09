# Container Hardening Guide

How TeamClaw wraps upstream OpenClaw into a hardened, enterprise-ready container — without modifying any OpenClaw source code.

## Dockerfile

```dockerfile
FROM node:20-slim AS base

# Pin upstream OpenClaw version
ARG OPENCLAW_VERSION=1.2.3
RUN npm install -g openclaw@${OPENCLAW_VERSION}

# Remove dangerous binaries
RUN apt-get update && \
    apt-get remove -y curl wget netcat-openbsd && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# Copy entrypoint and config scripts
COPY entrypoint.sh /entrypoint.sh
COPY scripts/ /scripts/
RUN chmod +x /entrypoint.sh

RUN mkdir -p /workspace /efs

# Non-root user
USER node
WORKDIR /workspace

EXPOSE 18789
ENTRYPOINT ["/entrypoint.sh"]
```

**Key decisions:**
- **Pinned version** — `OPENCLAW_VERSION` arg controls exactly which upstream release runs
- **Removed network tools** — `curl`, `wget`, `netcat` removed to prevent exfiltration
- **Non-root** — Container runs as `node` user (UID 1000)
- **No build tools** — Uses `node:20-slim` (not full image)

## Entrypoint Wrapper

The entrypoint is the core of the zero-modification approach. It runs **before** OpenClaw starts:

```bash
#!/bin/sh
set -e

# 1. Strip API keys — containers must go through Key Pool Proxy
unset ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_API_KEY GEMINI_API_KEY

# 2. Force safe defaults (OPENCLAW_* env vars read by upstream)
export OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-$(random 64 chars)}"
export OPENCLAW_TUNNEL=false

# 3. Audit logging to persistent EFS
export OPENCLAW_AUDIT_DIR="/efs/users/${USER_ID}/audit"
export OPENCLAW_TRANSCRIPT_DIR="/efs/users/${USER_ID}/transcripts"

# 4. Generate merged config
node /scripts/generate-config.js

# 5. Start OpenClaw Gateway
exec openclaw gateway --config /workspace/openclaw.json
```

**What this achieves:**
- API keys physically absent from container environment
- Tunnel functionality disabled (prevents external connections)
- Audit trail persisted to EFS (survives container restarts)
- Config hierarchy merged before startup

## Config Merger (`generate-config.js`)

Merges three levels of configuration into the final `openclaw.json`:

```
Global (/efs/system/global-config.json)
  → Team (/efs/teams/{teamId}/team-config.json)
    → User (/efs/users/{userId}/user-config.json)
      = /workspace/openclaw.json
```

Deep merge strategy: nested objects are recursively merged, scalar values are overwritten. Each level can restrict but not escalate permissions.

SOUL.md files are concatenated (not merged), preserving all layers:
```
Enterprise SOUL.md + Team SOUL.md + User SOUL.md → /workspace/SOUL.md
```

MEMORY.md is copied from user's EFS directory if it exists.

## Security Properties

| Property | Mechanism |
|----------|-----------|
| No API key leakage | `unset` in entrypoint; keys never enter container |
| No network exfiltration tools | `curl`/`wget`/`netcat` removed at build time |
| No privilege escalation | Non-root user, no `sudo` installed |
| No tunnel bypass | `OPENCLAW_TUNNEL=false` forced |
| Storage isolation | EFS Access Points enforce POSIX UID/GID per user |
| Audit persistence | Transcripts written to EFS, not lost on container stop |
| Graceful shutdown | `exec` ensures SIGTERM reaches OpenClaw process |

## Upgrading OpenClaw

To upgrade the upstream OpenClaw version:

1. Update `OPENCLAW_VERSION` in the Dockerfile
2. Build and push new image to ECR
3. Update `teamclawImageTag` in `libs/teamclaw/cloud-config/src/fargate/props.ts`
4. Deploy — ECS will roll out new task definitions

No source code changes, no merge conflicts, no fork maintenance.
