const mockDdbSend = jest.fn();
const mockLambdaSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDdbSend })),
  GetItemCommand: jest.fn((input: any) => ({ input })),
  PutItemCommand: jest.fn((input: any) => ({ input })),
  QueryCommand: jest.fn((input: any) => ({ input })),
  UpdateItemCommand: jest.fn((input: any) => ({ input })),
  ConditionalCheckFailedException: class ConditionalCheckFailedException extends Error {
    override name = 'ConditionalCheckFailedException';
  },
}));

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn(() => ({ send: mockLambdaSend })),
  InvokeCommand: jest.fn((input: any) => ({ input })),
}));

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

process.env['USERS_TABLE_NAME'] = 'UsersTable';
process.env['CONFIG_TABLE_NAME'] = 'ConfigTable';
process.env['LIFECYCLE_LAMBDA_NAME'] = 'LifecycleLambda';
process.env['ALB_DNS_NAME'] = 'test-alb.example.com';

import { handler } from './user-session';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {}): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'POST /user/session',
    rawPath: '/user/session',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method: 'POST', path: '/user/session', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      accountId: '123456789012', apiId: 'test', domainName: 'test', domainPrefix: 'test',
      requestId: 'test', routeKey: 'POST /user/session', stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000', timeEpoch: 0,
      authorizer: { jwt: { claims: { sub: 'user-123', email: 'alice@company.com' }, scopes: [] } },
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

describe('user-session handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return ready with wsEndpoint when user exists and is running', async () => {
    mockDdbSend
      .mockResolvedValueOnce({
        Item: {
          userId: { S: 'user-123' },
          email: { S: 'alice@company.com' },
          status: { S: 'running' },
          taskArn: { S: 'arn:aws:ecs:...' },
        },
      })
      .mockResolvedValueOnce({}); // UpdateItemCommand for lastActiveAt
    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ready');
  });

  it('should start container when user exists but is stopped', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Item: {
        userId: { S: 'user-123' },
        email: { S: 'alice@company.com' },
        status: { S: 'stopped' },
      },
    });
    mockLambdaSend.mockResolvedValueOnce({
      Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: '{"message":"started"}' })),
    });
    const res = await invoke();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('starting');
    expect(mockLambdaSend).toHaveBeenCalledTimes(1);
  });

  it('should auto-register and provision when user does not exist and domain is allowed', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({
        Items: [
          { scopeKey: { S: 'global#default' }, configKey: { S: 'allowedDomains' }, value: { S: '["company.com"]' } },
          { scopeKey: { S: 'global#default' }, configKey: { S: 'defaultTeamId' }, value: { S: '"team-default"' } },
        ],
      })
      .mockResolvedValueOnce({});
    mockLambdaSend.mockResolvedValueOnce({
      Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: '{"message":"provisioned"}' })),
    });
    const res = await invoke();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('provisioning');
  });

  it('should return 403 when domain is not allowed', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({
        Items: [
          { scopeKey: { S: 'global#default' }, configKey: { S: 'allowedDomains' }, value: { S: '["other.com"]' } },
        ],
      });
    const res = await invoke();
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toContain('IT');
  });

  it('should return 403 when no allowedDomains config exists', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({ Items: [] });
    const res = await invoke();
    expect(res.statusCode).toBe(403);
  });

  it('should return 400 when JWT claims are missing email', async () => {
    const event = makeEvent({
      requestContext: {
        ...makeEvent().requestContext,
        authorizer: { jwt: { claims: { sub: 'user-123' }, scopes: [] } },
      },
    } as any);
    const res = await invoke(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Missing');
  });

  it('should return 500 when DynamoDB throws an error', async () => {
    mockDdbSend.mockRejectedValueOnce(new Error('DDB failure'));
    const res = await invoke();
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toContain('DDB failure');
  });
});
