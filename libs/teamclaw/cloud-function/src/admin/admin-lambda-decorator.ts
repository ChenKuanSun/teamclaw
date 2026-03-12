import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { withRequest } from '../shared/logger';
import {
  HandlerMethod,
  HandlerFunction,
  HttpStatusCode,
  HttpStatusMessage,
  getCASATier2SecurityHeaders,
  sanitizeErrorMessage,
  POSTAndPUTCloudFunctionInput,
  GETAndDELETECloudFunctionInput,
} from '../shared/lambda-helper';

// create handler decorator
export function adminLambdaHandlerDecorator<T extends HandlerMethod, U>(
  handlerMethod: T,
  fn: HandlerFunction<T, U>,
): (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  context: Context,
) => Promise<APIGatewayProxyResult> {
  return async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
    context: Context,
  ): Promise<APIGatewayProxyResult> => {
    try {
      withRequest(event, context);
      const requestMethod = event.routeKey.split(' ')[0];
      if (requestMethod !== handlerMethod) {
        return {
          statusCode: HttpStatusCode.FORBIDDEN,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...getCASATier2SecurityHeaders(),
          },
          body: JSON.stringify({
            message: HttpStatusMessage[HttpStatusCode.FORBIDDEN],
          }),
        };
      }

      let payload:
        | POSTAndPUTCloudFunctionInput<U>
        | GETAndDELETECloudFunctionInput;
      if (
        handlerMethod === HandlerMethod.POST ||
        handlerMethod === HandlerMethod.PUT
      ) {
        if (!event.body) {
          return {
            statusCode: HttpStatusCode.BAD_REQUEST,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              ...getCASATier2SecurityHeaders(),
            },
            body: JSON.stringify({
              message: HttpStatusMessage[HttpStatusCode.BAD_REQUEST],
            }),
          };
        }

        let parsedBody: U;
        try {
          parsedBody = event.isBase64Encoded
            ? JSON.parse(Buffer.from(event.body, 'base64').toString('utf-8'))
            : JSON.parse(event.body);
        } catch {
          return {
            statusCode: HttpStatusCode.BAD_REQUEST,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              ...getCASATier2SecurityHeaders(),
            },
            body: JSON.stringify({
              message: HttpStatusMessage[HttpStatusCode.BAD_REQUEST],
            }),
          };
        }

        payload = {
          raw: event,
          queryStringParameters: event.queryStringParameters,
          pathParameters: event.pathParameters,
          body: parsedBody,
        };
      } else {
        payload = {
          raw: event,
          queryStringParameters: event.queryStringParameters,
          pathParameters: event.pathParameters,
        };
      }

      // Type assertion needed: TypeScript can't narrow conditional types at runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { status, body } = await (fn as any)(payload);

      return {
        statusCode: status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...getCASATier2SecurityHeaders(),
        },
        body: JSON.stringify(body),
      };
    } catch (error) {
      // Security: Don't log stack traces in production (prevent info leakage)
      const env = process.env['DEPLOY_ENV'];
      const isProduction = env === 'prod';

      if (isProduction) {
        // Production: Log sanitized message only (no stack trace, no secrets, no type)
        // CRITICAL: Error type removed to prevent tech stack fingerprinting
        const rawMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error('Lambda error:', {
          message: sanitizeErrorMessage(rawMessage),
        });
      } else {
        // Development: Log sanitized error (include stack trace for debugging)
        // CRITICAL: Stack traces can also contain secrets - must sanitize!
        if (error instanceof Error) {
          console.error('Lambda error (dev):', {
            message: sanitizeErrorMessage(error.message),
            stack: error.stack ? sanitizeErrorMessage(error.stack) : undefined,
            type: error.constructor.name,
          });
        } else {
          console.error('Lambda error (dev):', error);
        }
      }

      return {
        statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...getCASATier2SecurityHeaders(),
        },
        body: JSON.stringify({
          message: HttpStatusMessage[HttpStatusCode.INTERNAL_SERVER_ERROR],
          // NEVER leak error details to client (even in dev)
        }),
      };
    }
  };
}
