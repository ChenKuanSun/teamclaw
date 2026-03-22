import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
  GETAndDELETECloudFunctionInput,
} from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars({ USERS_TABLE_NAME: process.env['USERS_TABLE_NAME'] });

const dynamodb = new DynamoDBClient({});
const USERS_TABLE = process.env['USERS_TABLE_NAME']!;

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

  const result = await dynamodb.send(new GetItemCommand({
    TableName: USERS_TABLE,
    Key: { userId: { S: userId } },
  }));

  if (!result.Item) {
    return {
      status: HttpStatusCode.NOT_FOUND,
      body: { message: 'User not found' },
    };
  }

  const item = result.Item;
  const user = {
    userId: item['userId']?.S,
    teamId: item['teamId']?.S,
    email: item['email']?.S,
    displayName: item['displayName']?.S,
    status: item['status']?.S,
    efsAccessPointId: item['efsAccessPointId']?.S,
    taskArn: item['taskArn']?.S,
    createdAt: item['createdAt']?.S,
    updatedAt: item['updatedAt']?.S,
  };

  return {
    status: HttpStatusCode.SUCCESS,
    body: user,
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.GET,
  handlerFn,
);
