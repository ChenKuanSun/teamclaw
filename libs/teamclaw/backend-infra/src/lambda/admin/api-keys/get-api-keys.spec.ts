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
}));

process.env['API_KEYS_SECRET_ARN'] = 'arn:aws:secretsmanager:us-east-1:123:secret:api-keys';

import { handler } from './get-api-keys';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {}): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'GET /admin/api-keys',
    rawPath: '/admin/api-keys',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method: 'GET', path: '/admin/api-keys', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'GET /admin/api-keys',
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

describe('get-api-keys handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return masked API keys by provider', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: newFormatSecret({
        openai: { authType: 'apiKey', keys: ['sk-abcdefghijklmnop', 'sk-1234567890abcdef'] },
        anthropic: { authType: 'apiKey', keys: ['ant-key12345'] },
      }),
    });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.providers.openai.authType).toBe('apiKey');
    expect(body.providers.openai.keys).toHaveLength(2);
    expect(body.providers.openai.keys[0].index).toBe(0);
    expect(body.providers.openai.keys[0].masked).toMatch(/^\*+mnop$/);
    expect(body.providers.anthropic.keys).toHaveLength(1);
  });

  it('should return OAuth provider info with boolean flags', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: newFormatSecret({
        google: {
          authType: 'oauthToken',
          token: 'tok-secret',
          accessToken: 'acc-secret',
          refreshToken: 'ref-secret',
          expiresAt: 1700000000,
        },
      }),
    });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.providers.google).toEqual({
      authType: 'oauthToken',
      hasToken: true,
      hasAccessToken: true,
      hasRefreshToken: true,
      expiresAt: 1700000000,
    });
  });

  it('should handle legacy format (migration)', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: JSON.stringify({
        openai: ['sk-abcdefghijklmnop'],
      }),
    });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.providers.openai.authType).toBe('apiKey');
    expect(body.providers.openai.keys).toHaveLength(1);
    expect(body.providers.openai.keys[0].masked).toMatch(/^\*+mnop$/);
  });

  it('should mask short keys with all asterisks', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: newFormatSecret({
        test: { authType: 'apiKey', keys: ['ab'] },
      }),
    });
    const res = await invoke();
    expect(JSON.parse(res.body).providers.test.keys[0].masked).toBe('****');
  });

  it('should handle empty secret', async () => {
    mockSend.mockResolvedValueOnce({ SecretString: '{}' });
    const res = await invoke();
    expect(JSON.parse(res.body).providers).toEqual({});
  });

  it('should return 500 on SecretsManager error', async () => {
    mockSend.mockRejectedValueOnce(new Error('SM error'));
    const res = await invoke();
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('SM error');
  });
});
