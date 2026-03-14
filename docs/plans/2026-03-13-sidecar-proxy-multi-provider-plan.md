# Sidecar Proxy Multi-Provider Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Key Pool Proxy Lambda with an ECS sidecar container that proxies all 20+ AI provider requests, supporting API key, OAuth token, and AWS SDK auth — keeping all credentials hidden from the OpenClaw container.

**Architecture:** A lightweight Node.js HTTP proxy runs as a sidecar container in the same Fargate task as OpenClaw. OpenClaw sends requests to `localhost:3000/<provider>`, the sidecar strips the dummy auth header, injects real credentials + provider-specific headers, and pipes the SSE response stream back. Bedrock bypasses the sidecar entirely via ECS Task Role. A shared Provider Registry constant defines all supported providers.

**Tech Stack:** Node.js (native `http` module), AWS CDK (TypeScript), AWS Secrets Manager, DynamoDB, ECS Fargate, Angular 21 + Material

---

### Task 1: Provider Registry Shared Constant

Create a shared provider registry used by sidecar, admin API lambdas, generate-config, and admin panel frontend.

**Files:**
- Create: `libs/core/constants/src/provider-registry.ts`

**Step 1: Create the provider registry**

```typescript
export type ProviderAuthType = 'apiKey' | 'oauthToken' | 'awsSdk';

export interface ProviderDefinition {
  id: string;
  name: string;
  authType: ProviderAuthType;
  baseUrl: string;
  /** Header name for API key injection. Defaults to 'Authorization' with Bearer prefix. */
  authHeader?: string;
  /** If true, key is sent as-is in the header (no 'Bearer ' prefix). */
  rawHeader?: boolean;
  /** Extra headers to inject on every request. */
  extraHeaders?: Record<string, string>;
}

/**
 * All supported AI providers.
 * Bedrock (awsSdk) bypasses the sidecar — listed here for registry completeness only.
 */
export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (API Key)',
    authType: 'apiKey',
    baseUrl: 'https://api.anthropic.com',
    authHeader: 'x-api-key',
    rawHeader: true,
    extraHeaders: {
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14',
    },
  },
  {
    id: 'anthropic-token',
    name: 'Anthropic (Setup Token)',
    authType: 'oauthToken',
    baseUrl: 'https://api.anthropic.com',
    extraHeaders: {
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14',
    },
  },
  {
    id: 'openai',
    name: 'OpenAI (API Key)',
    authType: 'apiKey',
    baseUrl: 'https://api.openai.com',
  },
  {
    id: 'openai-codex',
    name: 'OpenAI Codex (Subscription)',
    authType: 'oauthToken',
    baseUrl: 'https://api.openai.com',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    authType: 'apiKey',
    baseUrl: 'https://generativelanguage.googleapis.com',
    authHeader: 'x-goog-api-key',
    rawHeader: true,
  },
  {
    id: 'amazon-bedrock',
    name: 'Amazon Bedrock',
    authType: 'awsSdk',
    baseUrl: '', // bypasses sidecar
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    authType: 'apiKey',
    baseUrl: 'https://openrouter.ai/api',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    authType: 'apiKey',
    baseUrl: 'https://api.mistral.ai',
  },
  {
    id: 'together',
    name: 'Together AI',
    authType: 'apiKey',
    baseUrl: 'https://api.together.xyz',
  },
  {
    id: 'groq',
    name: 'Groq',
    authType: 'apiKey',
    baseUrl: 'https://api.groq.com/openai',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    authType: 'apiKey',
    baseUrl: 'https://api.x.ai',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    authType: 'apiKey',
    baseUrl: 'https://api.deepseek.com',
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    authType: 'apiKey',
    baseUrl: 'https://api.fireworks.ai/inference',
  },
];

/** Providers that go through the sidecar proxy (excludes awsSdk). */
export const PROXY_PROVIDERS = PROVIDER_REGISTRY.filter(p => p.authType !== 'awsSdk');

/** Lookup provider by ID. */
export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY.find(p => p.id === id);
}
```

**Step 2: Export from barrel**

Check if `libs/core/constants/src/index.ts` exists. If so, add:
```typescript
export * from './provider-registry';
```
If not, create it with that export.

**Step 3: Verify TypeScript compiles**

Run: `npx nx run core-constants:build` or `npx tsc --noEmit -p libs/core/constants/tsconfig.json`
Expected: No errors

**Step 4: Commit**

```bash
git add libs/core/constants/src/provider-registry.ts libs/core/constants/src/index.ts
git commit -m "feat: add shared provider registry constant for multi-provider support"
```

---

### Task 2: Secrets Manager Format Migration Utility

Create a utility function that auto-detects old format `{ anthropic: [keys] }` and converts to new format `{ providers: { anthropic: { authType, keys } } }`. Used by all admin API key lambdas.

**Files:**
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/api-keys/secrets-format.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/api-keys/secrets-format.spec.ts`

**Step 1: Write the test**

```typescript
import { parseSecrets, serializeSecrets, type ProvidersSecret } from './secrets-format';

