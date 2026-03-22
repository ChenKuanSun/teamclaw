import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import { listIntegrations } from './integrations-core';

validateRequiredEnvVars({
  INTEGRATIONS_TABLE_NAME: process.env['INTEGRATIONS_TABLE_NAME'],
  DEPLOY_ENV: process.env['DEPLOY_ENV'],
});

const handlerFn = async (
  _request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  const integrations = await listIntegrations();

  return {
    status: HttpStatusCode.SUCCESS,
    body: { integrations },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.GET,
  handlerFn,
);
