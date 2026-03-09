const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  PutItemCommand: jest.fn((input: any) => ({ input })),
}));

process.env['CONFIG_TABLE_NAME'] = 'ConfigTable';

import { handler } from './update-team-config';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'PUT', path: '/admin/config/team/t1', pathParameters: null,
    queryStringParameters: null, body: null, headers: {}, multiValueHeaders: {},
    isBase64Encoded: false, requestContext: {} as any, resource: '',
    stageVariables: null, multiValueQueryStringParameters: null,
    ...overrides,
  }) as APIGatewayProxyEvent;

const invoke = async (event = makeEvent()) =>
  (await handler(event, {} as Context, undefined as unknown as Callback)) as {
    statusCode: number; headers: any; body: string;
  };

describe('update-team-config handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when teamId is missing', async () => {
    const res = await invoke(makeEvent({ body: JSON.stringify({ configKey: 'k', value: 'v' }) }));
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when configKey or value is missing', async () => {
    const res = await invoke(makeEvent({ pathParameters: { teamId: 't1' }, body: JSON.stringify({}) }));
    expect(res.statusCode).toBe(400);
  });

  it('should update team config', async () => {
    mockSend.mockResolvedValueOnce({});
    const res = await invoke(
      makeEvent({
        pathParameters: { teamId: 't1' },
        body: JSON.stringify({ configKey: 'maxTokens', value: 2048 }),
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(JSON.parse(res.body).teamId).toBe('t1');
    expect(mockSend.mock.calls[0][0].input.Item.scopeKey).toEqual({ S: 'team#t1' });
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke(
      makeEvent({ pathParameters: { teamId: 't1' }, body: JSON.stringify({ configKey: 'k', value: 'v' }) }),
    );
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
