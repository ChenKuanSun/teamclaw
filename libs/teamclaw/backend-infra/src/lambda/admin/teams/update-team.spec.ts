const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
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
process.env['DEPLOY_ENV'] = 'dev';

import { handler } from './update-team';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'PUT',
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

describe('update-team handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when teamId is missing', async () => {
    const res = await invoke();
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Missing teamId');
  });

  it('should update name and description', async () => {
    mockSend.mockResolvedValueOnce({
      Attributes: {
        teamId: { S: 't1' }, name: { S: 'Updated' }, description: { S: 'New desc' },
        memberIds: { SS: ['u1'] }, createdAt: { S: '2026-01-01' }, updatedAt: { S: '2026-01-02' },
      },
    });

    const res = await invoke(
      makeEvent({
        pathParameters: { teamId: 't1' },
        body: JSON.stringify({ name: 'Updated', description: 'New desc' }),
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Updated');
    expect(body.memberCount).toBe(1);
  });

  it('should update memberIds', async () => {
    mockSend.mockResolvedValueOnce({
      Attributes: {
        teamId: { S: 't1' }, name: { S: 'Team' },
        memberIds: { SS: ['u1', 'u2'] }, updatedAt: { S: '2026-01-02' },
      },
    });

    const res = await invoke(
      makeEvent({
        pathParameters: { teamId: 't1' },
        body: JSON.stringify({ memberIds: ['u1', 'u2'] }),
      }),
    );
    expect(JSON.parse(res.body).memberIds).toEqual(['u1', 'u2']);
  });

  it('should set memberIds to NULL when empty array', async () => {
    mockSend.mockResolvedValueOnce({
      Attributes: { teamId: { S: 't1' }, name: { S: 'Team' }, updatedAt: { S: '2026-01-02' } },
    });

    await invoke(
      makeEvent({
        pathParameters: { teamId: 't1' },
        body: JSON.stringify({ memberIds: [] }),
      }),
    );

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeValues[':memberIds']).toEqual({ NULL: true });
  });

  it('should return 404 on ConditionalCheckFailedException', async () => {
    const error: any = new Error('Condition failed');
    error.name = 'ConditionalCheckFailedException';
    mockSend.mockRejectedValueOnce(error);

    const res = await invoke(
      makeEvent({ pathParameters: { teamId: 'nonexistent' }, body: JSON.stringify({ name: 'x' }) }),
    );
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).message).toBe('Team not found');
  });

  it('should return 500 on generic error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke(
      makeEvent({ pathParameters: { teamId: 't1' }, body: JSON.stringify({ name: 'x' }) }),
    );
    expect(res.statusCode).toBe(500);
  });
});
