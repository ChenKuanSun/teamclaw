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
  PutItemCommand: jest.fn((input: any) => ({ input })),
}));

process.env['CONFIG_TABLE_NAME'] = 'ConfigTable';

import { handler } from './update-user-config';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'PUT', path: '/admin/config/user/u1', pathParameters: null,
    queryStringParameters: null, body: null, headers: {}, multiValueHeaders: {},
    isBase64Encoded: false, requestContext: {} as any, resource: '',
    stageVariables: null, multiValueQueryStringParameters: null,
    ...overrides,
  }) as APIGatewayProxyEvent;

const invoke = async (event = makeEvent()) =>
  (await (handler as any)(event)) as {
    statusCode: number; headers: any; body: string;
  };

describe('update-user-config handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when userId is missing', async () => {
    const res = await invoke(makeEvent({ body: JSON.stringify({ configKey: 'k', value: 'v' }) }));
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when configKey or value is missing', async () => {
    const res = await invoke(makeEvent({ pathParameters: { userId: 'u1' }, body: JSON.stringify({ configKey: 'k' }) }));
    expect(res.statusCode).toBe(400);
  });

  it('should update user config', async () => {
    mockSend.mockResolvedValueOnce({});
    const res = await invoke(
      makeEvent({ pathParameters: { userId: 'u1' }, body: JSON.stringify({ configKey: 'theme', value: 'dark' }) }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).userId).toBe('u1');
    expect(mockSend.mock.calls[0][0].input.Item.scopeKey).toEqual({ S: 'user#u1' });
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke(
      makeEvent({ pathParameters: { userId: 'u1' }, body: JSON.stringify({ configKey: 'k', value: 'v' }) }),
    );
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('DDB error');
  });
});
