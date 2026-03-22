import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import { deleteUserCredential } from '../../admin/integrations/integrations-core';

validateRequiredEnvVars({
  INTEGRATIONS_TABLE_NAME: process.env['INTEGRATIONS_TABLE_NAME'],
  DEPLOY_ENV: process.env['DEPLOY_ENV'],
});

const handlerFn = async (
  request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  const sub =
    (request.raw?.requestContext?.authorizer?.jwt?.claims?.['sub'] as string) ||
    '';
  const integrationId = request.pathParameters?.['integrationId'];

  if (!sub) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'Missing sub in JWT' },
    };
  }

  if (!integrationId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'integrationId path parameter is required' },
    };
  }

  await deleteUserCredential(integrationId, sub);

  return {
    status: HttpStatusCode.SUCCESS,
    body: { message: 'Integration disconnected', integrationId },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.DELETE,
  handlerFn,
);
