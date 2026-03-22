import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import { deleteTeamCredential } from './integrations-core';

validateRequiredEnvVars({
  INTEGRATIONS_TABLE_NAME: process.env['INTEGRATIONS_TABLE_NAME'],
  DEPLOY_ENV: process.env['DEPLOY_ENV'],
});

const handlerFn = async (
  request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  const integrationId = request.pathParameters?.['integrationId'];
  const teamId = request.pathParameters?.['teamId'];

  if (!integrationId || !teamId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: {
        message: 'integrationId and teamId path parameters are required',
      },
    };
  }

  await deleteTeamCredential(integrationId, teamId);

  return {
    status: HttpStatusCode.SUCCESS,
    body: { message: 'Team credentials deleted', integrationId, teamId },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.DELETE,
  handlerFn,
);
