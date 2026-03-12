import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  Context,
} from 'aws-lambda';
import { adminLambdaHandlerDecorator } from './admin-lambda-decorator';
import { HandlerMethod, HttpStatusCode } from '../shared/lambda-helper';

jest.mock('../shared/logger', () => ({
  logger: { error: jest.fn() },
  withRequest: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withRequest: mockWithRequest } = require('../shared/logger') as {
  withRequest: jest.Mock;
};

function createMockEvent(
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: '2.0',
    routeKey: 'GET /test',
    rawPath: '/test',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: {
        method: 'GET',
        path: '/test',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test-req-id',
      routeKey: 'GET /test',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: {
        jwt: { claims: { sub: 'admin-user' }, scopes: [] },
      },
    },
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    ...overrides,
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
  memoryLimitInMB: '128',
  awsRequestId: 'test-id',
  logGroupName: '/aws/lambda/test',
  logStreamName: 'test-stream',
  getRemainingTimeInMillis: () => 30000,
  done: jest.fn(),
  fail: jest.fn(),
  succeed: jest.fn(),
};

describe('adminLambdaHandlerDecorator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, DEPLOY_ENV: 'dev' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return security headers', async () => {
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.GET,
      async () => ({ status: HttpStatusCode.SUCCESS, body: {} }),
    );

    const event = createMockEvent();
    const result = await handler(event, mockContext);

    expect(result.headers?.['X-Content-Type-Options']).toBe('nosniff');
    expect(result.headers?.['X-Frame-Options']).toBe('DENY');
    expect(result.headers?.['Content-Security-Policy']).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(result.headers?.['Referrer-Policy']).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(result.headers?.['Permissions-Policy']).toBe(
      'geolocation=(), microphone=(), camera=()',
    );
    expect(result.headers?.['Strict-Transport-Security']).toBe('max-age=0');
  });

  it('should return HSTS with longer max-age in prod', async () => {
    process.env['DEPLOY_ENV'] = 'prod';

    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.GET,
      async () => ({ status: HttpStatusCode.SUCCESS, body: {} }),
    );

    const event = createMockEvent();
    const result = await handler(event, mockContext);

    expect(result.headers?.['Strict-Transport-Security']).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
  });

  it('should return 403 for wrong HTTP method', async () => {
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.GET,
      async () => ({ status: HttpStatusCode.SUCCESS, body: {} }),
    );

    const event = createMockEvent({
      routeKey: 'POST /test',
      requestContext: {
        ...createMockEvent().requestContext,
        http: {
          method: 'POST',
          path: '/test',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'test',
        },
        routeKey: 'POST /test',
      },
    });
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Forbidden',
    });
  });

  it('should return handler result on success with structured input', async () => {
    const responseBody = { data: 'test', count: 42 };
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.GET,
      async (input) => {
        // Verify structured input is passed
        expect(input).toHaveProperty('raw');
        expect(input).toHaveProperty('queryStringParameters');
        expect(input).toHaveProperty('pathParameters');
        return { status: HttpStatusCode.SUCCESS, body: responseBody };
      },
    );

    const event = createMockEvent();
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual(responseBody);
    expect(result.headers?.['Content-Type']).toBe(
      'application/json; charset=utf-8',
    );
    expect(mockWithRequest).toHaveBeenCalledWith(event, mockContext);
  });

  it('should parse body for POST handler', async () => {
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.POST,
      async (input) => {
        expect((input as any).body).toEqual({ name: 'test' });
        return { status: HttpStatusCode.SUCCESS, body: { ok: true } };
      },
    );

    const event = createMockEvent({
      routeKey: 'POST /test',
      requestContext: {
        ...createMockEvent().requestContext,
        http: {
          method: 'POST',
          path: '/test',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'test',
        },
        routeKey: 'POST /test',
      },
      body: JSON.stringify({ name: 'test' }),
    });
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
  });

  it('should handle base64 encoded body', async () => {
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.POST,
      async (input) => {
        expect((input as any).body).toEqual({ name: 'base64test' });
        return { status: HttpStatusCode.SUCCESS, body: { ok: true } };
      },
    );

    const event = createMockEvent({
      routeKey: 'POST /test',
      requestContext: {
        ...createMockEvent().requestContext,
        http: {
          method: 'POST',
          path: '/test',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'test',
        },
        routeKey: 'POST /test',
      },
      body: Buffer.from(JSON.stringify({ name: 'base64test' })).toString(
        'base64',
      ),
      isBase64Encoded: true,
    });
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
  });

  it('should return 400 for POST with missing body', async () => {
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.POST,
      async () => ({ status: HttpStatusCode.SUCCESS, body: {} }),
    );

    const event = createMockEvent({
      routeKey: 'POST /test',
      requestContext: {
        ...createMockEvent().requestContext,
        http: {
          method: 'POST',
          path: '/test',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'test',
        },
        routeKey: 'POST /test',
      },
      body: undefined as unknown as string,
    });
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Bad Request',
    });
  });

  it('should return 500 on handler error', async () => {
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.GET,
      async () => {
        throw new Error('Database connection failed');
      },
    );

    const event = createMockEvent();
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Internal Server Error',
    });
  });

  it('should return 400 for malformed JSON body', async () => {
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.POST,
      async () => ({ status: HttpStatusCode.SUCCESS, body: { ok: true } }),
    );

    const event = createMockEvent({
      routeKey: 'POST /test',
      requestContext: {
        ...createMockEvent().requestContext,
        http: {
          method: 'POST',
          path: '/test',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'test',
        },
        routeKey: 'POST /test',
      },
      body: '{invalid json!!!',
    });
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Bad Request',
    });
  });

  it('should use { message } key in error responses', async () => {
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.GET,
      async () => {
        throw new Error('Something went wrong');
      },
    );

    const event = createMockEvent();
    const result = await handler(event, mockContext);

    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('message');
    expect(body).not.toHaveProperty('error');
    expect(body.message).toBe('Internal Server Error');
  });
});
