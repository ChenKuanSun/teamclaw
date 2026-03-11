import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { APIGatewayProxyHandler } from 'aws-lambda';

const dynamodb = new DynamoDBClient({});
const cognito = new CognitoIdentityProviderClient({});
const USERS_TABLE = process.env['USERS_TABLE_NAME']!;
const USER_POOL_ID = process.env['COGNITO_USER_POOL_ID']!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env['ADMIN_ORIGIN'] || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const ALLOWED_FIELDS = ['teamId', 'status', 'displayName'] as const;
type AllowedField = typeof ALLOWED_FIELDS[number];

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = event.pathParameters?.['userId'];

    if (!userId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing userId path parameter' }),
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    const body = JSON.parse(event.body);

    // Validate that at least one allowed field is present
    const updates: Partial<Record<AllowedField, string>> = {};
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'No valid fields to update. Allowed: teamId, status, displayName' }),
      };
    }

    // Verify user exists
    const existing = await dynamodb.send(new GetItemCommand({
      TableName: USERS_TABLE,
      Key: { userId: { S: userId } },
    }));

    if (!existing.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    // Build DynamoDB update expression
    const exprParts: string[] = [];
    const exprAttrNames: Record<string, string> = {};
    const exprAttrValues: Record<string, any> = {};

    for (const [field, value] of Object.entries(updates)) {
      exprParts.push(`#${field} = :${field}`);
      exprAttrNames[`#${field}`] = field;
      exprAttrValues[`:${field}`] = { S: String(value) };
    }

    // Always update updatedAt
    exprParts.push('#updatedAt = :updatedAt');
    exprAttrNames['#updatedAt'] = 'updatedAt';
    exprAttrValues[':updatedAt'] = { S: new Date().toISOString() };

    await dynamodb.send(new UpdateItemCommand({
      TableName: USERS_TABLE,
      Key: { userId: { S: userId } },
      UpdateExpression: `SET ${exprParts.join(', ')}`,
      ExpressionAttributeNames: exprAttrNames,
      ExpressionAttributeValues: exprAttrValues,
    }));

    // Update Cognito user attributes if displayName changed
    if (updates.displayName) {
      try {
        await cognito.send(new AdminUpdateUserAttributesCommand({
          UserPoolId: USER_POOL_ID,
          Username: userId,
          UserAttributes: [
            { Name: 'custom:displayName', Value: updates.displayName },
          ],
        }));
      } catch (cognitoError) {
        // Log but don't fail — DynamoDB is the source of truth
        console.error('Failed to update Cognito attributes:', cognitoError);
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'User updated', userId, updates }),
    };
  } catch (error) {
    console.error('Failed to update user:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
