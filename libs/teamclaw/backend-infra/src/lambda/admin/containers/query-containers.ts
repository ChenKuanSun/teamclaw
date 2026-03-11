import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars(['USERS_TABLE_NAME']);

const ddbClient = new DynamoDBClient({});
const TABLE_NAME = process.env['USERS_TABLE_NAME']!;

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.GET,
  async (event) => {
    const qs = event.queryStringParameters || {};
    const limit = qs['limit'] ? parseInt(qs['limit'], 10) : 25;
    const exclusiveStartKey = qs['nextToken']
      ? JSON.parse(Buffer.from(qs['nextToken'], 'base64').toString())
      : undefined;

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
      status: HttpStatusCode.OK,
      body: { containers, nextToken },
    };
  },
);
