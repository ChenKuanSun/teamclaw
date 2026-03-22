# TeamClaw Enterprise Admin Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an admin dashboard for TeamClaw Enterprise — manage users, teams, containers, API keys, configs, and usage analytics. Follow Affiora's secretary-admin-app architecture exactly.

**Architecture:** Separate Angular 21 SPA (`web-admin`) with its own Cognito User Pool (PKCE OAuth), REST API Gateway + WAF, and Lambda functions. Deployed via Amplify. All CDK patterns mirror Affiora's admin stacks: SSM cross-stack refs, `StackPropsWithEnv`, separate CDK app for admin infra.

**Tech Stack:** Angular 21 (standalone, signals, Material), AWS CDK (Cognito, API Gateway, WAF, Lambda, DynamoDB), Amplify hosting

---

## Reference Files (Affiora → TeamClaw mapping)

| Affiora Source | TeamClaw Target |
|---|---|
| `apps/30-secretary/secretary-admin-app/` | `apps/web-admin/` |
| `apps/30-secretary/secretary-backend-admin-infra/` | `apps/infra-admin/teamclaw-admin-infra/` |
| `libs/secretary/backend-infra/src/stack/admin-cognito.stack.ts` | `libs/teamclaw/backend-infra/src/stack/admin-cognito.stack.ts` |
| `libs/secretary/backend-infra/src/stack/admin/` | `libs/teamclaw/backend-infra/src/stack/admin/` |
| `libs/secretary/backend-infra/src/lambda/admin/` | `libs/teamclaw/backend-infra/src/lambda/admin/` |

## Admin Features (TeamClaw-specific)

| Feature | Routes | Lambda Functions |
|---|---|---|
| Dashboard | `/admin/dashboard/stats` | `get-stats` |
| Users | `/admin/users`, `/admin/users/{userId}` | `query-users`, `get-user`, `update-user`, `delete-user` |
| Teams | `/admin/teams`, `/admin/teams/{teamId}` | `query-teams`, `get-team`, `create-team`, `update-team`, `delete-team` |
| Containers | `/admin/containers`, `/admin/containers/{userId}/*` | `query-containers`, `get-container`, `start-container`, `stop-container`, `provision-container` |
| Config | `/admin/config/global`, `/admin/config/teams/{teamId}`, `/admin/config/users/{userId}` | `get-global-config`, `update-global-config`, `get-team-config`, `update-team-config`, `get-user-config`, `update-user-config` |
| API Keys | `/admin/api-keys` | `get-api-keys`, `add-api-key`, `remove-api-key`, `get-key-usage-stats` |
| Usage | `/admin/analytics/*` | `get-system-analytics`, `query-users-usage`, `get-usage-by-provider` |

---

### Task 1: Cloud Config — Add Admin SSM Parameters & Constants

**Files:**
- Modify: `libs/core/cloud-config/src/ssm/ssm.ts`
- Modify: `libs/core/cloud-config/src/common/app.ts`
- Modify: `libs/core/cloud-config/src/index.ts`

**Step 1: Add admin SSM parameters to ssm.ts**

Add admin-related SSM parameter paths (Cognito, API Gateway, Lambda names) to `TC_SSM_PARAMETER`, matching Affiora's `AF_SECRETARY_SSM_PARAMETER` pattern with `ADMIN_COGNITO`, `ADMIN_API`, and `ADMIN_API.LAMBDA` sub-objects.

```typescript
// Add to TC_SSM_PARAMETER for each environment:
ADMIN_COGNITO: {
  USER_POOL_ID: `/tc/${env}/admin-cognito/userPoolId`,
  USER_POOL_CLIENT_ID: `/tc/${env}/admin-cognito/userPoolClientId`,
  USER_POOL_DOMAIN: `/tc/${env}/admin-cognito/userPoolDomain`,
},
ADMIN_API: {
  REST_API_ID: `/tc/${env}/admin-api/restApiId`,
  ROOT_RESOURCE_ID: `/tc/${env}/admin-api/rootResourceId`,
  REST_API_ENDPOINT: `/tc/${env}/admin-api/restApiEndpoint`,
  STAGE_NAME: `/tc/${env}/admin-api/stageName`,
  WEB_ACL_ARN: `/tc/${env}/admin-api/webAclArn`,
  LAMBDA: {
    // Dashboard
    GET_DASHBOARD_STATS_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/getDashboardStats`,
    // Users
    QUERY_USERS_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/queryUsers`,
    GET_USER_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/getUser`,
    UPDATE_USER_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/updateUser`,
    DELETE_USER_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/deleteUser`,
    // Teams
    QUERY_TEAMS_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/queryTeams`,
    GET_TEAM_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/getTeam`,
    CREATE_TEAM_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/createTeam`,
    UPDATE_TEAM_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/updateTeam`,
    DELETE_TEAM_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/deleteTeam`,
    // Containers
    QUERY_CONTAINERS_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/queryContainers`,
    GET_CONTAINER_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/getContainer`,
    START_CONTAINER_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/startContainer`,
    STOP_CONTAINER_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/stopContainer`,
    PROVISION_CONTAINER_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/provisionContainer`,
    // Config
    GET_GLOBAL_CONFIG_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/getGlobalConfig`,
    UPDATE_GLOBAL_CONFIG_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/updateGlobalConfig`,
    GET_TEAM_CONFIG_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/getTeamConfig`,
    UPDATE_TEAM_CONFIG_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/updateTeamConfig`,
    GET_USER_CONFIG_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/getUserConfig`,
    UPDATE_USER_CONFIG_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/updateUserConfig`,
    // API Keys
    GET_API_KEYS_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/getApiKeys`,
    ADD_API_KEY_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/addApiKey`,
    REMOVE_API_KEY_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/removeApiKey`,
    GET_KEY_USAGE_STATS_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/getKeyUsageStats`,
    // Analytics
    GET_SYSTEM_ANALYTICS_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/getSystemAnalytics`,
    QUERY_USERS_USAGE_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/queryUsersUsage`,
    GET_USAGE_BY_PROVIDER_LAMBDA_NAME: `/tc/${env}/admin-api/lambda/getUsageByProvider`,
  },
},
```

**Step 2: Add admin Cognito domain prefix and callback URLs to app.ts**

```typescript
export const TC_ADMIN_USER_POOL_DOMAIN_PREFIX = {
  [ENVIRONMENT.PROD]: 'teamclaw-admin',
  [ENVIRONMENT.DEV]: 'teamclaw-admin-dev',
};

