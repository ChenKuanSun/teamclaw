import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

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
const CACHE_TTL_MS = 60_000;

const rrCounters: Record<string, number> = {};

export async function loadSecrets(): Promise<ProvidersSecret> {
  if (cachedSecret && Date.now() < cacheExpiry) return cachedSecret;

  const result = await smClient.send(new GetSecretValueCommand({
    SecretId: process.env['API_KEYS_SECRET_ARN']!,
  }));

  const parsed = JSON.parse(result.SecretString || '{}');

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
  // For OAuth tokens on anthropic provider, use anthropic-token meta (has OAuth beta headers)
  const meta = (providerId === 'anthropic' && entry?.authType === 'oauthToken')
    ? PROVIDER_META['anthropic-token']
    : PROVIDER_META[providerId];

  if (!entry || !meta) return null;

  const headers: Record<string, string> = {};

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

  if (meta.extraHeaders) {
    Object.assign(headers, meta.extraHeaders);
  }

  const targetUrl = `${meta.baseUrl}${path}`;
  return { targetUrl, headers };
}

export function invalidateCache(): void {
  cachedSecret = null;
  cacheExpiry = 0;
}
