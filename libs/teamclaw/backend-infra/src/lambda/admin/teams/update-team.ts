import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const ddbClient = new DynamoDBClient({});
const TABLE_NAME = process.env['TEAMS_TABLE_NAME']!;

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

    const body = event.body ? JSON.parse(event.body) : {};
    const now = new Date().toISOString();

    const expressionParts: string[] = ['#updatedAt = :updatedAt'];
    const exprNames: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const exprValues: Record<string, any> = { ':updatedAt': { S: now } };

    if (body.name !== undefined) {
      expressionParts.push('#name = :name');
      exprNames['#name'] = 'name';
      exprValues[':name'] = { S: body.name };
    }

    if (body.description !== undefined) {
      expressionParts.push('#description = :description');
      exprNames['#description'] = 'description';
      exprValues[':description'] = { S: body.description };
    }

    if (body.memberIds !== undefined) {
      expressionParts.push('#memberIds = :memberIds');
      exprNames['#memberIds'] = 'memberIds';
      exprValues[':memberIds'] = body.memberIds.length > 0
        ? { SS: body.memberIds }
        : { NULL: true };
    }

    const result = await ddbClient.send(new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: { teamId: { S: teamId } },
      UpdateExpression: 'SET ' + expressionParts.join(', '),
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
      ConditionExpression: 'attribute_exists(teamId)',
      ReturnValues: 'ALL_NEW',
    }));

    const item = result.Attributes!;
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        teamId: item['teamId']?.S,
        name: item['name']?.S,
        description: item['description']?.S,
        memberIds: item['memberIds']?.SS || [],
        memberCount: item['memberIds']?.SS?.length || 0,
        createdAt: item['createdAt']?.S,
        updatedAt: item['updatedAt']?.S,
      }),
    };
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Team not found' }),
      };
    }
    console.error('Error updating team:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to update team' }),
    };
  }
};
