const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  ScanCommand: jest.fn((input: any) => ({ input })),
}));

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

process.env['USAGE_TABLE_NAME'] = 'UsageTable';

import { handler } from './get-usage-by-provider';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'GET', path: '/admin/analytics/usage-by-provider', pathParameters: null,
    queryStringParameters: null, body: null, headers: {}, multiValueHeaders: {},
    isBase64Encoded: false, requestContext: {} as any, resource: '',
    stageVariables: null, multiValueQueryStringParameters: null,
    ...overrides,
  }) as APIGatewayProxyEvent;

const invoke = async (event = makeEvent()) =>
  (await (handler as any)(event, {} as Context)) as {
    statusCode: number; headers: any; body: string;
  };

describe('get-usage-by-provider handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when from parameter is missing', async () => {
    const res = await invoke();
    expect(res.statusCode).toBe(400);
  });

  it('should return time series grouped by provider and date', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { provider: { S: 'openai' }, timestamp: { S: '2026-01-01T10:00:00Z' } },
        { provider: { S: 'openai' }, timestamp: { S: '2026-01-01T14:00:00Z' } },
        { provider: { S: 'openai' }, timestamp: { S: '2026-01-02T10:00:00Z' } },
        { provider: { S: 'anthropic' }, timestamp: { S: '2026-01-01T12:00:00Z' } },
      ],
      LastEvaluatedKey: undefined,
    });

    const res = await invoke(makeEvent({ queryStringParameters: { from: '2026-01-01T00:00:00Z' } }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.byProvider.openai).toEqual([
      { date: '2026-01-01', count: 2 },
      { date: '2026-01-02', count: 1 },
    ]);
    expect(body.byProvider.anthropic).toEqual([{ date: '2026-01-01', count: 1 }]);
  });

  it('should sort time series by date', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { provider: { S: 'openai' }, timestamp: { S: '2026-01-03T10:00:00Z' } },
        { provider: { S: 'openai' }, timestamp: { S: '2026-01-01T10:00:00Z' } },
        { provider: { S: 'openai' }, timestamp: { S: '2026-01-02T10:00:00Z' } },
      ],
      LastEvaluatedKey: undefined,
    });

    const body = JSON.parse((await invoke(makeEvent({ queryStringParameters: { from: '2026-01-01T00:00:00Z' } }))).body);
    const dates = body.byProvider.openai.map((d: any) => d.date);
    expect(dates).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('should handle empty results', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    const body = JSON.parse((await invoke(makeEvent({ queryStringParameters: { from: '2026-01-01T00:00:00Z' } }))).body);
    expect(body.byProvider).toEqual({});
  });

  it('should handle items without provider as unknown', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ timestamp: { S: '2026-01-01T10:00:00Z' } }],
      LastEvaluatedKey: undefined,
    });
    const body = JSON.parse((await invoke(makeEvent({ queryStringParameters: { from: '2026-01-01T00:00:00Z' } }))).body);
    expect(body.byProvider.unknown).toBeDefined();
  });

  it('should paginate through all pages', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ provider: { S: 'openai' }, timestamp: { S: '2026-01-01T10:00:00Z' } }], LastEvaluatedKey: { pk: { S: 'p1' } } })
      .mockResolvedValueOnce({ Items: [{ provider: { S: 'openai' }, timestamp: { S: '2026-01-01T11:00:00Z' } }], LastEvaluatedKey: undefined });

    const body = JSON.parse((await invoke(makeEvent({ queryStringParameters: { from: '2026-01-01T00:00:00Z' } }))).body);
    expect(body.byProvider.openai[0].count).toBe(2);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke(makeEvent({ queryStringParameters: { from: '2026-01-01T00:00:00Z' } }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('DDB error');
  });
});