export const TC_ADMIN_AUTH_CALLBACK_URL = {
  [ENVIRONMENT.PROD]: 'https://main.XXXX.amplifyapp.com/auth/callback',
  [ENVIRONMENT.DEV]: 'https://dev.XXXX.amplifyapp.com/auth/callback',
};

export const TC_ADMIN_AUTH_LOGOUT_URL = {
  [ENVIRONMENT.PROD]: 'https://main.XXXX.amplifyapp.com/auth/login',
  [ENVIRONMENT.DEV]: 'https://dev.XXXX.amplifyapp.com/auth/login',
};

export const TC_ADMIN_APP_DOMAIN_NAME = {
  [ENVIRONMENT.PROD]: 'main.XXXX.amplifyapp.com',
  [ENVIRONMENT.DEV]: 'dev.XXXX.amplifyapp.com',
};
```

**Step 3: Export new constants from index.ts**

Ensure all new exports are re-exported.

**Step 4: Commit**

```bash
git add libs/core/cloud-config/src/
git commit -m "feat(cloud-config): add admin SSM parameters and Cognito constants"
```

---

### Task 2: Admin Cognito Stack

**Files:**
- Create: `libs/teamclaw/backend-infra/src/stack/admin-cognito.stack.ts`
- Modify: `libs/teamclaw/backend-infra/src/index.ts`

**Step 1: Create admin-cognito.stack.ts**

Copy Affiora's `admin-cognito.stack.ts` pattern exactly. Key points:
- Separate User Pool from web-chat's Cognito (prevents password conflicts)
- `selfSignUpEnabled: false` (admin accounts manually created)
- PKCE OAuth flow (`generateSecret: false`)
- Cognito managed login branding
- SSM parameters for pool ID, client ID, domain
- Localhost callback URL for DEV only (port 4900)

```typescript
import {
  TC_ADMIN_USER_POOL_DOMAIN_PREFIX,
  TC_ADMIN_AUTH_CALLBACK_URL,
  TC_ADMIN_AUTH_LOGOUT_URL,
  TC_SSM_PARAMETER,
  StackPropsWithEnv,
  ENVIRONMENT,
} from '@TeamClaw/core/cloud-config';
import {
  RemovalPolicy,
  Stack,
  aws_cognito,
  aws_ssm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class AdminCognitoStack extends Stack {
  public readonly adminUserPool: aws_cognito.IUserPool;
  public readonly adminUserPoolClient: aws_cognito.IUserPoolClient;

  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, props);
    const { deployEnv } = props;

    this.adminUserPool = new aws_cognito.UserPool(
      this, id + 'AdminUserPool', {
        removalPolicy: RemovalPolicy.RETAIN,
        selfSignUpEnabled: false,
        signInAliases: { email: true },
        autoVerify: { email: true },
        passwordPolicy: {
          minLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireDigits: true,
          requireSymbols: true,
        },
        accountRecovery: aws_cognito.AccountRecovery.EMAIL_ONLY,
      },
    );

    this.adminUserPool.addDomain('default', {
      cognitoDomain: {
        domainPrefix: TC_ADMIN_USER_POOL_DOMAIN_PREFIX[deployEnv],
      },
      managedLoginVersion: aws_cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    const adminCallbackUrls = [TC_ADMIN_AUTH_CALLBACK_URL[deployEnv]];
    const adminLogoutUrls = [TC_ADMIN_AUTH_LOGOUT_URL[deployEnv]];

    if (deployEnv === ENVIRONMENT.DEV) {
      adminCallbackUrls.push('http://localhost:4900/auth/callback');
      adminLogoutUrls.push('http://localhost:4900/auth/login');
    }

    this.adminUserPoolClient = this.adminUserPool.addClient(
      id + 'AdminClient', {
        generateSecret: false,
        supportedIdentityProviders: [
          aws_cognito.UserPoolClientIdentityProvider.COGNITO,
        ],
        authFlows: { userPassword: true, userSrp: true },
        oAuth: {
          callbackUrls: adminCallbackUrls,
          logoutUrls: adminLogoutUrls,
          flows: { authorizationCodeGrant: true },
          scopes: [
            aws_cognito.OAuthScope.OPENID,
            aws_cognito.OAuthScope.EMAIL,
            aws_cognito.OAuthScope.PROFILE,
          ],
        },
      },
    );

    new aws_cognito.CfnManagedLoginBranding(
      this, id + 'AdminManagedLoginBranding', {
        userPoolId: this.adminUserPool.userPoolId,
        clientId: this.adminUserPoolClient.userPoolClientId,
        useCognitoProvidedValues: true,
      },
    );

    // SSM Parameters
    new aws_ssm.StringParameter(this, id + 'AdminUserPoolId', {
      parameterName: TC_SSM_PARAMETER[deployEnv].ADMIN_COGNITO.USER_POOL_ID,
      stringValue: this.adminUserPool.userPoolId,
    });

    new aws_ssm.StringParameter(this, id + 'AdminUserPoolClientId', {
      parameterName: TC_SSM_PARAMETER[deployEnv].ADMIN_COGNITO.USER_POOL_CLIENT_ID,
      stringValue: this.adminUserPoolClient.userPoolClientId,
    });

    new aws_ssm.StringParameter(this, id + 'AdminUserPoolDomain', {
      parameterName: TC_SSM_PARAMETER[deployEnv].ADMIN_COGNITO.USER_POOL_DOMAIN,
      stringValue: TC_ADMIN_USER_POOL_DOMAIN_PREFIX[deployEnv],
    });
  }
}
```

**Step 2: Add export to index.ts**

```typescript
export * from './stack/admin-cognito.stack';
```

**Step 3: Commit**

```bash
git add libs/teamclaw/backend-infra/src/stack/admin-cognito.stack.ts libs/teamclaw/backend-infra/src/index.ts
git commit -m "feat(admin): add AdminCognitoStack with separate admin user pool"
```

---

### Task 3: Admin API Gateway Stack (with WAF)

**Files:**
- Create: `libs/teamclaw/backend-infra/src/stack/admin/admin-api-gateway.stack.ts`
- Create: `libs/teamclaw/backend-infra/src/stack/admin/index.ts`
- Modify: `libs/teamclaw/backend-infra/src/index.ts`

**Step 1: Create admin-api-gateway.stack.ts**

Follow Affiora's `admin-api-gateway.stack.ts` exactly:
- REST API with `v1` stage
- WAF with 5 managed rules + rate limiting (100 req/5min) + body size limit (8KB)
- WAF logging to CloudWatch (1 year retention)
- CORS with environment-specific origins
- API Gateway CloudWatch logging role
- SSM parameters for API ID, root resource ID, endpoint, stage name, WebACL ARN

Use `TC_ADMIN_APP_DOMAIN_NAME` for CORS origins. DEV includes `http://localhost:4900`.

**Step 2: Create admin/index.ts**

```typescript
export * from './admin-api-gateway.stack';
```

**Step 3: Add export to parent index.ts**

```typescript
export * from './stack/admin';
```

**Step 4: Commit**

```bash
git add libs/teamclaw/backend-infra/src/stack/admin/
git commit -m "feat(admin): add AdminApiGatewayStack with WAF protection"
```

---

### Task 4: Admin Lambda Functions — Dashboard & Users

**Files:**
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/dashboard/get-stats.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/users/query-users.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/users/get-user.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/users/update-user.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/users/delete-user.ts`

Each Lambda handler follows the pattern:
```typescript
import { APIGatewayProxyHandler } from 'aws-lambda';

export const handler: APIGatewayProxyHandler = async (event) => {
  // Implementation reads from DynamoDB tables (teamclaw-users-{env})
  // Returns JSON response with CORS headers
};
```

**Dashboard get-stats:** Query `teamclaw-users-{env}` DynamoDB table for:
- Total users count
- Active containers (status='running')
- Total teams
- API key pool size
- Usage stats (from `teamclaw-usage-{env}` table)

**Users query-users:** Scan/query `teamclaw-users-{env}` with pagination (limit/offset), optional email/status filter.

**Users get-user:** Get single user record by userId from `teamclaw-users-{env}`, include container status.

**Users update-user:** Update user attributes (team assignment, status, display name) in `teamclaw-users-{env}` + Cognito attributes.

**Users delete-user:** Async delete — invoke lifecycle Lambda to stop container, remove EFS access point, delete DynamoDB record, delete Cognito user.

**Step: Commit**

```bash
git add libs/teamclaw/backend-infra/src/lambda/admin/
git commit -m "feat(admin): add dashboard and user management Lambda handlers"
```

---

### Task 5: Admin Lambda Functions — Teams & Containers

**Files:**
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/teams/query-teams.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/teams/get-team.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/teams/create-team.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/teams/update-team.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/teams/delete-team.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/containers/query-containers.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/containers/get-container.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/containers/start-container.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/containers/stop-container.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/containers/provision-container.ts`

**Teams:** New DynamoDB table `teamclaw-teams-{env}` (teamId PK). Fields: teamId, name, description, memberIds[], createdAt, updatedAt.

**Containers:** Proxy to existing lifecycle Lambda for start/stop/provision. Query/get reads from `teamclaw-users-{env}` (container status is stored per-user).

**Step: Commit**

```bash
git add libs/teamclaw/backend-infra/src/lambda/admin/teams/ libs/teamclaw/backend-infra/src/lambda/admin/containers/
git commit -m "feat(admin): add team and container management Lambda handlers"
```

---

### Task 6: Admin Lambda Functions — Config, API Keys & Analytics

**Files:**
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/config/get-global-config.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/config/update-global-config.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/config/get-team-config.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/config/update-team-config.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/config/get-user-config.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/config/update-user-config.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/api-keys/get-api-keys.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/api-keys/add-api-key.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/api-keys/remove-api-key.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/api-keys/get-key-usage-stats.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/analytics/get-system-analytics.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/analytics/query-users-usage.ts`
- Create: `libs/teamclaw/backend-infra/src/lambda/admin/analytics/get-usage-by-provider.ts`

**Config hierarchy:** Global→Team→User. New DynamoDB table `teamclaw-config-{env}` with composite key (scope#scopeId, configKey). Merged config resolves: global defaults → team overrides → user overrides. Config includes SOUL.md content, MEMORY.md content, allowed models, rate limits.

**API Keys:** Read/write to Secrets Manager (existing `teamclaw-api-keys-{env}` secret). Add/remove individual provider keys. Usage stats from `teamclaw-usage-{env}` DynamoDB table.

**Analytics:** Query `teamclaw-usage-{env}` table, aggregate by time/provider/user/team.

**Step: Commit**

```bash
git add libs/teamclaw/backend-infra/src/lambda/admin/config/ libs/teamclaw/backend-infra/src/lambda/admin/api-keys/ libs/teamclaw/backend-infra/src/lambda/admin/analytics/
git commit -m "feat(admin): add config, API key, and analytics Lambda handlers"
```

---

### Task 7: Admin Lambda CDK Stack

**Files:**
- Create: `libs/teamclaw/backend-infra/src/stack/admin/admin-lambda.stack.ts`
- Modify: `libs/teamclaw/backend-infra/src/stack/admin/index.ts`

**Step 1: Create admin-lambda.stack.ts**

Follow Affiora's `admin-lambda.stack.ts` pattern:
- Import all DynamoDB tables via SSM (`teamclaw-users`, `teamclaw-usage`, `teamclaw-teams`, `teamclaw-config`)
- Import Secrets Manager ARN via SSM
- Create all ~27 Lambda functions using `TC_LAMBDA_DEFAULT_PROPS`
- Each function gets `DEPLOY_ENV` env var + specific table/secret env vars
- Grant appropriate permissions (DynamoDB read/write, Secrets Manager read/write)
- Container Lambdas get ECS/EFS/EventBridge permissions (reuse lifecycle Lambda's permissions pattern)
- Delete user Lambda gets Cognito `AdminDeleteUser` permission
- Store all function names in SSM parameters

**DynamoDB tables to add to ControlPlaneStack (new):**
- `teamclaw-teams-{env}` — teamId (PK)
- `teamclaw-config-{env}` — scopeKey (PK: `global#default`, `team#teamId`, `user#userId`), configKey (SK)

**Step 2: Export from admin/index.ts**

```typescript
export * from './admin-api-gateway.stack';
export * from './admin-lambda.stack';
```

**Step 3: Commit**

```bash
git add libs/teamclaw/backend-infra/src/stack/admin/admin-lambda.stack.ts libs/teamclaw/backend-infra/src/stack/admin/index.ts
git commit -m "feat(admin): add AdminLambdaStack with all admin Lambda functions"
```

---

### Task 8: Admin API Gateway Route Stack

**Files:**
- Create: `libs/teamclaw/backend-infra/src/stack/admin/admin-api-gateway-route.stack.ts`
- Modify: `libs/teamclaw/backend-infra/src/stack/admin/index.ts`

**Step 1: Create admin-api-gateway-route.stack.ts**

Follow Affiora's `admin-api-gateway-route.stack.ts` pattern exactly:
- Import Admin Cognito User Pool from SSM → create CognitoUserPoolsAuthorizer
- Import Admin REST API from SSM (restApiId + rootResourceId)
- CORS configuration with environment-specific origins
- Create `/admin` root resource with all child routes
- All routes use Cognito authorizer
- Helper functions: `getLambda(name, ssmPath)` and `addResourceWithCors(parent, pathPart)`

Routes:
```
GET    /admin/dashboard/stats
GET    /admin/users
GET    /admin/users/{userId}
PUT    /admin/users/{userId}
DELETE /admin/users/{userId}
GET    /admin/teams
GET    /admin/teams/{teamId}
POST   /admin/teams
PUT    /admin/teams/{teamId}
DELETE /admin/teams/{teamId}
GET    /admin/containers
GET    /admin/containers/{userId}
POST   /admin/containers/{userId}/start
POST   /admin/containers/{userId}/stop
POST   /admin/containers/{userId}/provision
GET    /admin/config/global
PUT    /admin/config/global
GET    /admin/config/teams/{teamId}
PUT    /admin/config/teams/{teamId}
GET    /admin/config/users/{userId}
PUT    /admin/config/users/{userId}
GET    /admin/api-keys
POST   /admin/api-keys
DELETE /admin/api-keys/{keyId}
GET    /admin/api-keys/usage-stats
GET    /admin/analytics/system
GET    /admin/analytics/users-usage
GET    /admin/analytics/usage-by-provider
```

**Step 2: Export from admin/index.ts**

**Step 3: Commit**

```bash
git add libs/teamclaw/backend-infra/src/stack/admin/admin-api-gateway-route.stack.ts libs/teamclaw/backend-infra/src/stack/admin/index.ts
git commit -m "feat(admin): add AdminApiGatewayRouteStack with all admin API routes"
```

---

### Task 9: Admin CDK App Entry Point

**Files:**
- Create: `apps/infra-admin/teamclaw-admin-infra/cdk/app.ts`
- Create: `apps/infra-admin/teamclaw-admin-infra/cdk/main.ts`
- Create: `apps/infra-admin/teamclaw-admin-infra/cdk.json`
- Create: `apps/infra-admin/teamclaw-admin-infra/tsconfig.json`
- Create: `apps/infra-admin/teamclaw-admin-infra/project.json`

**Step 1: Create cdk/app.ts**

Follow Affiora's `secretary-backend-admin-infra/cdk/app.ts` exactly:

```typescript
import {
  AdminCognitoStack,
  AdminApiGatewayStack,
  AdminLambdaStack,
  AdminApiGatewayRouteStack,
} from '@TeamClaw/teamclaw/backend-infra';
import {
  ENVIRONMENT,
  TC_AWS_CLOUD,
  TC_STACK_PREFIX,
} from '@TeamClaw/core/cloud-config';
import { App } from 'aws-cdk-lib';

export const createApp = (): App => {
  const deployEnv =
    process.env['DEPLOY_ENV'] === ENVIRONMENT.PROD
      ? ENVIRONMENT.PROD
      : ENVIRONMENT.DEV;

  const app = new App();
  const stackPrefix = TC_STACK_PREFIX[deployEnv] + 'Admin';
  const env = TC_AWS_CLOUD[deployEnv];

  const adminCognitoStack = new AdminCognitoStack(
    app, stackPrefix + 'CognitoStack', { env, deployEnv },
  );

  const adminApiGatewayStack = new AdminApiGatewayStack(
    app, stackPrefix + 'APIGatewayStack', { env, deployEnv },
  );

  const adminLambdaStack = new AdminLambdaStack(
    app, stackPrefix + 'LambdaStack', { env, deployEnv },
  );

  const adminApiGatewayRouteStack = new AdminApiGatewayRouteStack(
    app, stackPrefix + 'APIGatewayRouteStack', { env, deployEnv },
  );
  adminApiGatewayRouteStack.addDependency(adminCognitoStack);
  adminApiGatewayRouteStack.addDependency(adminApiGatewayStack);
  adminApiGatewayRouteStack.addDependency(adminLambdaStack);

  return app;
};

createApp();
```

**Step 2: Create cdk/main.ts**

```typescript
import { createApp } from './app';

const app = createApp();
app.synth();
```

**Step 3: Create cdk.json, tsconfig.json, project.json**

Copy from existing `apps/infra-control-plane/teamclaw-control-plane-infra/` and adjust paths.

**Step 4: Commit**

```bash
git add apps/infra-admin/teamclaw-admin-infra/
git commit -m "feat(admin): add CDK app for admin infrastructure deployment"
```

---

### Task 10: Scaffold Admin Angular App

**Files:**
- Create: `apps/web-admin/project.json`
- Create: `apps/web-admin/tsconfig.json`
- Create: `apps/web-admin/tsconfig.app.json`
- Create: `apps/web-admin/tsconfig.spec.json`
- Create: `apps/web-admin/jest.config.ts`
- Create: `apps/web-admin/src/main.ts`
- Create: `apps/web-admin/src/index.html`
- Create: `apps/web-admin/src/styles.scss`
- Create: `apps/web-admin/src/test-setup.ts`
- Create: `apps/web-admin/src/environments/environment.ts`
- Create: `apps/web-admin/src/environments/environment.development.ts`

**Step 1: Create project.json**

Follow Affiora's `secretary-admin-app/project.json` pattern:
- `projectType: "application"`
- `prefix: "tc-admin"`
- Build target with `@angular/build:application`
- Serve target on port 4900 (different from web-chat's port)
- Production budgets: 1.5MB initial, 20KB component style
- Development configuration with `environment.development.ts` replacement
- Test target with Jest

**Step 2: Create environment files**

```typescript
// environment.ts (production)
export const environment = {
  isProduction: true,
  auth: {
    clientId: 'TODO_AFTER_DEPLOY',
    domain: 'teamclaw-admin.auth.ap-southeast-1.amazoncognito.com',
  },
  adminApiUrl: 'TODO_AFTER_DEPLOY',
};

// environment.development.ts
export const environment = {
  isProduction: false,
  auth: {
    clientId: 'TODO_AFTER_DEPLOY',
    domain: 'teamclaw-admin-dev.auth.us-west-1.amazoncognito.com',
  },
  adminApiUrl: 'TODO_AFTER_DEPLOY',
};
```

**Step 3: Create index.html**

Follow web-chat's index.html (includes `global` polyfill since we may use Cognito JS SDK):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>TeamClaw Admin</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/x-icon" href="favicon.ico" />
  </head>
  <body>
    <app-root></app-root>
  </body>
</html>
```

Note: No `global` polyfill needed — admin app uses PKCE OAuth (no `amazon-cognito-identity-js`).

**Step 4: Create main.ts**

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
```

**Step 5: Commit**

```bash
git add apps/web-admin/
git commit -m "feat(admin): scaffold web-admin Angular app"
```

---

### Task 11: Admin Auth Service & Guards

**Files:**
- Create: `apps/web-admin/src/app/services/admin-auth.service.ts`
- Create: `apps/web-admin/src/app/services/admin-api.service.ts`
- Create: `apps/web-admin/src/app/guards/auth.guard.ts`
- Create: `apps/web-admin/src/app/guards/auth.interceptor.ts`

**Step 1: Create admin-auth.service.ts**

Copy Affiora's `admin-auth.service.ts` exactly. It uses:
- Angular signals (`signal`, `computed`)
- PKCE OAuth flow (generateRandomString, generateCodeChallenge)
- SessionStorage for tokens (cleared on tab close)
- Token refresh with `refreshAccessToken()`
- State: `isAuthenticated`, `accessToken`, `idToken`, `userEmail`
- Methods: `login()`, `handleCallback()`, `refreshAccessToken()`, `signOut()`
- Allowed redirect paths for TeamClaw admin routes

**Step 2: Create admin-api.service.ts**

HTTP service for all admin API calls. Pattern matches Affiora's:
- Inject HttpClient
- `baseUrl` from `environment.adminApiUrl`
- Methods per API route (e.g., `getDashboardStats()`, `queryUsers(params)`, `getTeam(teamId)`, etc.)
- Use HttpParams for query parameters

**Step 3: Create auth.guard.ts**

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AdminAuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  authService.setRedirectUrl(state.url);
  router.navigateByUrl('/auth/login');
  return false;
};
```

**Step 4: Create auth.interceptor.ts**

Follow Affiora pattern — inject Authorization Bearer token, handle 401 with token refresh.

**Step 5: Commit**

```bash
git add apps/web-admin/src/app/services/ apps/web-admin/src/app/guards/
git commit -m "feat(admin): add auth service, API service, guard, and interceptor"
```

---

### Task 12: Admin App Config, Routes & Layout

**Files:**
- Create: `apps/web-admin/src/app/app.component.ts`
- Create: `apps/web-admin/src/app/app.config.ts`
- Create: `apps/web-admin/src/app/app.routes.ts`
- Create: `apps/web-admin/src/app/auth/auth.routes.ts`
- Create: `apps/web-admin/src/app/auth/login/login.component.ts`
- Create: `apps/web-admin/src/app/auth/callback/callback.component.ts`
- Create: `apps/web-admin/src/app/layout/layout.component.ts`

**Step 1: Create app.config.ts**

```typescript
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { appRoutes } from './app.routes';
import { authInterceptor } from './guards/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
  ],
};
```

**Step 2: Create app.routes.ts**

```typescript
import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { LayoutComponent } from './layout/layout.component';

