const mockSend = jest.fn();

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn(() => ({ send: mockSend })),
  InvokeCommand: jest.fn((input: any) => ({ input })),
}));

process.env['LIFECYCLE_LAMBDA_NAME'] = 'lifecycle-fn';

import { handler } from './stop-container';

const makeEvent = (overrides: any = {}) => ({
  queryStringParameters: null,
  pathParameters: null,
  body: null,
  headers: {},
  requestContext: {} as any,
  ...overrides,
});

describe('stop-container handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when userId is missing', async () => {
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(400);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('should invoke lifecycle Lambda with stop action', async () => {
    mockSend.mockResolvedValueOnce({
      Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: '{}' })),
    });

    const res = await handler(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(Buffer.from(mockSend.mock.calls[0][0].input.Payload).toString());
    expect(payload.action).toBe('stop');
  });

  it('should forward lifecycle Lambda status code', async () => {
    mockSend.mockResolvedValueOnce({
      Payload: Buffer.from(JSON.stringify({ statusCode: 404, body: '{}' })),
    });
    const res = await handler(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(404);
  });

  it('should return 500 on Lambda invocation error', async () => {
    mockSend.mockRejectedValueOnce(new Error('Lambda error'));
    const res = await handler(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
