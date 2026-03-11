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
    adminLambdaHandlerDecorator: (_method: string, fn: any) => {
      return async (event: any, context: any) => {
        try {
          const result = await fn(event);
          return {
            statusCode: result.status,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.body),
          };
        } catch (error: any) {
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
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
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'DELETE',
    path: '/admin/teams/t1',
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    requestContext: {} as any,
    resource: '',
    stageVariables: null,
    multiValueQueryStringParameters: null,
    ...overrides,
  }) as APIGatewayProxyEvent;

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
