# Team Mode MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable self-service Team Mode — employees login with company email, auto-provision, auto-start, with admin only doing initial config.

**Architecture:** New Session Lambda handles user lifecycle on chat login. Admin panel gets "Add Config" and "Add Member" features. Chat app gets a waiting screen during provisioning.

**Tech Stack:** Angular 21, AWS Lambda (Node.js), DynamoDB, CDK, Affiora cloud-function patterns

---

### Task 1: Session Lambda — `POST /user/session`

**Files:**
- Create: `libs/teamclaw/backend-infra/src/lambda/session/user-session.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/session/user-session.spec.ts`

**Context:** This Lambda is called by the Chat App (not the admin API). It uses the same Cognito user pool as the chat app. It checks if the user exists in DynamoDB, auto-registers if the email domain is allowed, and ensures their container is running.

**Step 1: Write the spec**

```typescript
// user-session.spec.ts
const mockDdbSend = jest.fn();
const mockLambdaSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDdbSend })),
  GetItemCommand: jest.fn((input: any) => ({ input })),
  PutItemCommand: jest.fn((input: any) => ({ input })),
  ScanCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn(() => ({ send: mockLambdaSend })),
  InvokeCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('@TeamClaw/teamclaw/cloud-function', () => {
  const actual = jest.requireActual('@TeamClaw/teamclaw/cloud-function');
  return {
    ...actual,
    adminLambdaHandlerDecorator: (method: string, fn: any) => {
      return async (event: any, context: any) => {
        try {
          const input = {
            raw: event,
            queryStringParameters: event.queryStringParameters,
            pathParameters: event.pathParameters,
            body: event.body ? JSON.parse(event.body) : undefined,
          };
          const result = await fn(input);
          return {
            statusCode: result.status,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(result.body),
          };
        } catch (error: any) {
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ message: error.message || 'Internal server error' }),
          };
        }
      };
    },
    validateRequiredEnvVars: jest.fn(),
  };
});

process.env['USERS_TABLE_NAME'] = 'UsersTable';
process.env['CONFIG_TABLE_NAME'] = 'ConfigTable';
process.env['LIFECYCLE_LAMBDA_NAME'] = 'LifecycleLambda';

import { handler } from './user-session';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {}): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'POST /user/session',
    rawPath: '/user/session',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method: 'POST', path: '/user/session', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      accountId: '123456789012', apiId: 'test', domainName: 'test', domainPrefix: 'test',
      requestId: 'test', routeKey: 'POST /user/session', stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000', timeEpoch: 0,
      authorizer: { jwt: { claims: { sub: 'user-123', email: 'alice@company.com' }, scopes: [] } },
    },
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    ...overrides,
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

const invoke = async (event = makeEvent()) =>
  (await (handler as any)(event, {} as Context)) as {
    statusCode: number; headers: any; body: string;
  };

describe('user-session handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return ready with wsEndpoint when user exists and is running', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Item: {
        userId: { S: 'user-123' },
        email: { S: 'alice@company.com' },
        status: { S: 'running' },
        taskArn: { S: 'arn:aws:ecs:...' },
      },
    });
    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ready');
  });

  it('should start container when user exists but is stopped', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Item: {
        userId: { S: 'user-123' },
        email: { S: 'alice@company.com' },
        status: { S: 'stopped' },
      },
    });
    mockLambdaSend.mockResolvedValueOnce({
      Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: '{"message":"started"}' })),
    });
    const res = await invoke();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('starting');
    expect(mockLambdaSend).toHaveBeenCalledTimes(1);
  });

  it('should auto-register and provision when user does not exist and domain is allowed', async () => {
    // GetItem returns no user
    mockDdbSend
      .mockResolvedValueOnce({ Item: undefined })
      // Scan for allowedDomains config
      .mockResolvedValueOnce({
        Items: [
          { scopeKey: { S: 'global#default' }, configKey: { S: 'allowedDomains' }, value: { S: '["company.com"]' } },
          { scopeKey: { S: 'global#default' }, configKey: { S: 'defaultTeamId' }, value: { S: '"team-default"' } },
        ],
      })
      // PutItem for new user
      .mockResolvedValueOnce({});
    // Lifecycle provision+start
    mockLambdaSend.mockResolvedValueOnce({
      Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: '{"message":"provisioned"}' })),
    });
    const res = await invoke();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('provisioning');
  });

  it('should return 403 when domain is not allowed', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({
        Items: [
          { scopeKey: { S: 'global#default' }, configKey: { S: 'allowedDomains' }, value: { S: '["other.com"]' } },
        ],
      });
    const res = await invoke();
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toContain('IT');
  });

  it('should return 403 when no allowedDomains config exists', async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({ Items: [] });
    const res = await invoke();
    expect(res.statusCode).toBe(403);
  });
});
```

