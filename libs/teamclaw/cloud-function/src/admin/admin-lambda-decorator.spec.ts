import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import {
  adminLambdaHandlerDecorator,
  AdminHandlerResult,
} from './admin-lambda-decorator';
import { HandlerMethod, HttpStatusCode } from '../shared/lambda-helper';

jest.mock('@TeamClaw/core/cloud-config', () => ({
  getTCAdminApiCorsOrigins: jest.fn((env: string) => {
    if (env === 'prod') {
      return ['https://admin.teamclaw.com'];
    }
    return ['https://admin-dev.teamclaw.com', 'http://localhost:4200'];
  }),
  ENVIRONMENT: { DEV: 'dev', PROD: 'prod' },
}));

jest.mock('../shared/logger', () => ({
  logger: { error: jest.fn() },
  withRequest: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger } = require('../shared/logger') as {
  logger: { error: jest.Mock };
};

function createMockEvent(
  overrides: Partial<APIGatewayProxyEvent> = {},
): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {
      origin: 'https://admin-dev.teamclaw.com',
    },
    body: null,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    path: '/test',
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '',
    stageVariables: null,
    ...overrides,
  };
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

  it('should return correct CORS headers for matching origin', async () => {
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.GET,
      async () => ({ status: HttpStatusCode.OK, body: {} }),
    );

    const event = createMockEvent({
      headers: { origin: 'http://localhost:4200' },
    });
    const result = await handler(event, mockContext);

    expect(result.headers?.['Access-Control-Allow-Origin']).toBe(
      'http://localhost:4200',
    );
  });

  it('should return first allowed origin when request origin not in allowlist', async () => {
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.GET,
      async () => ({ status: HttpStatusCode.OK, body: {} }),
    );

    const event = createMockEvent({
      headers: { origin: 'https://evil.example.com' },
    });
    const result = await handler(event, mockContext);

    expect(result.headers?.['Access-Control-Allow-Origin']).toBe(
      'https://admin-dev.teamclaw.com',
    );
  });

  it('should return security headers', async () => {
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.GET,
      async () => ({ status: HttpStatusCode.OK, body: {} }),
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
    expect(result.headers?.['Strict-Transport-Security']).toBe(
      'max-age=86400',
    );
  });

  it('should return HSTS with longer max-age in prod', async () => {
    process.env['DEPLOY_ENV'] = 'prod';

    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.GET,
      async () => ({ status: HttpStatusCode.OK, body: {} }),
    );

    const event = createMockEvent({
      headers: { origin: 'https://admin.teamclaw.com' },
    });
    const result = await handler(event, mockContext);

    expect(result.headers?.['Strict-Transport-Security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
  });

  it('should return 405 for wrong HTTP method', async () => {
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.GET,
      async () => ({ status: HttpStatusCode.OK, body: {} }),
    );

    const event = createMockEvent({ httpMethod: 'POST' });
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(405);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Method not allowed',
    });
  });

  it('should handle OPTIONS preflight', async () => {
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.GET,
      async () => ({ status: HttpStatusCode.OK, body: {} }),
    );

    const event = createMockEvent({ httpMethod: 'OPTIONS' });
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('');
    expect(result.headers?.['Access-Control-Allow-Methods']).toBe(
      'OPTIONS,GET,POST,PUT,DELETE',
    );
  });

  it('should return handler result on success', async () => {
    const responseBody = { data: 'test', count: 42 };
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.GET,
      async () => ({ status: HttpStatusCode.OK, body: responseBody }),
    );

    const event = createMockEvent();
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual(responseBody);
    expect(result.headers?.['Content-Type']).toBe('application/json');
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
      message: 'Internal server error',
    });
  });

  it('should sanitize error messages in logs', async () => {
    const arnMessage =
      'Failed for arn:aws:lambda:us-east-1:123456789012:function:my-func';
    const handler = adminLambdaHandlerDecorator(
      HandlerMethod.GET,
      async () => {
        throw new Error(arnMessage);
      },
    );

    const event = createMockEvent();
    await handler(event, mockContext);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const loggedMessage = logger.error.mock.calls[0][1] as string;
    expect(loggedMessage).not.toContain('arn:aws:lambda');
    expect(loggedMessage).not.toContain('123456789012');
    expect(loggedMessage).toContain('[AWS_ARN]');
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
    expect(body.message).toBe('Internal server error');
  });
});
