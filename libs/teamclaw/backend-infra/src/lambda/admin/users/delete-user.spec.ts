const mockDdbSend = jest.fn();
const mockLambdaSend = jest.fn();
const mockEfsSend = jest.fn();
const mockCognitoSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDdbSend })),
  GetItemCommand: jest.fn((input: any) => ({ input })),
  DeleteItemCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn(() => ({ send: mockLambdaSend })),
  InvokeCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('@aws-sdk/client-efs', () => ({
  EFSClient: jest.fn(() => ({ send: mockEfsSend })),
  DeleteAccessPointCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({ send: mockCognitoSend })),
  AdminDeleteUserCommand: jest.fn((input: any) => ({ input })),
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

process.env['USERS_TABLE_NAME'] = 'UsersTable';
process.env['LIFECYCLE_FUNCTION_NAME'] = 'lifecycle-fn';
process.env['COGNITO_USER_POOL_ID'] = 'us-east-1_test';
process.env['DEPLOY_ENV'] = 'dev';

import { handler } from './delete-user';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'DELETE',
    path: '/admin/users/u1',
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

describe('delete-user handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when userId is missing', async () => {
    const res = await invoke();
    expect(res.statusCode).toBe(400);
  });

  it('should return 404 when user is not found', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: undefined });
    const res = await invoke(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(404);
  });

  it('should delete a running user with full cascade', async () => {
    mockDdbSend
      .mockResolvedValueOnce({
        Item: {
          userId: { S: 'u1' },
          status: { S: 'running' },
          taskArn: { S: 'arn:ecs:task/123' },
          efsAccessPointId: { S: 'ap-123' },
        },
      })
      .mockResolvedValueOnce({});

    mockLambdaSend.mockResolvedValueOnce({});
    mockEfsSend.mockResolvedValueOnce({});
    mockCognitoSend.mockResolvedValueOnce({});

    const res = await invoke(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).message).toBe('User deletion initiated');
    expect(mockLambdaSend).toHaveBeenCalledTimes(1);
    expect(mockEfsSend).toHaveBeenCalledTimes(1);
    expect(mockCognitoSend).toHaveBeenCalledTimes(1);
    expect(mockDdbSend).toHaveBeenCalledTimes(2);
  });

  it('should skip lifecycle Lambda if not running', async () => {
    mockDdbSend
      .mockResolvedValueOnce({
        Item: { userId: { S: 'u1' }, status: { S: 'stopped' }, efsAccessPointId: { S: 'ap-123' } },
      })
      .mockResolvedValueOnce({});
    mockEfsSend.mockResolvedValueOnce({});
    mockCognitoSend.mockResolvedValueOnce({});

    await invoke(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(mockLambdaSend).not.toHaveBeenCalled();
  });

  it('should skip EFS delete if no access point', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: { userId: { S: 'u1' }, status: { S: 'stopped' } } })
      .mockResolvedValueOnce({});
    mockCognitoSend.mockResolvedValueOnce({});

    await invoke(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(mockEfsSend).not.toHaveBeenCalled();
  });

  it('should still delete DynamoDB record even if Cognito fails', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: { userId: { S: 'u1' }, status: { S: 'stopped' } } })
      .mockResolvedValueOnce({});
    mockCognitoSend.mockRejectedValueOnce(new Error('Cognito error'));

    const res = await invoke(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(202);
    expect(mockDdbSend).toHaveBeenCalledTimes(2);
  });

  it('should return 500 on unexpected error', async () => {
    mockDdbSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(500);
  });
});
