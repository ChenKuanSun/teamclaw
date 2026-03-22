import type { POSTAndPUTCloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import { setTeamOverride } from './integrations-core';

validateRequiredEnvVars({
  INTEGRATIONS_TABLE_NAME: process.env['INTEGRATIONS_TABLE_NAME'],
  DEPLOY_ENV: process.env['DEPLOY_ENV'],
});

const handlerFn = async (
  request: POSTAndPUTCloudFunctionInput<Record<string, unknown>>,
): Promise<{ status: number; body: unknown }> => {
  const integrationId = request.pathParameters?.['integrationId'];
  const teamId = request.pathParameters?.['teamId'];
  const adminUserId = request.raw?.requestContext?.authorizer?.jwt?.claims?.[
    'sub'
  ] as string;

  if (!adminUserId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'Missing admin identity' },
    };
  }

  if (!integrationId || !teamId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: {
        message: 'integrationId and teamId path parameters are required',
      },
    };
  }

  const { body } = request;
  const enabled = body?.['enabled'] as boolean | undefined;
  const credentials = body?.['credentials'] as
    | Record<string, string>
    | undefined;
  const allowUserOverride = body?.['allowUserOverride'] as boolean | undefined;

  await setTeamOverride(
    integrationId,
    teamId,
    { enabled, credentials, allowUserOverride },
    adminUserId,
  );

  return {
    status: HttpStatusCode.SUCCESS,
    body: { message: 'Team override updated', integrationId, teamId },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.PUT,
  handlerFn,
);
