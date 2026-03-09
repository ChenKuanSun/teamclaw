const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  ScanCommand: jest.fn((input: any) => ({ input })),
}));

process.env['USAGE_TABLE_NAME'] = 'UsageTable';

import { handler } from './get-key-usage-stats';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const makeEvent = (): APIGatewayProxyEvent =>
  ({
    httpMethod: 'GET', path: '/admin/api-keys/usage-stats', pathParameters: null,
    queryStringParameters: null, body: null, headers: {}, multiValueHeaders: {},
    isBase64Encoded: false, requestContext: {} as any, resource: '',
    stageVariables: null, multiValueQueryStringParameters: null,
  }) as APIGatewayProxyEvent;

const invoke = async () =>
  (await handler(makeEvent(), {} as Context, undefined as unknown as Callback)) as {
    statusCode: number; headers: any; body: string;
  };

describe('get-key-usage-stats handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return usage stats by provider', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { provider: { S: 'openai' } },
        { provider: { S: 'openai' } },
        { provider: { S: 'anthropic' } },
      ],
      LastEvaluatedKey: undefined,
    });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = JSON.parse(res.body);
    expect(body.totalRequests).toBe(3);
    expect(body.byProvider.openai).toBe(2);
    expect(body.byProvider.anthropic).toBe(1);
  });

  it('should handle empty usage table', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    const res = await invoke();
    const body = JSON.parse(res.body);
    expect(body.totalRequests).toBe(0);
    expect(body.byProvider).toEqual({});
  });

  it('should paginate through all results', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ provider: { S: 'openai' } }], LastEvaluatedKey: { pk: { S: 'p1' } } })
      .mockResolvedValueOnce({ Items: [{ provider: { S: 'openai' } }], LastEvaluatedKey: undefined });

    const body = JSON.parse((await invoke()).body);
    expect(body.totalRequests).toBe(2);
  });

  it('should count items without provider as unknown', async () => {
    mockSend.mockResolvedValueOnce({ Items: [{ timestamp: { S: '2026-01-01' } }], LastEvaluatedKey: undefined });
    const body = JSON.parse((await invoke()).body);
    expect(body.byProvider.unknown).toBe(1);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke();
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
