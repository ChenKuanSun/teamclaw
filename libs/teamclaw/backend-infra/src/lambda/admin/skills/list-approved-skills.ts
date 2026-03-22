import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import { listApprovedSkills } from './skills-approval';

validateRequiredEnvVars({ SKILLS_TABLE_NAME: process.env['SKILLS_TABLE_NAME'] });

const handlerFn = async (
  _request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  const result = await listApprovedSkills();

  return {
    status: HttpStatusCode.SUCCESS,
    body: result,
  };
};

export const handler = adminLambdaHandlerDecorator(HandlerMethod.GET, handlerFn);
