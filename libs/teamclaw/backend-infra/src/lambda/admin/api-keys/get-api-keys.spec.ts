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
}));

process.env['API_KEYS_SECRET_ARN'] = 'arn:aws:secretsmanager:us-east-1:123:secret:api-keys';

import { handler } from './get-api-keys';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const makeEvent = (): APIGatewayProxyEvent =>
  ({
    httpMethod: 'GET', path: '/admin/api-keys', pathParameters: null,
    queryStringParameters: null, body: null, headers: {}, multiValueHeaders: {},
    isBase64Encoded: false, requestContext: {} as any, resource: '',
    stageVariables: null, multiValueQueryStringParameters: null,
  }) as APIGatewayProxyEvent;

const invoke = async (event = makeEvent()) =>
  (await (handler as any)(event)) as {
    statusCode: number; headers: any; body: string;
  };

describe('get-api-keys handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return masked API keys by provider', async () => {
    mockSend.mockResolvedValueOnce({
      SecretString: JSON.stringify({
        openai: ['sk-abcdefghijklmnop', 'sk-1234567890abcdef'],
        anthropic: ['ant-key12345'],
      }),
    });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.providers.openai).toHaveLength(2);
    expect(body.providers.openai[0].index).toBe(0);
    expect(body.providers.openai[0].masked).toMatch(/^\*+mnop$/);
    expect(body.providers.anthropic).toHaveLength(1);
  });

  it('should mask short keys with all asterisks', async () => {
    mockSend.mockResolvedValueOnce({ SecretString: JSON.stringify({ test: ['ab'] }) });
    const res = await invoke();
    expect(JSON.parse(res.body).providers.test[0].masked).toBe('****');
  });

  it('should handle empty secret', async () => {
    mockSend.mockResolvedValueOnce({ SecretString: '{}' });
    const res = await invoke();
    expect(JSON.parse(res.body).providers).toEqual({});
  });

  it('should return 500 on SecretsManager error', async () => {
    mockSend.mockRejectedValueOnce(new Error('SM error'));
    const res = await invoke();
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('SM error');
  });
});
