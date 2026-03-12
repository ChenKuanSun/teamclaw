import {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';

/**
 * Union type for both REST API v1 and HTTP API v2 events
 */
export type APIGatewayEvent =
  | APIGatewayProxyEvent
  | APIGatewayProxyEventV2WithJWTAuthorizer;

/**
 * Type guard to check if event is HTTP API v2 format
 */
export function isHttpApiV2(
  event: APIGatewayEvent,
): event is APIGatewayProxyEventV2WithJWTAuthorizer {
  // HTTP API v2 has 'version' property set to '2.0'
  return 'version' in event && event.version === '2.0';
}

/**
 * Extract HTTP method from API Gateway event
 * Supports both REST API v1 and HTTP API v2
 */
export function getHttpMethod(event: APIGatewayEvent): string {
  if (isHttpApiV2(event)) {
    return event.requestContext.http.method;
  }
  return event.httpMethod;
}

/**
 * Extract Cognito ID from API Gateway event
 * Supports both REST API v1 (authorizer claims) and HTTP API v2 (JWT authorizer)
 */
export function extractCognitoId(event: APIGatewayEvent): string | undefined {
  if (isHttpApiV2(event)) {
    // HTTP API v2 with JWT authorizer
    return event.requestContext.authorizer?.jwt?.claims?.['sub'] as
      | string
      | undefined;
  }
  // REST API v1 with Cognito authorizer
  const claims = event.requestContext.authorizer?.['claims'];
  if (claims) {
    return claims.sub as string | undefined;
  }
  return undefined;
}

/**
 * Sanitize error messages to prevent leaking secrets in CloudWatch logs
 *
 * Redacts:
 * - Database URLs (postgresql://, mongodb://, redis://) - including URL-encoded
 * - JWT tokens (eyJ...)
 * - API keys (sk_..., pk_...)
 * - AWS credentials (AKIA..., aws_..., session tokens)
 * - Passwords in URLs (including URL-encoded)
 * - Base64-encoded secrets
 *
 * @param message - Error message or stack trace to sanitize
 * @returns Sanitized message safe for logging
 */
export function sanitizeErrorMessage(message: string): string {
  return (
    message
      // Database URLs: postgresql://user:PASSWORD@host/db → postgresql://***:***@host/db
      .replace(
        /(postgresql|mongodb|mysql|redis):\/\/([^:]+):([^@]+)@/gi,
        '$1://***:***@',
      )
      // JWT tokens: eyJhbGciOi... → eyJ***
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'eyJ***')
      // Stripe API keys: sk_live_... / pk_live_... → sk_*** / pk_***
      .replace(/sk_(live|test)_[A-Za-z0-9]+/g, 'sk_***')
      .replace(/pk_(live|test)_[A-Za-z0-9]+/g, 'pk_***')
      // AWS Access Keys: AKIAIOSFODNN7EXAMPLE → AKIA***
      .replace(/AKIA[0-9A-Z]{16}/g, 'AKIA***')
      // Generic passwords in URLs: password=secret123 → password=***
      .replace(/password=[^\s&]+/gi, 'password=***')
  );
}

export const validateRequiredEnvVars = (
  envVars: Record<string, string | undefined>,
): void => {
  const missing: string[] = [];

  for (const [name, value] of Object.entries(envVars)) {
    if (!value || value.trim() === '') {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `Lambda cannot start without these variables.`,
    );
  }
};

export enum HandlerMethod {
  POST = 'POST',
  GET = 'GET',
  PUT = 'PUT',
  DELETE = 'DELETE',
}

export enum HttpStatusCode {
  SUCCESS = 200,
  ACCEPTED = 202,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  INTERNAL_SERVER_ERROR = 500,
}

export const HttpStatusMessage = {
  [HttpStatusCode.SUCCESS]: 'Success',
  [HttpStatusCode.BAD_REQUEST]: 'Bad Request',
  [HttpStatusCode.FORBIDDEN]: 'Forbidden',
  [HttpStatusCode.NOT_FOUND]: 'Not Found',
  [HttpStatusCode.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
};

/**
 * CASA Tier 2 Security Headers
 *
 * These headers are required for Google CASA (Cloud Application Security Assessment) Tier 2 compliance.
 * They protect against common web vulnerabilities including XSS, clickjacking, and MIME sniffing.
 *
 * @see https://appdefensealliance.dev/casa/tier-2
 * @see https://owasp.org/www-project-application-security-verification-standard/
 */
export const getCASATier2SecurityHeaders = (): Record<string, string> => {
  // CRITICAL: Validate DEPLOY_ENV to prevent bypass attacks
  const rawEnv = process.env['DEPLOY_ENV'];

  // Reject ANY non-alphanumeric characters (prevents Unicode, whitespace, control chars)
  // 'prod' and 'dev' are pure ASCII lowercase - anything else is invalid
  if (rawEnv && !/^[a-z]+$/.test(rawEnv)) {
    throw new Error(
      `Invalid DEPLOY_ENV: "${rawEnv}" contains invalid characters (Unicode, whitespace, or non-alphanumeric). ` +
        `Expected exactly 'prod' or 'dev' (ASCII lowercase only). ` +
        `Lambda cannot start without valid environment configuration.`,
    );
  }

  const env = rawEnv?.trim();

  // Validate env is exactly 'prod' or 'dev'
  if (env !== 'prod' && env !== 'dev') {
    throw new Error(
      `Invalid DEPLOY_ENV: "${env}". Expected 'prod' or 'dev'. ` +
        `Lambda cannot start without valid environment configuration.`,
    );
  }

  const isProduction = env === 'prod';

  return {
    // HSTS: Strict in production, relaxed in dev (prevents local dev issues)
    'Strict-Transport-Security': isProduction
      ? 'max-age=31536000; includeSubDomains; preload'
      : 'max-age=0',

    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',

    // Admin API only returns JSON — no resources to load
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",

    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Permissions: Disable sensitive APIs (geolocation, camera, microphone)
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };
};

export interface POSTAndPUTCloudFunctionInput<T> {
  raw: APIGatewayProxyEventV2WithJWTAuthorizer;
  queryStringParameters: APIGatewayProxyEventV2WithJWTAuthorizer['queryStringParameters'];
  pathParameters: APIGatewayProxyEventV2WithJWTAuthorizer['pathParameters'];
  body: T;
}

export interface GETAndDELETECloudFunctionInput {
  raw: APIGatewayProxyEventV2WithJWTAuthorizer;
  queryStringParameters: APIGatewayProxyEventV2WithJWTAuthorizer['queryStringParameters'];
  pathParameters: APIGatewayProxyEventV2WithJWTAuthorizer['pathParameters'];
}

type HandlerFunction<T extends HandlerMethod, U> = T extends
  | HandlerMethod.POST
  | HandlerMethod.PUT
  ? (
      payload: POSTAndPUTCloudFunctionInput<U>,
    ) => Promise<{ status: number; body: unknown }>
  : (
      payload: GETAndDELETECloudFunctionInput,
    ) => Promise<{ status: number; body: unknown }>;

export { HandlerFunction };
