import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
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
  const { pathParameters } = request;
  const teamId = pathParameters?.['teamId'];

  if (!teamId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'Missing teamId path parameter' },
    };
  }

  const result = await ddbClient.send(new GetItemCommand({
    TableName: TABLE_NAME,
    Key: { teamId: { S: teamId } },
  }));

  if (!result.Item) {
    return {
      status: HttpStatusCode.NOT_FOUND,
      body: { message: 'Team not found' },
    };
  }

  const item = result.Item;
  const team = {
    teamId: item['teamId']?.S,
    name: item['name']?.S,
    description: item['description']?.S,
    memberIds: item['memberIds']?.SS || [],
    memberCount: item['memberIds']?.SS?.length || 0,
    createdAt: item['createdAt']?.S,
    updatedAt: item['updatedAt']?.S,
  };

  return {
    status: HttpStatusCode.SUCCESS,
    body: team,
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.GET,
  handlerFn,
);
