# Admin Onboarding + Chat Self-Registration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Admin onboarding wizard for first-time setup + chat app self-registration so employees can sign up and use OpenClaw without IT intervention.

**Architecture:** New onboarding status Lambda checks config completeness. Dashboard component conditionally renders onboarding wizard (Mat-Stepper) or normal stats. Chat Cognito pool enables self-signup; chat app adds signup + verify pages.

**Tech Stack:** Angular 21, AWS Lambda (Node.js), CDK, DynamoDB, Cognito, Material Stepper

---

### Task 1: Onboarding Status Lambda — `GET /admin/onboarding/status`

**Files:**
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/onboarding/get-onboarding-status.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/onboarding/get-onboarding-status.spec.ts`

**Context:** This Lambda checks whether the system has been configured enough for OpenClaw to work. It reads from: Secrets Manager (API keys), Teams DynamoDB table (at least one team), Config DynamoDB table (allowedDomains, defaultTeamId).

**Step 1: Write the spec**

```typescript
// get-onboarding-status.spec.ts
const mockDdbSend = jest.fn();
const mockSmSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDdbSend })),
  ScanCommand: jest.fn((input: any) => ({ input })),
  QueryCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => ({ send: mockSmSend })),
  GetSecretValueCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('@TeamClaw/teamclaw/cloud-function', () => {
  const actual = jest.requireActual('@TeamClaw/teamclaw/cloud-function');
  return {
    ...actual,
    adminLambdaHandlerDecorator: (method: string, fn: any) => {
      return async (event: any, context: any) => {
        const input = {
          raw: event,
          queryStringParameters: event.queryStringParameters,
          pathParameters: event.pathParameters,
        };
        const result = await fn(input);
        return {
          statusCode: result.status,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(result.body),
        };
      };
    },
    validateRequiredEnvVars: jest.fn(),
  };
});

process.env['TEAMS_TABLE_NAME'] = 'TeamsTable';
process.env['CONFIG_TABLE_NAME'] = 'ConfigTable';
process.env['API_KEYS_SECRET_ARN'] = 'arn:aws:secretsmanager:us-west-1:123:secret:test';

import { handler } from './get-onboarding-status';
import type { Context } from 'aws-lambda';

