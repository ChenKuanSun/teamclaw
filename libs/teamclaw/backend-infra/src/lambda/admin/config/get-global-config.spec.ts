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

import { handler } from './get-global-config';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const makeEvent = (): APIGatewayProxyEvent =>
  ({
    httpMethod: 'GET', path: '/admin/config/global', pathParameters: null,
    queryStringParameters: null, body: null, headers: {}, multiValueHeaders: {},
    isBase64Encoded: false, requestContext: {} as any, resource: '',
    stageVariables: null, multiValueQueryStringParameters: null,
  }) as APIGatewayProxyEvent;

const invoke = async (event = makeEvent()) =>
  (await (handler as any)(event)) as {
    statusCode: number; headers: any; body: string;
  };

describe('get-global-config handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return global config items', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { configKey: { S: 'maxTokens' }, value: { S: '4096' }, updatedAt: { S: '2026-01-01' }, updatedBy: { S: 'admin' } },
        { configKey: { S: 'defaultModel' }, value: { S: '"claude-3"' }, updatedAt: { S: '2026-01-02' }, updatedBy: { S: 'admin' } },
      ],
    });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.configs).toHaveLength(2);
    expect(body.configs[0].value).toBe(4096);
    expect(body.configs[1].value).toBe('claude-3');
  });

  it('should query with global#default scopeKey', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    await invoke();
    expect(mockSend.mock.calls[0][0].input.ExpressionAttributeValues[':sk']).toEqual({ S: 'global#default' });
  });

  it('should handle empty config', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    const res = await invoke();
    expect(JSON.parse(res.body).configs).toEqual([]);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke();
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('DDB error');
  });
});
