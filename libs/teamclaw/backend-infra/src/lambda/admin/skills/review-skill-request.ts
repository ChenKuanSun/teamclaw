import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import type { POSTAndPUTCloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import { reviewSkillRequest } from './skills-approval';

validateRequiredEnvVars({ SKILLS_TABLE_NAME: process.env['SKILLS_TABLE_NAME'] });

const handlerFn = async (
  request: POSTAndPUTCloudFunctionInput<Record<string, unknown>>,
): Promise<{ status: number; body: unknown }> => {
  const { body } = request;

  if (
    !body?.['skillId'] ||
    !body?.['requestedBy'] ||
    !body?.['decision'] ||
    !body?.['reviewedBy'] ||
    !body?.['scope']
  ) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'Missing required fields: skillId, requestedBy, decision, reviewedBy, scope' },
    };
  }

  const decision = body['decision'] as string;
  if (decision !== 'approved' && decision !== 'rejected') {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'decision must be "approved" or "rejected"' },
    };
  }

  const scope = body['scope'] as string;
  if (scope !== 'global' && scope !== 'team' && scope !== 'user') {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'scope must be "global", "team", or "user"' },
    };
  }

  const result = await reviewSkillRequest({
    skillId: body['skillId'] as string,
    requestedBy: body['requestedBy'] as string,
    decision: decision as 'approved' | 'rejected',
    reviewedBy: body['reviewedBy'] as string,
    scope: scope as 'global' | 'team' | 'user',
  });

  return {
    status: HttpStatusCode.SUCCESS,
    body: result,
  };
};

export const handler = adminLambdaHandlerDecorator(HandlerMethod.POST, handlerFn);