const makeEvent = () => ({
  version: '2.0',
  routeKey: 'GET /admin/onboarding/status',
  rawPath: '/admin/onboarding/status',
  rawQueryString: '',
  headers: {},
  requestContext: {
    http: { method: 'GET', path: '/admin/onboarding/status', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
    accountId: '123', apiId: 'test', domainName: 'test', domainPrefix: 'test',
    requestId: 'test', routeKey: 'GET /admin/onboarding/status', stage: '$default',
    time: '01/Jan/2026:00:00:00 +0000', timeEpoch: 0,
    authorizer: { jwt: { claims: { sub: 'admin-1' }, scopes: [] } },
  },
  isBase64Encoded: false,
});

const invoke = async () =>
  (await (handler as any)(makeEvent(), {} as Context)) as { statusCode: number; body: string };

describe('get-onboarding-status', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return complete: true when all steps are done', async () => {
    // API keys exist
    mockSmSend.mockResolvedValueOnce({
      SecretString: JSON.stringify({ anthropic: ['sk-test'] }),
    });
    // Teams scan returns items
    mockDdbSend.mockResolvedValueOnce({ Count: 1 });
    // Config query returns allowedDomains and defaultTeamId
    mockDdbSend.mockResolvedValueOnce({
      Items: [
        { configKey: { S: 'allowedDomains' }, value: { S: '["company.com"]' } },
        { configKey: { S: 'defaultTeamId' }, value: { S: '"team-1"' } },
      ],
    });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.complete).toBe(true);
    expect(body.steps.apiKey).toBe(true);
    expect(body.steps.team).toBe(true);
    expect(body.steps.allowedDomains).toBe(true);
    expect(body.steps.defaultTeamId).toBe(true);
  });

  it('should return complete: false when no API keys', async () => {
    mockSmSend.mockResolvedValueOnce({ SecretString: '{}' });
    mockDdbSend.mockResolvedValueOnce({ Count: 0 });
    mockDdbSend.mockResolvedValueOnce({ Items: [] });

    const res = await invoke();
    const body = JSON.parse(res.body);
    expect(body.complete).toBe(false);
    expect(body.steps.apiKey).toBe(false);
  });

  it('should handle Secrets Manager error gracefully', async () => {
    mockSmSend.mockRejectedValueOnce(new Error('Access denied'));
    mockDdbSend.mockResolvedValueOnce({ Count: 0 });
    mockDdbSend.mockResolvedValueOnce({ Items: [] });

    const res = await invoke();
    const body = JSON.parse(res.body);
    expect(body.steps.apiKey).toBe(false);
  });
});
```

**Step 2: Write the implementation**

```typescript
// get-onboarding-status.ts
import { DynamoDBClient, ScanCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars({
  TEAMS_TABLE_NAME: process.env['TEAMS_TABLE_NAME'],
  CONFIG_TABLE_NAME: process.env['CONFIG_TABLE_NAME'],
  API_KEYS_SECRET_ARN: process.env['API_KEYS_SECRET_ARN'],
});

const ddb = new DynamoDBClient({});
const sm = new SecretsManagerClient({});
const TEAMS_TABLE = process.env['TEAMS_TABLE_NAME']!;
const CONFIG_TABLE = process.env['CONFIG_TABLE_NAME']!;
const API_KEYS_SECRET_ARN = process.env['API_KEYS_SECRET_ARN']!;

const handlerFn = async (
  _request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  // Check API keys
  let hasApiKeys = false;
  try {
    const secret = await sm.send(new GetSecretValueCommand({ SecretId: API_KEYS_SECRET_ARN }));
    const keys = JSON.parse(secret.SecretString || '{}');
    hasApiKeys = Object.values(keys).some((arr: any) => Array.isArray(arr) && arr.length > 0);
  } catch {
    hasApiKeys = false;
  }

  // Check teams
  const teamsResult = await ddb.send(new ScanCommand({
    TableName: TEAMS_TABLE,
    Select: 'COUNT',
    Limit: 1,
  }));
  const hasTeam = (teamsResult.Count ?? 0) > 0;

  // Check global config
  const configResult = await ddb.send(new QueryCommand({
    TableName: CONFIG_TABLE,
    KeyConditionExpression: 'scopeKey = :sk',
    ExpressionAttributeValues: { ':sk': { S: 'global#default' } },
  }));

  let hasAllowedDomains = false;
  let hasDefaultTeamId = false;
  for (const item of configResult.Items ?? []) {
    const key = item['configKey']?.S;
    const value = item['value']?.S;
    if (key === 'allowedDomains' && value) {
      try {
        const domains = JSON.parse(value);
        hasAllowedDomains = Array.isArray(domains) && domains.length > 0;
      } catch { /* ignore */ }
    }
    if (key === 'defaultTeamId' && value) {
      try {
        const teamId = JSON.parse(value);
        hasDefaultTeamId = typeof teamId === 'string' && teamId.length > 0;
      } catch { /* ignore */ }
    }
  }

  const steps = { apiKey: hasApiKeys, team: hasTeam, allowedDomains: hasAllowedDomains, defaultTeamId: hasDefaultTeamId };
  const complete = Object.values(steps).every(Boolean);

  return {
    status: HttpStatusCode.SUCCESS,
    body: { complete, steps },
  };
};

export const handler = adminLambdaHandlerDecorator(HandlerMethod.GET, handlerFn);
```

**Step 3: Run tests**

Run: `npx jest libs/teamclaw/backend-infra/src/lambda/admin/onboarding/get-onboarding-status.spec.ts --no-coverage`
Expected: All 3 tests pass

**Step 4: Commit**

```bash
git add libs/teamclaw/backend-infra/src/lambda/admin/onboarding/
git commit -m "feat: add onboarding status Lambda"
```

---

### Task 2: CDK — Wire Onboarding Status Lambda + Route

**Files:**
- Modify: `libs/core/cloud-config/src/ssm/ssm.ts` — add `GET_ONBOARDING_STATUS_LAMBDA_NAME`
- Modify: `libs/teamclaw/backend-infra/src/stack/admin/admin-lambda.stack.ts` — add Lambda
- Modify: `libs/teamclaw/backend-infra/src/stack/admin/admin-api-gateway-route.stack.ts` — add route

**Step 1: Add SSM constant**

In `libs/core/cloud-config/src/ssm/ssm.ts`, add to both PROD and DEV `ADMIN_API.LAMBDA` sections:
```typescript
        // Onboarding
        GET_ONBOARDING_STATUS_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/getOnboardingStatusLambdaName`,
```
(Same pattern for DEV with `ENVIRONMENT.DEV`)

**Step 2: Add Lambda to AdminLambdaStack**

After the Session Lambda section, add:
```typescript
    // ==========================================================
    // Onboarding Lambda (1)
    // ==========================================================
    const getOnboardingStatusLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'GetOnboardingStatusLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(LAMBDA_ENTRY_PATH, 'admin', 'onboarding', 'get-onboarding-status.ts'),
        environment: {
          ...baseEnv,
          TEAMS_TABLE_NAME: teamsTableName,
          CONFIG_TABLE_NAME: configTableName,
          API_KEYS_SECRET_ARN: apiKeysSecret.secretArn,
        },
      },
    );
    teamsTable.grantReadData(getOnboardingStatusLambda);
    configTable.grantReadData(getOnboardingStatusLambda);
    apiKeysSecret.grantRead(getOnboardingStatusLambda);

    new aws_ssm.StringParameter(this, id + 'GetOnboardingStatusLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.GET_ONBOARDING_STATUS_LAMBDA_NAME,
      stringValue: getOnboardingStatusLambda.functionName,
    });
```

**Step 3: Add route**

In `admin-api-gateway-route.stack.ts`, add at the end (before closing `}`):
```typescript
    // ==========================================================
    // ONBOARDING ROUTES
    // ==========================================================
    addRoute(
      'GetOnboardingStatus',
      HttpMethod.GET,
      '/admin/onboarding/status',
      getLambda('GetOnboardingStatusLambda', ADMIN_LAMBDA_SSM.GET_ONBOARDING_STATUS_LAMBDA_NAME),
    );
```

**Step 4: Update tests**

Update `admin-lambda.stack.spec.ts` Lambda count from 29 to 30, add SSM param name.
Update `admin-api-gateway-route.stack.spec.ts` route count from 29 to 30, add path.

**Step 5: Run tests**

Run: `npx nx test lib-teamclaw-backend-infra --no-cache`
Expected: All tests pass

**Step 6: Commit**

```bash
git add libs/core/cloud-config/src/ssm/ssm.ts libs/teamclaw/backend-infra/src/stack/
git commit -m "feat(infra): wire onboarding status Lambda and API route"
```

---

### Task 3: Admin API Service — Add Onboarding Methods

**Files:**
- Modify: `apps/web-admin/src/app/services/admin-api.service.ts`

**Step 1: Add interface and method**

Add interface near the top types section:
```typescript
export interface OnboardingStatus {
  complete: boolean;
  steps: {
    apiKey: boolean;
    team: boolean;
    allowedDomains: boolean;
    defaultTeamId: boolean;
  };
}
```

Add method to `AdminApiService` class:
```typescript
  getOnboardingStatus(): Observable<OnboardingStatus> {
    return this.http.get<OnboardingStatus>(`${this.baseUrl}/admin/onboarding/status`);
  }
```

**Step 2: Commit**

```bash
git add apps/web-admin/src/app/services/admin-api.service.ts
git commit -m "feat(admin): add onboarding status API method"
```

---

### Task 4: Admin Onboarding Wizard Component

**Files:**
- Create: `apps/web-admin/src/app/features/dashboard/onboarding-wizard.component.ts`
- Modify: `apps/web-admin/src/app/features/dashboard/dashboard.component.ts`

**Step 1: Create OnboardingWizardComponent**

```typescript
// onboarding-wizard.component.ts
import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatStepperModule } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  AdminApiService,
  OnboardingStatus,
} from '../../services/admin-api.service';

@Component({
  selector: 'tc-onboarding-wizard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="onboarding-container">
      <h1>Welcome to TeamClaw</h1>
      <p class="subtitle">Let's set up your AI workspace. This only takes a minute.</p>

      <mat-stepper [linear]="true" #stepper>
        <!-- Step 1: API Key -->
        <mat-step [completed]="steps().apiKey" [editable]="!steps().apiKey">
          <ng-template matStepLabel>Add API Key</ng-template>
          <div class="step-content">
            <p>Add at least one AI provider API key so OpenClaw can function.</p>
            @if (steps().apiKey) {
              <div class="step-done">
                <mat-icon>check_circle</mat-icon>
                <span>API key configured</span>
              </div>
            } @else {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Provider</mat-label>
                <mat-select [(ngModel)]="apiKeyProvider">
                  <mat-option value="anthropic">Anthropic</mat-option>
                  <mat-option value="openai">OpenAI</mat-option>
                  <mat-option value="google">Google</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>API Key</mat-label>
                <input matInput [(ngModel)]="apiKeyValue" type="password" />
              </mat-form-field>
              <button mat-raised-button color="primary"
                [disabled]="!apiKeyProvider || !apiKeyValue || saving()"
                (click)="saveApiKey()">
                @if (saving()) { <mat-spinner diameter="20" /> } @else { Save Key }
              </button>
            }
            @if (stepError()) {
              <p class="error">{{ stepError() }}</p>
            }
            <div class="step-actions">
              <button mat-button matStepperNext [disabled]="!steps().apiKey">Next</button>
            </div>
          </div>
        </mat-step>

        <!-- Step 2: Create Team -->
        <mat-step [completed]="steps().team" [editable]="!steps().team">
          <ng-template matStepLabel>Create Team</ng-template>
          <div class="step-content">
            <p>Create your first team. Employees will be auto-assigned to this team.</p>
            @if (steps().team) {
              <div class="step-done">
                <mat-icon>check_circle</mat-icon>
                <span>Team created</span>
              </div>
            } @else {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Team Name</mat-label>
                <input matInput [(ngModel)]="teamName" placeholder="e.g. Engineering" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Description (optional)</mat-label>
                <textarea matInput [(ngModel)]="teamDescription" rows="2"></textarea>
              </mat-form-field>
              <button mat-raised-button color="primary"
                [disabled]="!teamName || saving()"
                (click)="saveTeam()">
                @if (saving()) { <mat-spinner diameter="20" /> } @else { Create Team }
              </button>
            }
            @if (stepError()) {
              <p class="error">{{ stepError() }}</p>
            }
            <div class="step-actions">
              <button mat-button matStepperPrevious>Back</button>
              <button mat-button matStepperNext [disabled]="!steps().team">Next</button>
            </div>
          </div>
        </mat-step>

        <!-- Step 3: Allowed Domains -->
        <mat-step [completed]="steps().allowedDomains && steps().defaultTeamId">
          <ng-template matStepLabel>Set Allowed Domains</ng-template>
          <div class="step-content">
            <p>Enter your company email domain. Employees with this domain can self-register and use OpenClaw.</p>
            @if (steps().allowedDomains && steps().defaultTeamId) {
              <div class="step-done">
                <mat-icon>check_circle</mat-icon>
                <span>Domain configured</span>
              </div>
            } @else {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Company Email Domain</mat-label>
                <input matInput [(ngModel)]="emailDomain" placeholder="company.com" />
              </mat-form-field>
              <button mat-raised-button color="primary"
                [disabled]="!emailDomain || saving()"
                (click)="saveDomainConfig()">
                @if (saving()) { <mat-spinner diameter="20" /> } @else { Save }
              </button>
            }
            @if (stepError()) {
              <p class="error">{{ stepError() }}</p>
            }
            <div class="step-actions">
              <button mat-button matStepperPrevious>Back</button>
              <button mat-button matStepperNext
                [disabled]="!steps().allowedDomains || !steps().defaultTeamId">Next</button>
            </div>
          </div>
        </mat-step>

        <!-- Step 4: Done -->
        <mat-step>
          <ng-template matStepLabel>Done</ng-template>
          <div class="step-content done-content">
            <mat-icon class="done-icon">celebration</mat-icon>
            <h2>You're all set!</h2>
            <p>TeamClaw is ready. Employees can now sign up with their company email and start using AI.</p>
            <button mat-raised-button color="primary" (click)="onComplete.emit()">
              Go to Dashboard
            </button>
          </div>
        </mat-step>
      </mat-stepper>
    </div>
  `,
  styles: [`
    .onboarding-container { padding: 24px; max-width: 720px; margin: 0 auto; }
    h1 { margin-bottom: 8px; }
    .subtitle { color: var(--mat-sys-on-surface-variant); margin-bottom: 32px; }
    .step-content { padding: 16px 0; max-width: 480px; }
    .step-actions { display: flex; gap: 8px; margin-top: 24px; }
    .full-width { width: 100%; }
    .step-done { display: flex; align-items: center; gap: 8px; color: var(--mat-sys-primary); margin: 16px 0; }
    .error { color: var(--mat-sys-error); margin-top: 8px; }
    .done-content { text-align: center; padding: 32px 0; }
    .done-icon { font-size: 64px; width: 64px; height: 64px; color: var(--mat-sys-primary); }
  `],
})
export class OnboardingWizardComponent {
  private readonly adminApi = inject(AdminApiService);

