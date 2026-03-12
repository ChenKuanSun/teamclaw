import {
  validateRequiredEnvVars,
  sanitizeErrorMessage,
  isHttpApiV2,
  getHttpMethod,
  extractCognitoId,
  getCASATier2SecurityHeaders,
  HttpStatusCode,
  HttpStatusMessage,
  HandlerMethod,
} from './lambda-helper';
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2WithJWTAuthorizer,
} from 'aws-lambda';

describe('validateRequiredEnvVars', () => {
  it('should pass when all required vars are present', () => {
    expect(() =>
      validateRequiredEnvVars({ FOO: 'bar', BAZ: 'qux' }),
    ).not.toThrow();
  });

  it('should throw with missing var names when vars are missing', () => {
    expect(() =>
      validateRequiredEnvVars({
        FOO: 'bar',
        MISSING_ONE: undefined,
        MISSING_TWO: undefined,
      }),
    ).toThrow('Missing required environment variables: MISSING_ONE, MISSING_TWO');
  });

  it('should throw for empty string values', () => {
    expect(() =>
      validateRequiredEnvVars({ FOO: '', BAR: '  ' }),
    ).toThrow('Missing required environment variables: FOO, BAR');
  });
});

describe('sanitizeErrorMessage', () => {
  it('should replace database URLs', () => {
    const msg = 'Error: postgresql://user:secret@host/db failed';
    const result = sanitizeErrorMessage(msg);
    expect(result).toContain('postgresql://***:***@');
    expect(result).not.toContain('secret');
  });

  it('should replace JWT tokens', () => {
    const msg = 'Token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def is expired';
    const result = sanitizeErrorMessage(msg);
    expect(result).toContain('eyJ***');
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('should replace Stripe API keys', () => {
    const msg = 'Stripe key sk_live_abc123 is invalid';
    const result = sanitizeErrorMessage(msg);
    expect(result).toContain('sk_***');
    expect(result).not.toContain('sk_live_abc123');
  });

  it('should replace AWS access keys (AKIA...)', () => {
    const msg = 'Key AKIAIOSFODNN7EXAMPLE is invalid';
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result).toContain('AKIA***');
  });

  it('should replace passwords in URLs', () => {
    const msg = 'Connection failed: password=mysecretpass&host=db';
    const result = sanitizeErrorMessage(msg);
    expect(result).toContain('password=***');
    expect(result).not.toContain('mysecretpass');
  });

  it('should preserve normal error messages', () => {
    const msg = 'Something went wrong with the request';
    const result = sanitizeErrorMessage(msg);
    expect(result).toBe('Something went wrong with the request');
  });
});

describe('isHttpApiV2', () => {
  it('should return true for v2 events', () => {
    const event = { version: '2.0' } as APIGatewayProxyEventV2WithJWTAuthorizer;
    expect(isHttpApiV2(event)).toBe(true);
  });

  it('should return false for v1 events', () => {
    const event = { httpMethod: 'GET' } as APIGatewayProxyEvent;
    expect(isHttpApiV2(event)).toBe(false);
  });
});

describe('getHttpMethod', () => {
  it('should extract method from v2 event', () => {
    const event = {
      version: '2.0',
      requestContext: { http: { method: 'POST' } },
    } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
    expect(getHttpMethod(event)).toBe('POST');
  });

  it('should extract method from v1 event', () => {
    const event = { httpMethod: 'GET' } as APIGatewayProxyEvent;
    expect(getHttpMethod(event)).toBe('GET');
  });
});

describe('extractCognitoId', () => {
  it('should extract sub from v2 JWT authorizer', () => {
    const event = {
      version: '2.0',
      requestContext: {
        authorizer: { jwt: { claims: { sub: 'user-123' }, scopes: [] } },
      },
    } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
    expect(extractCognitoId(event)).toBe('user-123');
  });

  it('should extract sub from v1 authorizer claims', () => {
    const event = {
      httpMethod: 'GET',
      requestContext: { authorizer: { claims: { sub: 'user-456' } } },
    } as unknown as APIGatewayProxyEvent;
    expect(extractCognitoId(event)).toBe('user-456');
  });

  it('should return undefined when no authorizer', () => {
    const event = {
      httpMethod: 'GET',
      requestContext: {},
    } as unknown as APIGatewayProxyEvent;
    expect(extractCognitoId(event)).toBeUndefined();
  });
});

describe('getCASATier2SecurityHeaders', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return dev headers', () => {
    process.env['DEPLOY_ENV'] = 'dev';
    const headers = getCASATier2SecurityHeaders();
    expect(headers['Strict-Transport-Security']).toBe('max-age=0');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  it('should return prod headers with HSTS', () => {
    process.env['DEPLOY_ENV'] = 'prod';
    const headers = getCASATier2SecurityHeaders();
    expect(headers['Strict-Transport-Security']).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
  });

  it('should throw on invalid DEPLOY_ENV', () => {
    process.env['DEPLOY_ENV'] = 'staging';
    expect(() => getCASATier2SecurityHeaders()).toThrow('Invalid DEPLOY_ENV');
  });

  it('should throw on unicode DEPLOY_ENV', () => {
    process.env['DEPLOY_ENV'] = 'dеv'; // Cyrillic 'е'
    expect(() => getCASATier2SecurityHeaders()).toThrow('invalid characters');
  });
});

describe('enums and constants', () => {
  it('should have correct HttpStatusCode values', () => {
    expect(HttpStatusCode.SUCCESS).toBe(200);
    expect(HttpStatusCode.BAD_REQUEST).toBe(400);
    expect(HttpStatusCode.INTERNAL_SERVER_ERROR).toBe(500);
  });

  it('should have correct HttpStatusMessage mappings', () => {
    expect(HttpStatusMessage[HttpStatusCode.SUCCESS]).toBe('Success');
    expect(HttpStatusMessage[HttpStatusCode.FORBIDDEN]).toBe('Forbidden');
  });

  it('should have correct HandlerMethod values', () => {
    expect(HandlerMethod.GET).toBe('GET');
    expect(HandlerMethod.POST).toBe('POST');
    expect(HandlerMethod.PUT).toBe('PUT');
    expect(HandlerMethod.DELETE).toBe('DELETE');
  });
});
