import { getProvider } from '@TeamClaw/core/constants';

export interface ProviderSecretEntry {
  authType: 'apiKey' | 'oauthToken';
  keys?: string[];
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface ProvidersSecret {
  providers: Record<string, ProviderSecretEntry>;
}

export function parseSecrets(secretString: string | undefined): ProvidersSecret {
  if (!secretString) return { providers: {} };

  const parsed = JSON.parse(secretString);
  if (!parsed || typeof parsed !== 'object') return { providers: {} };

  if (parsed.providers && typeof parsed.providers === 'object') {
    return parsed as ProvidersSecret;
  }

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

export function serializeSecrets(secret: ProvidersSecret): string {
  return JSON.stringify(secret);
}

export function hasAnyCredentials(secret: ProvidersSecret): boolean {
  return Object.values(secret.providers).some(entry => {
    if (entry.keys && entry.keys.length > 0) return true;
    if (entry.token) return true;
    if (entry.accessToken) return true;
    return false;
  });
}