  readonly steps = signal({ apiKey: false, team: false, allowedDomains: false, defaultTeamId: false });
  readonly saving = signal(false);
  readonly stepError = signal('');
  readonly onComplete = output();

  // Step 1
  apiKeyProvider = '';
  apiKeyValue = '';

  // Step 2
  teamName = '';
  teamDescription = '';
  private createdTeamId = '';

  // Step 3
  emailDomain = '';

  /** Called by parent to set initial status */
  setStatus(status: OnboardingStatus): void {
    this.steps.set({ ...status.steps });
  }

  saveApiKey(): void {
    this.saving.set(true);
    this.stepError.set('');
    this.adminApi.addApiKey({ provider: this.apiKeyProvider, key: this.apiKeyValue }).subscribe({
      next: () => {
        this.steps.update(s => ({ ...s, apiKey: true }));
        this.saving.set(false);
      },
      error: (err) => {
        this.stepError.set(err.error?.message || 'Failed to save API key');
        this.saving.set(false);
      },
    });
  }

  saveTeam(): void {
    this.saving.set(true);
    this.stepError.set('');
    this.adminApi.createTeam({ name: this.teamName, description: this.teamDescription }).subscribe({
      next: (team) => {
        this.createdTeamId = team.teamId;
        this.steps.update(s => ({ ...s, team: true }));
        this.saving.set(false);
      },
      error: (err) => {
        this.stepError.set(err.error?.message || 'Failed to create team');
        this.saving.set(false);
      },
    });
  }

