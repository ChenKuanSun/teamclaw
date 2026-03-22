import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars({ USERS_TABLE_NAME: process.env['USERS_TABLE_NAME'] });

const ddbClient = new DynamoDBClient({});
const TABLE_NAME = process.env['USERS_TABLE_NAME']!;

const handlerFn = async (
  request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  const { queryStringParameters } = request;
  const qs = queryStringParameters || {};
  const limit = qs['limit'] ? parseInt(qs['limit'], 10) : 25;
  let exclusiveStartKey: Record<string, any> | undefined;
  if (qs['nextToken']) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(qs['nextToken'], 'base64').toString());
    } catch {
      return {
        status: HttpStatusCode.BAD_REQUEST,
        body: { message: 'Invalid nextToken' },
      };
    }
  }

  const params: any = {
    TableName: TABLE_NAME,
    Limit: limit,
  };

  if (exclusiveStartKey) {
    params.ExclusiveStartKey = exclusiveStartKey;
  }

  const result = await ddbClient.send(new ScanCommand(params));

  const containers = (result.Items || []).map((item) => ({
    userId: item['userId']?.S,
    email: item['email']?.S || null,
    displayName: item['displayName']?.S || null,
    teamId: item['teamId']?.S || null,
    status: item['status']?.S || 'unknown',
    taskArn: item['taskArn']?.S || null,
  }));

  const nextToken = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;

  return {
    status: HttpStatusCode.SUCCESS,
    body: { containers, nextToken },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.GET,
  handlerFn,
);
