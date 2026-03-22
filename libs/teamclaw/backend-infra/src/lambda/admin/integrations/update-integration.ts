import type { POSTAndPUTCloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import { setGlobalCredential } from './integrations-core';

validateRequiredEnvVars({
  INTEGRATIONS_TABLE_NAME: process.env['INTEGRATIONS_TABLE_NAME'],
  DEPLOY_ENV: process.env['DEPLOY_ENV'],
});

const handlerFn = async (
  request: POSTAndPUTCloudFunctionInput<Record<string, unknown>>,
): Promise<{ status: number; body: unknown }> => {
  const integrationId = request.pathParameters?.['integrationId'];
  const adminUserId = request.raw?.requestContext?.authorizer?.jwt?.claims?.[
    'sub'
  ] as string;

  if (!adminUserId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'Missing admin identity' },
    };
  }

  if (!integrationId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'integrationId path parameter is required' },
    };
  }

  const credentials = request.body?.['credentials'] as
    | Record<string, string>
    | undefined;

  if (!credentials || typeof credentials !== 'object') {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'credentials object is required in body' },
    };
  }

  await setGlobalCredential(integrationId, credentials, adminUserId);

  return {
    status: HttpStatusCode.SUCCESS,
    body: { message: 'Integration credentials updated', integrationId },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.PUT,
  handlerFn,
);