**Step 2: Write the implementation**

```typescript
// user-session.ts
import { DynamoDBClient, GetItemCommand, PutItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
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
  const result = await ddb.send(new ScanCommand({
    TableName: CONFIG_TABLE,
    FilterExpression: 'begins_with(scopeKey, :scope)',
    ExpressionAttributeValues: { ':scope': { S: 'global#' } },
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
    InvocationType: 'Event', // async — don't wait
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
  const defaultTeamId = globalConfig['defaultTeamId']
    ? JSON.parse(globalConfig['defaultTeamId'])
    : undefined;

  await ddb.send(new PutItemCommand({
    TableName: USERS_TABLE,
    Item: {
      userId: { S: sub },
      email: { S: email },
      status: { S: 'provisioning' },
      ...(defaultTeamId ? { teamId: { S: defaultTeamId } } : {}),
      createdAt: { S: new Date().toISOString() },
    },
  }));

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

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.POST,
  handlerFn,
);
```

**Step 3: Run tests**

Run: `npx jest libs/teamclaw/backend-infra/src/lambda/session/user-session.spec.ts --no-coverage`
Expected: All 5 tests pass

**Step 4: Commit**

```bash
git add libs/teamclaw/backend-infra/src/lambda/session/
git commit -m "feat: add user-session Lambda for self-service auto-provision"
```

---

### Task 2: CDK — Wire Session Lambda + API Route

**Files:**
- Modify: `libs/teamclaw/backend-infra/src/stack/admin/admin-lambda.stack.ts` — add Session Lambda
- Modify: `libs/teamclaw/backend-infra/src/stack/admin/admin-api-gateway-route.stack.ts` — add `POST /user/session` route

**Context:** The Session Lambda needs access to: USERS_TABLE, CONFIG_TABLE, LIFECYCLE_LAMBDA. It uses the **chat app's Cognito authorizer** (not the admin one). Since the chat Cognito pool is in the control-plane stack, this Lambda's API route needs a separate JWT authorizer pointed at the chat Cognito pool.

**Step 1: Add the Lambda to AdminLambdaStack**

Add a new Lambda function for user-session, following the exact same pattern as other Lambda definitions in the stack. Give it env vars: `USERS_TABLE_NAME`, `CONFIG_TABLE_NAME`, `LIFECYCLE_LAMBDA_NAME`, `DEPLOY_ENV`. Grant it read/write on USERS_TABLE and CONFIG_TABLE, plus invoke on LIFECYCLE_LAMBDA.

**Step 2: Add the API route**

Add `POST /user/session` route to AdminApiGatewayRouteStack. This route needs to use the **chat app Cognito JWT authorizer** (user pool from control-plane stack, read via SSM). Create a second `HttpJwtAuthorizer` that points to the chat Cognito user pool's issuer URL.

**Step 3: Run CDK synth to verify**

Run: `npx nx synth teamclaw-admin-infra --configuration=dev`
Expected: Synthesizes without errors

**Step 4: Run tests**

Run: `npx nx test lib-teamclaw-backend-infra --no-cache`
Expected: All tests pass

**Step 5: Commit**

```bash
git commit -m "feat(infra): wire user-session Lambda and API route with chat Cognito authorizer"
```

---

### Task 3: Admin Config — Add "New Config Entry" Button

