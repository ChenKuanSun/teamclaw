import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambdaClient = new LambdaClient({});
const LIFECYCLE_LAMBDA_NAME = process.env['LIFECYCLE_LAMBDA_NAME']!;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler = async (event: any) => {
  try {
    const userId = event.pathParameters?.userId;

    if (!userId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing userId path parameter' }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};

    const invokePayload: any = { action: 'provision', userId };
    if (body.teamId) {
      invokePayload.teamId = body.teamId;
    }

    const result = await lambdaClient.send(new InvokeCommand({
      FunctionName: LIFECYCLE_LAMBDA_NAME,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(invokePayload)),
    }));

    const payload = result.Payload
      ? JSON.parse(Buffer.from(result.Payload).toString())
      : {};

    return {
      statusCode: payload.statusCode || 200,
      headers: CORS_HEADERS,
      body: typeof payload.body === 'string' ? payload.body : JSON.stringify(payload),
    };
  } catch (error) {
    console.error('Error provisioning container:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to provision container' }),
    };
  }
};
