const mockDdbSend = jest.fn();
const mockCognitoSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDdbSend })),
  UpdateItemCommand: jest.fn((input: any) => ({ input })),
  GetItemCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({ send: mockCognitoSend })),
  AdminUpdateUserAttributesCommand: jest.fn((input: any) => ({ input })),
}));

process.env['USERS_TABLE_NAME'] = 'UsersTable';
process.env['COGNITO_USER_POOL_ID'] = 'us-east-1_test';

import { handler } from './update-user';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'PUT',
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
  (await handler(event, {} as Context, undefined as unknown as Callback)) as {
    statusCode: number;
    headers: any;
    body: string;
  };

describe('update-user handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when userId is missing', async () => {
    const res = await invoke();
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Missing userId');
  });

  it('should return 400 when body is missing', async () => {
    const res = await invoke(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Missing request body');
  });

  it('should return 400 when no valid fields provided', async () => {
    const res = await invoke(
      makeEvent({ pathParameters: { userId: 'u1' }, body: JSON.stringify({ invalidField: 'x' }) }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('No valid fields');
  });

  it('should return 404 when user not found', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: undefined });
    const res = await invoke(
      makeEvent({ pathParameters: { userId: 'u1' }, body: JSON.stringify({ status: 'stopped' }) }),
    );
    expect(res.statusCode).toBe(404);
  });

  it('should update user fields in DynamoDB', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: { userId: { S: 'u1' } } })
      .mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({
        pathParameters: { userId: 'u1' },
        body: JSON.stringify({ status: 'stopped', teamId: 't2' }),
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = JSON.parse(res.body);
    expect(body.message).toBe('User updated');
    expect(body.userId).toBe('u1');
    expect(mockDdbSend).toHaveBeenCalledTimes(2);
    expect(mockCognitoSend).not.toHaveBeenCalled();
  });

  it('should update Cognito when displayName changes', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: { userId: { S: 'u1' } } })
      .mockResolvedValueOnce({});
    mockCognitoSend.mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({
        pathParameters: { userId: 'u1' },
        body: JSON.stringify({ displayName: 'New Name' }),
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(mockCognitoSend).toHaveBeenCalledTimes(1);
  });

  it('should not fail if Cognito update fails', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: { userId: { S: 'u1' } } })
      .mockResolvedValueOnce({});
    mockCognitoSend.mockRejectedValueOnce(new Error('Cognito error'));

    const res = await invoke(
      makeEvent({
        pathParameters: { userId: 'u1' },
        body: JSON.stringify({ displayName: 'New Name' }),
      }),
    );
    expect(res.statusCode).toBe(200);
  });

  it('should return 500 on DynamoDB error', async () => {
    mockDdbSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke(
      makeEvent({
        pathParameters: { userId: 'u1' },
        body: JSON.stringify({ status: 'running' }),
      }),
    );
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
