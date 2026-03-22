import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import { deleteGlobalCredential } from './integrations-core';

validateRequiredEnvVars({
  INTEGRATIONS_TABLE_NAME: process.env['INTEGRATIONS_TABLE_NAME'],
  DEPLOY_ENV: process.env['DEPLOY_ENV'],
});

const handlerFn = async (
  request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  const integrationId = request.pathParameters?.['integrationId'];

  if (!integrationId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'integrationId path parameter is required' },
    };
  }

  await deleteGlobalCredential(integrationId);

  return {
    status: HttpStatusCode.SUCCESS,
    body: { message: 'Integration credentials deleted', integrationId },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.DELETE,
  handlerFn,
);
