import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
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
  const { pathParameters } = request;
  const userId = pathParameters?.['userId'];

  if (!userId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'Missing userId path parameter' },
    };
  }

  const result = await ddbClient.send(new GetItemCommand({
    TableName: TABLE_NAME,
    Key: { userId: { S: userId } },
  }));

  if (!result.Item) {
    return {
      status: HttpStatusCode.NOT_FOUND,
      body: { message: 'Container not found' },
    };
  }

  const item = result.Item;
  return {
    status: HttpStatusCode.SUCCESS,
    body: {
      userId: item['userId']?.S,
      email: item['email']?.S || null,
      displayName: item['displayName']?.S || null,
      teamId: item['teamId']?.S || null,
      efsAccessPointId: item['efsAccessPointId']?.S || null,
      status: item['status']?.S || 'unknown',
      taskArn: item['taskArn']?.S || null,
      createdAt: item['createdAt']?.S,
      updatedAt: item['updatedAt']?.S,
    },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.GET,
  handlerFn,
);