  saveDomainConfig(): void {
    this.saving.set(true);
    this.stepError.set('');
    const domain = this.emailDomain.trim().toLowerCase();

    // Save allowedDomains
    this.adminApi.updateGlobalConfig({ configKey: 'allowedDomains', value: JSON.stringify([domain]) }).subscribe({
      next: () => {
        this.steps.update(s => ({ ...s, allowedDomains: true }));
        // Save defaultTeamId
        if (this.createdTeamId) {
          this.adminApi.updateGlobalConfig({ configKey: 'defaultTeamId', value: JSON.stringify(this.createdTeamId) }).subscribe({
            next: () => {
              this.steps.update(s => ({ ...s, defaultTeamId: true }));
              this.saving.set(false);
            },
            error: (err) => {
              this.stepError.set(err.error?.message || 'Failed to set default team');
              this.saving.set(false);
            },
          });
        } else {
          this.saving.set(false);
        }
      },
      error: (err) => {
        this.stepError.set(err.error?.message || 'Failed to save domain config');
        this.saving.set(false);
      },
    });
  }
}
```

**Step 2: Modify Dashboard to show wizard when onboarding incomplete**

In `apps/web-admin/src/app/features/dashboard/dashboard.component.ts`:

a) Add imports:
```typescript
import { OnboardingWizardComponent } from './onboarding-wizard.component';
import { AdminApiService, DashboardStats, OnboardingStatus } from '../../services/admin-api.service';
```

b) Add `OnboardingWizardComponent` to the `imports` array.

c) Add signal:
```typescript
readonly onboardingStatus = signal<OnboardingStatus | null>(null);
```

d) Add `ViewChild`:
```typescript
@ViewChild(OnboardingWizardComponent) wizard?: OnboardingWizardComponent;
```

e) In `ngOnInit`, before `loadStats()`, call onboarding check:
```typescript
  ngOnInit(): void {
    this.checkOnboarding();
  }

  private checkOnboarding(): void {
    this.api.getOnboardingStatus()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => {
          this.onboardingStatus.set(status);
          if (status.complete) {
            this.loadStats();
          } else {
            this.isLoading.set(false);
            // Set wizard status after view init
            setTimeout(() => this.wizard?.setStatus(status));
          }
        },
        error: () => {
          // If onboarding check fails, just load dashboard normally
          this.loadStats();
        },
      });
  }

  onOnboardingComplete(): void {
    this.onboardingStatus.set(null);
    this.loadStats();
  }
