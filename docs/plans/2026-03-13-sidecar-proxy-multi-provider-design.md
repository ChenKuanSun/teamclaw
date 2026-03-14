# Sidecar Proxy Multi-Provider Design

## Goal

Replace the current Key Pool Proxy Lambda with an ECS sidecar container that proxies all AI provider requests, supporting 20+ OpenClaw providers with API key, OAuth token, and AWS SDK auth — while keeping all credentials hidden from the OpenClaw container.

## Current Architecture

```
OpenClaw Container → Key Pool Proxy Lambda (API Gateway) → Anthropic/OpenAI/Google
```

- Only 3 providers (anthropic, openai, google)
- Only API key auth
- No streaming (sync fetch in Lambda)
- Keys stored in Secrets Manager as `{ anthropic: [keys], openai: [keys], google: [keys] }`

## New Architecture

```
OpenClaw Container → localhost:3000 (Sidecar Proxy) → Provider APIs
                                                    → Usage tracking (DynamoDB)
```

- All 20+ OpenClaw providers
- API key, OAuth token (setup-token, Codex), AWS SDK (Bedrock)
- Native SSE streaming pass-through
- Keys/tokens stored in Secrets Manager, read by sidecar at startup

### Bedrock Exception

Bedrock uses binary EventStream + SigV4 signing, not suitable for HTTP proxy. Bedrock bypasses the sidecar entirely:

```
OpenClaw Container → Bedrock API (via ECS Task Role, auth: "aws-sdk")
```

## Provider Auth Types

| Auth Type | HTTP Mechanism | Proxy Behavior | Examples |
|-----------|---------------|----------------|----------|
| `apiKey` | `x-api-key` or `Authorization: Bearer` | Inject key, forward request | anthropic, openai, google, openrouter, mistral, together, groq, zai, ollama |
| `oauthToken` | `Authorization: Bearer` + beta headers | Inject token, add provider-specific headers | anthropic (setup-token), openai-codex |
| `awsSdk` | SigV4 | **Bypass sidecar** — direct via Task Role | amazon-bedrock |

### Provider-Specific Auth Details

**Anthropic API key:**
- Header: `x-api-key: <key>`
- Required: `anthropic-version: 2023-06-01`
- Beta: `fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14`

**Anthropic setup-token** (prefix `sk-ant-oat`):
- Header: `Authorization: Bearer <token>`
- Required: `anthropic-version: 2023-06-01`
- Beta: `claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14`
- No refresh needed (static token, user re-pastes when expired)

**OpenAI API key:**
- Header: `Authorization: Bearer <key>`

**OpenAI Codex OAuth:**
- Header: `Authorization: Bearer <access_token>`
- Refresh: sidecar calls `https://auth.openai.com/oauth/token` with refresh_token when expired

**Google Gemini:**
- Header: `x-goog-api-key: <key>`

**Other API key providers** (openrouter, mistral, together, groq, etc.):
- Header: `Authorization: Bearer <key>` (OpenAI-compatible)

## Secrets Manager Format

New format supporting multiple auth types:

```json
{
  "providers": {
    "anthropic": {
      "authType": "apiKey",
      "keys": ["sk-ant-key1", "sk-ant-key2"]
    },
    "anthropic-token": {
      "authType": "oauthToken",
      "token": "sk-ant-oat01-..."
    },
    "openai": {
      "authType": "apiKey",
      "keys": ["sk-oai-key1"]
    },
    "openai-codex": {
      "authType": "oauthToken",
      "accessToken": "eyJ...",
      "refreshToken": "rt-...",
      "expiresAt": 1710000000
    },
    "google": {
      "authType": "apiKey",
      "keys": ["AIza-key1"]
    },
    "openrouter": {
      "authType": "apiKey",
      "keys": ["sk-or-key1"]
    }
  }
}
```

**Migration:** Admin API detects old format `{ anthropic: [keys] }` and auto-migrates to new format on first write.

## Sidecar Proxy Container

### Technology

Node.js HTTP proxy (lightweight, same runtime as OpenClaw). Listens on port 3000.

### Request Flow

1. OpenClaw sends request to `http://localhost:3000/<provider>/v1/messages`
2. Sidecar extracts provider from URL path
3. Looks up provider credentials from cached Secrets Manager data
4. For API key providers: round-robin key selection
5. For OAuth providers: check expiry, refresh if needed
6. Strips OpenClaw's dummy auth header, injects real credentials
7. Adds provider-specific headers (beta headers, version headers)
8. Forwards request to real provider API with streaming pass-through
9. Logs usage to DynamoDB (provider, model, userId, timestamp)

### Streaming

SSE pass-through only. The sidecar pipes the upstream response stream directly to the client. No buffering, no parsing.

For OpenAI Responses API: force `transport: "sse"` in OpenClaw config to avoid WebSocket complexity.

### Provider URL Mapping

```javascript
const PROVIDER_URLS = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  google: 'https://generativelanguage.googleapis.com',
  openrouter: 'https://openrouter.ai/api',
  mistral: 'https://api.mistral.ai',
  together: 'https://api.together.xyz',
  groq: 'https://api.groq.com/openai',
  // ... extensible via config
};
```

## OpenClaw Config Changes (`generate-config.js`)

