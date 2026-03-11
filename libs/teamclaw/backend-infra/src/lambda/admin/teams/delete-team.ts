import {
  DynamoDBClient,
  DeleteItemCommand,
  GetItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';

const ddbClient = new DynamoDBClient({});
const TEAMS_TABLE = process.env['TEAMS_TABLE_NAME']!;
const USERS_TABLE = process.env['USERS_TABLE_NAME']!;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env['ADMIN_ORIGIN'] || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler = async (event: any) => {
  try {
    const teamId = event.pathParameters?.teamId;

    if (!teamId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing teamId path parameter' }),
      };
    }

    // Get team to find member IDs before deletion
    const teamResult = await ddbClient.send(new GetItemCommand({
      TableName: TEAMS_TABLE,
      Key: { teamId: { S: teamId } },
    }));

    if (!teamResult.Item) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Team not found' }),
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
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ deleted: true, teamId, membersUpdated: memberIds.length }),
    };
  } catch (error) {
    console.error('Error deleting team:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to delete team' }),
    };
  }
};