```

f) Update template — wrap existing content in a condition:
```html
    <div class="dashboard-container">
      @if (onboardingStatus() && !onboardingStatus()!.complete) {
        <tc-onboarding-wizard (onComplete)="onOnboardingComplete()" />
      } @else {
        <h1>Dashboard</h1>
        <!-- ... existing dashboard template ... -->
      }
    </div>
```

**Step 3: Commit**

```bash
git add apps/web-admin/src/app/features/dashboard/ apps/web-admin/src/app/services/admin-api.service.ts
git commit -m "feat(admin): add onboarding wizard to dashboard"
```

---

### Task 5: CDK — Enable Cognito Self-Signup

**Files:**
- Modify: `libs/teamclaw/backend-infra/src/stack/control-plane.stack.ts`

**Step 1: Change selfSignUpEnabled**

In `control-plane.stack.ts`, change line 27:
```typescript
      selfSignUpEnabled: true, // Allow employee self-registration
```

**Step 2: Run CDK synth**

Run: `npx nx synth teamclaw-control-plane-infra --configuration=dev`
Expected: Synthesizes without errors

**Step 3: Commit**

```bash
git add libs/teamclaw/backend-infra/src/stack/control-plane.stack.ts
git commit -m "feat(infra): enable Cognito self-signup for chat users"
```

---

### Task 6: Chat App — Sign Up Page

**Files:**
- Create: `apps/web-chat/src/app/pages/signup/signup.component.ts`
- Create: `apps/web-chat/src/app/pages/signup/signup.component.html`
- Create: `apps/web-chat/src/app/pages/signup/signup.component.scss`
- Modify: `apps/web-chat/src/app/services/auth.service.ts` — add `signUp()` method
- Modify: `apps/web-chat/src/app/app.routes.ts` — add `/signup` route
- Modify: `apps/web-chat/src/app/pages/login/login.component.html` — add "Sign up" link

**Context:** Uses `amazon-cognito-identity-js` (already installed). The sign up flow: `CognitoUserPool.signUp(email, password, attributes, null, callback)` → Cognito sends verification code → user enters code on verify page.

**Step 1: Add signUp and confirmRegistration to AuthService**

In `apps/web-chat/src/app/services/auth.service.ts`, add:
```typescript
  async signUp(email: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.userPool.signUp(
        email,
        password,
        [{ Name: 'email', Value: email }],
        [],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
      );
    });
  }

  async confirmRegistration(email: string, code: string): Promise<void> {
    const user = new CognitoUser({ Username: email, Pool: this.userPool });
    return new Promise((resolve, reject) => {
      user.confirmRegistration(code, true, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
```

Import `CognitoUserAttribute` from `amazon-cognito-identity-js` if needed for the attributes array.

**Step 2: Create SignupComponent**

Template (`signup.component.html`) — same visual style as login (gradient orbs, centered card):
```html
<div class="login-container">
  <div class="gradient-orbs" aria-hidden="true">
    <div class="orb orb-blue"></div>
    <div class="orb orb-cyan"></div>
    <div class="orb orb-navy"></div>
  </div>
  <div class="login-content">
    <header class="branding">
      <h1 class="brand-name">TeamClaw</h1>
      <p class="tagline">Enterprise AI Collaboration</p>
    </header>
    <section class="login-card">
      <div class="card-header">
        <h2 class="welcome-title">{{ 'Create Account' | translate }}</h2>
      </div>
      <div class="card-body">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'Email' | translate }}</mat-label>
          <input matInput type="email" autocomplete="email"
            [ngModel]="email()" (ngModelChange)="email.set($event)" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'Password' | translate }}</mat-label>
          <input matInput type="password" autocomplete="new-password"
            [ngModel]="password()" (ngModelChange)="password.set($event)" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'Confirm Password' | translate }}</mat-label>
          <input matInput type="password" autocomplete="new-password"
            [ngModel]="confirmPassword()" (ngModelChange)="confirmPassword.set($event)"
            (keyup.enter)="submitSignup()" />
        </mat-form-field>
        @if (errorMessage()) {
          <div class="error-message"><p>{{ errorMessage() }}</p></div>
        }
        <button mat-raised-button color="primary" class="submit-btn full-width"
          (click)="submitSignup()" [disabled]="isLoading()">
          @if (isLoading()) {
            <mat-spinner diameter="20"></mat-spinner>
          } @else {
            <span>{{ 'Sign Up' | translate }}</span>
          }
        </button>
      </div>
      <footer class="card-footer">
        <p class="footer-text">
          {{ 'Already have an account?' | translate }}
          <a routerLink="/login">{{ 'Sign In' | translate }}</a>
        </p>
      </footer>
    </section>
  </div>