```javascript
const baseConfig = {
  models: {
    providers: {
      anthropic: { baseUrl: 'http://localhost:3000/anthropic', apiKey: 'proxy-managed' },
      openai: { baseUrl: 'http://localhost:3000/openai', apiKey: 'proxy-managed' },
      google: { baseUrl: 'http://localhost:3000/google', apiKey: 'proxy-managed' },
      // ... dynamically generated from Secrets Manager provider list
      // Bedrock excluded — uses auth: "aws-sdk" directly
    },
  },
};
```

`apiKey: 'proxy-managed'` is a dummy value — OpenClaw requires it to register the provider, but the sidecar ignores it and substitutes the real credentials.

## ECS Task Definition Changes

Add sidecar container to the Fargate task definition:

```
Task Definition: teamclaw-user-{env}
  Container 1: teamclaw (existing)
    - image: ECR teamclaw-enterprise-{env}
    - port: 18789
    - essential: true
    - dependsOn: proxy-sidecar (HEALTHY)
  Container 2: proxy-sidecar (new)
    - image: ECR teamclaw-sidecar-{env}
    - port: 3000
    - essential: true
    - healthCheck: HTTP GET localhost:3000/health
    - environment: API_KEYS_SECRET_ARN, USAGE_TABLE_NAME, USER_ID
```

Both containers share the same Task Role (Secrets Manager + DynamoDB access). The main container starts after sidecar is healthy.

## CDK Changes

1. **FoundationStack** — Add second ECR repo `teamclaw-sidecar-{env}`
2. **ControlPlaneStack** — No changes (lifecycle Lambda already has RegisterTaskDefinition permission)
3. **Lifecycle Lambda** — Add `containerOverrides` for sidecar, register task definition with both containers

## Admin Panel Changes

### Provider Registry

Shared constant defining all supported providers with metadata:

```typescript
const PROVIDER_REGISTRY = [
  { id: 'anthropic', name: 'Anthropic (API Key)', authType: 'apiKey', envVar: 'ANTHROPIC_API_KEY' },
  { id: 'anthropic-token', name: 'Anthropic (Setup Token)', authType: 'oauthToken' },
  { id: 'openai', name: 'OpenAI (API Key)', authType: 'apiKey', envVar: 'OPENAI_API_KEY' },
  { id: 'openai-codex', name: 'OpenAI Codex (Subscription)', authType: 'oauthToken' },
  { id: 'google', name: 'Google Gemini', authType: 'apiKey', envVar: 'GEMINI_API_KEY' },
  { id: 'amazon-bedrock', name: 'Amazon Bedrock', authType: 'awsSdk' },
  { id: 'openrouter', name: 'OpenRouter', authType: 'apiKey', envVar: 'OPENROUTER_API_KEY' },
  { id: 'mistral', name: 'Mistral', authType: 'apiKey', envVar: 'MISTRAL_API_KEY' },
  { id: 'together', name: 'Together AI', authType: 'apiKey', envVar: 'TOGETHER_API_KEY' },
  { id: 'groq', name: 'Groq', authType: 'apiKey', envVar: 'GROQ_API_KEY' },
  { id: 'ollama', name: 'Ollama', authType: 'apiKey', envVar: 'OLLAMA_API_KEY' },
  { id: 'zai', name: 'Z.AI (GLM)', authType: 'apiKey', envVar: 'ZAI_API_KEY' },
  // ... more from OpenClaw catalog
];
```

### Admin API Changes

- `POST /admin/api-keys` — Support new Secrets Manager format, all provider IDs
- `GET /admin/api-keys` — Return keys grouped by provider with auth type
- `DELETE /admin/api-keys/{provider}/{index}` — Support new format
- Onboarding wizard provider dropdown — Use PROVIDER_REGISTRY

### Onboarding Wizard

Provider dropdown shows all providers from registry. Auth type determines the form:
- `apiKey` → API key input field
- `oauthToken` → Token/paste input with instructions (e.g., "Run `claude setup-token` and paste here")
- `awsSdk` → No key needed, just enable (uses Task Role)

## Key Pool Proxy Lambda (Retained)

Keep the existing Key Pool Proxy Lambda for external service integrations only (non-container clients that need centrally-managed API keys). Not used by OpenClaw containers.

## Usage Tracking

Sidecar logs every request to DynamoDB (same schema as current Key Pool Proxy):
- `userId`, `timestamp`, `provider`, `model`, `ttl` (90 days)

Admin analytics endpoints continue to work unchanged.

## Migration Path

1. Build sidecar proxy container image
2. Deploy to new ECR repo
3. Update Lifecycle Lambda to register task definition with sidecar
4. Update `generate-config.js` to point baseUrl to localhost:3000
5. Migrate Secrets Manager format (auto-detect old/new)
6. Update Admin API + Panel for new provider registry
7. Existing containers continue working (Key Pool Proxy Lambda stays until all containers are re-provisioned)

## Out of Scope

- Bedrock configuration UI (just enable/disable via Task Role)
- Per-user provider restrictions (future: config table can restrict providers per team/user)
- OpenClaw native auth profile management (all auth managed by TeamClaw admin)
- Google Vertex / Antigravity OAuth (complex plugin-based auth, low priority)
- WebSocket transport for OpenAI Responses (force SSE via config)
