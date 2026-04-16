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
      'anthropic-beta': 'context-1m-2025-08-07,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14',
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

// Anthropic beta flags allowed to pass through the sidecar.
// This is a governance control point — betas not in this list are dropped
// before being forwarded to Anthropic's API. Update when adopting new betas.
export const BETA_ALLOWLIST = new Set<string>([
  // Core features TeamClaw ships by default — MUST stay in sync with PROVIDER_META extraHeaders
  'fine-grained-tool-streaming-2025-05-14',
  'interleaved-thinking-2025-05-14',
  'context-1m-2025-08-07',
  'claude-code-20250219',
  'oauth-2025-04-20',
  // Standard features commonly requested by clients
  'prompt-caching-2024-07-31',
  'token-efficient-tools-2025-02-19',
]);

// Self-check: our own defaults must pass the allowlist filter
for (const meta of Object.values(PROVIDER_META)) {
  const ourBetas = meta.extraHeaders?.['anthropic-beta']?.split(',').map(s => s.trim()) ?? [];
  for (const beta of ourBetas) {
    if (!BETA_ALLOWLIST.has(beta)) {
      throw new Error(`[sidecar/auth] PROVIDER_META contains beta "${beta}" not in BETA_ALLOWLIST — governance drift`);
    }
  }
}

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
  authType: ProviderAuthType;
}

export function mergeBetaHeader(existing: string | undefined, ours: string): string {
  const combined = new Set([
    ...(existing ? existing.split(',').map(s => s.trim()).filter(Boolean) : []),
    ...ours.split(',').map(s => s.trim()).filter(Boolean),
  ]);

  const allowed: string[] = [];
  const dropped: string[] = [];
  for (const beta of combined) {
    if (BETA_ALLOWLIST.has(beta)) allowed.push(beta);
    else dropped.push(beta);
  }

  if (dropped.length > 0) {
    console.warn(
      `[sidecar/auth] Dropped disallowed beta flag(s): ${dropped.join(',')} — ` +
      `update BETA_ALLOWLIST in auth.ts if intended.`,
    );
  }

  return allowed.join(',');
}

export async function resolveAuth(
  providerId: string,
  path: string,
  incomingHeaders?: Record<string, string>,
): Promise<AuthResult | null> {
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
    // Check if the OAuth token is expired or about to expire
    if (entry.expiresAt) {
      const now = Date.now();
      const TEN_MINUTES = 10 * 60 * 1000;
      const FIVE_MINUTES = 5 * 60 * 1000;

      if (now > entry.expiresAt - TEN_MINUTES && now <= entry.expiresAt - FIVE_MINUTES) {
        console.warn(
          `[sidecar/auth] OAuth token for provider "${providerId}" expires in less than 10 minutes`
        );
      }

      if (now > entry.expiresAt - FIVE_MINUTES) {
        console.warn(
          `[sidecar/auth] OAuth token for provider "${providerId}" expired or expiring soon — invalidating cache and reloading`
        );
        invalidateCache();
        const refreshed = await loadSecrets();
        const refreshedEntry = refreshed.providers[providerId];

        if (
          !refreshedEntry ||
          refreshedEntry.authType !== 'oauthToken' ||
          (refreshedEntry.expiresAt && now > refreshedEntry.expiresAt - FIVE_MINUTES)
        ) {
          console.error(
            `[sidecar/auth] OAuth token for provider "${providerId}" is still expired after reload from Secrets Manager. ` +
            `An external process must refresh the token in the secret.`
          );
          return null;
        }

        // Use the refreshed entry going forward
        const refreshedToken = refreshedEntry.token || refreshedEntry.accessToken;
        if (!refreshedToken) return null;
        headers['authorization'] = `Bearer ${refreshedToken}`;
        if (meta.extraHeaders) {
          Object.assign(headers, meta.extraHeaders);
        }
        if (headers['anthropic-beta']) {
          headers['anthropic-beta'] = mergeBetaHeader(
            incomingHeaders?.['anthropic-beta'],
            headers['anthropic-beta'],
          );
        }
        const targetUrl = `${meta.baseUrl}${path}`;
        return { targetUrl, headers, authType: 'oauthToken' };
      }
    }

    const token = entry.token || entry.accessToken;
    if (!token) return null;
    headers['authorization'] = `Bearer ${token}`;
  } else {
    return null;
  }

  if (meta.extraHeaders) {
    Object.assign(headers, meta.extraHeaders);
  }
  if (headers['anthropic-beta']) {
    headers['anthropic-beta'] = mergeBetaHeader(
      incomingHeaders?.['anthropic-beta'],
      headers['anthropic-beta'],
    );
  }

  const targetUrl = `${meta.baseUrl}${path}`;
  return { targetUrl, headers, authType: entry.authType };
}

export function invalidateCache(): void {
  cachedSecret = null;
  cacheExpiry = 0;
}