</div>
```

Component (`signup.component.ts`):
```typescript
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'tc-signup',
  standalone: true,
  imports: [
    FormsModule, RouterLink, MatCardModule, MatInputModule,
    MatButtonModule, MatFormFieldModule, MatProgressSpinnerModule, TranslateModule,
  ],
  templateUrl: './signup.component.html',
  styleUrl: '../login/login.component.scss',
})
export class SignupComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly email = signal('');
  readonly password = signal('');
  readonly confirmPassword = signal('');
  readonly errorMessage = signal('');
  readonly isLoading = signal(false);

  async submitSignup(): Promise<void> {
    const email = this.email();
    const password = this.password();

    if (!email || !password) {
      this.errorMessage.set('Please fill in all fields');
      return;
    }
    if (password !== this.confirmPassword()) {
      this.errorMessage.set('Passwords do not match');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      await this.auth.signUp(email, password);
      this.router.navigate(['/verify'], { queryParams: { email } });
    } catch (e: unknown) {
      this.errorMessage.set(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      this.isLoading.set(false);
    }
  }
}
```

Style: reuse `login.component.scss` (same `styleUrl`).

**Step 3: Commit**

```bash
git add apps/web-chat/src/app/pages/signup/ apps/web-chat/src/app/services/auth.service.ts
git commit -m "feat(chat): add sign up page with Cognito self-registration"
```

---

### Task 7: Chat App — Verify Page

**Files:**
- Create: `apps/web-chat/src/app/pages/verify/verify.component.ts`
- Create: `apps/web-chat/src/app/pages/verify/verify.component.html`
- Modify: `apps/web-chat/src/app/app.routes.ts` — add `/verify` and `/signup` routes
- Modify: `apps/web-chat/src/app/pages/login/login.component.html` — add signup link

**Step 1: Create VerifyComponent**

Template (`verify.component.html`):
```html
<div class="login-container">
  <div class="gradient-orbs" aria-hidden="true">
    <div class="orb orb-blue"></div>
    <div class="orb orb-cyan"></div>
    <div class="orb orb-navy"></div>
  </div>
  <div class="login-content">
    <header class="branding">
      <h1 class="brand-name">TeamClaw</h1>
      <p class="tagline">Enterprise AI Collaboration</p>
    </header>
    <section class="login-card">
      <div class="card-header">
        <h2 class="welcome-title">{{ 'Verify Email' | translate }}</h2>
      </div>
      <div class="card-body">
        <p class="verify-hint">We sent a verification code to <strong>{{ email() }}</strong></p>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'Verification Code' | translate }}</mat-label>
          <input matInput [ngModel]="code()" (ngModelChange)="code.set($event)"
            (keyup.enter)="submitVerify()" maxlength="6" autocomplete="one-time-code" />
        </mat-form-field>
        @if (errorMessage()) {
          <div class="error-message"><p>{{ errorMessage() }}</p></div>
        }
        @if (success()) {
          <div class="success-message"><p>Email verified! Redirecting to login...</p></div>
        }
        <button mat-raised-button color="primary" class="submit-btn full-width"
          (click)="submitVerify()" [disabled]="isLoading() || success()">
          @if (isLoading()) {
            <mat-spinner diameter="20"></mat-spinner>
          } @else {
            <span>{{ 'Verify' | translate }}</span>
          }
        </button>
      </div>
      <footer class="card-footer">
        <p class="footer-text">
          <a routerLink="/login">{{ 'Back to Sign In' | translate }}</a>
        </p>
      </footer>
    </section>
  </div>
