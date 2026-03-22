/**
 * Tests for libs/teamclaw/sidecar/src/auth.ts
 *
 * Covers: loadSecrets, resolveAuth, invalidateCache
 * Mock strategy: intercept the SecretsManagerClient constructor to inject a
 * controlled `send` spy, then use jest.resetModules() between tests to reset
 * module-level cache and round-robin counters.
 */

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => {
  const actual = jest.requireActual('@aws-sdk/client-secrets-manager');
  return {
    ...actual,
    SecretsManagerClient: jest
      .fn()
      .mockImplementation(() => ({ send: mockSend })),
  };
});

function freshImport() {
  return require('./auth') as typeof import('./auth');
}

beforeEach(() => {
  jest.resetModules();
  mockSend.mockReset();
  process.env['API_KEYS_SECRET_ARN'] =
    'arn:aws:secretsmanager:us-east-1:123456:secret:test';
});

afterEach(() => {
  delete process.env['API_KEYS_SECRET_ARN'];
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// loadSecrets
// ---------------------------------------------------------------------------
describe('loadSecrets', () => {
  it('parses a providers-format secret correctly', async () => {
    const secretPayload = {
      providers: {
        anthropic: { authType: 'apiKey', keys: ['sk-ant-1', 'sk-ant-2'] },
        openai: { authType: 'apiKey', keys: ['sk-oai-1'] },
      },
    };
    mockSend.mockResolvedValue({ SecretString: JSON.stringify(secretPayload) });

    const { loadSecrets } = freshImport();
    const result = await loadSecrets();

    expect(result).toEqual(secretPayload);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('handles empty secret string gracefully (returns empty providers)', async () => {
    mockSend.mockResolvedValue({ SecretString: '' });

    const { loadSecrets } = freshImport();
    const result = await loadSecrets();

    expect(result).toEqual({ providers: {} });
  });

  it('handles malformed JSON by throwing', async () => {
    mockSend.mockResolvedValue({ SecretString: '{{not json' });

    const { loadSecrets } = freshImport();
    await expect(loadSecrets()).rejects.toThrow();
  });

  it('migrates legacy format (plain object of arrays) to providers format', async () => {
    const legacySecret = {
      anthropic: ['sk-ant-1', 'sk-ant-2'],
      openai: ['sk-oai-1'],
    };
    mockSend.mockResolvedValue({ SecretString: JSON.stringify(legacySecret) });

    const { loadSecrets } = freshImport();
    const result = await loadSecrets();

    expect(result).toEqual({
      providers: {
        anthropic: { authType: 'apiKey', keys: ['sk-ant-1', 'sk-ant-2'] },
        openai: { authType: 'apiKey', keys: ['sk-oai-1'] },
      },
    });
  });

  it('caches the secret and does not re-fetch within TTL', async () => {
    const secretPayload = {
      providers: { anthropic: { authType: 'apiKey', keys: ['sk-1'] } },
    };
    mockSend.mockResolvedValue({ SecretString: JSON.stringify(secretPayload) });

    const { loadSecrets } = freshImport();

    await loadSecrets();
    await loadSecrets();
    await loadSecrets();

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('re-fetches the secret after TTL expires', async () => {
    jest.useFakeTimers();

    const secretPayload = {
      providers: { anthropic: { authType: 'apiKey', keys: ['sk-1'] } },
    };
    mockSend.mockResolvedValue({ SecretString: JSON.stringify(secretPayload) });

    const { loadSecrets } = freshImport();

    await loadSecrets();
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Advance past the 60s TTL
    jest.advanceTimersByTime(61_000);

    await loadSecrets();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// invalidateCache
// ---------------------------------------------------------------------------
describe('invalidateCache', () => {
  it('forces a re-fetch on next loadSecrets call', async () => {
    const secretPayload = {
      providers: { anthropic: { authType: 'apiKey', keys: ['sk-1'] } },
    };
    mockSend.mockResolvedValue({ SecretString: JSON.stringify(secretPayload) });

    const { loadSecrets, invalidateCache } = freshImport();

    await loadSecrets();
    expect(mockSend).toHaveBeenCalledTimes(1);

    invalidateCache();

    await loadSecrets();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// resolveAuth
// ---------------------------------------------------------------------------
describe('resolveAuth', () => {
  function setupSecret(secret: object) {
    mockSend.mockResolvedValue({ SecretString: JSON.stringify(secret) });
  }

  it('returns correct headers for anthropic API key provider', async () => {
    setupSecret({
      providers: {
        anthropic: { authType: 'apiKey', keys: ['sk-ant-test'] },
      },
    });

    const { resolveAuth } = freshImport();
    const result = await resolveAuth('anthropic', '/v1/messages');

    expect(result).not.toBeNull();
    expect(result!.targetUrl).toBe('https://api.anthropic.com/v1/messages');
    expect(result!.headers['x-api-key']).toBe('sk-ant-test');
    expect(result!.headers['anthropic-version']).toBe('2023-06-01');
    expect(result!.headers['anthropic-beta']).toContain(
      'fine-grained-tool-streaming',
    );
    // rawHeader means no Bearer prefix
    expect(result!.headers['authorization']).toBeUndefined();
  });

  it('returns correct headers for google API key provider', async () => {
    setupSecret({
      providers: {
        google: { authType: 'apiKey', keys: ['goog-key-1'] },
      },
    });

    const { resolveAuth } = freshImport();
    const result = await resolveAuth('google', '/v1/models');

    expect(result).not.toBeNull();
    expect(result!.headers['x-goog-api-key']).toBe('goog-key-1');
    expect(result!.targetUrl).toBe(
      'https://generativelanguage.googleapis.com/v1/models',
    );
  });

  it('returns Bearer authorization for openai provider', async () => {
    setupSecret({
      providers: {
        openai: { authType: 'apiKey', keys: ['sk-oai-1'] },
      },
    });

    const { resolveAuth } = freshImport();
    const result = await resolveAuth('openai', '/v1/chat/completions');

    expect(result).not.toBeNull();
    expect(result!.headers['authorization']).toBe('Bearer sk-oai-1');
    expect(result!.targetUrl).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });

  it('round-robins across multiple API keys', async () => {
    setupSecret({
      providers: {
        anthropic: { authType: 'apiKey', keys: ['key-A', 'key-B', 'key-C'] },
      },
    });

    const { resolveAuth } = freshImport();

    const keys: string[] = [];
    for (let i = 0; i < 6; i++) {
      const result = await resolveAuth('anthropic', '/v1/messages');
      keys.push(result!.headers['x-api-key']);
    }

    expect(keys).toEqual([
      'key-A',
      'key-B',
      'key-C',
      'key-A',
      'key-B',
      'key-C',
    ]);
  });

  it('returns null for unknown provider', async () => {
    setupSecret({
      providers: {
        anthropic: { authType: 'apiKey', keys: ['sk-1'] },
      },
    });

    const { resolveAuth } = freshImport();
    const result = await resolveAuth('nonexistent-provider', '/v1/chat');

    expect(result).toBeNull();
  });

  it('returns null for provider with no credentials (empty keys array)', async () => {
    setupSecret({
      providers: {
        anthropic: { authType: 'apiKey', keys: [] },
      },
    });

    const { resolveAuth } = freshImport();
    const result = await resolveAuth('anthropic', '/v1/messages');

    expect(result).toBeNull();
  });

  it('returns null when provider entry exists but has unrecognized authType', async () => {
    setupSecret({
      providers: {
        anthropic: { authType: 'magic' as any },
      },
    });

    const { resolveAuth } = freshImport();
    const result = await resolveAuth('anthropic', '/v1/messages');

    expect(result).toBeNull();
  });

  // OAuth token tests
  describe('OAuth token handling', () => {
    it('returns Bearer token for oauthToken type', async () => {
      setupSecret({
        providers: {
          anthropic: {
            authType: 'oauthToken',
            token: 'oauth-tok-123',
            expiresAt: Date.now() + 3_600_000,
          },
        },
      });

      const { resolveAuth } = freshImport();
      const result = await resolveAuth('anthropic', '/v1/messages');

      expect(result).not.toBeNull();
      expect(result!.headers['authorization']).toBe('Bearer oauth-tok-123');
      // OAuth on anthropic should use anthropic-token meta with oauth beta header
      expect(result!.headers['anthropic-beta']).toContain('oauth-2025-04-20');
      expect(result!.targetUrl).toBe('https://api.anthropic.com/v1/messages');
    });

    it('uses accessToken field when token field is absent', async () => {
      setupSecret({
        providers: {
          anthropic: {
            authType: 'oauthToken',
            accessToken: 'access-tok-456',
            expiresAt: Date.now() + 3_600_000,
          },
        },
      });

      const { resolveAuth } = freshImport();
      const result = await resolveAuth('anthropic', '/v1/messages');

      expect(result).not.toBeNull();
      expect(result!.headers['authorization']).toBe('Bearer access-tok-456');
    });

    it('returns null when oauthToken has no token and no accessToken', async () => {
      setupSecret({
        providers: {
          anthropic: {
            authType: 'oauthToken',
            expiresAt: Date.now() + 3_600_000,
          },
        },
      });

      const { resolveAuth } = freshImport();
      const result = await resolveAuth('anthropic', '/v1/messages');

      expect(result).toBeNull();
    });

    it('warns but still returns token when expiring in < 10 min but > 5 min', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const SEVEN_MIN_FROM_NOW = Date.now() + 7 * 60 * 1000;

      setupSecret({
        providers: {
          anthropic: {
            authType: 'oauthToken',
            token: 'about-to-expire',
            expiresAt: SEVEN_MIN_FROM_NOW,
          },
        },
      });

      const { resolveAuth } = freshImport();
      const result = await resolveAuth('anthropic', '/v1/messages');

      expect(result).not.toBeNull();
      expect(result!.headers['authorization']).toBe('Bearer about-to-expire');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('expires in less than 10 minutes'),
      );
    });

    it('invalidates cache and reloads when token expires within 5 min', async () => {
      jest.spyOn(console, 'warn').mockImplementation();
      const TWO_MIN_FROM_NOW = Date.now() + 2 * 60 * 1000;

      mockSend
        .mockResolvedValueOnce({
          SecretString: JSON.stringify({
            providers: {
              anthropic: {
                authType: 'oauthToken',
                token: 'old-tok',
                expiresAt: TWO_MIN_FROM_NOW,
              },
            },
          }),
        })
        .mockResolvedValueOnce({
          SecretString: JSON.stringify({
            providers: {
              anthropic: {
                authType: 'oauthToken',
                token: 'refreshed-tok',
                expiresAt: Date.now() + 3_600_000,
              },
            },
          }),
        });

      const { resolveAuth } = freshImport();
      const result = await resolveAuth('anthropic', '/v1/messages');

      expect(result).not.toBeNull();
      expect(result!.headers['authorization']).toBe('Bearer refreshed-tok');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('returns null when token is still expired after reload', async () => {
      jest.spyOn(console, 'warn').mockImplementation();
      jest.spyOn(console, 'error').mockImplementation();
      const EXPIRED = Date.now() - 60_000;

      mockSend.mockResolvedValue({
        SecretString: JSON.stringify({
          providers: {
            anthropic: {
              authType: 'oauthToken',
              token: 'still-expired',
              expiresAt: EXPIRED,
            },
          },
        }),
      });

      const { resolveAuth } = freshImport();
      const result = await resolveAuth('anthropic', '/v1/messages');

      expect(result).toBeNull();
    });
  });

  // Provider-specific URL and header tests
  describe('provider meta mapping', () => {
    const cases: Array<{ providerId: string; expectedBaseUrl: string }> = [
      {
        providerId: 'openrouter',
        expectedBaseUrl: 'https://openrouter.ai/api',
      },
      { providerId: 'mistral', expectedBaseUrl: 'https://api.mistral.ai' },
      { providerId: 'together', expectedBaseUrl: 'https://api.together.xyz' },
      { providerId: 'groq', expectedBaseUrl: 'https://api.groq.com/openai' },
      { providerId: 'xai', expectedBaseUrl: 'https://api.x.ai' },
      { providerId: 'deepseek', expectedBaseUrl: 'https://api.deepseek.com' },
      {
        providerId: 'fireworks',
        expectedBaseUrl: 'https://api.fireworks.ai/inference',
      },
    ];

    test.each(cases)(
      '$providerId routes to $expectedBaseUrl',
      async ({ providerId, expectedBaseUrl }) => {
        setupSecret({
          providers: {
            [providerId]: { authType: 'apiKey', keys: ['test-key'] },
          },
        });

        const { resolveAuth } = freshImport();
        const result = await resolveAuth(providerId, '/v1/chat');

        expect(result).not.toBeNull();
        expect(result!.targetUrl).toBe(`${expectedBaseUrl}/v1/chat`);
        expect(result!.headers['authorization']).toBe('Bearer test-key');
      },
    );
  });
});
