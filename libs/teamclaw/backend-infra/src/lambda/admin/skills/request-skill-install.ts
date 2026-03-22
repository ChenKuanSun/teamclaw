import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import type { POSTAndPUTCloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import { requestSkillInstall } from './skills-approval';

validateRequiredEnvVars({ SKILLS_TABLE_NAME: process.env['SKILLS_TABLE_NAME'] });

const handlerFn = async (
  request: POSTAndPUTCloudFunctionInput<Record<string, unknown>>,
): Promise<{ status: number; body: unknown }> => {
  const { body } = request;

  if (!body?.['skillId'] || !body?.['skillName'] || !body?.['source'] || !body?.['requestedBy']) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'Missing required fields: skillId, skillName, source, requestedBy' },
    };
  }

  const result = await requestSkillInstall({
    skillId: body['skillId'] as string,
    skillName: body['skillName'] as string,
    source: body['source'] as string,
    requestedBy: body['requestedBy'] as string,
    teamId: body['teamId'] as string | undefined,
  });

  return {
    status: HttpStatusCode.SUCCESS,
    body: result,
  };
};

export const handler = adminLambdaHandlerDecorator(HandlerMethod.POST, handlerFn);