export const appRoutes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'users/:userId',
        loadComponent: () =>
          import('./features/user-detail/user-detail.component').then((m) => m.UserDetailComponent),
      },
      {
        path: 'teams',
        loadComponent: () =>
          import('./features/teams/teams.component').then((m) => m.TeamsComponent),
      },
      {
        path: 'teams/:teamId',
        loadComponent: () =>
          import('./features/team-detail/team-detail.component').then((m) => m.TeamDetailComponent),
      },
      {
        path: 'containers',
        loadComponent: () =>
          import('./features/containers/containers.component').then((m) => m.ContainersComponent),
      },
      {
        path: 'config',
        loadComponent: () =>
          import('./features/config/config.component').then((m) => m.ConfigComponent),
      },
      {
        path: 'api-keys',
        loadComponent: () =>
          import('./features/api-keys/api-keys.component').then((m) => m.ApiKeysComponent),
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./features/analytics/analytics.component').then((m) => m.AnalyticsComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
```

**Step 3: Create layout component**

Material sidenav with header. Navigation links to all admin features. Shows logged-in user email. Sign-out button.

**Step 4: Create auth routes (login + callback)**

**Step 5: Commit**

```bash
git add apps/web-admin/src/app/
git commit -m "feat(admin): add app config, routes, layout, and auth pages"
```

---

### Task 13: Admin Feature Components — Dashboard

**Files:**
- Create: `apps/web-admin/src/app/features/dashboard/dashboard.component.ts`

**Dashboard shows:**
- Total users (card)
- Active containers (card, with running/stopped/provisioned breakdown)
- Total teams (card)
- API key pool size by provider (card)
- Recent usage chart (last 7 days)

Uses Material cards, inject `AdminApiService`, call `getDashboardStats()` on init.

**Step: Commit**

```bash
git add apps/web-admin/src/app/features/dashboard/
git commit -m "feat(admin): add dashboard feature component"
```

---

### Task 14: Admin Feature Components — Users & User Detail

**Files:**
- Create: `apps/web-admin/src/app/features/users/users.component.ts`
- Create: `apps/web-admin/src/app/features/user-detail/user-detail.component.ts`

**Users list:**
- Material table with columns: Email, Team, Container Status, Last Active, Actions
- Pagination, search by email, filter by status
- Action buttons: View, Start Container, Stop Container

**User detail:**
- User info (email, team, created date)
- Container status with start/stop/provision buttons
- Config overrides (link to config page for this user)
- Usage history

**Step: Commit**

```bash
git add apps/web-admin/src/app/features/users/ apps/web-admin/src/app/features/user-detail/
git commit -m "feat(admin): add users list and user detail components"
```

---

### Task 15: Admin Feature Components — Teams & Containers

**Files:**
- Create: `apps/web-admin/src/app/features/teams/teams.component.ts`
- Create: `apps/web-admin/src/app/features/team-detail/team-detail.component.ts`
- Create: `apps/web-admin/src/app/features/containers/containers.component.ts`

**Teams list:**
- Material table: Name, Members Count, Created, Actions
- Create team dialog (name, description)
- Edit/delete actions

**Team detail:**
- Team info, member list, config overrides
- Add/remove members

**Containers:**
- Material table: User, Status, Task ARN, CPU/Memory, Uptime, Actions
- Bulk start/stop
- Provision new container for user

**Step: Commit**

```bash
git add apps/web-admin/src/app/features/teams/ apps/web-admin/src/app/features/team-detail/ apps/web-admin/src/app/features/containers/
git commit -m "feat(admin): add teams, team detail, and containers components"
```

---

### Task 16: Admin Feature Components — Config, API Keys & Analytics

**Files:**
- Create: `apps/web-admin/src/app/features/config/config.component.ts`
- Create: `apps/web-admin/src/app/features/api-keys/api-keys.component.ts`
- Create: `apps/web-admin/src/app/features/analytics/analytics.component.ts`

**Config:**
- Tab group: Global | Team | User
- Global: JSON/form editor for default SOUL.md, MEMORY.md, allowed models, rate limits
- Team: Select team → show overrides (inherits from global, highlights differences)
- User: Select user → show overrides (inherits from team→global)
- Save button per scope

**API Keys:**
- Table: Provider, Key (masked), Status, Usage Count, Last Used
- Add key dialog (provider selector, key input)
- Remove key (with confirmation)
- Usage stats per provider (chart)

**Analytics:**
- Date range picker
- System stats: total requests, avg latency, error rate
- Per-user usage table
- Per-provider breakdown (Anthropic/OpenAI/Google usage counts)
- Charts using native Canvas or simple bar charts (no heavy chart library)

**Step: Commit**

```bash
git add apps/web-admin/src/app/features/config/ apps/web-admin/src/app/features/api-keys/ apps/web-admin/src/app/features/analytics/
git commit -m "feat(admin): add config, API keys, and analytics components"
```

---

### Task 17: Admin Amplify Stack & Build Config

**Files:**
- Create: `libs/teamclaw/backend-infra/src/stack/admin-amplify.stack.ts`
- Create: `amplify-admin.yml`
- Modify: `libs/teamclaw/backend-infra/src/index.ts`
- Modify: `apps/infra-admin/teamclaw-admin-infra/cdk/app.ts`

**Step 1: Create admin-amplify.stack.ts**

Follow existing `amplify.stack.ts` pattern but for admin app:
- GitHub source (same repo, same OAuth token)
- `AMPLIFY_MONOREPO_APP_ROOT: 'apps/web-admin'`
- Branches: main, dev (autoBuild)
- SPA redirect rule

**Step 2: Create amplify-admin.yml**

```yaml
version: 1
applications:
  - appRoot: apps/web-admin
    frontend:
      phases:
        preBuild:
          commands:
            - nvm install 22.15.0
            - nvm use 22.15.0
            - cd ../..
            - npm ci --legacy-peer-deps
        build:
          commands:
            - if [ "${AWS_BRANCH}" = "main" ]; then npx nx run
              web-admin:build:production --verbose; fi
            - if [ "${AWS_BRANCH}" = "dev" ]; then npx nx run
              web-admin:build:development --verbose; fi
      artifacts:
        baseDirectory: ../../dist/apps/web-admin/browser/
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
```

**Step 3: Add Amplify stack to admin CDK app**

```typescript
// In apps/infra-admin/teamclaw-admin-infra/cdk/app.ts, add:
new AdminAmplifyStack(app, stackPrefix + 'AmplifyStack', {
  env: TC_AWS_CLOUD[ENVIRONMENT.PROD], // Always ap-southeast-1
  deployEnv,
});
```

**Step 4: Export and commit**

```bash
git add libs/teamclaw/backend-infra/src/stack/admin-amplify.stack.ts amplify-admin.yml apps/infra-admin/teamclaw-admin-infra/cdk/app.ts libs/teamclaw/backend-infra/src/index.ts
git commit -m "feat(admin): add admin Amplify stack and build configuration"
```

---

### Task 18: DynamoDB Tables for Admin (Teams & Config)

**Files:**
- Modify: `libs/teamclaw/backend-infra/src/stack/control-plane.stack.ts`
- Modify: `libs/core/cloud-config/src/ssm/ssm.ts`

**Step 1: Add DynamoDB tables to control-plane.stack.ts**

Add two new tables (follow existing `teamclaw-users-{env}` pattern):

```typescript
// Teams table
const teamsTable = new aws_dynamodb.TableV2(this, id + 'TeamsTable', {
  tableName: `teamclaw-teams-${deployEnv}`,
  partitionKey: { name: 'teamId', type: aws_dynamodb.AttributeType.STRING },
  removalPolicy: RemovalPolicy.RETAIN,
  billing: aws_dynamodb.Billing.onDemand(),
});

// Config table (hierarchical: global/team/user)
const configTable = new aws_dynamodb.TableV2(this, id + 'ConfigTable', {
  tableName: `teamclaw-config-${deployEnv}`,
  partitionKey: { name: 'scopeKey', type: aws_dynamodb.AttributeType.STRING },
  sortKey: { name: 'configKey', type: aws_dynamodb.AttributeType.STRING },
  removalPolicy: RemovalPolicy.RETAIN,
  billing: aws_dynamodb.Billing.onDemand(),
});
```

**Step 2: Add SSM parameters for new tables**

```typescript
DYNAMODB: {
  TEAMS_TABLE_ARN: `/tc/${env}/dynamodb/teamsTableArn`,
  TEAMS_TABLE_NAME: `/tc/${env}/dynamodb/teamsTableName`,
  CONFIG_TABLE_ARN: `/tc/${env}/dynamodb/configTableArn`,
  CONFIG_TABLE_NAME: `/tc/${env}/dynamodb/configTableName`,
  USERS_TABLE_ARN: `/tc/${env}/dynamodb/usersTableArn`,
  USERS_TABLE_NAME: `/tc/${env}/dynamodb/usersTableName`,
  USAGE_TABLE_ARN: `/tc/${env}/dynamodb/usageTableArn`,
  USAGE_TABLE_NAME: `/tc/${env}/dynamodb/usageTableName`,
},
```

**Step 3: Commit**

```bash
git add libs/teamclaw/backend-infra/src/stack/control-plane.stack.ts libs/core/cloud-config/src/ssm/ssm.ts
git commit -m "feat(admin): add DynamoDB tables for teams and config hierarchy"
```

---

### Task 19: Fix Outstanding Issues

**Files:**
- Modify: `apps/web-chat/project.json` (line 69: `jest.config.cts` → `jest.config.ts`)

**Step 1: Fix jest config reference**

```json
"jestConfig": "apps/web-chat/jest.config.ts"
```

**Step 2: Commit**

```bash
git add apps/web-chat/project.json
git commit -m "fix: correct jest.config.ts reference in web-chat project.json"
```

---

## Deployment Order

1. **Task 18 first** — Deploy DynamoDB tables (ControlPlaneStack update)
2. **Task 1** — Cloud config changes
3. **Tasks 2-3** — Admin Cognito + API Gateway
4. **Tasks 4-6** — Lambda handlers
5. **Task 7-8** — Lambda CDK + Route stacks
6. **Task 9** — CDK app entry point → `cdk deploy --all`
7. **Tasks 10-16** — Angular admin app
8. **Task 17** — Amplify deployment
9. **Task 19** — Fix outstanding issues

## CDK Deploy Commands

```bash
# Deploy admin infrastructure (DEV)
cd apps/infra-admin/teamclaw-admin-infra
DEPLOY_ENV=dev npx cdk deploy --all

# Deploy admin infrastructure (PROD)
DEPLOY_ENV=prod npx cdk deploy --all

# Update control plane (for new DynamoDB tables)
cd apps/infra-control-plane/teamclaw-control-plane-infra
DEPLOY_ENV=dev npx cdk deploy DevTcControlPlaneStack
```