</div>
```

Component (`verify.component.ts`):
```typescript
import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'tc-verify',
  standalone: true,
  imports: [
    FormsModule, RouterLink, MatCardModule, MatInputModule,
    MatButtonModule, MatFormFieldModule, MatProgressSpinnerModule, TranslateModule,
  ],
  templateUrl: './verify.component.html',
  styleUrl: '../login/login.component.scss',
})
export class VerifyComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly email = signal('');
  readonly code = signal('');
  readonly errorMessage = signal('');
  readonly isLoading = signal(false);
  readonly success = signal(false);

  ngOnInit(): void {
    const emailParam = this.route.snapshot.queryParamMap.get('email');
    if (emailParam) this.email.set(emailParam);
  }

  async submitVerify(): Promise<void> {
    if (!this.code()) {
      this.errorMessage.set('Please enter the verification code');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      await this.auth.confirmRegistration(this.email(), this.code());
      this.success.set(true);
      setTimeout(() => this.router.navigate(['/login']), 2000);
    } catch (e: unknown) {
      this.errorMessage.set(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      this.isLoading.set(false);
    }
  }
}
```

**Step 2: Update routes**

In `apps/web-chat/src/app/app.routes.ts`, add before the `path: ''` block:
```typescript
  {
    path: 'signup',
    loadComponent: () =>
      import('./pages/signup/signup.component').then(m => m.SignupComponent),
  },
  {
    path: 'verify',
    loadComponent: () =>
      import('./pages/verify/verify.component').then(m => m.VerifyComponent),
  },
