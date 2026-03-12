import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import { POSTAndPUTCloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars({ LIFECYCLE_LAMBDA_NAME: process.env['LIFECYCLE_LAMBDA_NAME'] });

const lambdaClient = new LambdaClient({});
const LIFECYCLE_LAMBDA_NAME = process.env['LIFECYCLE_LAMBDA_NAME']!;

const handlerFn = async (
  request: POSTAndPUTCloudFunctionInput<Record<string, unknown>>,
): Promise<{ status: number; body: unknown }> => {
  const { pathParameters } = request;
  const userId = pathParameters?.['userId'];

  if (!userId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'Missing userId path parameter' },
    };
  }

  const result = await lambdaClient.send(new InvokeCommand({
    FunctionName: LIFECYCLE_LAMBDA_NAME,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({ action: 'start', userId })),
  }));

  if (result.FunctionError) {
    const errorPayload = result.Payload
      ? JSON.parse(Buffer.from(result.Payload).toString())
      : { errorMessage: 'Lifecycle Lambda invocation failed' };
    return {
      status: HttpStatusCode.INTERNAL_SERVER_ERROR,
      body: { message: errorPayload.errorMessage || 'Lifecycle Lambda invocation failed' },
    };
  }

  const payload = result.Payload
    ? JSON.parse(Buffer.from(result.Payload).toString())
    : {};

  const responseBody = typeof payload.body === 'string'
    ? JSON.parse(payload.body)
    : payload;

  return {
    status: (payload.statusCode || 200) as HttpStatusCode,
    body: responseBody,
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.POST,
  handlerFn,
);
