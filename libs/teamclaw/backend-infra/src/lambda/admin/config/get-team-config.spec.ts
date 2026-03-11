jest.mock('@TeamClaw/teamclaw/cloud-function', () => {
  const actual = jest.requireActual('@TeamClaw/teamclaw/cloud-function');
  return {
    ...actual,
    adminLambdaHandlerDecorator: (_method: string, fn: any) => {
      return async (event: any) => {
        try {
          const result = await fn(event);
          return { statusCode: result.status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result.body) };
        } catch (error: any) {
          return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: error.message || 'Internal server error' }) };
        }
      };
    },
    validateRequiredEnvVars: jest.fn(),
  };
});

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  QueryCommand: jest.fn((input: any) => ({ input })),
}));

process.env['CONFIG_TABLE_NAME'] = 'ConfigTable';

import { handler } from './get-team-config';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'GET', path: '/admin/config/team/t1', pathParameters: null,
    queryStringParameters: null, body: null, headers: {}, multiValueHeaders: {},
    isBase64Encoded: false, requestContext: {} as any, resource: '',
    stageVariables: null, multiValueQueryStringParameters: null,
    ...overrides,
  }) as APIGatewayProxyEvent;

const invoke = async (event = makeEvent()) =>
  (await (handler as any)(event)) as {
    statusCode: number; headers: any; body: string;
  };

describe('get-team-config handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when teamId is missing', async () => {
    const res = await invoke();
    expect(res.statusCode).toBe(400);
  });

  it('should query with team#teamId scopeKey', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    await invoke(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(mockSend.mock.calls[0][0].input.ExpressionAttributeValues[':sk']).toEqual({ S: 'team#t1' });
  });

  it('should return team configs', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ configKey: { S: 'allowedModels' }, value: { S: '["claude-3","gpt-4"]' }, updatedAt: { S: '2026-01-01' }, updatedBy: { S: 'admin' } }],
    });
    const res = await invoke(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.teamId).toBe('t1');
    expect(body.configs[0].value).toEqual(['claude-3', 'gpt-4']);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('DDB error');
  });
});
