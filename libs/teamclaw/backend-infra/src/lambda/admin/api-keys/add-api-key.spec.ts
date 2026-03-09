const mockSend = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => ({ send: mockSend })),
  GetSecretValueCommand: jest.fn((input: any) => ({ input })),
  PutSecretValueCommand: jest.fn((input: any) => ({ input })),
}));

process.env['API_KEYS_SECRET_ARN'] = 'arn:aws:secretsmanager:us-east-1:123:secret:api-keys';

import { handler } from './add-api-key';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'POST', path: '/admin/api-keys', pathParameters: null,
    queryStringParameters: null, body: null, headers: {}, multiValueHeaders: {},
    isBase64Encoded: false, requestContext: {} as any, resource: '',
    stageVariables: null, multiValueQueryStringParameters: null,
    ...overrides,
  }) as APIGatewayProxyEvent;

const invoke = async (event = makeEvent()) =>
  (await handler(event, {} as Context, undefined as unknown as Callback)) as {
    statusCode: number; headers: any; body: string;
  };

describe('add-api-key handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when provider is missing', async () => {
    const res = await invoke(makeEvent({ body: JSON.stringify({ key: 'sk-123' }) }));
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when key is missing', async () => {
    const res = await invoke(makeEvent({ body: JSON.stringify({ provider: 'openai' }) }));
    expect(res.statusCode).toBe(400);
  });

  it('should add key to existing provider', async () => {
    mockSend
      .mockResolvedValueOnce({ SecretString: JSON.stringify({ openai: ['sk-existing'] }) })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ body: JSON.stringify({ provider: 'openai', key: 'sk-new' }) }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = JSON.parse(res.body);
    expect(body.totalKeys).toBe(2);

    const putInput = mockSend.mock.calls[1][0].input;
    expect(JSON.parse(putInput.SecretString).openai).toEqual(['sk-existing', 'sk-new']);
  });

  it('should create new provider when it does not exist', async () => {
    mockSend
      .mockResolvedValueOnce({ SecretString: JSON.stringify({}) })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ body: JSON.stringify({ provider: 'anthropic', key: 'ant-key' }) }),
    );
    expect(JSON.parse(res.body).totalKeys).toBe(1);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('SM error'));
    const res = await invoke(
      makeEvent({ body: JSON.stringify({ provider: 'openai', key: 'sk-123' }) }),
    );
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