**Files:**
- Modify: `apps/web-admin/src/app/features/config/config.component.ts`
- Create: `apps/web-admin/src/app/features/config/config-add-dialog.component.ts`

**Context:** Currently the Config page only has edit buttons. We need an "Add Config" button above each table that opens a dialog to create a new key-value pair. The dialog has a key input (free text) and a value textarea.

**Step 1: Create ConfigAddDialogComponent**

```typescript
// config-add-dialog.component.ts
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'tc-config-add-dialog',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Add Config Entry</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Key</mat-label>
        <input matInput [(ngModel)]="key" placeholder="e.g. allowedDomains" />
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Value</mat-label>
        <textarea matInput [(ngModel)]="value" rows="4" placeholder='e.g. ["company.com"]'></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" [disabled]="!key().trim()" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`.full-width { width: 100%; margin-bottom: 8px; }`],
})
export class ConfigAddDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ConfigAddDialogComponent>);
  readonly key = signal('');
  readonly value = signal('');

  save(): void {
    this.dialogRef.close({ configKey: this.key().trim(), value: this.value() });
  }
}
```

**Step 2: Add button to ConfigComponent**

In `config.component.ts`, add an "Add Config" button above each tab's table. Import `ConfigAddDialogComponent`. Add an `addConfig()` method that opens the dialog and calls `saveConfig()` on close.

Add this button in each tab, right before the `<mat-card>`:

```html
<div class="tab-actions">
  <button mat-raised-button color="primary" (click)="addConfig()">
    <mat-icon>add</mat-icon> Add Config
  </button>
</div>
```

And the method:

```typescript
addConfig(): void {
  const dialogRef = this.dialog.open(ConfigAddDialogComponent, { width: '480px' });
  dialogRef.afterClosed().subscribe((result) => {
    if (result) this.saveConfig(result);
  });
}
```

**Step 3: Run and verify in browser**

Run: `npx nx serve web-admin`
Expected: Each tab has "Add Config" button, opens dialog, saves correctly

**Step 4: Commit**

```bash
git commit -m "feat(admin): add 'Add Config' dialog to config page"
```

---

### Task 4: Admin Team Detail — Add Member

**Files:**
- Modify: `apps/web-admin/src/app/features/team-detail/team-detail.component.ts`

**Context:** The Team Detail page currently only has "remove member". We need an "Add Member" button that opens a dialog or dropdown to select a user from the users list (filtered to users NOT in any team or in this team).

**Step 1: Add member selection UI**

Add to the template, above the Members table:

```html
<div class="member-actions">
  <mat-form-field appearance="outline" class="member-select">
    <mat-label>Add Member</mat-label>
    <mat-select [(ngModel)]="selectedUserId">
      @for (user of availableUsers(); track user.userId) {
        <mat-option [value]="user.userId">{{ user.email }}</mat-option>
      }
    </mat-select>
  </mat-form-field>
  <button mat-raised-button color="primary" [disabled]="!selectedUserId" (click)="addMember()">
    <mat-icon>person_add</mat-icon> Add
  </button>
</div>
```

**Step 2: Add the logic**

```typescript
readonly availableUsers = signal<AdminUser[]>([]);
selectedUserId = '';

// In loadTeam, after loading team, load available users:
private loadAvailableUsers(team: Team): void {
  this.adminApi.queryUsers({ limit: 100 }).subscribe({
    next: (res) => {
      const memberSet = new Set(team.memberIds ?? []);
      this.availableUsers.set(res.users.filter(u => !memberSet.has(u.userId)));
    },
  });
}

addMember(): void {
  if (!this.selectedUserId) return;
  const currentTeam = this.team();
  if (!currentTeam) return;
  const updatedIds = [...(currentTeam.memberIds ?? []), this.selectedUserId];
  this.adminApi.updateTeam(currentTeam.teamId, { memberIds: updatedIds }).subscribe({
    next: () => {
      this.selectedUserId = '';
      this.loadTeam(currentTeam.teamId);
    },
  });
}
```

Call `this.loadAvailableUsers(team)` after `this.loadMembers(team)` in `loadTeam()`.

**Step 3: Commit**

