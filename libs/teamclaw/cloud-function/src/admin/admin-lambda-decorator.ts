import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import {
  getTCAdminApiCorsOrigins,
  ENVIRONMENT,
} from '@TeamClaw/core/cloud-config';
import { logger, withRequest } from '../shared/logger';
import {
  HandlerMethod,
  HttpStatusCode,
  sanitizeErrorMessage,
} from '../shared/lambda-helper';

export interface AdminHandlerResult {
  status: HttpStatusCode;
  body: unknown;
}

type AdminHandler = (
  event: APIGatewayProxyEvent,
) => Promise<AdminHandlerResult>;

function getAdminCorsHeaders(
  event: APIGatewayProxyEvent,
): Record<string, string> {
  const deployEnv = (process.env['DEPLOY_ENV'] || 'dev') as ENVIRONMENT;
  const allowedOrigins = getTCAdminApiCorsOrigins(deployEnv);
  const requestOrigin =
    event.headers?.['origin'] || event.headers?.['Origin'] || '';
  const origin = allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
  };
}

function getAdminSecurityHeaders(): Record<string, string> {
  const isProd = process.env['DEPLOY_ENV'] === 'prod';
  return {
    'Strict-Transport-Security': isProd
      ? 'max-age=31536000; includeSubDomains; preload'
      : 'max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };
}

export function adminLambdaHandlerDecorator(
  method: HandlerMethod,
  handler: AdminHandler,
): (
  event: APIGatewayProxyEvent,
  context: Context,
) => Promise<APIGatewayProxyResult> {
  return async (
    event: APIGatewayProxyEvent,
    context: Context,
  ): Promise<APIGatewayProxyResult> => {
    withRequest(event, context);

    const corsHeaders = getAdminCorsHeaders(event);
    const securityHeaders = getAdminSecurityHeaders();
    const allHeaders = {
      ...corsHeaders,
      ...securityHeaders,
      'Content-Type': 'application/json',
    };

    // Handle OPTIONS preflight
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: HttpStatusCode.OK,
        headers: allHeaders,
        body: '',
      };
    }

    // Method validation
    if (event.httpMethod !== method) {
      return {
        statusCode: 405,
        headers: allHeaders,
        body: JSON.stringify({ message: 'Method not allowed' }),
      };
    }

    try {
      const result = await handler(event);
      return {
        statusCode: result.status,
        headers: allHeaders,
        body: JSON.stringify(result.body),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error({ err: error }, sanitizeErrorMessage(errorMessage));
      return {
        statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR,
        headers: allHeaders,
        body: JSON.stringify({ message: 'Internal server error' }),
      };
    }
  };
}
