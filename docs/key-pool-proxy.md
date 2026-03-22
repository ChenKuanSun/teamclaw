# Key Pool Proxy

The Key Pool Proxy is an API Gateway + Lambda function that sits between OpenClaw containers and AI provider APIs. It solves the core enterprise problem: **managing shared API keys without exposing them to user containers**.

## How It Works

```
OpenClaw container
  ↓ models.providers.anthropic.baseUrl = "https://{api-gw}/anthropic"
API Gateway (/{provider}/{proxy+})
  ↓
Key Pool Proxy Lambda
  ├─ Fetch keys from Secrets Manager (5-min cache)
  ├─ Pick key via round-robin per provider
  ├─ Track usage in DynamoDB (user, provider, model, timestamp)
  └─ Forward request to real provider API with injected key
  ↓
Provider API (Anthropic / OpenAI / Google)
```

## Provider Routing

The Lambda determines the provider from the URL path or `x-provider` header:

| Path Pattern | Provider | Auth Header |
|-------------|----------|-------------|
| `/anthropic/*` | Anthropic | `x-api-key` |
| `/openai/*` | OpenAI | `Authorization: Bearer` |
| `/google/*` | Google | `x-goog-api-key` |

## API Keys Secret Format

Store in Secrets Manager as JSON:

```json
{
  "anthropic": ["sk-ant-key1", "sk-ant-key2", "sk-ant-key3"],
  "openai": ["sk-oai-key1", "sk-oai-key2"],
  "google": ["AIza-key1"]
}
```

Keys are cached in Lambda memory for 5 minutes to reduce Secrets Manager API calls.

## Round-Robin Distribution

Each provider maintains an independent counter. Keys are distributed evenly across all available keys for that provider. This prevents hot-spotting and spreads rate limits across keys.

## Usage Tracking

Every proxied request writes a record to DynamoDB:

```json
{
  "userId": "user-123",
  "timestamp": "2026-03-08T10:30:00Z",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "ttl": 1726300000
}
```

Records auto-expire after 90 days via DynamoDB TTL.

## OpenClaw Configuration

In the container's merged `openclaw.json`:

```json
{
  "models": {
    "providers": {
      "anthropic": { "baseUrl": "https://{api-gw-url}/anthropic" },
      "openai": { "baseUrl": "https://{api-gw-url}/openai" },
      "google": { "baseUrl": "https://{api-gw-url}/google" }
    }
  }
}
```

OpenClaw's native `models.providers.*.baseUrl` feature redirects all AI API calls through the proxy. The container never needs (or has) direct API keys.

## IAM Permissions

The Lambda needs:
- `secretsmanager:GetSecretValue` — Read the API key pool
- `dynamodb:PutItem` — Write usage records

These are scoped to the specific secret ARN and table name via CDK grants.
