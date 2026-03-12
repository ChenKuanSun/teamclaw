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

import { handler } from './add-api-key';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {}): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'POST /admin/api-keys',
    rawPath: '/admin/api-keys',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method: 'POST', path: '/admin/api-keys', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'POST /admin/api-keys',
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

describe('add-api-key handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when provider is missing', async () => {
    const res = await invoke(makeEvent({ body: JSON.stringify({ key: 'sk-123' }) }));
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when key is missing', async () => {
    const res = await invoke(makeEvent({ body: JSON.stringify({ provider: 'openai' }) }));
    expect(res.statusCode).toBe(400);
  });

  it('should add key to existing provider', async () => {
    mockSend
      .mockResolvedValueOnce({ SecretString: JSON.stringify({ openai: ['sk-existing'] }) })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ body: JSON.stringify({ provider: 'openai', key: 'sk-new' }) }),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.totalKeys).toBe(2);

    const putInput = mockSend.mock.calls[1][0].input;
    expect(JSON.parse(putInput.SecretString).openai).toEqual(['sk-existing', 'sk-new']);
  });

  it('should create new provider when it does not exist', async () => {
    mockSend
      .mockResolvedValueOnce({ SecretString: JSON.stringify({}) })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ body: JSON.stringify({ provider: 'anthropic', key: 'ant-key' }) }),
    );
    expect(JSON.parse(res.body).totalKeys).toBe(1);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('SM error'));
    const res = await invoke(
      makeEvent({ body: JSON.stringify({ provider: 'openai', key: 'sk-123' }) }),
    );
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('SM error');
  });
});