```

**Step 3: Add signup link to login page**

In `apps/web-chat/src/app/pages/login/login.component.html`, replace the footer (line 67-71):
```html
      <footer class="card-footer">
        <p class="footer-text">
          {{ "Don't have an account?" | translate }}
          <a routerLink="/signup">{{ 'Sign Up' | translate }}</a>
        </p>
        <p class="footer-text">
          {{ 'Powered by OpenClaw' | translate }}
        </p>
      </footer>
```

Add `RouterLink` import to `login.component.ts` imports array.

**Step 4: Update login redirect**

In `login.component.ts`, change line 44 and 66 — both `router.navigate(['/chat'])` should become `router.navigate(['/session'])` since we now have the session init flow.

**Step 5: Commit**

```bash
git add apps/web-chat/src/app/pages/verify/ apps/web-chat/src/app/pages/signup/ apps/web-chat/src/app/pages/login/ apps/web-chat/src/app/app.routes.ts
git commit -m "feat(chat): add email verification page and signup flow"
```

---

### Task 8: Deploy and Verify

**Step 1: Run all tests**

```bash
npx nx test lib-teamclaw-backend-infra --no-cache
npx nx test lib-teamclaw-cloud-function --no-cache
```

**Step 2: Deploy backend**

```bash
npx nx deploy teamclaw-admin-infra --configuration=dev
```

**Step 3: Deploy control plane (for Cognito self-signup change)**

```bash
npx nx deploy teamclaw-control-plane-infra --configuration=dev
```

**Step 4: Verify**

1. Open Admin Panel → should show Onboarding Wizard
2. Add an API key → step completes
3. Create a team → step completes
4. Set allowed domain → step completes + auto-sets defaultTeamId
5. "Go to Dashboard" → normal dashboard loads
6. Refresh Admin Panel → dashboard shows directly (onboarding complete)
7. Open Chat App → "/signup" → register with company email
8. Check email for verification code → enter on /verify
9. Login → session init → waiting screen

**Step 5: Commit and push**

```bash
git push origin main && git checkout dev && git rebase main && git push origin dev && git checkout main
```
