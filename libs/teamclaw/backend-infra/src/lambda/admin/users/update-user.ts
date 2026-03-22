import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
  POSTAndPUTCloudFunctionInput,
} from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars({ USERS_TABLE_NAME: process.env['USERS_TABLE_NAME'], COGNITO_USER_POOL_ID: process.env['COGNITO_USER_POOL_ID'] });

const dynamodb = new DynamoDBClient({});
const cognito = new CognitoIdentityProviderClient({});
const USERS_TABLE = process.env['USERS_TABLE_NAME']!;
const USER_POOL_ID = process.env['COGNITO_USER_POOL_ID']!;

const ALLOWED_FIELDS = ['teamId', 'status', 'displayName'] as const;
type AllowedField = typeof ALLOWED_FIELDS[number];

const handlerFn = async (
  request: POSTAndPUTCloudFunctionInput<Record<string, unknown>>,
): Promise<{ status: number; body: unknown }> => {
  const { body, pathParameters } = request;
  const userId = pathParameters?.['userId'];

  if (!userId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'Missing userId path parameter' },
    };
  }

  if (!body) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'Missing request body' },
    };
  }

  // Validate status field values
  const ALLOWED_STATUSES = ['active', 'disabled', 'provisioned', 'running', 'stopped'] as const;
  if (body['status'] && !ALLOWED_STATUSES.includes(body['status'] as any)) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}` },
    };
  }

  // Validate that at least one allowed field is present
  const updates: Partial<Record<AllowedField, string>> = {};
  for (const field of ALLOWED_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field] as string;
    }
  }

  if (Object.keys(updates).length === 0) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'No valid fields to update. Allowed: teamId, status, displayName' },
    };
  }

  // Verify user exists
  const existing = await dynamodb.send(new GetItemCommand({
    TableName: USERS_TABLE,
    Key: { userId: { S: userId } },
  }));

  if (!existing.Item) {
    return {
      status: HttpStatusCode.NOT_FOUND,
      body: { message: 'User not found' },
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
    status: HttpStatusCode.SUCCESS,
    body: { message: 'User updated', userId, updates },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.PUT,
  handlerFn,
);
