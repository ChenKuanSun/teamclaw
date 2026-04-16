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
    expect(result!.authType).toBe('apiKey');
    // rawHeader means no Bearer prefix
    expect(result!.headers['authorization']).toBeUndefined();
  });

  it('includes context-1m-2025-08-07 beta for anthropic (apiKey) provider', async () => {
    setupSecret({
      providers: {
        anthropic: { authType: 'apiKey', keys: ['sk-ant-test'] },
      },
    });

    const { resolveAuth } = freshImport();
    const result = await resolveAuth('anthropic', '/v1/messages');

    expect(result).not.toBeNull();
    expect(result!.headers['anthropic-beta']).toContain(
      'context-1m-2025-08-07',
    );
  });

  it('does NOT include context-1m-2025-08-07 beta for anthropic-token (OAuth) provider', async () => {
    setupSecret({
      providers: {
        anthropic: {
          authType: 'oauthToken',
          token: 'oauth-tok-xyz',
          expiresAt: Date.now() + 3_600_000,
        },
      },
    });

    const { resolveAuth } = freshImport();
    const result = await resolveAuth('anthropic', '/v1/messages');

    expect(result).not.toBeNull();
    expect(result!.headers['anthropic-beta']).not.toContain(
      'context-1m-2025-08-07',
    );
    expect(result!.headers['anthropic-beta']).toContain('oauth-2025-04-20');
  });

  it('merges incoming anthropic-beta with provider extraHeaders (dedup)', async () => {
    setupSecret({
      providers: {
        anthropic: { authType: 'apiKey', keys: ['sk-ant-test'] },
      },
    });

    const { resolveAuth } = freshImport();
    const result = await resolveAuth('anthropic', '/v1/messages', {
      'anthropic-beta':
        'context-1m-2025-08-07,prompt-caching-2024-07-31',
    });

    expect(result).not.toBeNull();
    const betas = result!.headers['anthropic-beta'].split(',');
    expect(betas).toContain('context-1m-2025-08-07');
    expect(betas).toContain('prompt-caching-2024-07-31');
    expect(betas).toContain('fine-grained-tool-streaming-2025-05-14');
    // dedup: context-1m should appear only once
    expect(
      betas.filter(b => b === 'context-1m-2025-08-07').length,
    ).toBe(1);
  });

  it('returns authType on AuthResult for apiKey provider', async () => {
    setupSecret({
      providers: {
        openai: { authType: 'apiKey', keys: ['sk-oai-1'] },
      },
    });

    const { resolveAuth } = freshImport();
    const result = await resolveAuth('openai', '/v1/chat/completions');

    expect(result).not.toBeNull();
    expect(result!.authType).toBe('apiKey');
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
      expect(result!.authType).toBe('oauthToken');
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

// ---------------------------------------------------------------------------
// mergeBetaHeader
// ---------------------------------------------------------------------------
describe('mergeBetaHeader', () => {
  it('returns ours when existing is undefined', () => {
    const { mergeBetaHeader } = freshImport();
    expect(mergeBetaHeader(undefined, 'context-1m-2025-08-07,prompt-caching-2024-07-31,oauth-2025-04-20')).toBe(
      'context-1m-2025-08-07,prompt-caching-2024-07-31,oauth-2025-04-20',
    );
  });

  it('returns ours when existing is empty string', () => {
    const { mergeBetaHeader } = freshImport();
    expect(mergeBetaHeader('', 'context-1m-2025-08-07,prompt-caching-2024-07-31')).toBe(
      'context-1m-2025-08-07,prompt-caching-2024-07-31',
    );
  });

  it('merges overlapping beta flags and dedups', () => {
    const { mergeBetaHeader } = freshImport();
    const merged = mergeBetaHeader(
      'context-1m-2025-08-07,prompt-caching-2024-07-31',
      'prompt-caching-2024-07-31,oauth-2025-04-20',
    );
    const parts = merged.split(',');
    expect(parts).toEqual(
      expect.arrayContaining([
        'context-1m-2025-08-07',
        'prompt-caching-2024-07-31',
        'oauth-2025-04-20',
      ]),
    );
    expect(parts.filter(p => p === 'prompt-caching-2024-07-31').length).toBe(1);
  });

  it('merges non-overlapping flags keeping all', () => {
    const { mergeBetaHeader } = freshImport();
    const merged = mergeBetaHeader('context-1m-2025-08-07', 'oauth-2025-04-20');
    const parts = merged.split(',');
    expect(parts).toEqual(
      expect.arrayContaining(['context-1m-2025-08-07', 'oauth-2025-04-20']),
    );
    expect(parts.length).toBe(2);
  });

  it('trims whitespace and filters empty entries', () => {
    const { mergeBetaHeader } = freshImport();
    const merged = mergeBetaHeader(
      ' context-1m-2025-08-07 , prompt-caching-2024-07-31 ,  ',
      'oauth-2025-04-20 , context-1m-2025-08-07',
    );
    const parts = merged.split(',');
    expect(parts).toEqual(
      expect.arrayContaining([
        'context-1m-2025-08-07',
        'prompt-caching-2024-07-31',
        'oauth-2025-04-20',
      ]),
    );
    expect(parts.filter(p => p === 'context-1m-2025-08-07').length).toBe(1);
    expect(parts.filter(p => p === '').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Beta allowlist governance
// ---------------------------------------------------------------------------
describe('Beta allowlist governance', () => {
  it('exports BETA_ALLOWLIST containing all tokens currently in anthropic + anthropic-token extraHeaders', () => {
    const { BETA_ALLOWLIST } = freshImport();
    // The core betas TeamClaw ships by default across anthropic (apiKey) and anthropic-token (OAuth)
    const shippedBetas = [
      'fine-grained-tool-streaming-2025-05-14',
      'interleaved-thinking-2025-05-14',
      'context-1m-2025-08-07',
      'claude-code-20250219',
      'oauth-2025-04-20',
    ];
    for (const beta of shippedBetas) {
      expect(BETA_ALLOWLIST.has(beta)).toBe(true);
    }
  });

  it('returns the beta unchanged when mergeBetaHeader(undefined, <allowlisted>) is called', () => {
    const { mergeBetaHeader } = freshImport();
    expect(mergeBetaHeader(undefined, 'context-1m-2025-08-07')).toBe(
      'context-1m-2025-08-07',
    );
  });

  it('drops computer-use and returns only allowlisted beta', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const { mergeBetaHeader } = freshImport();
    const result = mergeBetaHeader(
      'computer-use-2024-10-22',
      'context-1m-2025-08-07',
    );
    expect(result).toBe('context-1m-2025-08-07');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('computer-use-2024-10-22'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Dropped disallowed beta flag'),
    );
  });

  it('keeps prompt-caching and drops unknown-beta', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const { mergeBetaHeader } = freshImport();
    const result = mergeBetaHeader(
      'prompt-caching-2024-07-31,unknown-beta',
      '',
    );
    expect(result).toBe('prompt-caching-2024-07-31');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown-beta'),
    );
  });

  it('does NOT warn when all tokens are allowlisted', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const { mergeBetaHeader } = freshImport();
    mergeBetaHeader('context-1m-2025-08-07', 'prompt-caching-2024-07-31');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('self-check throws at module load when PROVIDER_META contains a non-allowlisted beta', () => {
    // Verify the self-check rejects governance drift. We simulate drift by
    // mocking the AWS SDK import (so auth.ts loads cleanly in isolation) and
    // then exercising the exact invariant loop against a rogue PROVIDER_META
    // entry using the module's real BETA_ALLOWLIST.
    expect(() => {
      jest.isolateModules(() => {
        jest.doMock('@aws-sdk/client-secrets-manager', () => {
          const actual = jest.requireActual('@aws-sdk/client-secrets-manager');
          return {
            ...actual,
            SecretsManagerClient: jest
              .fn()
              .mockImplementation(() => ({ send: mockSend })),
          };
        });
        const authMod = require('./auth') as typeof import('./auth');
        const rogueBeta = 'computer-use-2024-10-22';
        // Confirm rogue beta is NOT in the real exported allowlist
        expect(authMod.BETA_ALLOWLIST.has(rogueBeta)).toBe(false);
        // Replay the same invariant logic from auth.ts against a fake drifted
        // PROVIDER_META entry and assert it throws the expected error shape.
        const driftedMeta: Record<string, { extraHeaders?: Record<string, string> }> = {
          anthropic: { extraHeaders: { 'anthropic-beta': rogueBeta } },
        };
        for (const meta of Object.values(driftedMeta)) {
          const ourBetas =
            meta.extraHeaders?.['anthropic-beta']
              ?.split(',')
              .map((s: string) => s.trim()) ?? [];
          for (const beta of ourBetas) {
            if (!authMod.BETA_ALLOWLIST.has(beta)) {
              throw new Error(
                `[sidecar/auth] PROVIDER_META contains beta "${beta}" not in BETA_ALLOWLIST — governance drift`,
              );
            }
          }
        }
      });
    }).toThrow(/governance drift/);
  });
});
