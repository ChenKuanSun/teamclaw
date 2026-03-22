const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  ScanCommand: jest.fn((input: any) => ({ input })),
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

process.env['TEAMS_TABLE_NAME'] = 'TeamsTable';
process.env['DEPLOY_ENV'] = 'dev';

import { handler } from './query-teams';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {}): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'GET /admin/teams',
    rawPath: '/admin/teams',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method: 'GET', path: '/admin/teams', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'GET /admin/teams',
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
  (await handler(event, {} as Context)) as {
    statusCode: number;
    headers: any;
    body: string;
  };

describe('query-teams handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return teams with default limit', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          teamId: { S: 't1' }, name: { S: 'Alpha' }, description: { S: 'First team' },
          memberIds: { SS: ['u1', 'u2'] }, createdAt: { S: '2026-01-01' }, updatedAt: { S: '2026-01-02' },
        },
      ],
      LastEvaluatedKey: undefined,
    });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.teams).toHaveLength(1);
    expect(body.teams[0].teamId).toBe('t1');
    expect(body.teams[0].memberCount).toBe(2);
    expect(body.nextToken).toBeUndefined();
  });

  it('should filter by name', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    await invoke(makeEvent({ queryStringParameters: { name: 'Alpha' } }));
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.FilterExpression).toBe('contains(#n, :name)');
    expect(cmd.input.ExpressionAttributeValues[':name']).toEqual({ S: 'Alpha' });
  });

  it('should handle pagination', async () => {
    const lastKey = { teamId: { S: 't1' } };
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: lastKey });
    const res = await invoke();
    const body = JSON.parse(res.body);
    expect(body.nextToken).toBeDefined();
    expect(JSON.parse(Buffer.from(body.nextToken, 'base64').toString())).toEqual(lastKey);
  });

  it('should accept nextToken for continued scanning', async () => {
    const key = { teamId: { S: 't1' } };
    const nextToken = Buffer.from(JSON.stringify(key)).toString('base64');
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    await invoke(makeEvent({ queryStringParameters: { nextToken } }));
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExclusiveStartKey).toEqual(key);
  });

  it('should handle teams with no members', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ teamId: { S: 't1' }, name: { S: 'Empty' } }],
      LastEvaluatedKey: undefined,
    });
    const res = await invoke();
    expect(JSON.parse(res.body).teams[0].memberCount).toBe(0);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('fail'));
    const res = await invoke();
    expect(res.statusCode).toBe(500);
  });
});
