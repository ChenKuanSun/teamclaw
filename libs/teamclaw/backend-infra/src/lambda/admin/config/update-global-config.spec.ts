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

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  PutItemCommand: jest.fn((input: any) => ({ input })),
}));

process.env['CONFIG_TABLE_NAME'] = 'ConfigTable';

import { handler } from './update-global-config';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {}): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'PUT /admin/config/global',
    rawPath: '/admin/config/global',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method: 'PUT', path: '/admin/config/global', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'PUT /admin/config/global',
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

describe('update-global-config handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when configKey is missing', async () => {
    const res = await invoke(makeEvent({ body: JSON.stringify({ value: 'test' }) }));
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when value is undefined', async () => {
    const res = await invoke(makeEvent({ body: JSON.stringify({ configKey: 'test' }) }));
    expect(res.statusCode).toBe(400);
  });

  it('should update global config', async () => {
    mockSend.mockResolvedValueOnce({});
    const res = await invoke(
      makeEvent({
        body: JSON.stringify({ configKey: 'maxTokens', value: 4096 }),
        requestContext: {
          http: { method: 'PUT', path: '/admin/config/global', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
          accountId: '123456789012', apiId: 'test', domainName: 'test', domainPrefix: 'test',
          requestId: 'test', routeKey: 'PUT /admin/config/global', stage: '$default',
          time: '01/Jan/2026:00:00:00 +0000', timeEpoch: 0,
          authorizer: { jwt: { claims: { sub: 'admin-user' }, scopes: [] } },
        } as any,
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).configKey).toBe('maxTokens');
    const putInput = mockSend.mock.calls[0][0].input;
    expect(putInput.Item.scopeKey).toEqual({ S: 'global#default' });
    expect(putInput.Item.updatedBy).toEqual({ S: 'admin-user' });
  });

  it('should default updatedBy to admin', async () => {
    mockSend.mockResolvedValueOnce({});
    await invoke(makeEvent({
      body: JSON.stringify({ configKey: 'k', value: 'v' }),
      requestContext: {
        http: { method: 'PUT', path: '/admin/config/global', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
        accountId: '123456789012', apiId: 'test', domainName: 'test', domainPrefix: 'test',
        requestId: 'test', routeKey: 'PUT /admin/config/global', stage: '$default',
        time: '01/Jan/2026:00:00:00 +0000', timeEpoch: 0,
        authorizer: { jwt: { claims: {}, scopes: [] } },
      } as any,
    }));
    expect(mockSend.mock.calls[0][0].input.Item.updatedBy).toEqual({ S: 'admin' });
  });

  it('should accept value of 0 (falsy but valid)', async () => {
    mockSend.mockResolvedValueOnce({});
    const res = await invoke(makeEvent({ body: JSON.stringify({ configKey: 'limit', value: 0 }) }));
    expect(res.statusCode).toBe(200);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke(makeEvent({ body: JSON.stringify({ configKey: 'k', value: 'v' }) }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('DDB error');
  });
});
