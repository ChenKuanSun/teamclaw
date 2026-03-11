# Affiora Compliance Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 19 deviations from Affiora reference patterns identified in the compliance audit.

**Architecture:** Create a shared `cloud-function` library with Lambda handler decorator, security headers, and structured logging — exactly matching Affiora's `libs/core/cloud-function/`. Then migrate all Lambda handlers to use it, fix CDK patterns, and align Angular/ESLint config.

**Tech Stack:** TypeScript, AWS CDK, Angular 21, Nx, pino, @ngrx/signals, DynamoDBDocumentClient

---

## Phase 1: Foundation — Cloud Function Library (C-1, C-2, C-3, I-5, M-3)

### Task 1: Create `libs/teamclaw/cloud-function/` Nx library

**Files:**
- Create: `libs/teamclaw/cloud-function/project.json`
- Create: `libs/teamclaw/cloud-function/tsconfig.json`
- Create: `libs/teamclaw/cloud-function/tsconfig.lib.json`
- Create: `libs/teamclaw/cloud-function/src/index.ts`
- Modify: `tsconfig.base.json` — add path alias `@TeamClaw/teamclaw/cloud-function`

**Step 1: Generate the Nx library**

Run:
```bash
cd /Users/cksun/Project/openclaw-enterprise
npx nx g @nx/js:library --name=cloud-function --directory=libs/teamclaw/cloud-function --importPath=@TeamClaw/teamclaw/cloud-function --bundler=none --unitTestRunner=jest --no-interactive
```

**Step 2: Verify the path alias was added**

Run: `grep -n "cloud-function" tsconfig.base.json`
Expected: Path alias `@TeamClaw/teamclaw/cloud-function` pointing to `libs/teamclaw/cloud-function/src/index.ts`

**Step 3: Install pino + pino-lambda**

Run: `yarn add pino pino-lambda && yarn add -D @types/pino`

**Step 4: Commit**

```bash
git add libs/teamclaw/cloud-function/ tsconfig.base.json package.json yarn.lock
git commit -m "feat: scaffold teamclaw/cloud-function Nx library"
```

---

### Task 2: Create logger (M-3)

**Files:**
- Create: `libs/teamclaw/cloud-function/src/lib/logger.ts`
- Create: `libs/teamclaw/cloud-function/src/lib/logger.spec.ts`

**Step 1: Write the failing test**

```typescript
// libs/teamclaw/cloud-function/src/lib/logger.spec.ts
import { logger, withRequest } from './logger';

describe('logger', () => {
  it('should export a pino logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('should export withRequest function', () => {
    expect(typeof withRequest).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx nx test cloud-function --testPathPattern=logger`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// libs/teamclaw/cloud-function/src/lib/logger.ts
import { pino } from 'pino';
import { lambdaRequestTracker, pinoLambdaDestination } from 'pino-lambda';

const LOG_LEVEL = process.env['LOG_LEVEL'] || 'info';

const destination = pinoLambdaDestination();

export const logger = pino(
  {
    level: LOG_LEVEL,
  },
  destination,
);
export const withRequest = lambdaRequestTracker();
```

**Step 4: Run test to verify it passes**

Run: `npx nx test cloud-function --testPathPattern=logger`
Expected: PASS

**Step 5: Commit**

```bash
git add libs/teamclaw/cloud-function/src/lib/logger.ts libs/teamclaw/cloud-function/src/lib/logger.spec.ts
git commit -m "feat(cloud-function): add pino structured logger"
```

---

### Task 3: Create lambda-helper — sanitizeErrorMessage + validateRequiredEnvVars (C-3, I-5)

**Files:**
- Create: `libs/teamclaw/cloud-function/src/lib/lambda-helper.ts`
- Create: `libs/teamclaw/cloud-function/src/lib/lambda-helper.spec.ts`

**Step 1: Write the failing tests**

```typescript
// libs/teamclaw/cloud-function/src/lib/lambda-helper.spec.ts
import { sanitizeErrorMessage, validateRequiredEnvVars, HttpStatusCode, HttpStatusMessage } from './lambda-helper';

describe('sanitizeErrorMessage', () => {
  it('should redact database URLs', () => {
    const msg = 'Error: postgresql://admin:secret123@db.example.com/mydb';
    expect(sanitizeErrorMessage(msg)).toContain('postgresql://***:***@');
    expect(sanitizeErrorMessage(msg)).not.toContain('secret123');
  });

  it('should redact JWT tokens', () => {
    const msg = 'Token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(sanitizeErrorMessage(msg)).toContain('eyJ***');
    expect(sanitizeErrorMessage(msg)).not.toContain('dozjgNryP4J3jVmNHl0w5N');
  });

  it('should redact Stripe API keys', () => {
    expect(sanitizeErrorMessage('key: sk_live_abc123')).toContain('sk_***');
    expect(sanitizeErrorMessage('key: pk_test_xyz789')).toContain('pk_***');
  });

  it('should redact AWS access keys', () => {
    expect(sanitizeErrorMessage('key: AKIAIOSFODNN7EXAMPLE')).toContain('AKIA***');
  });

  it('should redact passwords in URLs', () => {
    expect(sanitizeErrorMessage('url?password=secret123&foo=bar')).toContain('password=***');
    expect(sanitizeErrorMessage('url?password=secret123&foo=bar')).not.toContain('secret123');
  });
});

