#!/bin/sh
set -e

# ─── Security Controls (zero source code modification) ───
# Strip all provider API keys — sidecar proxy handles all provider auth
unset ANTHROPIC_API_KEY ANTHROPIC_OAUTH_TOKEN OPENAI_API_KEY GOOGLE_API_KEY GEMINI_API_KEY

export OPENCLAW_TUNNEL=false

# Audit log to persistent EFS
export OPENCLAW_AUDIT_DIR="/efs/users/${USER_ID}/audit"
export OPENCLAW_TRANSCRIPT_DIR="/efs/users/${USER_ID}/transcripts"
mkdir -p "$OPENCLAW_AUDIT_DIR" "$OPENCLAW_TRANSCRIPT_DIR" 2>/dev/null || true

# Persist sessions on EFS (survives container restarts)
export OPENCLAW_SESSION_DIR="/efs/users/${USER_ID}/sessions"
mkdir -p "$OPENCLAW_SESSION_DIR" 2>/dev/null || true

# ─── Generate merged config (Global → Team → User) ───
node /scripts/generate-config.js

# Symlink OpenClaw's session store to EFS for persistence
OPENCLAW_STATE_DIR="${HOME}/.openclaw/agents/main/sessions"
mkdir -p "$(dirname "$OPENCLAW_STATE_DIR")" 2>/dev/null || true
if [ ! -L "$OPENCLAW_STATE_DIR" ]; then
  rm -rf "$OPENCLAW_STATE_DIR"
  ln -sf "$OPENCLAW_SESSION_DIR" "$OPENCLAW_STATE_DIR"
fi

# ─── Start OpenClaw Gateway (upstream binary) ───
# All model API calls are routed through sidecar proxy (http://localhost:3000).
# Auth is handled by ALB/CloudFront upstream; container is in private subnet.
exec openclaw gateway run --port 18789 --bind lan --auth trusted-proxy --allow-unconfigured