```bash
git commit -m "feat(admin): add member to team from team detail page"
```

---

### Task 5: Replace Native confirm() with ConfirmDialogComponent

**Files:**
- Modify: `apps/web-admin/src/app/features/team-detail/team-detail.component.ts` — `removeMember()`
- Modify: `apps/web-admin/src/app/features/teams/teams.component.ts` — `deleteTeam()`
- Modify: `apps/web-admin/src/app/features/api-keys/api-keys.component.ts` — `removeKey()`

**Context:** `ConfirmDialogComponent` already exists at `apps/web-admin/src/app/shared/confirm-dialog.component.ts` but is never used. Replace all `confirm()` calls.

**Step 1: Replace in each file**

Pattern to replace:

```typescript
// Before:
if (!confirm(`Remove ${member.email} from team?`)) return;

// After:
const dialogRef = this.dialog.open(ConfirmDialogComponent, {
  data: {
    title: 'Remove Member',
    message: `Remove ${member.email} from this team?`,
    confirmText: 'Remove',
    confirmColor: 'warn',
    icon: 'person_remove',
  },
});
dialogRef.afterClosed().subscribe((confirmed) => {
  if (!confirmed) return;
  // ... existing logic
});
```

Add `MatDialog` import and inject to each component. Import `ConfirmDialogComponent` and `ConfirmDialogData`.

**Step 2: Commit**

```bash
git commit -m "feat(admin): replace native confirm() with ConfirmDialogComponent"
```

---

### Task 6: Chat App — Session Init + Waiting Screen

**Files:**
- Create: `apps/web-chat/src/app/services/session.service.ts`
- Create: `apps/web-chat/src/app/pages/session-init/session-init.component.ts`
- Modify: `apps/web-chat/src/app/pages/chat/chat.component.ts`
- Modify: `apps/web-chat/src/app/app.routes.ts`

**Context:** After login, the chat app calls `POST /user/session`. If the response status is not `ready`, show a waiting screen that polls every 3 seconds until ready.

**Step 1: Create SessionService**

```typescript
// session.service.ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SessionResponse {
  status: 'ready' | 'starting' | 'provisioning';
  userId: string;
  message?: string;
  estimatedWaitSeconds?: number;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);

  initSession(): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(
      `${environment.adminApiUrl}/user/session`,
      {},
    );
  }
}
```

**Step 2: Create SessionInitComponent**

A page that calls `initSession()` on load. If `status === 'ready'` → navigate to `/chat`. Otherwise show a spinner with the message and poll every 3 seconds.

```typescript
// session-init.component.ts — waiting screen
// Shows: spinner + "Setting up your workspace..." or "Starting your assistant..."
// Polls POST /user/session every 3s
// On 'ready' → router.navigate(['/chat'])
// On 403 → show error "Contact your IT admin"
```

**Step 3: Update chat.component.ts**

Remove the direct `ws.connect()` from `ngOnInit()`. Instead, check that the session is `ready` (via a route guard or by navigating through session-init first).

**Step 4: Update routes**

Add `/session` route → `SessionInitComponent`. Make the auth guard redirect to `/session` instead of directly to `/chat` after login.

**Step 5: Commit**

```bash
git commit -m "feat(chat): add session init with auto-provision waiting screen"
```

---

### Task 7: Deploy and Verify

**Step 1: Run all tests**

```bash
npx nx test lib-teamclaw-backend-infra --no-cache
npx nx test lib-teamclaw-cloud-function --no-cache
```

**Step 2: Deploy**

```bash
npx nx deploy teamclaw-admin-infra --configuration=dev
```

**Step 3: Seed default config**

Via the admin panel Config page, add these global entries:
- `allowedDomains` → `["your-company-domain.com"]`
- `defaultTeamId` → (the team ID from Teams page)
- `idleTimeoutMinutes` → `30`

**Step 4: Test the flow**

1. Open chat app → login with company email
2. Should see "First time setup, please wait..."
3. After ~30-60s → chat ready
4. Stop container via admin → re-login → "Starting your assistant..."
5. After ~15s → chat ready

**Step 5: Commit and push**

```bash
git push
```
