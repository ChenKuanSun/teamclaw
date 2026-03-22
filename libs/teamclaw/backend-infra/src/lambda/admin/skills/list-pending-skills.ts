import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import { listPendingRequests } from './skills-approval';

validateRequiredEnvVars({ SKILLS_TABLE_NAME: process.env['SKILLS_TABLE_NAME'] });

const handlerFn = async (
  _request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  const result = await listPendingRequests();

  return {
    status: HttpStatusCode.SUCCESS,
    body: result,
  };
};

export const handler = adminLambdaHandlerDecorator(HandlerMethod.GET, handlerFn);
