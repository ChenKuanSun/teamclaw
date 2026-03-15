#!/bin/sh
set -e

# ─── Security Controls (zero source code modification) ───
# Strip all provider API keys from environment
unset ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_API_KEY GEMINI_API_KEY

export OPENCLAW_TUNNEL=false

# Audit log to persistent EFS
export OPENCLAW_AUDIT_DIR="/efs/users/${USER_ID}/audit"
export OPENCLAW_TRANSCRIPT_DIR="/efs/users/${USER_ID}/transcripts"
mkdir -p "$OPENCLAW_AUDIT_DIR" "$OPENCLAW_TRANSCRIPT_DIR" 2>/dev/null || true

# ─── Generate merged config (Global → Team → User) ───
node /scripts/generate-config.js

# ─── Start OpenClaw Gateway (upstream binary) ───
# Auth is handled by ALB/CloudFront upstream; container is in private subnet.
exec openclaw gateway run --port 18789 --bind lan --auth trusted-proxy --allow-unconfigured