describe('validateRequiredEnvVars', () => {
  it('should pass when all vars are present', () => {
    expect(() => validateRequiredEnvVars({ FOO: 'bar', BAZ: 'qux' })).not.toThrow();
  });

  it('should throw when vars are missing', () => {
    expect(() => validateRequiredEnvVars({ FOO: 'bar', BAZ: undefined }))
      .toThrow('Missing required environment variables: BAZ');
  });

  it('should throw when vars are empty strings', () => {
    expect(() => validateRequiredEnvVars({ FOO: '', BAZ: '  ' }))
      .toThrow('Missing required environment variables: FOO, BAZ');
  });
});

describe('HttpStatusCode', () => {
  it('should have correct values', () => {
    expect(HttpStatusCode.SUCCESS).toBe(200);
    expect(HttpStatusCode.BAD_REQUEST).toBe(400);
    expect(HttpStatusCode.INTERNAL_SERVER_ERROR).toBe(500);
  });
});

describe('HttpStatusMessage', () => {
  it('should map codes to messages', () => {
    expect(HttpStatusMessage[HttpStatusCode.SUCCESS]).toBe('Success');
    expect(HttpStatusMessage[HttpStatusCode.BAD_REQUEST]).toBe('Bad Request');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx nx test cloud-function --testPathPattern=lambda-helper`
Expected: FAIL

**Step 3: Write implementation**

```typescript
// libs/teamclaw/cloud-function/src/lib/lambda-helper.ts
import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { withRequest } from './logger';

/**
 * CASA Tier 2: Sanitize error messages to prevent sensitive information disclosure (ASVS 7.4.1)
 */
export function sanitizeErrorMessage(message: string): string {
  return (
    message
      .replace(
        /(postgresql|mongodb|mysql|redis):\/\/([^:]+):([^@]+)@/gi,
        '$1://***:***@',
      )
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'eyJ***')
      .replace(/sk_(live|test)_[A-Za-z0-9]+/g, 'sk_***')
      .replace(/pk_(live|test)_[A-Za-z0-9]+/g, 'pk_***')
      .replace(/AKIA[0-9A-Z]{16}/g, 'AKIA***')
      .replace(/password=[^\s&]+/gi, 'password=***')
  );
}

export const validateRequiredEnvVars = (
  envVars: Record<string, string | undefined>,
): void => {
  const missing: string[] = [];

  for (const [name, value] of Object.entries(envVars)) {
    if (!value || value.trim() === '') {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `Lambda cannot start without these variables.`,
    );
  }
};

export enum HandlerMethod {
  POST = 'POST',
  GET = 'GET',
  PUT = 'PUT',
  DELETE = 'DELETE',
}

export enum HttpStatusCode {
  SUCCESS = 200,
  ACCEPTED = 202,
  FOUND = 302,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  INTERNAL_SERVER_ERROR = 500,
}

export const HttpStatusMessage: Record<number, string> = {
  [HttpStatusCode.SUCCESS]: 'Success',
  [HttpStatusCode.BAD_REQUEST]: 'Bad Request',
  [HttpStatusCode.FORBIDDEN]: 'Forbidden',
  [HttpStatusCode.NOT_FOUND]: 'Not Found',
  [HttpStatusCode.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
};

/**
 * CASA Tier 2 Security Headers
 */
const getCASATier2SecurityHeaders = (): Record<string, string> => {
  const rawEnv = process.env['DEPLOY_ENV'];

  if (rawEnv && !/^[a-z]+$/.test(rawEnv)) {
    throw new Error(
      `Invalid DEPLOY_ENV: "${rawEnv}" contains invalid characters. ` +
        `Expected exactly 'prod' or 'dev' (ASCII lowercase only).`,
    );
  }

  const env = rawEnv?.trim();

  if (env !== 'prod' && env !== 'dev') {
    throw new Error(
      `Invalid DEPLOY_ENV: "${env}". Expected 'prod' or 'dev'. ` +
        `Lambda cannot start without valid environment configuration.`,
    );
  }

  const isProduction = env === 'prod';

  return {
    'Strict-Transport-Security': isProduction
      ? 'max-age=31536000; includeSubDomains; preload'
      : 'max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy':
      "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data:; " +
      "connect-src 'self'; " +
      "object-src 'none'; " +
      "base-uri 'self'; " +
      (isProduction ? 'upgrade-insecure-requests; ' : '') +
      "frame-ancestors 'none';",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };
};

export interface POSTAndPUTCloudFunctionInput<T> {
  raw: APIGatewayProxyEventV2WithJWTAuthorizer;
  queryStringParameters: APIGatewayProxyEventV2WithJWTAuthorizer['queryStringParameters'];
  pathParameters: APIGatewayProxyEventV2WithJWTAuthorizer['pathParameters'];
  body: T;
}

export interface GETAndDELETECloudFunctionInput {
  raw: APIGatewayProxyEventV2WithJWTAuthorizer;
  queryStringParameters: APIGatewayProxyEventV2WithJWTAuthorizer['queryStringParameters'];
  pathParameters: APIGatewayProxyEventV2WithJWTAuthorizer['pathParameters'];
}

type HandlerFunction<T extends HandlerMethod, U> = T extends
  | HandlerMethod.POST
  | HandlerMethod.PUT
  ? (
      payload: POSTAndPUTCloudFunctionInput<U>,
    ) => Promise<{ status: number; body: any }>
  : (
      payload: GETAndDELETECloudFunctionInput,
    ) => Promise<{ status: number; body: any }>;

export function awsLambdaHandlerDecorator<T extends HandlerMethod, U>(
  handlerMethod: T,
  fn: HandlerFunction<T, U>,
): (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  context: Context,
) => Promise<APIGatewayProxyResult> {
  return async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
    context: Context,
  ): Promise<APIGatewayProxyResult> => {
    try {
      withRequest(event, context);
      const requestMethod = event.routeKey.split(' ')[0];
      if (requestMethod !== handlerMethod) {
        return {
          statusCode: HttpStatusCode.FORBIDDEN,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...getCASATier2SecurityHeaders(),
          },
          body: JSON.stringify({
            message: HttpStatusMessage[HttpStatusCode.FORBIDDEN],
          }),
        };
      }

      let payload:
        | POSTAndPUTCloudFunctionInput<U>
        | GETAndDELETECloudFunctionInput;
      if (
        handlerMethod === HandlerMethod.POST ||
        handlerMethod === HandlerMethod.PUT
      ) {
        if (!event.body) {
          return {
            statusCode: HttpStatusCode.BAD_REQUEST,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              ...getCASATier2SecurityHeaders(),
            },
            body: JSON.stringify({
              message: HttpStatusMessage[HttpStatusCode.BAD_REQUEST],
            }),
          };
        }

        if (event.isBase64Encoded) {
          payload = {
            raw: event,
            queryStringParameters: event.queryStringParameters,
            pathParameters: event.pathParameters,
            body: JSON.parse(
              Buffer.from(event.body, 'base64').toString('utf-8'),
            ),
          };
        } else {
          payload = {
            raw: event,
            queryStringParameters: event.queryStringParameters,
            pathParameters: event.pathParameters,
            body: JSON.parse(event.body),
          };
        }
      } else {
        payload = {
          raw: event,
          queryStringParameters: event.queryStringParameters,
          pathParameters: event.pathParameters,
        };
      }

      const { status, body } = await fn(payload as any);

      return {
        statusCode: status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...getCASATier2SecurityHeaders(),
        },
        body: JSON.stringify(body),
      };
    } catch (error) {
      const env = process.env['DEPLOY_ENV'];
      const isProduction = env === 'prod';

      if (isProduction) {
        const rawMessage =
          error instanceof Error ? error.message : 'Unknown error';
        console.error('Lambda error:', {
          message: sanitizeErrorMessage(rawMessage),
        });
      } else {
        if (error instanceof Error) {
          console.error('Lambda error (dev):', {
            message: sanitizeErrorMessage(error.message),
            stack: error.stack ? sanitizeErrorMessage(error.stack) : undefined,
            type: error.constructor.name,
          });
        } else {
          console.error('Lambda error (dev):', error);
        }
      }

      return {
        statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...getCASATier2SecurityHeaders(),
        },
        body: JSON.stringify({
          message: HttpStatusMessage[HttpStatusCode.INTERNAL_SERVER_ERROR],
        }),
      };
    }
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx nx test cloud-function --testPathPattern=lambda-helper`
Expected: PASS

**IMPORTANT for all handler tests:** Every test that invokes a handler using `awsLambdaHandlerDecorator` MUST set `process.env['DEPLOY_ENV'] = 'dev'` in `beforeEach`, otherwise `getCASATier2SecurityHeaders()` will throw.

**Step 5: Export from barrel**

Update `libs/teamclaw/cloud-function/src/index.ts`:
```typescript
export {
  awsLambdaHandlerDecorator,
  GETAndDELETECloudFunctionInput,
  HandlerMethod,
  HttpStatusCode,
  HttpStatusMessage,
  POSTAndPUTCloudFunctionInput,
  sanitizeErrorMessage,
  validateRequiredEnvVars,
} from './lib/lambda-helper';
export { logger, withRequest } from './lib/logger';
```

**Step 6: Commit**

```bash
git add libs/teamclaw/cloud-function/
git commit -m "feat(cloud-function): add lambda-helper decorator with CASA Tier 2 security headers"
```

---

## Phase 2: Migrate Admin Lambda Handlers (C-2, C-4, I-5, I-6)

All 27 admin handlers follow the same pattern. Below shows the migration for one handler — repeat for all.

### Task 4: Install `@aws-sdk/lib-dynamodb` dependency

**Step 1: Install**

Run: `yarn add -D @aws-sdk/lib-dynamodb@^3.1005.0`

**Step 2: Commit**

```bash
git add package.json yarn.lock
git commit -m "chore: add @aws-sdk/lib-dynamodb for DynamoDBDocumentClient"
```

---

### Task 5: Migrate `get-stats.ts` (dashboard) — first handler as template

**Files:**
- Modify: `libs/teamclaw/backend-infra/src/lambda/admin/dashboard/get-stats.ts`
- Modify: `libs/teamclaw/backend-infra/src/lambda/admin/dashboard/get-stats.spec.ts`

**Step 1: Rewrite handler using decorator**

Replace the entire file `libs/teamclaw/backend-infra/src/lambda/admin/dashboard/get-stats.ts`:

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  awsLambdaHandlerDecorator,
  GETAndDELETECloudFunctionInput,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';

const USERS_TABLE = process.env['USERS_TABLE_NAME']!;
const USAGE_TABLE = process.env['USAGE_TABLE_NAME']!;

validateRequiredEnvVars({
  USERS_TABLE_NAME: process.env['USERS_TABLE_NAME'],
  USAGE_TABLE_NAME: process.env['USAGE_TABLE_NAME'],
  DEPLOY_ENV: process.env['DEPLOY_ENV'],
});

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = awsLambdaHandlerDecorator(
  HandlerMethod.GET,
  async (_payload: GETAndDELETECloudFunctionInput) => {
    const usersResult = await docClient.send(
      new ScanCommand({ TableName: USERS_TABLE }),
    );
    const users = usersResult.Items ?? [];

    const totalUsers = users.length;
    const runningContainers = users.filter(
      (u) => u['status'] === 'running',
    ).length;
    const stoppedContainers = users.filter(
      (u) => u['status'] === 'stopped',
    ).length;
    const provisionedContainers = users.filter(
      (u) => u['status'] === 'provisioned',
    ).length;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let totalRequests24h = 0;
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const usageResult = await docClient.send(
        new ScanCommand({
          TableName: USAGE_TABLE,
          FilterExpression: '#ts >= :since',
          ExpressionAttributeNames: { '#ts': 'timestamp' },
          ExpressionAttributeValues: { ':since': oneDayAgo },
          ExclusiveStartKey: lastEvaluatedKey,
        }),
      );
      totalRequests24h += usageResult.Count ?? 0;
      lastEvaluatedKey = usageResult.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return {
      status: HttpStatusCode.SUCCESS,
      body: {
        totalUsers,
        containers: {
          running: runningContainers,
          stopped: stoppedContainers,
          provisioned: provisionedContainers,
        },
        totalRequests24h,
      },
    };
  },
);
```

**Step 2: Update the spec to match new handler signature**

Replace the entire file `libs/teamclaw/backend-infra/src/lambda/admin/dashboard/get-stats.spec.ts`:

```typescript
const mockSend = jest.fn();

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
  ScanCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(),
}));

process.env['USERS_TABLE_NAME'] = 'UsersTable';
process.env['USAGE_TABLE_NAME'] = 'UsageTable';

import { handler } from './get-stats';
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  Context,
} from 'aws-lambda';

const makeEvent = (): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    routeKey: 'GET /admin/dashboard/stats',
    rawPath: '/admin/dashboard/stats',
    pathParameters: undefined,
    queryStringParameters: undefined,
    body: undefined,
    headers: {},
    isBase64Encoded: false,
    requestContext: {
      authorizer: { jwt: { claims: {}, scopes: [] } },
    } as any,
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

const invoke = async (event = makeEvent()) =>
  handler(event, {} as Context) as Promise<{
    statusCode: number;
    headers: any;
    body: string;
  }>;

describe('get-stats handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DEPLOY_ENV'] = 'dev';
  });

  it('should return aggregated stats with multiple user statuses', async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [
          { userId: 'u1', status: 'running' },
          { userId: 'u2', status: 'stopped' },
          { userId: 'u3', status: 'running' },
          { userId: 'u4', status: 'provisioned' },
        ],
      })
      .mockResolvedValueOnce({ Count: 15, LastEvaluatedKey: undefined });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.totalUsers).toBe(4);
    expect(body.containers.running).toBe(2);
    expect(body.containers.stopped).toBe(1);
    expect(body.containers.provisioned).toBe(1);
    expect(body.totalRequests24h).toBe(15);
  });

  it('should handle empty tables', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Count: 0 });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.totalUsers).toBe(0);
    expect(body.containers.running).toBe(0);
    expect(body.totalRequests24h).toBe(0);
  });

  it('should paginate through usage table', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({
        Count: 10,
        LastEvaluatedKey: { pk: 'page1' },
      })
      .mockResolvedValueOnce({ Count: 5, LastEvaluatedKey: undefined });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).totalRequests24h).toBe(15);
  });

  it('should return 500 on DynamoDB error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB failure'));
    const res = await invoke();
    expect(res.statusCode).toBe(500);
  });
});
```

**Step 3: Run test**

Run: `npx nx test backend-infra --testPathPattern=get-stats`
Expected: PASS

**Step 4: Commit**

```bash
git add libs/teamclaw/backend-infra/src/lambda/admin/dashboard/
git commit -m "refactor(admin): migrate get-stats to handler decorator + DynamoDBDocumentClient"
```

---

### Task 6: Migrate remaining admin handlers (batch)

Apply the same pattern from Task 5 to ALL remaining admin handlers. Each handler needs:

**IMPORTANT for all handler tests:** Every test that invokes a handler using `awsLambdaHandlerDecorator` MUST set `process.env['DEPLOY_ENV'] = 'dev'` in `beforeEach`, otherwise `getCASATier2SecurityHeaders()` will throw.

1. Replace `APIGatewayProxyHandler` import with `awsLambdaHandlerDecorator` from `@TeamClaw/teamclaw/cloud-function`
2. Replace `DynamoDBClient` low-level ops with `DynamoDBDocumentClient` from `@aws-sdk/lib-dynamodb`
3. Remove manual `corsHeaders` object
4. Add `validateRequiredEnvVars()` at module top level
5. Wrap handler in `awsLambdaHandlerDecorator(HandlerMethod.GET|POST|PUT|DELETE, async (payload) => { ... })`
6. Return `{ status: HttpStatusCode.XXX, body: { ... } }` instead of raw `{ statusCode, headers, body }`
7. Remove try/catch (decorator handles it)
8. Remove manual marshalling (`item['field']?.S` → `item['field']`)

**Handlers to migrate (27 total, minus 1 done in Task 5 = 26 remaining):**

GET handlers (use `HandlerMethod.GET`):
- `admin/users/query-users.ts`
- `admin/users/get-user.ts`
- `admin/teams/query-teams.ts`
- `admin/teams/get-team.ts`
- `admin/containers/query-containers.ts`
- `admin/containers/get-container.ts`
- `admin/config/get-global-config.ts`
- `admin/config/get-team-config.ts`
- `admin/config/get-user-config.ts`
- `admin/api-keys/get-api-keys.ts`
- `admin/api-keys/get-key-usage-stats.ts`
- `admin/analytics/get-system-analytics.ts`
- `admin/analytics/get-usage-by-provider.ts`
- `admin/analytics/query-users-usage.ts`

POST handlers (use `HandlerMethod.POST`):
- `admin/teams/create-team.ts`
- `admin/api-keys/add-api-key.ts`
- `admin/containers/provision-container.ts`
- `admin/containers/start-container.ts`
- `admin/containers/stop-container.ts`

PUT handlers (use `HandlerMethod.PUT`):
- `admin/users/update-user.ts`
- `admin/teams/update-team.ts`
- `admin/config/update-global-config.ts`
- `admin/config/update-team-config.ts`
- `admin/config/update-user-config.ts`

DELETE handlers (use `HandlerMethod.DELETE`):
- `admin/users/delete-user.ts`
- `admin/teams/delete-team.ts`
- `admin/api-keys/remove-api-key.ts`

**After each batch of ~5 handlers:**

Run: `npx nx test backend-infra`
Expected: All tests pass

Commit after each batch.

---

---

## Phase 3: CDK Fixes (C-5, I-1, I-8, I-9)

### Task 7: Scope IAM policies to specific ARNs (C-5)

**Files:**
- Modify: `libs/teamclaw/backend-infra/src/stack/control-plane.stack.ts`

**Step 1: Replace wildcard IAM policies with scoped ARNs**

In `control-plane.stack.ts`, replace each `resources: ['*']` with specific ARNs:

```typescript
// ECS permissions — scope to cluster
lifecycleLambda.addToRolePolicy(new aws_iam.PolicyStatement({
  actions: [
    'ecs:RunTask',
    'ecs:StopTask',
    'ecs:DescribeTasks',
    'ecs:ListTasks',
    'ecs:RegisterTaskDefinition',
    'ecs:DeregisterTaskDefinition',
  ],
  resources: [
    `arn:aws:ecs:${this.region}:${this.account}:cluster/teamclaw-*`,
    `arn:aws:ecs:${this.region}:${this.account}:task/teamclaw-*`,
    `arn:aws:ecs:${this.region}:${this.account}:task-definition/teamclaw-*`,
  ],
}));

// iam:PassRole — scope to task execution/task roles
lifecycleLambda.addToRolePolicy(new aws_iam.PolicyStatement({
  actions: ['iam:PassRole'],
  resources: [
    `arn:aws:iam::${this.account}:role/teamclaw-*`,
  ],
  conditions: {
    StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' },
  },
}));

// EFS — scope to specific file system
const efsFileSystemId = aws_ssm.StringParameter.valueForStringParameter(this, ssm.EFS.FILE_SYSTEM_ID);
lifecycleLambda.addToRolePolicy(new aws_iam.PolicyStatement({
  actions: [
    'elasticfilesystem:CreateAccessPoint',
    'elasticfilesystem:DeleteAccessPoint',
    'elasticfilesystem:DescribeAccessPoints',
  ],
  resources: [
    `arn:aws:elasticfilesystem:${this.region}:${this.account}:file-system/${efsFileSystemId}`,
    `arn:aws:elasticfilesystem:${this.region}:${this.account}:access-point/*`,
  ],
}));

// Scheduler role — scope to lifecycle lambda
schedulerRole.addToPolicy(new aws_iam.PolicyStatement({
  actions: ['lambda:InvokeFunction'],
  resources: [lifecycleLambdaArn],
}));

// iam:PassRole for scheduler — scope to scheduler role
lifecycleLambda.addToRolePolicy(new aws_iam.PolicyStatement({
  actions: ['iam:PassRole'],
  resources: [schedulerRole.roleArn],
  conditions: {
    StringEquals: { 'iam:PassedToService': 'scheduler.amazonaws.com' },
  },
}));
```

**Step 2: Run CDK synth**

Run:
```bash
cd apps/20-control-plane/teamclaw-control-plane-infra
CDK_TSCONFIG=tsconfig.cdk.json npx cdk synth --profile chddev 2>&1 | tail -5
```
Expected: Successfully synthesized

**Step 3: Commit**

```bash
git add libs/teamclaw/backend-infra/src/stack/control-plane.stack.ts
git commit -m "security(cdk): scope IAM policies to specific ARNs instead of wildcard"
```

---

### Task 8: Migrate DynamoDB Table V1 → TableV2 (I-1)

**Files:**
- Modify: `libs/teamclaw/backend-infra/src/stack/control-plane.stack.ts`

**Step 1: Replace `aws_dynamodb.Table` with `aws_dynamodb.TableV2`**

Change `userTable` and `usageTable`:

```typescript
// Before:
const userTable = new aws_dynamodb.Table(this, 'UserTable', {
  tableName: `teamclaw-users-${deployEnv}`,
  partitionKey: { name: 'userId', type: aws_dynamodb.AttributeType.STRING },
  billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
});

// After:
const userTable = new aws_dynamodb.TableV2(this, 'UserTable', {
  tableName: `teamclaw-users-${deployEnv}`,
  partitionKey: { name: 'userId', type: aws_dynamodb.AttributeType.STRING },
  billing: aws_dynamodb.Billing.onDemand(),
  removalPolicy: RemovalPolicy.RETAIN,
});

// Before:
const usageTable = new aws_dynamodb.Table(this, 'UsageTable', {
  tableName: `teamclaw-usage-${deployEnv}`,
  partitionKey: { name: 'userId', type: aws_dynamodb.AttributeType.STRING },
  sortKey: { name: 'timestamp', type: aws_dynamodb.AttributeType.STRING },
  billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.DESTROY,
  timeToLiveAttribute: 'ttl',
});

// After:
const usageTable = new aws_dynamodb.TableV2(this, 'UsageTable', {
  tableName: `teamclaw-usage-${deployEnv}`,
  partitionKey: { name: 'userId', type: aws_dynamodb.AttributeType.STRING },
  sortKey: { name: 'timestamp', type: aws_dynamodb.AttributeType.STRING },
  billing: aws_dynamodb.Billing.onDemand(),
  removalPolicy: RemovalPolicy.DESTROY,
  timeToLiveAttribute: 'ttl',
});
```

**CRITICAL MIGRATION WARNING:** Changing from `aws_dynamodb.Table` to `aws_dynamodb.TableV2` changes the CloudFormation resource type from `AWS::DynamoDB::Table` to `AWS::DynamoDB::GlobalTable`. CloudFormation cannot update a resource's `Type` — it will attempt to DELETE and RECREATE the table. Since `usageTable` has `removalPolicy: RemovalPolicy.DESTROY`, **all usage data will be permanently lost**.

**Safe migration steps:**
1. First, change `usageTable` removalPolicy to `RETAIN` and deploy
2. Run `cdk diff` to confirm the table replacement is planned
3. Remove the old table from the stack state: `cdk import` the existing tables under new logical IDs
4. Alternative: Keep V1 for existing tables, only use V2 for NEW tables going forward

**Recommendation:** Defer this task. Keep existing `userTable` and `usageTable` as V1 (`aws_dynamodb.Table`). Only `teamsTable` and `configTable` (already V2) are unaffected. The V1→V2 migration for existing tables should be done in a separate PR with a proper CloudFormation import procedure.

**Step 2: Run CDK synth**

Run:
```bash
cd apps/20-control-plane/teamclaw-control-plane-infra
CDK_TSCONFIG=tsconfig.cdk.json npx cdk synth --profile chddev 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add libs/teamclaw/backend-infra/src/stack/control-plane.stack.ts
git commit -m "refactor(cdk): migrate DynamoDB Table V1 to TableV2"
```

---

### Task 9: Move `aws-cdk-lib` to devDependencies (I-8)

**Files:**
- Modify: `package.json`

**Step 1: Move CDK packages from dependencies to devDependencies**

Move these from `dependencies` to `devDependencies`:
- `aws-cdk-lib`
- `constructs`
- `@aws-cdk/aws-amplify-alpha`
- `esbuild`

**Step 2: Move `zone.js` from devDependencies to dependencies (I-9)**

Move `zone.js` from `devDependencies` to `dependencies`.

**Step 3: Install to verify**

Run: `yarn install`
Expected: No errors

**Step 4: Run CDK synth to verify**

Run:
```bash
cd apps/20-control-plane/teamclaw-control-plane-infra
CDK_TSCONFIG=tsconfig.cdk.json npx cdk synth --profile chddev 2>&1 | tail -5
```

**Step 5: Commit**

```bash
git add package.json yarn.lock
git commit -m "chore: move CDK to devDependencies, zone.js to dependencies"
```

---

## Phase 4: ESLint & Config (I-4, M-1, M-2)

### Task 10: Extend ESLint flat config with Affiora rules (I-4)

**Files:**
- Modify: `eslint.config.mjs`

**Step 1: Add TypeScript strict rules**

```javascript
import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc', '**/cdk.out', '**/node_modules'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
```

**Step 2: Run lint**

Run: `npx nx run-many --target=lint --all --parallel=5 2>&1 | tail -20`
Expected: May have warnings but no config errors

**Step 3: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore: extend ESLint flat config with TypeScript strict rules"
```

---

### Task 11: Fix .gitignore (M-1)

**Files:**
- Modify: `.gitignore`

**Step 1: Change `cdk.out/` to `**/cdk.out`**

Replace:
```
cdk.out/
```
With:
```
**/cdk.out
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "fix: use **/cdk.out to catch nested CDK output dirs"
```

---

### Task 12: Create CLAUDE.md (M-2)

**Files:**
- Create: `CLAUDE.md`

**Step 1: Write CLAUDE.md**

```markdown
# TeamClaw Development Guide

## Project Structure

Nx monorepo. Apps in `apps/`, libs in `libs/`.

### Apps
- `apps/enterprise-admin/` — Angular 21 admin panel
- `apps/enterprise-chat/` — Angular 21 chat interface
- `apps/00-foundation/` — CDK: VPC, EFS, ECR
- `apps/10-cluster/` — CDK: ECS Cluster, ALB
- `apps/20-control-plane/` — CDK: Cognito, DynamoDB, Lambda
- `apps/30-admin/` — CDK: Admin API Gateway, Lambda, Amplify

### Libs
- `libs/core/constants/` — shared constants
- `libs/core/cloud-config/` — SSM paths, stack props, environment config
- `libs/core/types/` — shared TypeScript types
- `libs/teamclaw/cloud-config/` — Lambda/container default props
- `libs/teamclaw/cloud-function/` — Lambda handler decorator, logger, security headers
- `libs/teamclaw/backend-infra/` — CDK stacks, Lambda handlers
- `libs/teamclaw/container/` — Docker container config

## Key Commands

```bash
# Angular dev server
npx nx serve enterprise-admin
npx nx serve enterprise-chat

# Build
npx nx build enterprise-admin

# Test
npx nx test backend-infra
npx nx test cloud-function
npx nx test enterprise-admin

# Lint
npx nx lint enterprise-admin

# CDK deploy (admin stacks)
cd apps/20-control-plane/teamclaw-control-plane-infra
CDK_TSCONFIG=tsconfig.cdk.json npx cdk deploy --all --profile chddev
```

## Lambda Pattern

All Lambda handlers use `awsLambdaHandlerDecorator` from `@TeamClaw/teamclaw/cloud-function`:

```typescript
import { awsLambdaHandlerDecorator, HandlerMethod, HttpStatusCode, validateRequiredEnvVars } from '@TeamClaw/teamclaw/cloud-function';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

validateRequiredEnvVars({ TABLE_NAME: process.env['TABLE_NAME'], DEPLOY_ENV: process.env['DEPLOY_ENV'] });

export const handler = awsLambdaHandlerDecorator(HandlerMethod.GET, async (payload) => {
  // Business logic here — no try/catch, no CORS headers, no security headers
  return { status: HttpStatusCode.SUCCESS, body: { data } };
});
```

## CDK Patterns

- Use `TableV2` (not `Table`) for DynamoDB
- Use `HttpApi` (V2) for API Gateway
- Scope IAM policies to specific ARNs — no `resources: ['*']`
- Use `DynamoDBDocumentClient` in Lambda handlers (not low-level marshalling)

## Naming

- Product: TeamClaw
- Upstream: OpenClaw (keep as-is in env vars, Docker, binary refs)
- Path prefix: `@TeamClaw/`
- SSM prefix: `/tc/`
- Stack prefix: `ProdTc` / `DevTc`
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md with development guide"
```

---

## Phase 5: Angular Fixes (I-7, M-5)

### Task 13: Add `withComponentInputBinding()` to enterprise-chat (I-7)

**Files:**
- Modify: `apps/enterprise-chat/src/app/app.config.ts`

**Step 1: Find and update app.config.ts**

Add `withComponentInputBinding()` to `provideRouter()`:

```typescript
import { withComponentInputBinding } from '@angular/router';

// In providers array, find provideRouter and add:
provideRouter(routes, withComponentInputBinding()),
```

**Step 2: Verify build**

Run: `npx nx build enterprise-chat`
Expected: BUILD SUCCESS

**Step 3: Commit**

```bash
git add apps/enterprise-chat/src/app/app.config.ts
git commit -m "feat(enterprise-chat): add withComponentInputBinding for route param binding"
```

---

### Task 14: Add @ngrx/signals for state management (M-5)

**Files:**
- Install: `@ngrx/signals`

**Step 1: Install**

Run: `yarn add @ngrx/signals`

**Step 2: Commit**

```bash
git add package.json yarn.lock
git commit -m "chore: add @ngrx/signals for Angular state management"
```

**Note:** Actual migration of services to @ngrx/signals pattern (like Affiora's `signalState`, `patchState`, `rxMethod`) should be done incrementally per-feature. This task just installs the dependency.

---

## Phase 6: Pin Versions (M-4)

### Task 15: Pin exact versions in package.json

**Files:**
- Modify: `package.json`

**Step 1: Remove `^` and `~` prefixes from all dependency versions**

For example:
- `"@angular/core": "^21.1.3"` → `"@angular/core": "21.1.3"`
- `"rxjs": "~7.8.0"` → `"rxjs": "7.8.0"`
- `"zone.js": "~0.15.0"` → `"zone.js": "0.15.0"`

Apply to ALL entries in `dependencies`, `devDependencies`, and `optionalDependencies`.

**Step 2: Verify install**

Run: `yarn install`
Expected: No errors

**Step 3: Commit**

```bash
git add package.json yarn.lock
git commit -m "chore: pin exact versions in package.json"
```

---

## Summary — Task Execution Order

| # | Task | Issues Fixed | Dependencies |
|---|------|-------------|--------------|
| 1 | Scaffold cloud-function lib | C-1 | None |
| 2 | Logger | M-3 | Task 1 |
| 3 | Lambda helper + decorator | C-1, C-2, C-3, I-5 | Task 2 |
| 4 | Install lib-dynamodb | I-6 | None |
| 5 | Migrate get-stats (template) | C-4, I-6 | Task 3, 4 |
| 6 | Migrate remaining handlers | C-4, I-6 | Task 5 |
| 7 | Scope IAM policies | C-5 | None |
| 8 | DynamoDB Table V1 → V2 | I-1 | None |
| 9 | Move CDK to devDeps | I-8, I-9 | None |
| 10 | ESLint flat config | I-4 | None |
| 11 | Fix .gitignore | M-1 | None |
| 12 | Create CLAUDE.md | M-2 | None |
| 13 | withComponentInputBinding | I-7 | None |
| 14 | Install @ngrx/signals | M-5 | None |
| 15 | Pin exact versions | M-4 | None |

**Deferred items (too disruptive for this iteration):**
- **I-2: Migrate key-pool-proxy from RestApi V1 to HttpApi V2** — Requires URL change propagated to all containers. Do in a separate PR after handler migration is stable.
- **I-3: Move frontend apps into numbered group folders** — Requires Nx project.json updates, CI changes, import path changes. Do in a separate PR.
