const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  DeleteItemCommand: jest.fn((input: any) => ({ input })),
  GetItemCommand: jest.fn((input: any) => ({ input })),
  UpdateItemCommand: jest.fn((input: any) => ({ input })),
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
process.env['USERS_TABLE_NAME'] = 'UsersTable';
process.env['DEPLOY_ENV'] = 'dev';

import { handler } from './delete-team';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {}): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'DELETE /admin/teams/{teamId}',
    rawPath: '/admin/teams/t1',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method: 'DELETE', path: '/admin/teams/t1', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'DELETE /admin/teams/{teamId}',
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

describe('delete-team handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when teamId is missing', async () => {
    const res = await invoke();
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Missing teamId');
  });

  it('should return 404 when team not found', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const res = await invoke(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).message).toBe('Team not found');
  });

  it('should delete team and update members', async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { teamId: { S: 't1' }, memberIds: { SS: ['u1', 'u2'] } } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await invoke(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.deleted).toBe(true);
    expect(body.membersUpdated).toBe(2);
    expect(mockSend).toHaveBeenCalledTimes(4);
  });

  it('should delete team with no members', async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { teamId: { S: 't1' } } })
      .mockResolvedValueOnce({});

    const res = await invoke(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).membersUpdated).toBe(0);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(res.statusCode).toBe(500);
  });
});
