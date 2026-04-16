#!/bin/sh
set -e

# ─── Security Controls (zero source code modification) ───
# Strip all provider API keys — sidecar proxy handles all provider auth
unset ANTHROPIC_API_KEY ANTHROPIC_OAUTH_TOKEN OPENAI_API_KEY GOOGLE_API_KEY GEMINI_API_KEY

# Point upstream at EFS for all state (sessions, audit, transcripts under this root)
# Upstream env var reference: src/config/paths.ts
export OPENCLAW_STATE_DIR="/efs/users/${USER_ID}/openclaw-state"
if ! mkdir -p "$OPENCLAW_STATE_DIR"; then
  echo "[entrypoint] FATAL: cannot create $OPENCLAW_STATE_DIR — EFS mount failed?" >&2
  exit 1
fi
if ! (touch "$OPENCLAW_STATE_DIR/.write-probe" && rm -f "$OPENCLAW_STATE_DIR/.write-probe"); then
  echo "[entrypoint] FATAL: $OPENCLAW_STATE_DIR not writable — check EFS IAM / access point" >&2
  exit 1
fi

# User skills directory (users can create custom SKILL.md files here).
# EFS is already verified above; a soft failure here only disables user-authored skills.
mkdir -p "/efs/users/${USER_ID}/user-skills" || \
  echo "[entrypoint] WARN: user-skills dir not created — custom skills disabled" >&2

# ─── Generate merged config (Global → Team → User) ───
node /scripts/generate-config.js

# ─── Start OpenClaw Gateway (upstream binary) ───
# All model API calls are routed through sidecar proxy (http://localhost:3000).
# Auth is handled by ALB/CloudFront upstream; container is in private subnet.
exec openclaw gateway run --port 18789 --bind lan --auth trusted-proxy --allow-unconfigured
