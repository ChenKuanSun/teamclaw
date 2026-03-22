import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars({ TEAMS_TABLE_NAME: process.env['TEAMS_TABLE_NAME'] });

const ddbClient = new DynamoDBClient({});
const TABLE_NAME = process.env['TEAMS_TABLE_NAME']!;

const handlerFn = async (
  request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  const { queryStringParameters } = request;
  const qs = queryStringParameters || {};
  const nameFilter = qs['name'] as string | undefined;
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

  if (nameFilter) {
    params.FilterExpression = 'contains(#n, :name)';
    params.ExpressionAttributeNames = { '#n': 'name' };
    params.ExpressionAttributeValues = { ':name': { S: nameFilter } };
  }

  const result = await ddbClient.send(new ScanCommand(params));

  const teams = (result.Items || []).map((item) => ({
    teamId: item['teamId']?.S,
    name: item['name']?.S,
    description: item['description']?.S,
    memberCount: item['memberIds']?.SS?.length || 0,
    createdAt: item['createdAt']?.S,
    updatedAt: item['updatedAt']?.S,
  }));

  const nextToken = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;

  return {
    status: HttpStatusCode.SUCCESS,
    body: { teams, nextToken },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.GET,
  handlerFn,
);
