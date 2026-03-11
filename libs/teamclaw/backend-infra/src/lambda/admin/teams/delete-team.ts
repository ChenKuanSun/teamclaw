import {
  DynamoDBClient,
  DeleteItemCommand,
  GetItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars(['TEAMS_TABLE_NAME', 'USERS_TABLE_NAME']);

const ddbClient = new DynamoDBClient({});
const TEAMS_TABLE = process.env['TEAMS_TABLE_NAME']!;
const USERS_TABLE = process.env['USERS_TABLE_NAME']!;

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.DELETE,
  async (event) => {
    const teamId = event.pathParameters?.['teamId'];

    if (!teamId) {
      return {
        status: HttpStatusCode.BAD_REQUEST,
        body: { message: 'Missing teamId path parameter' },
      };
    }

    // Get team to find member IDs before deletion
    const teamResult = await ddbClient.send(new GetItemCommand({
      TableName: TEAMS_TABLE,
      Key: { teamId: { S: teamId } },
    }));

    if (!teamResult.Item) {
      return {
        status: HttpStatusCode.NOT_FOUND,
        body: { message: 'Team not found' },
      };
    }

    // Unset teamId on all member user records
    const memberIds = teamResult.Item['memberIds']?.SS || [];
    for (const userId of memberIds) {
      await ddbClient.send(new UpdateItemCommand({
        TableName: USERS_TABLE,
        Key: { userId: { S: userId } },
        UpdateExpression: 'SET teamId = :empty, updatedAt = :now',
        ExpressionAttributeValues: {
          ':empty': { S: '' },
          ':now': { S: new Date().toISOString() },
        },
      }));
    }

    // Delete the team
    await ddbClient.send(new DeleteItemCommand({
      TableName: TEAMS_TABLE,
      Key: { teamId: { S: teamId } },
    }));

    return {
      status: HttpStatusCode.OK,
      body: { deleted: true, teamId, membersUpdated: memberIds.length },
    };
  },
);
