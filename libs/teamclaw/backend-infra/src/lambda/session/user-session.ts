import { ConditionalCheckFailedException, DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import type { POSTAndPUTCloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars({
  USERS_TABLE_NAME: process.env['USERS_TABLE_NAME'],
  CONFIG_TABLE_NAME: process.env['CONFIG_TABLE_NAME'],
  LIFECYCLE_LAMBDA_NAME: process.env['LIFECYCLE_LAMBDA_NAME'],
});

const ddb = new DynamoDBClient({});
const lambda = new LambdaClient({});
const USERS_TABLE = process.env['USERS_TABLE_NAME']!;
const CONFIG_TABLE = process.env['CONFIG_TABLE_NAME']!;
const LIFECYCLE_LAMBDA = process.env['LIFECYCLE_LAMBDA_NAME']!;

async function getGlobalConfig(): Promise<Record<string, string>> {
  const result = await ddb.send(new QueryCommand({
    TableName: CONFIG_TABLE,
    KeyConditionExpression: 'scopeKey = :sk',
    ExpressionAttributeValues: { ':sk': { S: 'global#default' } },
  }));
  const config: Record<string, string> = {};
  for (const item of result.Items ?? []) {
    const key = item['configKey']?.S;
    const value = item['value']?.S;
    if (key && value) config[key] = value;
  }
  return config;
}

async function invokeLifecycle(action: string, userId: string, teamId?: string): Promise<void> {
  const payload: any = { action, userId };
  if (teamId) payload.teamId = teamId;
  await lambda.send(new InvokeCommand({
    FunctionName: LIFECYCLE_LAMBDA,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify(payload)),
  }));
}

const handlerFn = async (
  request: POSTAndPUTCloudFunctionInput<Record<string, unknown>>,
): Promise<{ status: number; body: unknown }> => {
  const email = (request.raw?.requestContext?.authorizer?.jwt?.claims?.['email'] as string) || '';
  const sub = (request.raw?.requestContext?.authorizer?.jwt?.claims?.['sub'] as string) || '';

  if (!email || !sub) {
    return { status: HttpStatusCode.BAD_REQUEST, body: { message: 'Missing email or sub in JWT' } };
  }

  // 1. Check if user exists
  const userResult = await ddb.send(new GetItemCommand({
    TableName: USERS_TABLE,
    Key: { userId: { S: sub } },
  }));

  if (userResult.Item) {
    const userStatus = userResult.Item['status']?.S || 'unknown';

    if (userStatus === 'running') {
      return {
        status: HttpStatusCode.SUCCESS,
        body: { status: 'ready', userId: sub },
      };
    }

    // stopped or provisioned → start
    await invokeLifecycle('start', sub);
    return {
      status: HttpStatusCode.SUCCESS,
      body: { status: 'starting', userId: sub, estimatedWaitSeconds: 30 },
    };
  }

  // 2. User doesn't exist — check domain
  const globalConfig = await getGlobalConfig();
  const allowedDomainsRaw = globalConfig['allowedDomains'];
  if (!allowedDomainsRaw) {
    return {
      status: HttpStatusCode.FORBIDDEN,
      body: { message: 'Self-registration is not configured. Please contact your IT administrator.' },
    };
  }

  let allowedDomains: string[];
  try {
    allowedDomains = JSON.parse(allowedDomainsRaw);
  } catch {
    return {
      status: HttpStatusCode.FORBIDDEN,
      body: { message: 'Self-registration is not configured. Please contact your IT administrator.' },
    };
  }

  const emailDomain = email.split('@')[1]?.toLowerCase();
  if (!emailDomain || !allowedDomains.includes(emailDomain)) {
    return {
      status: HttpStatusCode.FORBIDDEN,
      body: { message: 'Your email domain is not authorized. Please contact your IT administrator.' },
    };
  }

  // 3. Auto-register
  let defaultTeamId: string | undefined;
  try {
    defaultTeamId = globalConfig['defaultTeamId']
      ? JSON.parse(globalConfig['defaultTeamId'])
      : undefined;
  } catch {
    defaultTeamId = undefined;
  }

  try {
    await ddb.send(new PutItemCommand({
      TableName: USERS_TABLE,
      Item: {
        userId: { S: sub },
        email: { S: email },
        status: { S: 'provisioning' },
        ...(defaultTeamId ? { teamId: { S: defaultTeamId } } : {}),
        createdAt: { S: new Date().toISOString() },
      },
      ConditionExpression: 'attribute_not_exists(userId)',
    }));
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      // Another request just created this user — return provisioning status
      return {
        status: HttpStatusCode.SUCCESS,
        body: { status: 'provisioning', userId: sub, message: 'First time setup, please wait...', estimatedWaitSeconds: 60 },
      };
    }
    throw err;
  }

  // 4. Provision + start (async)
  await invokeLifecycle('provision', sub, defaultTeamId);

  return {
    status: HttpStatusCode.SUCCESS,
    body: {
      status: 'provisioning',
      userId: sub,
      message: 'First time setup, please wait...',
      estimatedWaitSeconds: 60,
    },
  };
};

// Intentionally reusing adminLambdaHandlerDecorator — it has no admin-specific logic,
// just provides standard request parsing and error handling.
export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.POST,
  handlerFn,
);
