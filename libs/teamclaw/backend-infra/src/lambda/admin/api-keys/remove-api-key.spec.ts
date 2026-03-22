jest.mock('@TeamClaw/teamclaw/cloud-function', () => {
  const actual = jest.requireActual('@TeamClaw/teamclaw/cloud-function');
  return {
    ...actual,
    adminLambdaHandlerDecorator: (method: string, fn: any) => {
      return async (event: any, context: any) => {
        try {
          const input = {
            raw: event,
            queryStringParameters: event.queryStringParameters,
            pathParameters: event.pathParameters,
            body: event.body ? JSON.parse(event.body) : undefined,
          };
          const result = await fn(input);
          return {
            statusCode: result.status,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(result.body),
          };
        } catch (error: any) {
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
              message: error.message || 'Internal server error',
            }),
          };
        }
      };
    },
    validateRequiredEnvVars: jest.fn(),
  };
});

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => ({ send: mockSend })),
  GetSecretValueCommand: jest.fn((input: any) => ({ input })),
  PutSecretValueCommand: jest.fn((input: any) => ({ input })),
}));

process.env['API_KEYS_SECRET_ARN'] =
  'arn:aws:secretsmanager:us-east-1:123:secret:api-keys';

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  Context,
} from 'aws-lambda';
import { handler } from './remove-api-key';

