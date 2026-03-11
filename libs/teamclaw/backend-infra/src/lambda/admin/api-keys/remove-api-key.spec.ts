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

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => ({ send: mockSend })),
  GetSecretValueCommand: jest.fn((input: any) => ({ input })),
  PutSecretValueCommand: jest.fn((input: any) => ({ input })),
}));

process.env['API_KEYS_SECRET_ARN'] = 'arn:aws:secretsmanager:us-east-1:123:secret:api-keys';

import { handler } from './remove-api-key';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'DELETE', path: '/admin/api-keys', pathParameters: null,
    queryStringParameters: null, body: null, headers: {}, multiValueHeaders: {},
    isBase64Encoded: false, requestContext: {} as any, resource: '',
    stageVariables: null, multiValueQueryStringParameters: null,
    ...overrides,
  }) as APIGatewayProxyEvent;

const invoke = async (event = makeEvent()) =>
  (await (handler as any)(event)) as {
    statusCode: number; headers: any; body: string;
  };

describe('remove-api-key handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when provider is missing', async () => {
    const res = await invoke(makeEvent({ body: JSON.stringify({ keyIndex: 0 }) }));
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when keyIndex is NaN', async () => {
    const res = await invoke(makeEvent({ body: JSON.stringify({ provider: 'openai' }) }));
    expect(res.statusCode).toBe(400);
  });

  it('should return 404 when provider does not exist', async () => {
    mockSend.mockResolvedValueOnce({ SecretString: JSON.stringify({ openai: ['sk-1'] }) });
    const res = await invoke(
      makeEvent({ body: JSON.stringify({ provider: 'anthropic', keyIndex: 0 }) }),
    );
    expect(res.statusCode).toBe(404);
  });

  it('should return 404 when keyIndex is out of bounds', async () => {
    mockSend.mockResolvedValueOnce({ SecretString: JSON.stringify({ openai: ['sk-1'] }) });
    const res = await invoke(
      makeEvent({ body: JSON.stringify({ provider: 'openai', keyIndex: 5 }) }),
    );
    expect(res.statusCode).toBe(404);
  });

  it('should return 404 when keyIndex is negative', async () => {
    mockSend.mockResolvedValueOnce({ SecretString: JSON.stringify({ openai: ['sk-1'] }) });
    const res = await invoke(
      makeEvent({ body: JSON.stringify({ provider: 'openai', keyIndex: -1 }) }),
    );
    expect(res.statusCode).toBe(404);
  });

  it('should remove key at specified index', async () => {
    mockSend
      .mockResolvedValueOnce({ SecretString: JSON.stringify({ openai: ['sk-0', 'sk-1', 'sk-2'] }) })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ body: JSON.stringify({ provider: 'openai', keyIndex: 1 }) }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).remainingKeys).toBe(2);

    const putInput = mockSend.mock.calls[1][0].input;
    expect(JSON.parse(putInput.SecretString).openai).toEqual(['sk-0', 'sk-2']);
  });

  it('should accept provider from path parameters', async () => {
    mockSend
      .mockResolvedValueOnce({ SecretString: JSON.stringify({ openai: ['sk-0'] }) })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({ pathParameters: { provider: 'openai', keyId: '0' }, body: JSON.stringify({}) }),
    );
    expect(res.statusCode).toBe(200);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('SM error'));
    const res = await invoke(
      makeEvent({ body: JSON.stringify({ provider: 'openai', keyIndex: 0 }) }),
    );
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('SM error');
  });
});
