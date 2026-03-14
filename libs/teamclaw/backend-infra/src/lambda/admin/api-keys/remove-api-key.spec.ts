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
            body: JSON.stringify({ message: error.message || 'Internal server error' }),
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

process.env['API_KEYS_SECRET_ARN'] = 'arn:aws:secretsmanager:us-east-1:123:secret:api-keys';

import { handler } from './remove-api-key';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {}): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'DELETE /admin/api-keys',
    rawPath: '/admin/api-keys',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method: 'DELETE', path: '/admin/api-keys', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'DELETE /admin/api-keys',
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
    statusCode: number; headers: any; body: string;
  };

const newFormatSecret = (providers: Record<string, any>) =>
  JSON.stringify({ providers });

describe('remove-api-key handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when provider is missing', async () => {
    const res = await invoke(makeEvent({ pathParameters: { keyId: '0' } }));
    expect(res.statusCode).toBe(400);
  });

  it('should return 404 when provider does not exist', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: newFormatSecret({
        openai: { authType: 'apiKey', keys: ['sk-1'] },
      }),
    });
    const res = await invoke(
      makeEvent({ pathParameters: { provider: 'anthropic', keyId: '0' } }),
    );
    expect(res.statusCode).toBe(404);
  });

  it('should return 400 when keyIndex is missing for apiKey provider', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: newFormatSecret({
        openai: { authType: 'apiKey', keys: ['sk-1'] },
      }),
    });
    const res = await invoke(makeEvent({ pathParameters: { provider: 'openai' } }));
    expect(res.statusCode).toBe(400);
  });

  it('should return 404 when keyIndex is out of bounds', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: newFormatSecret({
        openai: { authType: 'apiKey', keys: ['sk-1'] },
      }),
    });
    const res = await invoke(
      makeEvent({ pathParameters: { provider: 'openai', keyId: '5' } }),
    );
    expect(res.statusCode).toBe(404);
  });

  it('should return 404 when keyIndex is negative', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: newFormatSecret({
        openai: { authType: 'apiKey', keys: ['sk-1'] },
      }),
    });
    const res = await invoke(
      makeEvent({ pathParameters: { provider: 'openai', keyId: '-1' } }),
    );
    expect(res.statusCode).toBe(404);
  });

  it('should remove key at specified index', async () => {
    mockSend
      .mockResolvedValueOnce({
        SecretString: newFormatSecret({
          openai: { authType: 'apiKey', keys: ['sk-0', 'sk-1', 'sk-2'] },
        }),
      })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ pathParameters: { provider: 'openai', keyId: '1' } }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).remainingKeys).toBe(2);

    const putInput = mockSend.mock.calls[1][0].input;
    const written = JSON.parse(putInput.SecretString);
    expect(written.providers.openai.keys).toEqual(['sk-0', 'sk-2']);
  });

  it('should delete provider when last key is removed', async () => {
    mockSend
      .mockResolvedValueOnce({
        SecretString: newFormatSecret({
          openai: { authType: 'apiKey', keys: ['sk-0'] },
        }),
      })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ pathParameters: { provider: 'openai', keyId: '0' } }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).remainingKeys).toBe(0);

    const putInput = mockSend.mock.calls[1][0].input;
    const written = JSON.parse(putInput.SecretString);
    expect(written.providers.openai).toBeUndefined();
  });

  it('should remove entire OAuth provider entry', async () => {
    mockSend
      .mockResolvedValueOnce({
        SecretString: newFormatSecret({
          google: { authType: 'oauthToken', token: 'tok-123', accessToken: 'acc-456' },
        }),
      })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ pathParameters: { provider: 'google' } }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toBe('OAuth credentials removed');

    const putInput = mockSend.mock.calls[1][0].input;
    const written = JSON.parse(putInput.SecretString);
    expect(written.providers.google).toBeUndefined();
  });

  it('should accept provider from query string parameters', async () => {
    mockSend
      .mockResolvedValueOnce({
        SecretString: newFormatSecret({
          openai: { authType: 'apiKey', keys: ['sk-0'] },
        }),
      })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ queryStringParameters: { provider: 'openai', keyIndex: '0' } }),
    );
    expect(res.statusCode).toBe(200);
  });

  it('should handle legacy format migration', async () => {
    mockSend
      .mockResolvedValueOnce({ SecretString: JSON.stringify({ openai: ['sk-0', 'sk-1', 'sk-2'] }) })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ pathParameters: { provider: 'openai', keyId: '1' } }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).remainingKeys).toBe(2);

    const putInput = mockSend.mock.calls[1][0].input;
    const written = JSON.parse(putInput.SecretString);
    expect(written.providers.openai.keys).toEqual(['sk-0', 'sk-2']);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('SM error'));
    const res = await invoke(
      makeEvent({ pathParameters: { provider: 'openai', keyId: '0' } }),
    );
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('SM error');
  });
});
