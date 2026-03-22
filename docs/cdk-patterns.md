# CDK Patterns & Conventions

TeamClaw's CDK infrastructure follows patterns from the Affiora monorepo. This document explains the conventions for contributors.

## Stack Communication via SSM Parameters

Stacks communicate through SSM Parameter Store — not CDK cross-stack references (which create tight coupling and deployment ordering issues).

```typescript
// Stack A: writes
new aws_ssm.StringParameter(this, 'VpcIdParam', {
  parameterName: ssm.VPC.VPC_ID,  // e.g., "/tc/dev/vpc/vpcId"
  stringValue: vpc.vpcId,
});

// Stack B: reads
const vpcId = aws_ssm.StringParameter.valueForStringParameter(
  this, ssm.VPC.VPC_ID,
);
```

All SSM paths are centralized in `libs/core/cloud-config/src/ssm/ssm.ts`:

```typescript
export const TC_SSM_PARAMETER = {
  [ENVIRONMENT.PROD]: {
    VPC: {
      VPC_ID: `/tc/${ENVIRONMENT.PROD}/vpc/vpcId`,
      // ...
    },
    EFS: { /* ... */ },
    ECR: { /* ... */ },
    ECS: { /* ... */ },
    COGNITO: { /* ... */ },
    API_GATEWAY: { /* ... */ },
    SECRETS: { /* ... */ },
  },
  [ENVIRONMENT.DEV]: { /* same structure */ },
};
```

## StackPropsWithEnv

Every stack receives a `deployEnv` property:

```typescript
import { StackProps } from 'aws-cdk-lib';
import { ENVIRONMENT } from '../common/app';

export interface StackPropsWithEnv extends StackProps {
  deployEnv: ENVIRONMENT;
}
```

This drives environment-specific naming (`teamclaw-dev`, `teamclaw-prod`) and SSM path selection.

## CDK App Entry Pattern

Each CDK app follows the same structure:

```
apps/{NN}-{layer}/{name}-infra/
  ├── cdk.json          # CDK config + context flags
  ├── cdk/
  │   ├── app.ts        # createApp() factory
  │   └── main.ts       # Entry point: createApp()
  ├── project.json      # Nx targets (deploy, synth, diff, etc.)
  ├── start-cdk.mjs     # Bootstrap with ts-node + debug support
  └── tsconfig.json     # Extends base tsconfig
```

### `cdk/app.ts` — createApp() Factory

```typescript
import { FoundationStack } from '@TeamClaw/teamclaw/backend-infra';
import { ENVIRONMENT, TC_AWS_CLOUD, TC_STACK_PREFIX } from '@TeamClaw/core/cloud-config';
import { App } from 'aws-cdk-lib';

export const createApp = (): App => {
  const deployEnv =
    process.env['DEPLOY_ENV'] === ENVIRONMENT.PROD
      ? ENVIRONMENT.PROD
      : ENVIRONMENT.DEV;

  const app = new App();
  const stackPrefix = TC_STACK_PREFIX[deployEnv];
  const env = TC_AWS_CLOUD[deployEnv];

  new FoundationStack(app, stackPrefix + 'FoundationStack', {
    env,
    deployEnv,
  });

  return app;
};
```

### `start-cdk.mjs` — Bootstrap with Debug Support

```javascript
import { spawn } from 'node:child_process';

process.env['TS_NODE_PROJECT'] = process.env['CDK_TSCONFIG'];

if (process.env['CDK_DEBUG'] === 'true') {
  process.env['NODE_OPTIONS'] =
    `--inspect-brk=${process.env['CDK_DEBUG_HOST']}:${process.env['CDK_DEBUG_PORT']}`;
}

spawn('node', ['"--require"', '"ts-node/register"', '"cdk/main.ts"'], {
  shell: true,
  stdio: 'inherit',
});
```

## Lambda Entry Path Convention

Lambda handler paths are centralized via a barrel file:

```typescript
// libs/teamclaw/backend-infra/src/lambda/index.ts
import * as path from 'path';
export const LAMBDA_ENTRY_PATH: string = path.join(__dirname);

// Usage in stacks:
import { LAMBDA_ENTRY_PATH } from '../lambda';
entry: `${LAMBDA_ENTRY_PATH}/key-pool-proxy/index.ts`,
```

## Default Props

Lambda and Fargate defaults are defined in `libs/teamclaw/cloud-config/`:

```typescript
// Lambda defaults
export const TC_LAMBDA_DEFAULT_PROPS = {
  runtime: Runtime.NODEJS_22_X,
  memorySize: 512,
  timeout: Duration.seconds(30),
  bundling: { externalModules: ['@aws-sdk/*'] },
};

// Lifecycle Lambda (needs more resources)
export const TC_LIFECYCLE_LAMBDA_PROPS = {
  ...TC_LAMBDA_DEFAULT_PROPS,
  memorySize: 1024,
  timeout: Duration.minutes(5),
};

// Fargate defaults
export const TC_FARGATE_DEFAULTS = {
  cpu: 1024,        // 1 vCPU
  memoryMiB: 2048,  // 2 GB
  port: 18789,      // OpenClaw gateway default port
  idleTimeoutMinutes: 30,
  healthCheckPath: '/health',
  teamclawImageTag: '1.2.3',
};
```

## Nx Targets (project.json)

Every CDK app has these targets:

| Target | Description | Has dev/prod configs |
|--------|-------------|---------------------|
| `deploy` | Deploy all stacks to AWS | Yes |
| `diff` | Compare stacks against current state | Yes |
| `synth` | Synthesize CloudFormation templates | Yes |
| `list` | List all stacks | Yes |
| `watch` | Watch for changes and auto-deploy | Yes |
| `destroy` | Destroy all stacks | Yes |
| `bootstrap` | Deploy CDK bootstrap stack | Yes |
| `doctor` | Check environment and configurations | No |
| `notices` | Show relevant notices | No |
| `drift` | Detect drift in deployed stacks | Yes |
| `docs` | Open CDK documentation | No |
| `lint` | Run ESLint on TypeScript files | No |
| `test` | Run unit tests | No |
| `test:watch` | Run unit tests in watch mode | No |
| `test:coverage` | Run unit tests with coverage | No |

Usage:
```bash
nx synth teamclaw-foundation-infra          # Dev (default)
nx synth teamclaw-foundation-infra:prod     # Prod
nx deploy teamclaw-cluster-infra:dev        # Deploy dev
```

## Naming Conventions

| Thing | Pattern | Example |
|-------|---------|---------|
| AWS resource names | `teamclaw-{purpose}-{env}` | `teamclaw-users-dev` |
| SSM parameters | `/tc/{env}/{service}/{key}` | `/tc/dev/ecs/clusterName` |
| Secrets | `{env}/teamclaw/{name}` | `dev/teamclaw/api-keys` |
| Stack names | `{Prefix}{StackName}` | `DevTcFoundationStack` |
| Lambda functions | `teamclaw-{purpose}-{env}` | `teamclaw-lifecycle-dev` |
| Path aliases | `@TeamClaw/{scope}/{lib}` | `@TeamClaw/core/cloud-config` |
| Constant prefix | `TC_` | `TC_SSM_PARAMETER` |
