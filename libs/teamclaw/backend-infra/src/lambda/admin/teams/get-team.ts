import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

const ddbClient = new DynamoDBClient({});
const TABLE_NAME = process.env.TEAMS_TABLE_NAME!;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
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

    const result = await ddbClient.send(new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { teamId: { S: teamId } },
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Team not found' }),
      };
    }

    const item = result.Item;
    const team = {
      teamId: item.teamId?.S,
      name: item.name?.S,
      description: item.description?.S,
      memberIds: item.memberIds?.SS || [],
      memberCount: item.memberIds?.SS?.length || 0,
      createdAt: item.createdAt?.S,
      updatedAt: item.updatedAt?.S,
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(team),
    };
  } catch (error) {
    console.error('Error getting team:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to get team' }),
    };
  }
};
