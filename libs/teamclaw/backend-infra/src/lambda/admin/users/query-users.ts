import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';

const dynamodb = new DynamoDBClient({});
const USERS_TABLE = process.env['USERS_TABLE_NAME']!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env['ADMIN_ORIGIN'] || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const params = event.queryStringParameters ?? {};
    const limit = Math.min(parseInt(params['limit'] || '50', 10), 100);
    const email = params['email'];
    const status = params['status'];
    let exclusiveStartKey: Record<string, any> | undefined;
    if (params['nextToken']) {
      try {
        const decoded = JSON.parse(Buffer.from(params['nextToken'], 'base64').toString());
        if (decoded && typeof decoded === 'object' && decoded.userId) {
          exclusiveStartKey = decoded;
        }
      } catch {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid nextToken' }) };
      }
    }

    // Build filter expression
    const filterParts: string[] = [];
    const exprAttrValues: Record<string, any> = {};
    const exprAttrNames: Record<string, string> = {};

    if (email) {
      filterParts.push('contains(#email, :email)');
      exprAttrNames['#email'] = 'email';
      exprAttrValues[':email'] = { S: email };
    }

    if (status) {
      filterParts.push('#status = :status');
      exprAttrNames['#status'] = 'status';
      exprAttrValues[':status'] = { S: status };
    }

    const scanParams: any = {
      TableName: USERS_TABLE,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    };

    if (filterParts.length > 0) {
      scanParams.FilterExpression = filterParts.join(' AND ');
      scanParams.ExpressionAttributeNames = exprAttrNames;
      scanParams.ExpressionAttributeValues = exprAttrValues;
    }

    const result = await dynamodb.send(new ScanCommand(scanParams));

    const users = (result.Items ?? []).map(item => ({
      userId: item['userId']?.S,
      teamId: item['teamId']?.S,
      email: item['email']?.S,
      displayName: item['displayName']?.S,
      status: item['status']?.S,
      efsAccessPointId: item['efsAccessPointId']?.S,
      taskArn: item['taskArn']?.S,
      createdAt: item['createdAt']?.S,
      updatedAt: item['updatedAt']?.S,
    }));

    const nextToken = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ users, nextToken }),
    };
  } catch (error) {
    console.error('Failed to query users:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