describe('secrets-format', () => {
  describe('parseSecrets', () => {
    it('parses new format as-is', () => {
      const input = JSON.stringify({
        providers: {
          anthropic: { authType: 'apiKey', keys: ['sk-ant-1'] },
        },
      });
      const result = parseSecrets(input);
      expect(result.providers.anthropic).toEqual({ authType: 'apiKey', keys: ['sk-ant-1'] });
    });

    it('migrates old format { provider: [keys] } to new format', () => {
      const input = JSON.stringify({
        anthropic: ['sk-ant-1', 'sk-ant-2'],
        openai: ['sk-oai-1'],
      });
      const result = parseSecrets(input);
      expect(result.providers.anthropic).toEqual({ authType: 'apiKey', keys: ['sk-ant-1', 'sk-ant-2'] });
      expect(result.providers.openai).toEqual({ authType: 'apiKey', keys: ['sk-oai-1'] });
    });

    it('handles empty string', () => {
      const result = parseSecrets('');
      expect(result).toEqual({ providers: {} });
    });

    it('handles empty object', () => {
      const result = parseSecrets('{}');
      expect(result).toEqual({ providers: {} });
    });
  });

  describe('serializeSecrets', () => {
    it('serializes to JSON string', () => {
      const secret: ProvidersSecret = {
        providers: { anthropic: { authType: 'apiKey', keys: ['k1'] } },
      };
      const json = JSON.parse(serializeSecrets(secret));
      expect(json.providers.anthropic.keys).toEqual(['k1']);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest libs/teamclaw/backend-infra/src/lambda/admin/api-keys/secrets-format.spec.ts --no-coverage`
Expected: FAIL (module not found)

**Step 3: Write the implementation**

```typescript
import { getProvider } from '@TeamClaw/core/constants';

/** Single provider entry in the new secrets format. */
export interface ProviderSecretEntry {
  authType: 'apiKey' | 'oauthToken';
  keys?: string[];
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

/** New secrets format with explicit provider config. */
export interface ProvidersSecret {
  providers: Record<string, ProviderSecretEntry>;
}

/**
 * Parse Secrets Manager value, auto-migrating old format if needed.
 *
 * Old format: `{ "anthropic": ["key1"], "openai": ["key2"] }`
 * New format: `{ "providers": { "anthropic": { "authType": "apiKey", "keys": ["key1"] } } }`
 */
export function parseSecrets(secretString: string | undefined): ProvidersSecret {
  if (!secretString) return { providers: {} };

  const parsed = JSON.parse(secretString);
  if (!parsed || typeof parsed !== 'object') return { providers: {} };

  // New format — has `providers` key
  if (parsed.providers && typeof parsed.providers === 'object') {
    return parsed as ProvidersSecret;
  }

  // Old format — each key is a provider ID with array of keys
  const providers: Record<string, ProviderSecretEntry> = {};
  for (const [providerId, keys] of Object.entries(parsed)) {
    if (Array.isArray(keys)) {
      const def = getProvider(providerId);
      providers[providerId] = {
        authType: def?.authType === 'oauthToken' ? 'oauthToken' : 'apiKey',
        keys: keys as string[],
      };
    }
  }
  return { providers };
}

/** Serialize secrets back to JSON string for Secrets Manager. */
export function serializeSecrets(secret: ProvidersSecret): string {
  return JSON.stringify(secret);
}

/**
 * Check if any provider has at least one credential configured.
 * Used by onboarding status check.
 */
export function hasAnyCredentials(secret: ProvidersSecret): boolean {
  return Object.values(secret.providers).some(entry => {
    if (entry.keys && entry.keys.length > 0) return true;
    if (entry.token) return true;
    if (entry.accessToken) return true;
    return false;
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest libs/teamclaw/backend-infra/src/lambda/admin/api-keys/secrets-format.spec.ts --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add libs/teamclaw/backend-infra/src/lambda/admin/api-keys/secrets-format.ts libs/teamclaw/backend-infra/src/lambda/admin/api-keys/secrets-format.spec.ts
git commit -m "feat: add secrets format migration utility for multi-provider support"
```

---

### Task 3: Update Admin API Key Lambdas for New Format

Update `add-api-key.ts`, `get-api-keys.ts`, `remove-api-key.ts` to use the new secrets format. Keep backward-compatible reading (auto-migration on read), always write new format.

**Files:**
- Modify: `libs/teamclaw/backend-infra/src/lambda/admin/api-keys/add-api-key.ts`
- Modify: `libs/teamclaw/backend-infra/src/lambda/admin/api-keys/get-api-keys.ts`
- Modify: `libs/teamclaw/backend-infra/src/lambda/admin/api-keys/remove-api-key.ts`

**Step 1: Update add-api-key.ts**

Replace the handler to accept `authType` and handle both API key and OAuth token:

```typescript
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { adminLambdaHandlerDecorator, HandlerMethod, HttpStatusCode, validateRequiredEnvVars } from '@TeamClaw/teamclaw/cloud-function';
import type { POSTAndPUTCloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import { parseSecrets, serializeSecrets } from './secrets-format';

validateRequiredEnvVars({ API_KEYS_SECRET_ARN: process.env['API_KEYS_SECRET_ARN'] });

const smClient = new SecretsManagerClient({});
const API_KEYS_SECRET_ARN = process.env['API_KEYS_SECRET_ARN']!;

const handlerFn = async (
  request: POSTAndPUTCloudFunctionInput<Record<string, unknown>>,
): Promise<{ status: number; body: unknown }> => {
  const { body } = request;
  const { provider, key, authType, token, accessToken, refreshToken, expiresAt } = body;

  if (!provider || typeof provider !== 'string') {
    return { status: HttpStatusCode.BAD_REQUEST, body: { message: 'provider is required' } };
  }

  const effectiveAuthType = (authType as string) || 'apiKey';

  // Validate based on auth type
  if (effectiveAuthType === 'apiKey') {
    if (!key || typeof key !== 'string' || (key as string).length > 256) {
      return { status: HttpStatusCode.BAD_REQUEST, body: { message: 'key is required (non-empty string, max 256 chars)' } };
    }
  } else if (effectiveAuthType === 'oauthToken') {
    if (!token && !accessToken) {
      return { status: HttpStatusCode.BAD_REQUEST, body: { message: 'token or accessToken is required for oauthToken auth' } };
    }
  }

  const result = await smClient.send(new GetSecretValueCommand({ SecretId: API_KEYS_SECRET_ARN }));
  const secret = parseSecrets(result.SecretString);

  if (effectiveAuthType === 'apiKey') {
    if (!secret.providers[provider as string]) {
      secret.providers[provider as string] = { authType: 'apiKey', keys: [] };
    }
    const entry = secret.providers[provider as string];
    if (!entry.keys) entry.keys = [];
    entry.keys.push(key as string);
  } else if (effectiveAuthType === 'oauthToken') {
    secret.providers[provider as string] = {
      authType: 'oauthToken',
      ...(token ? { token: token as string } : {}),
      ...(accessToken ? { accessToken: accessToken as string } : {}),
      ...(refreshToken ? { refreshToken: refreshToken as string } : {}),
      ...(expiresAt ? { expiresAt: expiresAt as number } : {}),
    };
  }

  await smClient.send(new PutSecretValueCommand({
    SecretId: API_KEYS_SECRET_ARN,
    SecretString: serializeSecrets(secret),
  }));

  return {
    status: HttpStatusCode.SUCCESS,
    body: { message: 'Credential added', provider },
  };
};

export const handler = adminLambdaHandlerDecorator(HandlerMethod.POST, handlerFn);
```

**Step 2: Update get-api-keys.ts**

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { adminLambdaHandlerDecorator, HandlerMethod, HttpStatusCode, validateRequiredEnvVars } from '@TeamClaw/teamclaw/cloud-function';
import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import { parseSecrets } from './secrets-format';

validateRequiredEnvVars({ API_KEYS_SECRET_ARN: process.env['API_KEYS_SECRET_ARN'] });

const smClient = new SecretsManagerClient({});
const API_KEYS_SECRET_ARN = process.env['API_KEYS_SECRET_ARN']!;

function maskKey(key: string): string {
  if (key.length <= 4) return '****';
  return '*'.repeat(key.length - 4) + key.slice(-4);
}

const handlerFn = async (
  request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  const result = await smClient.send(new GetSecretValueCommand({ SecretId: API_KEYS_SECRET_ARN }));
  const secret = parseSecrets(result.SecretString);

  const masked: Record<string, {
    authType: string;
    keys?: { index: number; masked: string }[];
    hasToken?: boolean;
    hasAccessToken?: boolean;
  }> = {};

  for (const [providerId, entry] of Object.entries(secret.providers)) {
    if (entry.authType === 'apiKey' && entry.keys) {
      masked[providerId] = {
        authType: entry.authType,
        keys: entry.keys.map((key, index) => ({ index, masked: maskKey(key) })),
      };
    } else if (entry.authType === 'oauthToken') {
      masked[providerId] = {
        authType: entry.authType,
        hasToken: !!entry.token,
        hasAccessToken: !!entry.accessToken,
      };
    }
  }

  return { status: HttpStatusCode.SUCCESS, body: { providers: masked } };
};

export const handler = adminLambdaHandlerDecorator(HandlerMethod.GET, handlerFn);
```

**Step 3: Update remove-api-key.ts**

```typescript
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { adminLambdaHandlerDecorator, HandlerMethod, HttpStatusCode, validateRequiredEnvVars } from '@TeamClaw/teamclaw/cloud-function';
import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import { parseSecrets, serializeSecrets } from './secrets-format';

validateRequiredEnvVars({ API_KEYS_SECRET_ARN: process.env['API_KEYS_SECRET_ARN'] });

const smClient = new SecretsManagerClient({});
const API_KEYS_SECRET_ARN = process.env['API_KEYS_SECRET_ARN']!;

const handlerFn = async (
  request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  const { pathParameters, queryStringParameters } = request;
  const provider = pathParameters?.['provider'] || queryStringParameters?.['provider'];
  const keyIdParam = pathParameters?.['keyId'] || queryStringParameters?.['keyIndex'];

  if (!provider) {
    return { status: HttpStatusCode.BAD_REQUEST, body: { message: 'provider is required' } };
  }

  const result = await smClient.send(new GetSecretValueCommand({ SecretId: API_KEYS_SECRET_ARN }));
  const secret = parseSecrets(result.SecretString);

  if (!secret.providers[provider]) {
    return { status: HttpStatusCode.NOT_FOUND, body: { message: 'Provider not found' } };
  }

  const entry = secret.providers[provider];

  if (entry.authType === 'oauthToken') {
    // Remove entire OAuth provider entry
    delete secret.providers[provider];
  } else {
    // Remove API key by index
    const keyIndex = keyIdParam !== undefined ? parseInt(keyIdParam, 10) : NaN;
    if (isNaN(keyIndex) || !entry.keys || keyIndex < 0 || keyIndex >= entry.keys.length) {
      return { status: HttpStatusCode.NOT_FOUND, body: { message: 'Key not found at specified index' } };
    }
    entry.keys.splice(keyIndex, 1);
    if (entry.keys.length === 0) {
      delete secret.providers[provider];
    }
  }

  await smClient.send(new PutSecretValueCommand({
    SecretId: API_KEYS_SECRET_ARN,
    SecretString: serializeSecrets(secret),
  }));

  return { status: HttpStatusCode.SUCCESS, body: { message: 'Credential removed', provider } };
};

export const handler = adminLambdaHandlerDecorator(HandlerMethod.DELETE, handlerFn);
```

**Step 4: Run existing tests**

Run: `npx jest libs/teamclaw/backend-infra/src/lambda/admin/api-keys/ --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add libs/teamclaw/backend-infra/src/lambda/admin/api-keys/add-api-key.ts libs/teamclaw/backend-infra/src/lambda/admin/api-keys/get-api-keys.ts libs/teamclaw/backend-infra/src/lambda/admin/api-keys/remove-api-key.ts
git commit -m "feat: update admin API key lambdas for multi-provider secrets format"
```

---

### Task 4: Update Onboarding Status Lambda

Update `get-onboarding-status.ts` to use the new secrets format parser.

**Files:**
- Modify: `libs/teamclaw/backend-infra/src/lambda/admin/onboarding/get-onboarding-status.ts`

**Step 1: Update the hasApiKeys check**

Replace line 31:
```typescript
hasApiKeys = Object.values(keys).some((arr: any) => Array.isArray(arr) && arr.length > 0);
```
With:
```typescript
import { parseSecrets, hasAnyCredentials } from '../api-keys/secrets-format';
// ...
const secret = parseSecrets(result.SecretString);
hasApiKeys = hasAnyCredentials(secret);
```

Remove the `JSON.parse` line (line 30) since `parseSecrets` handles it.

Full updated try block:
```typescript
try {
  const secret = await sm.send(new GetSecretValueCommand({ SecretId: API_KEYS_SECRET_ARN }));
  const parsed = parseSecrets(secret.SecretString);
  hasApiKeys = hasAnyCredentials(parsed);
} catch {
  hasApiKeys = false;
}
```

**Step 2: Run existing test**

Run: `npx jest libs/teamclaw/backend-infra/src/lambda/admin/onboarding/ --no-coverage`
Expected: PASS

**Step 3: Commit**

```bash
git add libs/teamclaw/backend-infra/src/lambda/admin/onboarding/get-onboarding-status.ts
git commit -m "feat: update onboarding status to use new secrets format parser"
```

---

### Task 5: Sidecar Proxy Container — HTTP Proxy Server

Create the sidecar proxy Node.js application.

**Files:**
- Create: `libs/teamclaw/sidecar/src/index.ts`
- Create: `libs/teamclaw/sidecar/src/auth.ts`
- Create: `libs/teamclaw/sidecar/src/usage.ts`
- Create: `libs/teamclaw/sidecar/package.json`
- Create: `libs/teamclaw/sidecar/tsconfig.json`

**Step 1: Create package.json**

```json
{
  "name": "@teamclaw/sidecar-proxy",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@aws-sdk/client-secrets-manager": "^3.0.0",
    "@aws-sdk/client-dynamodb": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create auth.ts — credential injection logic**

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import type { IncomingHttpHeaders } from 'http';

export type ProviderAuthType = 'apiKey' | 'oauthToken';

export interface ProviderSecretEntry {
  authType: ProviderAuthType;
  keys?: string[];
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface ProvidersSecret {
  providers: Record<string, ProviderSecretEntry>;
}

interface ProviderMeta {
  baseUrl: string;
  authHeader?: string;
  rawHeader?: boolean;
  extraHeaders?: Record<string, string>;
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    authHeader: 'x-api-key',
    rawHeader: true,
    extraHeaders: {
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14',
    },
  },
  'anthropic-token': {
    baseUrl: 'https://api.anthropic.com',
    extraHeaders: {
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14',
    },
  },
  openai: { baseUrl: 'https://api.openai.com' },
  'openai-codex': { baseUrl: 'https://api.openai.com' },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com',
    authHeader: 'x-goog-api-key',
    rawHeader: true,
  },
  openrouter: { baseUrl: 'https://openrouter.ai/api' },
  mistral: { baseUrl: 'https://api.mistral.ai' },
  together: { baseUrl: 'https://api.together.xyz' },
  groq: { baseUrl: 'https://api.groq.com/openai' },
  xai: { baseUrl: 'https://api.x.ai' },
  deepseek: { baseUrl: 'https://api.deepseek.com' },
  fireworks: { baseUrl: 'https://api.fireworks.ai/inference' },
};

const smClient = new SecretsManagerClient({});
let cachedSecret: ProvidersSecret | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

// Round-robin counters per provider
const rrCounters: Record<string, number> = {};

export async function loadSecrets(): Promise<ProvidersSecret> {
  if (cachedSecret && Date.now() < cacheExpiry) return cachedSecret;

  const result = await smClient.send(new GetSecretValueCommand({
    SecretId: process.env['API_KEYS_SECRET_ARN']!,
  }));

  const parsed = JSON.parse(result.SecretString || '{}');

  // Handle old format migration
  if (parsed.providers) {
    cachedSecret = parsed as ProvidersSecret;
  } else {
    const providers: Record<string, ProviderSecretEntry> = {};
    for (const [id, keys] of Object.entries(parsed)) {
      if (Array.isArray(keys)) {
        providers[id] = { authType: 'apiKey', keys: keys as string[] };
      }
    }
    cachedSecret = { providers };
  }

  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cachedSecret;
}

export interface AuthResult {
  targetUrl: string;
  headers: Record<string, string>;
}

export async function resolveAuth(providerId: string, path: string): Promise<AuthResult | null> {
  const secret = await loadSecrets();
  const entry = secret.providers[providerId];
  const meta = PROVIDER_META[providerId];

  if (!entry || !meta) return null;

  const headers: Record<string, string> = {};

  // Inject credentials
  if (entry.authType === 'apiKey' && entry.keys && entry.keys.length > 0) {
    if (!rrCounters[providerId]) rrCounters[providerId] = 0;
    const key = entry.keys[rrCounters[providerId] % entry.keys.length];
    rrCounters[providerId]++;

    if (meta.authHeader && meta.rawHeader) {
      headers[meta.authHeader] = key;
    } else if (meta.authHeader) {
      headers[meta.authHeader] = `Bearer ${key}`;
    } else {
      headers['authorization'] = `Bearer ${key}`;
    }
  } else if (entry.authType === 'oauthToken') {
    const token = entry.token || entry.accessToken;
    if (!token) return null;
    headers['authorization'] = `Bearer ${token}`;
  } else {
    return null;
  }

  // Inject provider-specific extra headers
  if (meta.extraHeaders) {
    Object.assign(headers, meta.extraHeaders);
  }

  const targetUrl = `${meta.baseUrl}${path}`;
  return { targetUrl, headers };
}

/** Force reload secrets from Secrets Manager. */
export function invalidateCache(): void {
  cachedSecret = null;
  cacheExpiry = 0;
}
```

**Step 4: Create usage.ts — DynamoDB usage logging**

```typescript
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env['USAGE_TABLE_NAME'];
const USER_ID = process.env['USER_ID'] || 'unknown';

export async function logUsage(provider: string, model: string): Promise<void> {
  if (!TABLE_NAME) return;

  const now = new Date();
  const ttl = Math.floor(now.getTime() / 1000) + 90 * 24 * 60 * 60; // 90 days

  try {
    await ddb.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: {
        userId: { S: USER_ID },
        timestamp: { S: now.toISOString() },
        provider: { S: provider },
        model: { S: model },
        ttl: { N: String(ttl) },
      },
    }));
  } catch (err) {
    console.error('[sidecar] Usage log failed:', err);
  }
}
```

**Step 5: Create index.ts — HTTP proxy server**

```typescript
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { resolveAuth, loadSecrets } from './auth';
import { logUsage } from './usage';

const PORT = parseInt(process.env['PORT'] || '3000', 10);

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"status":"ok"}');
    return;
  }

  // Extract provider from URL: /<provider>/rest/of/path
  const urlPath = req.url || '/';
  const match = urlPath.match(/^\/([^/]+)(\/.*)?$/);
  if (!match) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end('{"error":"Missing provider in URL path"}');
    return;
  }

  const providerId = match[1];
  const remainingPath = match[2] || '/';

  const auth = await resolveAuth(providerId, remainingPath);
  if (!auth) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `Provider "${providerId}" not configured or no credentials` }));
    return;
  }

  const targetUrl = new URL(auth.targetUrl);

  // Build upstream headers — copy from incoming, strip dummy auth, inject real
  const upstreamHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (key === 'host' || key === 'connection') continue;
    // Strip any incoming auth headers — sidecar manages auth
    if (key === 'authorization' || key === 'x-api-key' || key === 'x-goog-api-key') continue;
    if (value) upstreamHeaders[key] = Array.isArray(value) ? value[0] : value;
  }

  // Inject real credentials + provider headers
  Object.assign(upstreamHeaders, auth.headers);
  upstreamHeaders['host'] = targetUrl.host;

  // Extract model for usage logging (best-effort from request body)
  let model = 'unknown';

  const options: https.RequestOptions = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || 443,
    path: targetUrl.pathname + (targetUrl.search || ''),
    method: req.method,
    headers: upstreamHeaders,
  };

  const proxyReq = https.request(options, (proxyRes) => {
    // Pass through status and headers
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    // Stream pass-through — no buffering
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[sidecar] Upstream error for ${providerId}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upstream request failed' }));
    }
  });

  // Pipe request body to upstream, capturing model for logging
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
    proxyReq.write(chunk);
  });
  req.on('end', () => {
    proxyReq.end();
    // Best-effort model extraction for usage logging
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (body.model) model = body.model;
    } catch { /* not JSON or no model field */ }
    logUsage(providerId, model);
  });
  req.on('error', () => proxyReq.destroy());
});

// Pre-load secrets at startup
loadSecrets()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[sidecar] Proxy listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[sidecar] Failed to load secrets:', err);
    process.exit(1);
  });
```

**Step 6: Commit**

```bash
git add libs/teamclaw/sidecar/
git commit -m "feat: create sidecar proxy container for multi-provider support"
```

---

### Task 6: Sidecar Dockerfile

Create the Dockerfile for the sidecar proxy container.

**Files:**
- Create: `libs/teamclaw/sidecar/Dockerfile`

**Step 1: Create Dockerfile**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

FROM node:22-alpine
WORKDIR /app
RUN addgroup -g 1001 sidecar && adduser -u 1001 -G sidecar -s /bin/sh -D sidecar
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER sidecar
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
```

**Step 2: Verify Docker builds locally**

Run: `cd libs/teamclaw/sidecar && docker build -t teamclaw-sidecar:test .`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add libs/teamclaw/sidecar/Dockerfile
git commit -m "feat: add sidecar proxy Dockerfile"
```

---

### Task 7: Add Sidecar ECR Repository to FoundationStack

Add a second ECR repository for the sidecar container image.

**Files:**
- Modify: `libs/teamclaw/backend-infra/src/stack/foundation.stack.ts`
- Modify: `libs/core/cloud-config/src/ssm/ssm.ts`

**Step 1: Add SSM parameter for sidecar ECR repo**

In `libs/core/cloud-config/src/ssm/ssm.ts`, add to both PROD and DEV ECR sections:

```typescript
ECR: {
  TEAMCLAW_REPO_URI: `/tc/${ENVIRONMENT.PROD}/ecr/teamclawRepoUri`,
  SIDECAR_REPO_URI: `/tc/${ENVIRONMENT.PROD}/ecr/sidecarRepoUri`,   // <-- add this
},
```

(Same for DEV section)

**Step 2: Add ECR repo to FoundationStack**

In `libs/teamclaw/backend-infra/src/stack/foundation.stack.ts`, after the existing `ecrRepo` block (line 82-87), add:

```typescript
const sidecarRepo = new aws_ecr.Repository(this, 'SidecarRepo', {
  repositoryName: `teamclaw-sidecar-${deployEnv}`,
  removalPolicy: RemovalPolicy.RETAIN,
  imageScanOnPush: true,
});

new aws_ssm.StringParameter(this, 'SidecarRepoUriParam', {
  parameterName: ssm.ECR.SIDECAR_REPO_URI,
  stringValue: sidecarRepo.repositoryUri,
});
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p libs/teamclaw/backend-infra/tsconfig.json`
Expected: No errors

**Step 4: Commit**

```bash
git add libs/core/cloud-config/src/ssm/ssm.ts libs/teamclaw/backend-infra/src/stack/foundation.stack.ts
git commit -m "feat: add sidecar ECR repository to FoundationStack"
```

---

### Task 8: Update Lifecycle Lambda for Sidecar Container

Update the Lifecycle Lambda to register a task definition with two containers (teamclaw + sidecar) and pass sidecar env vars.

**Files:**
- Modify: `libs/teamclaw/backend-infra/src/lambda/lifecycle/index.ts`
- Modify: `libs/teamclaw/backend-infra/src/stack/control-plane.stack.ts`

**Step 1: Add sidecar env vars to ControlPlaneStack**

In `control-plane.stack.ts`, add to the Lifecycle Lambda environment (around line 188):

```typescript
environment: {
  DEPLOY_ENV: deployEnv,
  USER_TABLE_NAME: userTable.tableName,
  ECS_CLUSTER_NAME: aws_ssm.StringParameter.valueForStringParameter(this, ssm.ECS.CLUSTER_NAME),
  EFS_FILE_SYSTEM_ID: aws_ssm.StringParameter.valueForStringParameter(this, ssm.EFS.FILE_SYSTEM_ID),
  PRIVATE_SUBNET_IDS: aws_ssm.StringParameter.valueForStringParameter(this, ssm.VPC.PRIVATE_SUBNET_IDS),
  SECURITY_GROUP_ID: aws_ssm.StringParameter.valueForStringParameter(this, ssm.ECS.ALB_SECURITY_GROUP_ID),
  KEY_POOL_PROXY_URL: api.url,
  API_KEYS_SECRET_ARN: apiKeysSecretArn,                             // <-- add
  USAGE_TABLE_NAME: usageTable.tableName,                            // <-- add
  SIDECAR_IMAGE: aws_ssm.StringParameter.valueForStringParameter(    // <-- add
    this, ssm.ECR.SIDECAR_REPO_URI,
  ),
},
```

**Step 2: Update startContainer in lifecycle/index.ts**

Add sidecar container override to the `RunTaskCommand.overrides.containerOverrides` array in `startContainer()`:

Replace the `overrides` block (lines 129-138) with:

```typescript
overrides: {
  containerOverrides: [
    {
      name: 'teamclaw',
      environment: [
        { name: 'USER_ID', value: userId },
        { name: 'TEAM_ID', value: userRecord.Item['teamId']?.S || '' },
      ],
    },
    {
      name: 'proxy-sidecar',
      environment: [
        { name: 'API_KEYS_SECRET_ARN', value: process.env['API_KEYS_SECRET_ARN']! },
        { name: 'USAGE_TABLE_NAME', value: process.env['USAGE_TABLE_NAME'] || '' },
        { name: 'USER_ID', value: userId },
      ],
    },
  ],
},
```

Note: `KEY_POOL_PROXY_URL` is removed from the teamclaw container — it now uses `localhost:3000` via config.

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p libs/teamclaw/backend-infra/tsconfig.json`
Expected: No errors

**Step 4: Commit**

```bash
git add libs/teamclaw/backend-infra/src/lambda/lifecycle/index.ts libs/teamclaw/backend-infra/src/stack/control-plane.stack.ts
git commit -m "feat: update lifecycle lambda with sidecar container overrides"
```

---

### Task 9: Update generate-config.js for Sidecar Proxy

Update the container config generator to point all providers at `localhost:3000` instead of the Key Pool Proxy Lambda, and dynamically generate provider entries.

**Files:**
- Modify: `libs/teamclaw/container/scripts/generate-config.js`

**Step 1: Update generate-config.js**

Replace the `baseConfig.models.providers` block (lines 39-44) with:

```javascript
const SIDECAR_URL = 'http://localhost:3000';

// All providers that go through sidecar proxy
const PROXY_PROVIDERS = [
  'anthropic', 'anthropic-token', 'openai', 'openai-codex', 'google',
  'openrouter', 'mistral', 'together', 'groq', 'xai', 'deepseek', 'fireworks',
];

const providers = {};
for (const id of PROXY_PROVIDERS) {
  providers[id] = { baseUrl: `${SIDECAR_URL}/${id}`, apiKey: 'proxy-managed' };
}
// Bedrock bypasses sidecar — uses auth: 'aws-sdk' natively in OpenClaw
// (configured via team/global config if enabled)
```

Then use `providers` in `baseConfig`:

```javascript
const baseConfig = {
  gateway: {
    port: 18789,
    host: '0.0.0.0',
  },
  models: {
    providers,
  },
  session: {
    dmScope: 'per-channel-peer',
  },
};
```

Remove the `keyPoolProxyUrl` variable (line 6) since it's no longer used.

**Step 2: Verify the script runs**

Run: `USER_ID=test node libs/teamclaw/container/scripts/generate-config.js` (will fail on EFS reads but should not throw on providers)
Expected: Script runs, prints config generated message (EFS file read failures are OK)

**Step 3: Commit**

```bash
git add libs/teamclaw/container/scripts/generate-config.js
git commit -m "feat: update generate-config to use sidecar proxy for all providers"
```

---

### Task 10: Update Admin Panel Onboarding Wizard — Provider Dropdown

Update the onboarding wizard to show all providers from the registry with appropriate auth forms.

**Files:**
- Modify: `apps/enterprise-admin/src/app/features/dashboard/onboarding-wizard.component.ts`

**Step 1: Add provider list and update template**

Add a `providers` array from the registry (import or inline — since Angular can't import Node-only code, inline a simplified list). Update the mat-select to show all providers, and conditionally show different input fields based on auth type.

Replace the provider dropdown (lines 51-55):
```html
<mat-select [(ngModel)]="apiKeyProvider">
  <mat-option value="anthropic">Anthropic</mat-option>
  <mat-option value="openai">OpenAI</mat-option>
  <mat-option value="google">Google</mat-option>
</mat-select>
```

With:
```html
<mat-select [(ngModel)]="apiKeyProvider" (selectionChange)="onProviderChange()">
  @for (p of providerOptions; track p.id) {
    <mat-option [value]="p.id">{{ p.name }}</mat-option>
  }
</mat-select>
```

Add after the provider select, replace the API Key input field (lines 57-59):
```html
@if (selectedAuthType === 'apiKey') {
  <mat-form-field appearance="outline" class="full-width">
    <mat-label>API Key</mat-label>
    <input matInput [(ngModel)]="apiKeyValue" type="password" />
  </mat-form-field>
} @else if (selectedAuthType === 'oauthToken') {
  <mat-form-field appearance="outline" class="full-width">
    <mat-label>Token</mat-label>
    <input matInput [(ngModel)]="apiKeyValue" type="password"
      placeholder="Paste token here" />
    <mat-hint>{{ tokenHint }}</mat-hint>
  </mat-form-field>
}
```

**Step 2: Add component properties**

Add to the component class:

```typescript
readonly providerOptions = [
  { id: 'anthropic', name: 'Anthropic (API Key)', authType: 'apiKey' as const },
  { id: 'anthropic-token', name: 'Anthropic (Setup Token)', authType: 'oauthToken' as const },
  { id: 'openai', name: 'OpenAI (API Key)', authType: 'apiKey' as const },
  { id: 'openai-codex', name: 'OpenAI Codex (Subscription)', authType: 'oauthToken' as const },
  { id: 'google', name: 'Google Gemini', authType: 'apiKey' as const },
  { id: 'openrouter', name: 'OpenRouter', authType: 'apiKey' as const },
  { id: 'mistral', name: 'Mistral', authType: 'apiKey' as const },
  { id: 'together', name: 'Together AI', authType: 'apiKey' as const },
  { id: 'groq', name: 'Groq', authType: 'apiKey' as const },
  { id: 'xai', name: 'xAI (Grok)', authType: 'apiKey' as const },
  { id: 'deepseek', name: 'DeepSeek', authType: 'apiKey' as const },
  { id: 'fireworks', name: 'Fireworks AI', authType: 'apiKey' as const },
];

selectedAuthType: 'apiKey' | 'oauthToken' = 'apiKey';
tokenHint = '';

onProviderChange(): void {
  const provider = this.providerOptions.find(p => p.id === this.apiKeyProvider);
  this.selectedAuthType = provider?.authType || 'apiKey';
  this.apiKeyValue = '';
  if (this.apiKeyProvider === 'anthropic-token') {
    this.tokenHint = 'Run `claude setup-token` and paste the token here';
  } else if (this.apiKeyProvider === 'openai-codex') {
    this.tokenHint = 'Paste your Codex access token here';
  } else {
    this.tokenHint = '';
  }
}
```

**Step 3: Update saveApiKey to pass authType**

```typescript
saveApiKey(): void {
  this.saving.set(true);
  this.stepError.set('');
  const payload: Record<string, unknown> = {
    provider: this.apiKeyProvider,
    authType: this.selectedAuthType,
  };
  if (this.selectedAuthType === 'apiKey') {
    payload['key'] = this.apiKeyValue;
  } else {
    payload['token'] = this.apiKeyValue;
  }
  this.adminApi.addApiKey(payload).subscribe({
    next: () => {
      this.steps.update(s => ({ ...s, apiKey: true }));
      this.saving.set(false);
    },
    error: (err) => {
      this.stepError.set(err.error?.message || 'Failed to save credential');
      this.saving.set(false);
    },
  });
}
```

**Step 4: Update AdminApiService.addApiKey signature if needed**

Check `apps/enterprise-admin/src/app/services/admin-api.service.ts` — ensure `addApiKey` accepts a generic object (not just `{ provider, key }`). If it's typed narrowly, widen it:

```typescript
addApiKey(data: Record<string, unknown>): Observable<any> {
  return this.http.post(`${this.apiUrl}/admin/api-keys`, data);
}
```

**Step 5: Run tests**

Run: `npx nx test enterprise-admin --no-coverage`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/enterprise-admin/src/app/features/dashboard/onboarding-wizard.component.ts apps/enterprise-admin/src/app/services/admin-api.service.ts
git commit -m "feat: update onboarding wizard with full provider registry and auth type support"
```

---

### Task 11: ECS Task Definition — Register with Sidecar

The actual ECS task definition with two containers needs to be registered. Currently, task definitions are pre-registered manually or via CDK. The Lifecycle Lambda uses `RegisterTaskDefinition` — we need to either:
- Add a task definition registration step to the Lifecycle Lambda's `provision` flow, OR
- Create the task definition in CDK

Since the existing pattern uses `taskDefinition: 'teamclaw-user-${env}'` by name (line 120 of lifecycle), the simplest approach is to update the task definition registration. The task definition should be created/updated as part of CDK deploy or a one-time setup.

**This task is a CDK-only change — no Lambda code needed.**

**Files:**
- Create: `libs/teamclaw/backend-infra/src/stack/task-definition.stack.ts` (if task def is managed by CDK)
  OR
- Document: Manual `aws ecs register-task-definition` command

**Note:** This is deployment-time work. The exact approach depends on how the task definition `teamclaw-user-{env}` is currently registered. Check if it's in CDK or manually created. If manually created, provide the CLI command to register the updated task definition with two containers. If in CDK, add the sidecar container definition.

**Step 1: Check how task definition is currently managed**

Search for `teamclaw-user` in CDK stacks to see if task definition is created in CDK or externally.

**Step 2: If not in CDK, document the registration command**

Create a deployment script or add to existing deployment docs:

```bash
aws ecs register-task-definition \
  --family teamclaw-user-dev \
  --requires-compatibilities FARGATE \
  --network-mode awsvpc \
  --cpu 1024 --memory 2048 \
  --task-role-arn <task-role-arn> \
  --execution-role-arn <execution-role-arn> \
  --container-definitions '[
    {
      "name": "teamclaw",
      "image": "<ecr-uri>/teamclaw-enterprise-dev:latest",
      "essential": true,
      "portMappings": [{"containerPort": 18789}],
      "dependsOn": [{"containerName": "proxy-sidecar", "condition": "HEALTHY"}],
      "logConfiguration": {"logDriver": "awslogs", "options": {"awslogs-group": "/ecs/teamclaw-dev", "awslogs-region": "us-west-1", "awslogs-stream-prefix": "teamclaw"}}
    },
    {
      "name": "proxy-sidecar",
      "image": "<ecr-uri>/teamclaw-sidecar-dev:latest",
      "essential": true,
      "portMappings": [{"containerPort": 3000}],
      "healthCheck": {"command": ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"], "interval": 10, "timeout": 3, "retries": 3},
      "logConfiguration": {"logDriver": "awslogs", "options": {"awslogs-group": "/ecs/teamclaw-dev", "awslogs-region": "us-west-1", "awslogs-stream-prefix": "sidecar"}}
    }
  ]'
```

**Step 3: Commit**

```bash
git commit -m "docs: add sidecar task definition registration for ECS deployment"
```

---

### Task 12: Build and Test End-to-End

**Step 1: Run all unit tests**

Run: `npx nx run-many --target=test --all --no-coverage`
Expected: All tests pass

**Step 2: Build admin panel**

Run: `npx nx build enterprise-admin`
Expected: Build succeeds

**Step 3: Build sidecar Docker image**

Run: `cd libs/teamclaw/sidecar && docker build -t teamclaw-sidecar:test .`
Expected: Build succeeds

**Step 4: Commit any remaining fixes**

If tests or builds fail, fix and commit.

---

## Deployment Checklist (Post-Implementation)

1. Deploy FoundationStack (new ECR repo)
2. Build & push sidecar Docker image to new ECR repo
3. Register updated ECS task definition with sidecar container
4. Deploy ControlPlaneStack (Lifecycle Lambda env vars)
5. Deploy AdminLambdaStack (updated API key lambdas)
6. Migrate existing Secrets Manager format (add-api-key auto-migrates on next write)
7. Deploy Admin Panel (Amplify auto-deploys from git push)
8. Re-provision existing user containers (new task definition picks up on next start)