const makeEvent = (
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'DELETE /admin/api-keys/{keyId}',
    rawPath: '/admin/api-keys',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: {
        method: 'DELETE',
        path: '/admin/api-keys',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'DELETE /admin/api-keys/{keyId}',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: { jwt: { claims: { sub: 'admin-user' }, scopes: [] } },
    },
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    ...overrides,
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

const invoke = async (event = makeEvent()) =>
  (await (handler as any)(event, {} as Context)) as {
    statusCode: number;
    headers: any;
    body: string;
  };

const newFormatSecret = (providers: Record<string, any>) =>
  JSON.stringify({ providers });

describe('remove-api-key handler', () => {
  beforeEach(() => jest.clearAllMocks());

  // --- keyId path parameter validation ---

  it('should return 400 when keyId path parameter is missing', async () => {
    const res = await invoke(makeEvent({ pathParameters: {} }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe(
      'keyId path parameter is required',
    );
  });

  it('should return 400 when pathParameters is null', async () => {
    const res = await invoke(makeEvent({ pathParameters: null as any }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe(
      'keyId path parameter is required',
    );
  });

  it('should return 400 when provider portion is empty (keyId starts with colon)', async () => {
    const res = await invoke(
      makeEvent({ pathParameters: { keyId: ':somesuffix' } }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe('provider is required');
  });

  // --- Provider not found ---

  it('should return 404 when provider does not exist', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: newFormatSecret({
        openai: { authType: 'apiKey', keys: ['sk-1234567890abcdef'] },
      }),
    });
    const res = await invoke(
      makeEvent({ pathParameters: { keyId: 'anthropic:abcdef' } }),
    );
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).message).toBe('Provider not found');
  });

  // --- API key removal by suffix ---

  it('should remove key matching the suffix', async () => {
    mockSend
      .mockResolvedValueOnce({
        SecretString: newFormatSecret({
          openai: {
            authType: 'apiKey',
            keys: ['sk-aaaa1111', 'sk-bbbb2222', 'sk-cccc3333'],
          },
        }),
      })
      .mockResolvedValueOnce({});

    // Remove key ending with 'bbbb2222'
    const res = await invoke(
      makeEvent({ pathParameters: { keyId: 'openai:bbbb2222' } }),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toBe('API key removed');
    expect(body.provider).toBe('openai');
    expect(body.remainingKeys).toBe(2);

    const putInput = mockSend.mock.calls[1][0].input;
    const written = JSON.parse(putInput.SecretString);
    expect(written.providers.openai.keys).toEqual([
      'sk-aaaa1111',
      'sk-cccc3333',
    ]);
  });

  it('should find key by partial suffix match (endsWith)', async () => {
    mockSend
      .mockResolvedValueOnce({
        SecretString: newFormatSecret({
          openai: { authType: 'apiKey', keys: ['sk-proj-abcdefghijklmnop'] },
        }),
      })
      .mockResolvedValueOnce({});

    // suffix is last 8 chars as returned by get-api-keys
    const res = await invoke(
      makeEvent({ pathParameters: { keyId: 'openai:jklmnop' } }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).remainingKeys).toBe(0);
  });

  it('should delete provider when last key is removed', async () => {
    mockSend
      .mockResolvedValueOnce({
        SecretString: newFormatSecret({
          openai: { authType: 'apiKey', keys: ['sk-onlykey1'] },
        }),
      })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ pathParameters: { keyId: 'openai:onlykey1' } }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).remainingKeys).toBe(0);

    const putInput = mockSend.mock.calls[1][0].input;
    const written = JSON.parse(putInput.SecretString);
    expect(written.providers.openai).toBeUndefined();
  });

  it('should return 404 when no key matches the suffix', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: newFormatSecret({
        openai: { authType: 'apiKey', keys: ['sk-aaaa1111'] },
      }),
    });

    const res = await invoke(
      makeEvent({ pathParameters: { keyId: 'openai:xxxxxxxx' } }),
    );
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).message).toBe(
      'Key not found matching the given suffix',
    );
  });

  it('should return 400 when keySuffix is missing for apiKey provider', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: newFormatSecret({
        openai: { authType: 'apiKey', keys: ['sk-1234'] },
      }),
    });

    // keyId = 'openai' (no colon, so keySuffix is undefined)
    const res = await invoke(
      makeEvent({ pathParameters: { keyId: 'openai' } }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/keySuffix is required/);
  });

  it('should match first key when multiple keys share the same suffix', async () => {
    mockSend
      .mockResolvedValueOnce({
        SecretString: newFormatSecret({
          openai: {
            authType: 'apiKey',
            keys: ['sk-alpha-samesuffix', 'sk-bravo-samesuffix'],
          },
        }),
      })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ pathParameters: { keyId: 'openai:samesuffix' } }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).remainingKeys).toBe(1);

    // findIndex returns first match, so 'sk-alpha-samesuffix' is removed
    const putInput = mockSend.mock.calls[1][0].input;
    const written = JSON.parse(putInput.SecretString);
    expect(written.providers.openai.keys).toEqual(['sk-bravo-samesuffix']);
  });

  it('should handle empty keys array', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: newFormatSecret({
        openai: { authType: 'apiKey', keys: [] },
      }),
    });

    const res = await invoke(
      makeEvent({ pathParameters: { keyId: 'openai:anything' } }),
    );
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).message).toBe(
      'Key not found matching the given suffix',
    );
  });

  // --- OAuth provider removal ---

  it('should remove entire OAuth provider entry (keyId = provider name only)', async () => {
    mockSend
      .mockResolvedValueOnce({
        SecretString: newFormatSecret({
          google: {
            authType: 'oauthToken',
            token: 'tok-123',
            accessToken: 'acc-456',
          },
        }),
      })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ pathParameters: { keyId: 'google' } }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toBe('OAuth credentials removed');
    expect(JSON.parse(res.body).provider).toBe('google');

    const putInput = mockSend.mock.calls[1][0].input;
    const written = JSON.parse(putInput.SecretString);
    expect(written.providers.google).toBeUndefined();
  });

  it('should remove OAuth provider even when keyId has colon format', async () => {
    // If someone passes google:something, but google is an OAuth provider,
    // it should still delete the whole OAuth entry (keySuffix is ignored for OAuth)
    mockSend
      .mockResolvedValueOnce({
        SecretString: newFormatSecret({
          google: { authType: 'oauthToken', token: 'tok-123' },
        }),
      })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ pathParameters: { keyId: 'google:ignored' } }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toBe('OAuth credentials removed');
  });

  // --- URL encoding ---

  it('should decode URL-encoded keyId', async () => {
    mockSend
      .mockResolvedValueOnce({
        SecretString: newFormatSecret({
          openai: { authType: 'apiKey', keys: ['sk-test12345678'] },
        }),
      })
      .mockResolvedValueOnce({});

    // colon encoded as %3A
    const res = await invoke(
      makeEvent({ pathParameters: { keyId: 'openai%3A12345678' } }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toBe('API key removed');
  });

  // --- Legacy format migration ---

  it('should handle legacy format migration', async () => {
    mockSend
      .mockResolvedValueOnce({
        SecretString: JSON.stringify({
          openai: ['sk-aaa11111', 'sk-bbb22222', 'sk-ccc33333'],
        }),
      })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ pathParameters: { keyId: 'openai:bb22222' } }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).remainingKeys).toBe(2);

    const putInput = mockSend.mock.calls[1][0].input;
    const written = JSON.parse(putInput.SecretString);
    expect(written.providers.openai.keys).toEqual([
      'sk-aaa11111',
      'sk-ccc33333',
    ]);
  });

  // --- Other providers preserved ---

  it('should not affect other providers when removing a key', async () => {
    mockSend
      .mockResolvedValueOnce({
        SecretString: newFormatSecret({
          openai: { authType: 'apiKey', keys: ['sk-aaaa1111', 'sk-bbbb2222'] },
          anthropic: { authType: 'apiKey', keys: ['ant-key99'] },
        }),
      })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ pathParameters: { keyId: 'openai:aaaa1111' } }),
    );
    expect(res.statusCode).toBe(200);

    const putInput = mockSend.mock.calls[1][0].input;
    const written = JSON.parse(putInput.SecretString);
    expect(written.providers.openai.keys).toEqual(['sk-bbbb2222']);
    expect(written.providers.anthropic.keys).toEqual(['ant-key99']);
  });

  // --- Error handling ---

  it('should return 500 on SecretsManager error', async () => {
    mockSend.mockRejectedValueOnce(new Error('SM error'));
    const res = await invoke(
      makeEvent({ pathParameters: { keyId: 'openai:abcd1234' } }),
    );
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('SM error');
  });
});
