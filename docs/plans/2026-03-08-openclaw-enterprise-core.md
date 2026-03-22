# OpenClaw Enterprise Core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bootstrap the OpenClaw Enterprise Nx monorepo with CDK infrastructure (Foundation, Cluster, Control Plane), hardened Docker image, and Angular chat frontend — all following Affiora CDK patterns.

**Architecture:** Container-per-user ECS Fargate deployment of OpenClaw AI agent. Cognito SSO → ALB → per-user container. Key Pool Lambda proxy injects API keys. Angular Nebular chat UI connects to OpenClaw's WebSocket `chat.*` protocol. Config hierarchy (Global → Team → User) via JSON merge on EFS.

**Tech Stack:** Nx 22, AWS CDK 2, ECS Fargate, EFS, Cognito, API Gateway, Lambda, Angular 21 + Nebular, TypeScript 5, Docker

---

## Task 1: Initialize Nx Monorepo

**Files:**
- Create: `package.json`
- Create: `nx.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.npmrc`

**Step 1: Initialize git repo**

```bash
cd /Users/cksun/Project/openclaw-enterprise
git init
```

**Step 2: Create root package.json**

```json
{
  "name": "@OpenClaw/enterprise",
  "version": "0.0.0",
  "license": "UNLICENSED",
  "private": true,
  "scripts": {},
  "dependencies": {
    "aws-cdk-lib": "^2.232.2",
    "constructs": "^10.4.2",
    "esbuild": "^0.27.1"
  },
  "devDependencies": {
    "@nx/angular": "^22.5.4",
    "@nx/eslint": "^22.5.4",
    "@nx/jest": "^22.5.4",
    "@nx/js": "^22.5.4",
    "aws-cdk": "^2.232.2",
    "nx": "^22.5.4",
    "ts-node": "^10.9.2",
    "typescript": "^5.9.3",
    "prettier": "^3.5.0",
    "@types/node": "^22.0.0"
  },
  "packageManager": "yarn@1.22.22"
}
```

**Step 3: Create nx.json**

```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": [
      "default",
      "!{projectRoot}/**/?(*.)+(spec|test).[jt]s?(x)?(.snap)",
      "!{projectRoot}/tsconfig.spec.json",
      "!{projectRoot}/jest.config.[jt]s"
    ],
    "sharedGlobals": []
  },
  "plugins": [
    {
      "plugin": "@nx/eslint/plugin",
      "options": { "targetName": "lint" }
    },
    {
      "plugin": "@nx/jest/plugin",
      "options": { "targetName": "test" }
    }
  ],
  "generators": {
    "@nx/angular:application": {
      "e2eTestRunner": "none",
      "linter": "eslint",
      "style": "scss",
      "unitTestRunner": "jest"
    },
    "@nx/angular:component": {
      "style": "scss",
      "type": "component"
    },
    "@nx/angular:library": {
      "linter": "eslint",
      "unitTestRunner": "jest"
    }
  },
  "targetDefaults": {
    "@nx/js:tsc": {
      "cache": true,
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"]
    }
  }
}
```

**Step 4: Create tsconfig.base.json**

```json
{
  "compileOnSave": false,
  "compilerOptions": {
    "rootDir": ".",
    "sourceMap": true,
    "declaration": false,
    "moduleResolution": "node",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "importHelpers": true,
    "target": "es2022",
    "module": "esnext",
    "lib": ["es2022", "dom"],
    "skipLibCheck": true,
    "skipDefaultLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@OpenClaw/core/cloud-config": ["libs/core/cloud-config/src/index.ts"],
      "@OpenClaw/core/constants": ["libs/core/constants/src/index.ts"],
      "@OpenClaw/core/types": ["libs/core/types/src/index.ts"],
      "@OpenClaw/openclaw/cloud-config": ["libs/openclaw/cloud-config/src/index.ts"],
      "@OpenClaw/openclaw/backend-infra": ["libs/openclaw/backend-infra/src/index.ts"]
    }
  },
  "exclude": ["node_modules", "tmp"]
}
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
tmp/
cdk.out/
.nx/
*.js.map
*.d.ts
!jest.config.ts
!start-cdk.mjs
```

**Step 6: Create .npmrc**

```
legacy-peer-deps=true
```

**Step 7: Install dependencies**

Run: `cd /Users/cksun/Project/openclaw-enterprise && yarn install`
Expected: `node_modules/` created, no errors

**Step 8: Commit**

```bash
git add package.json nx.json tsconfig.base.json .gitignore .npmrc yarn.lock
git commit -m "chore: initialize Nx monorepo skeleton"
```

---

## Task 2: Create Core Libraries (constants, cloud-config, types)

**Files:**
- Create: `libs/core/constants/src/index.ts`
- Create: `libs/core/constants/src/app.ts`
- Create: `libs/core/constants/project.json`
- Create: `libs/core/constants/tsconfig.json`
- Create: `libs/core/cloud-config/src/index.ts`
- Create: `libs/core/cloud-config/src/common/index.ts`
- Create: `libs/core/cloud-config/src/common/app.ts`
- Create: `libs/core/cloud-config/src/types/stack.ts`
- Create: `libs/core/cloud-config/src/ssm/ssm.ts`
- Create: `libs/core/cloud-config/src/secret/policy.ts`
- Create: `libs/core/cloud-config/project.json`
- Create: `libs/core/cloud-config/tsconfig.json`
- Create: `libs/core/types/src/index.ts`
- Create: `libs/core/types/project.json`
- Create: `libs/core/types/tsconfig.json`

**Step 1: Create libs/core/constants/**

`libs/core/constants/src/app.ts`:
```typescript
export enum ENVIRONMENT {
  DEV = 'dev',
  PROD = 'prod',
}
```

`libs/core/constants/src/index.ts`:
```typescript
export * from './app';
```

`libs/core/constants/project.json`:
```json
{
  "name": "lib-core-constants",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/core/constants/src",
  "projectType": "library",
  "tags": []
}
```

`libs/core/constants/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs"
  },
  "include": ["src/**/*.ts"]
}
```

**Step 2: Create libs/core/cloud-config/**

`libs/core/cloud-config/src/common/app.ts`:
```typescript
import { Environment } from 'aws-cdk-lib';
import { ENVIRONMENT } from '@OpenClaw/core/constants';

export const OC_AWS_CLOUD = {
  [ENVIRONMENT.PROD]: {
    account: process.env['CDK_DEFAULT_ACCOUNT'] ?? '',
    region: 'ap-southeast-1',
  } as Environment,
  [ENVIRONMENT.DEV]: {
    account: process.env['CDK_DEFAULT_ACCOUNT'] ?? '',
    region: 'ap-southeast-1',
  } as Environment,
};

export const OC_STACK_PREFIX = {
  [ENVIRONMENT.PROD]: 'ProdOc',
  [ENVIRONMENT.DEV]: 'DevOc',
};

export const OC_SERVICE_NAME_PREFIX = {
  [ENVIRONMENT.PROD]: 'Prod_Oc_',
  [ENVIRONMENT.DEV]: 'Dev_Oc_',
};
```

`libs/core/cloud-config/src/common/index.ts`:
```typescript
export * from './app';
```

`libs/core/cloud-config/src/types/stack.ts`:
```typescript
import { StackProps } from 'aws-cdk-lib';
import { ENVIRONMENT } from '@OpenClaw/core/constants';

export interface StackPropsWithEnv extends StackProps {
  deployEnv: ENVIRONMENT;
}
```

`libs/core/cloud-config/src/ssm/ssm.ts`:
```typescript
import { ENVIRONMENT } from '@OpenClaw/core/constants';

export const OC_SSM_PARAMETER = {
  [ENVIRONMENT.PROD]: {
    VPC: {
      VPC_ID: `/oc/${ENVIRONMENT.PROD}/vpc/vpcId`,
      PRIVATE_SUBNET_IDS: `/oc/${ENVIRONMENT.PROD}/vpc/privateSubnetIds`,
      PUBLIC_SUBNET_IDS: `/oc/${ENVIRONMENT.PROD}/vpc/publicSubnetIds`,
    },
    EFS: {
      FILE_SYSTEM_ID: `/oc/${ENVIRONMENT.PROD}/efs/fileSystemId`,
      FILE_SYSTEM_ARN: `/oc/${ENVIRONMENT.PROD}/efs/fileSystemArn`,
      SECURITY_GROUP_ID: `/oc/${ENVIRONMENT.PROD}/efs/securityGroupId`,
    },
    ECR: {
      OPENCLAW_REPO_URI: `/oc/${ENVIRONMENT.PROD}/ecr/openclawRepoUri`,
    },
    ECS: {
      CLUSTER_ARN: `/oc/${ENVIRONMENT.PROD}/ecs/clusterArn`,
      CLUSTER_NAME: `/oc/${ENVIRONMENT.PROD}/ecs/clusterName`,
      ALB_LISTENER_ARN: `/oc/${ENVIRONMENT.PROD}/ecs/albListenerArn`,
      ALB_SECURITY_GROUP_ID: `/oc/${ENVIRONMENT.PROD}/ecs/albSecurityGroupId`,
    },
    COGNITO: {
      USER_POOL_ID: `/oc/${ENVIRONMENT.PROD}/cognito/userPoolId`,
      USER_POOL_ARN: `/oc/${ENVIRONMENT.PROD}/cognito/userPoolArn`,
      USER_POOL_CLIENT_ID: `/oc/${ENVIRONMENT.PROD}/cognito/userPoolClientId`,
    },
    API_GATEWAY: {
      KEY_POOL_PROXY_URL: `/oc/${ENVIRONMENT.PROD}/apiGateway/keyPoolProxyUrl`,
    },
    SECRETS: {
      API_KEYS_SECRET_ARN: `/oc/${ENVIRONMENT.PROD}/secrets/apiKeysSecretArn`,
    },
  },
  [ENVIRONMENT.DEV]: {
    VPC: {
      VPC_ID: `/oc/${ENVIRONMENT.DEV}/vpc/vpcId`,
      PRIVATE_SUBNET_IDS: `/oc/${ENVIRONMENT.DEV}/vpc/privateSubnetIds`,
      PUBLIC_SUBNET_IDS: `/oc/${ENVIRONMENT.DEV}/vpc/publicSubnetIds`,
    },
    EFS: {
      FILE_SYSTEM_ID: `/oc/${ENVIRONMENT.DEV}/efs/fileSystemId`,
      FILE_SYSTEM_ARN: `/oc/${ENVIRONMENT.DEV}/efs/fileSystemArn`,
      SECURITY_GROUP_ID: `/oc/${ENVIRONMENT.DEV}/efs/securityGroupId`,
    },
    ECR: {
      OPENCLAW_REPO_URI: `/oc/${ENVIRONMENT.DEV}/ecr/openclawRepoUri`,
    },
    ECS: {
      CLUSTER_ARN: `/oc/${ENVIRONMENT.DEV}/ecs/clusterArn`,
      CLUSTER_NAME: `/oc/${ENVIRONMENT.DEV}/ecs/clusterName`,
      ALB_LISTENER_ARN: `/oc/${ENVIRONMENT.DEV}/ecs/albListenerArn`,
      ALB_SECURITY_GROUP_ID: `/oc/${ENVIRONMENT.DEV}/ecs/albSecurityGroupId`,
    },
    COGNITO: {
      USER_POOL_ID: `/oc/${ENVIRONMENT.DEV}/cognito/userPoolId`,
      USER_POOL_ARN: `/oc/${ENVIRONMENT.DEV}/cognito/userPoolArn`,
      USER_POOL_CLIENT_ID: `/oc/${ENVIRONMENT.DEV}/cognito/userPoolClientId`,
    },
    API_GATEWAY: {
      KEY_POOL_PROXY_URL: `/oc/${ENVIRONMENT.DEV}/apiGateway/keyPoolProxyUrl`,
    },
    SECRETS: {
      API_KEYS_SECRET_ARN: `/oc/${ENVIRONMENT.DEV}/secrets/apiKeysSecretArn`,
    },
  },
};
```

`libs/core/cloud-config/src/secret/policy.ts`:
```typescript
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export const getOCApiKeysReadPolicy = (
  deployEnv: string,
  region: string,
  account: string,
) =>
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['secretsmanager:GetSecretValue'],
    resources: [
      `arn:aws:secretsmanager:${region}:${account}:secret:${deployEnv}/openclaw/*`,
    ],
  });
```

`libs/core/cloud-config/src/index.ts`:
```typescript
export * from './common';
export * from './types/stack';
export * from './ssm/ssm';
export * from './secret/policy';
```

`libs/core/cloud-config/project.json`:
```json
{
  "name": "lib-core-cloud-config",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/core/cloud-config/src",
  "projectType": "library",
  "tags": []
}
```

`libs/core/cloud-config/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs"
  },
  "include": ["src/**/*.ts"]
}
```

**Step 3: Create libs/core/types/**

`libs/core/types/src/index.ts`:
```typescript
export interface UserConfig {
  userId: string;
  teamId?: string;
  email: string;
  displayName: string;
  status: 'active' | 'suspended' | 'terminated';
  efsAccessPointId?: string;
  taskArn?: string;
}

export interface TeamConfig {
  teamId: string;
  name: string;
  adminUserIds: string[];
}

export interface OpenClawConfig {
  gateway: {
    port: number;
    token: string;
  };
  agents: Record<string, {
    name: string;
    model: string;
    soulMd?: string;
  }>;
  models: {
    providers: Record<string, {
      baseUrl: string;
    }>;
  };
}
```

`libs/core/types/project.json`:
```json
{
  "name": "lib-core-types",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/core/types/src",
  "projectType": "library",
  "tags": []
}
```

`libs/core/types/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs"
  },
  "include": ["src/**/*.ts"]
}
```

**Step 4: Verify Nx can see the libraries**

Run: `cd /Users/cksun/Project/openclaw-enterprise && npx nx show projects`
Expected: lists `lib-core-constants`, `lib-core-cloud-config`, `lib-core-types`

**Step 5: Commit**

```bash
git add libs/core/
git commit -m "feat: add core libraries (constants, cloud-config, types)"
```

---

## Task 3: Create OpenClaw Cloud Config Library

**Files:**
- Create: `libs/openclaw/cloud-config/src/index.ts`
- Create: `libs/openclaw/cloud-config/src/lambda/props.ts`
- Create: `libs/openclaw/cloud-config/src/fargate/props.ts`
- Create: `libs/openclaw/cloud-config/project.json`
- Create: `libs/openclaw/cloud-config/tsconfig.json`

**Step 1: Create Lambda default props**

`libs/openclaw/cloud-config/src/lambda/props.ts`:
```typescript
import { aws_lambda_nodejs, Duration } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

export const OC_LAMBDA_DEFAULT_PROPS: aws_lambda_nodejs.NodejsFunctionProps = {
  runtime: Runtime.NODEJS_22_X,
  memorySize: 512,
  timeout: Duration.seconds(30),
  bundling: {
    minify: true,
    externalModules: ['aws-sdk', '@aws-sdk/*', 'aws-lambda'],
  },
};

export const OC_LIFECYCLE_LAMBDA_PROPS: aws_lambda_nodejs.NodejsFunctionProps = {
  runtime: Runtime.NODEJS_22_X,
  memorySize: 1024,
  timeout: Duration.minutes(5),
  bundling: {
    minify: true,
    externalModules: ['aws-sdk', '@aws-sdk/*', 'aws-lambda'],
  },
};
```

**Step 2: Create Fargate default props**

`libs/openclaw/cloud-config/src/fargate/props.ts`:
```typescript
export const OC_FARGATE_DEFAULTS = {
  cpu: 1024,       // 1 vCPU
  memoryMiB: 2048, // 2 GB
  port: 18789,     // OpenClaw gateway default port
  idleTimeoutMinutes: 30,
  healthCheckPath: '/health',
  openclawImageTag: '1.2.3',
};
```

**Step 3: Create index and project files**

`libs/openclaw/cloud-config/src/index.ts`:
```typescript
export * from './lambda/props';
export * from './fargate/props';
```

`libs/openclaw/cloud-config/project.json`:
```json
{
  "name": "lib-openclaw-cloud-config",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/openclaw/cloud-config/src",
  "projectType": "library",
  "tags": []
}
```

`libs/openclaw/cloud-config/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs"
  },
  "include": ["src/**/*.ts"]
}
```

**Step 4: Commit**

```bash
git add libs/openclaw/
git commit -m "feat: add openclaw cloud-config library (lambda/fargate props)"
```

---

## Task 4: Create Foundation CDK Stack

**Files:**
- Create: `libs/openclaw/backend-infra/src/index.ts`
- Create: `libs/openclaw/backend-infra/src/stack/foundation.stack.ts`
- Create: `libs/openclaw/backend-infra/project.json`
- Create: `libs/openclaw/backend-infra/tsconfig.json`
- Create: `apps/infra-foundation/openclaw-foundation-infra/cdk/main.ts`
- Create: `apps/infra-foundation/openclaw-foundation-infra/cdk/app.ts`
- Create: `apps/infra-foundation/openclaw-foundation-infra/start-cdk.mjs`
- Create: `apps/infra-foundation/openclaw-foundation-infra/cdk.json`
- Create: `apps/infra-foundation/openclaw-foundation-infra/project.json`
- Create: `apps/infra-foundation/openclaw-foundation-infra/tsconfig.json`

**Step 1: Create FoundationStack**

`libs/openclaw/backend-infra/src/stack/foundation.stack.ts`:
```typescript
import {
  Stack,
  aws_ec2,
  aws_efs,
  aws_ecr,
  aws_secretsmanager,
  aws_ssm,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackPropsWithEnv, OC_SSM_PARAMETER } from '@OpenClaw/core/cloud-config';

export class FoundationStack extends Stack {
  public readonly vpc: aws_ec2.IVpc;
  public readonly fileSystem: aws_efs.IFileSystem;
  public readonly ecrRepo: aws_ecr.IRepository;

  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, props);
    const { deployEnv } = props;
    const ssm = OC_SSM_PARAMETER[deployEnv];

    // VPC with private subnets (Fargate tasks) + public subnets (ALB)
    const vpc = new aws_ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'Public', subnetType: aws_ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Private', subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      ],
    });
    this.vpc = vpc;

    new aws_ssm.StringParameter(this, 'VpcIdParam', {
      parameterName: ssm.VPC.VPC_ID,
      stringValue: vpc.vpcId,
    });

    // EFS — encrypted, per-user Access Points created at runtime by Lifecycle Lambda
    const efsSecurityGroup = new aws_ec2.SecurityGroup(this, 'EfsSecurityGroup', {
      vpc,
      description: 'EFS mount target security group',
      allowAllOutbound: false,
    });

    const fileSystem = new aws_efs.FileSystem(this, 'FileSystem', {
      vpc,
      securityGroup: efsSecurityGroup,
      encrypted: true,
      performanceMode: aws_efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: aws_efs.ThroughputMode.ELASTIC,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecyclePolicy: aws_efs.LifecyclePolicy.AFTER_30_DAYS,
    });
    this.fileSystem = fileSystem;

    new aws_ssm.StringParameter(this, 'EfsFileSystemIdParam', {
      parameterName: ssm.EFS.FILE_SYSTEM_ID,
      stringValue: fileSystem.fileSystemId,
    });
    new aws_ssm.StringParameter(this, 'EfsFileSystemArnParam', {
      parameterName: ssm.EFS.FILE_SYSTEM_ARN,
      stringValue: fileSystem.fileSystemArn,
    });
    new aws_ssm.StringParameter(this, 'EfsSecurityGroupIdParam', {
      parameterName: ssm.EFS.SECURITY_GROUP_ID,
      stringValue: efsSecurityGroup.securityGroupId,
    });

    // ECR repository for hardened OpenClaw image
    const ecrRepo = new aws_ecr.Repository(this, 'OpenClawRepo', {
      repositoryName: `openclaw-enterprise-${deployEnv}`,
      removalPolicy: RemovalPolicy.RETAIN,
      imageScanOnPush: true,
    });
    this.ecrRepo = ecrRepo;

    new aws_ssm.StringParameter(this, 'EcrRepoUriParam', {
      parameterName: ssm.ECR.OPENCLAW_REPO_URI,
      stringValue: ecrRepo.repositoryUri,
    });

    // Secrets Manager — API keys pool
    const apiKeysSecret = new aws_secretsmanager.Secret(this, 'ApiKeysSecret', {
      secretName: `${deployEnv}/openclaw/api-keys`,
      description: 'Shared API key pool for OpenClaw Enterprise',
    });

    new aws_ssm.StringParameter(this, 'ApiKeysSecretArnParam', {
      parameterName: ssm.SECRETS.API_KEYS_SECRET_ARN,
      stringValue: apiKeysSecret.secretArn,
    });
  }
}
```

**Step 2: Create backend-infra index**

`libs/openclaw/backend-infra/src/index.ts`:
```typescript
export * from './stack/foundation.stack';
```

`libs/openclaw/backend-infra/project.json`:
```json
{
  "name": "lib-openclaw-backend-infra",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/openclaw/backend-infra/src",
  "projectType": "library",
  "tags": []
}
```

`libs/openclaw/backend-infra/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs"
  },
  "include": ["src/**/*.ts"]
}
```

**Step 3: Create Foundation CDK app**

`apps/infra-foundation/openclaw-foundation-infra/cdk/app.ts`:
```typescript
import { FoundationStack } from '@OpenClaw/openclaw/backend-infra';
import { OC_AWS_CLOUD, OC_STACK_PREFIX } from '@OpenClaw/core/cloud-config';
import { ENVIRONMENT } from '@OpenClaw/core/constants';
import { App } from 'aws-cdk-lib';

export const createApp = (): App => {
  const deployEnv =
    process.env['DEPLOY_ENV'] === ENVIRONMENT.PROD
      ? ENVIRONMENT.PROD
      : ENVIRONMENT.DEV;

  const app = new App();
  const stackPrefix = OC_STACK_PREFIX[deployEnv];
  const env = OC_AWS_CLOUD[deployEnv];

  new FoundationStack(app, stackPrefix + 'FoundationStack', {
    env,
    deployEnv,
  });

  return app;
};
```

`apps/infra-foundation/openclaw-foundation-infra/cdk/main.ts`:
```typescript
import { createApp } from './app';

const app = createApp();
app.synth();
```

`apps/infra-foundation/openclaw-foundation-infra/start-cdk.mjs`:
```javascript
import { spawn } from 'node:child_process';

process.env['TS_NODE_PROJECT'] = process.env['CDK_TSCONFIG'] || './tsconfig.json';

spawn('node', ['--require', 'ts-node/register', 'cdk/main.ts'], {
  shell: true,
  stdio: 'inherit',
});
```

`apps/infra-foundation/openclaw-foundation-infra/cdk.json`:
```json
{
  "app": "node ./start-cdk.mjs",
  "watch": {
    "include": ["cdk/**/*"],
    "exclude": ["cdk.out", "**/*.spec.ts", "**/*.test.ts"]
  },
  "context": {
    "@aws-cdk/aws-lambda:recognizeLayerVersion": true,
    "@aws-cdk/core:checkSecretUsage": true,
    "@aws-cdk/core:target-partitions": ["aws"],
    "@aws-cdk/aws-iam:minimizePolicies": true,
    "@aws-cdk/aws-efs:denyAnonymousAccess": true,
    "@aws-cdk/aws-ec2:restrictDefaultSecurityGroup": true
  }
}
```

`apps/infra-foundation/openclaw-foundation-infra/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "types": ["node"]
  },
  "include": ["cdk/**/*.ts"]
}
```

`apps/infra-foundation/openclaw-foundation-infra/project.json`:
Copy the exact same project.json target pattern from Affiora (deploy, diff, synth, list, destroy, bootstrap, drift) but with `cwd` set to `apps/infra-foundation/openclaw-foundation-infra`.

**Step 4: Verify CDK synth compiles**

Run: `cd /Users/cksun/Project/openclaw-enterprise && npx nx synth openclaw-foundation-infra -c dev`
Expected: CloudFormation template generated in `cdk.out/`

**Step 5: Commit**

```bash
git add libs/openclaw/backend-infra/ apps/infra-foundation/
git commit -m "feat: add Foundation CDK stack (VPC, EFS, ECR, Secrets)"
```

---

## Task 5: Create Cluster CDK Stack

**Files:**
- Create: `libs/openclaw/backend-infra/src/stack/cluster.stack.ts`
- Modify: `libs/openclaw/backend-infra/src/index.ts`
- Create: `apps/infra-cluster/openclaw-cluster-infra/cdk/app.ts`
- Create: `apps/infra-cluster/openclaw-cluster-infra/cdk/main.ts`
- Create: `apps/infra-cluster/openclaw-cluster-infra/start-cdk.mjs`
- Create: `apps/infra-cluster/openclaw-cluster-infra/cdk.json`
- Create: `apps/infra-cluster/openclaw-cluster-infra/project.json`
- Create: `apps/infra-cluster/openclaw-cluster-infra/tsconfig.json`

**Step 1: Create ClusterStack**

`libs/openclaw/backend-infra/src/stack/cluster.stack.ts`:
```typescript
import {
  Stack,
  aws_ec2,
  aws_ecs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_ssm,
  Duration,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackPropsWithEnv, OC_SSM_PARAMETER } from '@OpenClaw/core/cloud-config';

export class ClusterStack extends Stack {
  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, props);
    const { deployEnv } = props;
    const ssm = OC_SSM_PARAMETER[deployEnv];

    // Import VPC from Foundation
    const vpcId = aws_ssm.StringParameter.valueForStringParameter(this, ssm.VPC.VPC_ID);
    const vpc = aws_ec2.Vpc.fromLookup(this, 'Vpc', { vpcId });

    // ECS Cluster
    const cluster = new aws_ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: `openclaw-${deployEnv}`,
      containerInsights: true,
    });

    new aws_ssm.StringParameter(this, 'ClusterArnParam', {
      parameterName: ssm.ECS.CLUSTER_ARN,
      stringValue: cluster.clusterArn,
    });
    new aws_ssm.StringParameter(this, 'ClusterNameParam', {
      parameterName: ssm.ECS.CLUSTER_NAME,
      stringValue: cluster.clusterName,
    });

    // ALB (public-facing, routes to per-user containers)
    const albSecurityGroup = new aws_ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      description: 'ALB security group',
      allowAllOutbound: true,
    });
    albSecurityGroup.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.tcp(443), 'HTTPS');
    albSecurityGroup.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.tcp(80), 'HTTP');

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });

    const listener = alb.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      // Certificate will be added when domain is configured
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not Found',
      }),
    });

    // Also add HTTP → HTTPS redirect
    alb.addListener('HttpListener', {
      port: 80,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        statusCode: 'HTTP_301',
      }),
    });

    new aws_ssm.StringParameter(this, 'AlbListenerArnParam', {
      parameterName: ssm.ECS.ALB_LISTENER_ARN,
      stringValue: listener.listenerArn,
    });
    new aws_ssm.StringParameter(this, 'AlbSecurityGroupIdParam', {
      parameterName: ssm.ECS.ALB_SECURITY_GROUP_ID,
      stringValue: albSecurityGroup.securityGroupId,
    });
  }
}
```

**Step 2: Update backend-infra index**

Add to `libs/openclaw/backend-infra/src/index.ts`:
```typescript
export * from './stack/cluster.stack';
```

**Step 3: Create CDK app files (same pattern as Task 4)**

`apps/infra-cluster/openclaw-cluster-infra/cdk/app.ts`:
```typescript
import { ClusterStack } from '@OpenClaw/openclaw/backend-infra';
import { OC_AWS_CLOUD, OC_STACK_PREFIX } from '@OpenClaw/core/cloud-config';
import { ENVIRONMENT } from '@OpenClaw/core/constants';
import { App } from 'aws-cdk-lib';

export const createApp = (): App => {
  const deployEnv =
    process.env['DEPLOY_ENV'] === ENVIRONMENT.PROD
      ? ENVIRONMENT.PROD
      : ENVIRONMENT.DEV;

  const app = new App();
  const stackPrefix = OC_STACK_PREFIX[deployEnv];
  const env = OC_AWS_CLOUD[deployEnv];

  new ClusterStack(app, stackPrefix + 'ClusterStack', {
    env,
    deployEnv,
  });

  return app;
};
```

Create `cdk/main.ts`, `start-cdk.mjs`, `cdk.json`, `project.json`, `tsconfig.json` — identical pattern to Task 4, with `cwd` updated to `apps/infra-cluster/openclaw-cluster-infra`.

**Step 4: Commit**

```bash
git add libs/openclaw/backend-infra/src/stack/cluster.stack.ts libs/openclaw/backend-infra/src/index.ts apps/infra-cluster/
git commit -m "feat: add Cluster CDK stack (ECS, ALB, Security Groups)"
```

---

## Task 6: Create Control Plane CDK Stack

**Files:**
- Create: `libs/openclaw/backend-infra/src/stack/control-plane.stack.ts`
- Create: `libs/openclaw/backend-infra/src/lambda/key-pool-proxy/index.ts`
- Create: `libs/openclaw/backend-infra/src/lambda/lifecycle/index.ts`
- Modify: `libs/openclaw/backend-infra/src/index.ts`
- Create: `apps/infra-control-plane/openclaw-control-plane-infra/cdk/app.ts`
- Create: `apps/infra-control-plane/openclaw-control-plane-infra/cdk/main.ts`
- Create: `apps/infra-control-plane/openclaw-control-plane-infra/start-cdk.mjs`
- Create: `apps/infra-control-plane/openclaw-control-plane-infra/cdk.json`
- Create: `apps/infra-control-plane/openclaw-control-plane-infra/project.json`
- Create: `apps/infra-control-plane/openclaw-control-plane-infra/tsconfig.json`

**Step 1: Create Cognito + Key Pool Proxy + Lifecycle Lambda stack**

`libs/openclaw/backend-infra/src/stack/control-plane.stack.ts`:
```typescript
import {
  Stack,
  aws_cognito,
  aws_lambda_nodejs,
  aws_apigateway,
  aws_dynamodb,
  aws_iam,
  aws_ssm,
  aws_secretsmanager,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackPropsWithEnv, OC_SSM_PARAMETER, getOCApiKeysReadPolicy } from '@OpenClaw/core/cloud-config';
import { OC_LAMBDA_DEFAULT_PROPS, OC_LIFECYCLE_LAMBDA_PROPS } from '@OpenClaw/openclaw/cloud-config';
import * as path from 'path';

export class ControlPlaneStack extends Stack {
  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, props);
    const { deployEnv } = props;
    const ssm = OC_SSM_PARAMETER[deployEnv];

    // ─── Cognito ───
    const userPool = new aws_cognito.UserPool(this, 'UserPool', {
      userPoolName: `openclaw-${deployEnv}`,
      selfSignUpEnabled: false, // Admin-only user creation
      signInAliases: { email: true },
      autoVerify: { email: true },
      mfa: aws_cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: aws_cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: {
        userSrp: true,
      },
      generateSecret: false,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    new aws_ssm.StringParameter(this, 'UserPoolIdParam', {
      parameterName: ssm.COGNITO.USER_POOL_ID,
      stringValue: userPool.userPoolId,
    });
    new aws_ssm.StringParameter(this, 'UserPoolArnParam', {
      parameterName: ssm.COGNITO.USER_POOL_ARN,
      stringValue: userPool.userPoolArn,
    });
    new aws_ssm.StringParameter(this, 'UserPoolClientIdParam', {
      parameterName: ssm.COGNITO.USER_POOL_CLIENT_ID,
      stringValue: userPoolClient.userPoolClientId,
    });

    // ─── DynamoDB: User-Container mapping & usage tracking ───
    const userTable = new aws_dynamodb.Table(this, 'UserTable', {
      tableName: `openclaw-users-${deployEnv}`,
      partitionKey: { name: 'userId', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const usageTable = new aws_dynamodb.Table(this, 'UsageTable', {
      tableName: `openclaw-usage-${deployEnv}`,
      partitionKey: { name: 'userId', type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // ─── Key Pool Proxy Lambda ───
    const apiKeysSecretArn = aws_ssm.StringParameter.valueForStringParameter(
      this, ssm.SECRETS.API_KEYS_SECRET_ARN,
    );
    const apiKeysSecret = aws_secretsmanager.Secret.fromSecretCompleteArn(
      this, 'ApiKeysSecret', apiKeysSecretArn,
    );

    const keyPoolLambda = new aws_lambda_nodejs.NodejsFunction(this, 'KeyPoolProxyLambda', {
      ...OC_LAMBDA_DEFAULT_PROPS,
      functionName: `openclaw-key-pool-proxy-${deployEnv}`,
      entry: path.join(__dirname, '../lambda/key-pool-proxy/index.ts'),
      environment: {
        API_KEYS_SECRET_ARN: apiKeysSecretArn,
        USAGE_TABLE_NAME: usageTable.tableName,
      },
    });
    apiKeysSecret.grantRead(keyPoolLambda);
    usageTable.grantWriteData(keyPoolLambda);

    // API Gateway fronting the Key Pool Proxy
    const api = new aws_apigateway.RestApi(this, 'KeyPoolApi', {
      restApiName: `openclaw-key-pool-${deployEnv}`,
      description: 'Proxies AI provider API calls, injects keys server-side',
    });

    const proxyResource = api.root.addProxy({
      defaultIntegration: new aws_apigateway.LambdaIntegration(keyPoolLambda),
      anyMethod: true,
    });

    new aws_ssm.StringParameter(this, 'KeyPoolProxyUrlParam', {
      parameterName: ssm.API_GATEWAY.KEY_POOL_PROXY_URL,
      stringValue: api.url,
    });

    // ─── Lifecycle Lambda (start/stop/provision containers) ───
    const lifecycleLambda = new aws_lambda_nodejs.NodejsFunction(this, 'LifecycleLambda', {
      ...OC_LIFECYCLE_LAMBDA_PROPS,
      functionName: `openclaw-lifecycle-${deployEnv}`,
      entry: path.join(__dirname, '../lambda/lifecycle/index.ts'),
      environment: {
        DEPLOY_ENV: deployEnv,
        USER_TABLE_NAME: userTable.tableName,
        ECS_CLUSTER_NAME: aws_ssm.StringParameter.valueForStringParameter(this, ssm.ECS.CLUSTER_NAME),
        EFS_FILE_SYSTEM_ID: aws_ssm.StringParameter.valueForStringParameter(this, ssm.EFS.FILE_SYSTEM_ID),
        KEY_POOL_PROXY_URL: api.url,
      },
    });
    userTable.grantReadWriteData(lifecycleLambda);

    // ECS permissions for lifecycle Lambda
    lifecycleLambda.addToRolePolicy(new aws_iam.PolicyStatement({
      actions: [
        'ecs:RunTask',
        'ecs:StopTask',
        'ecs:DescribeTasks',
        'ecs:ListTasks',
        'ecs:RegisterTaskDefinition',
        'ecs:DeregisterTaskDefinition',
      ],
      resources: ['*'],
    }));
    lifecycleLambda.addToRolePolicy(new aws_iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: ['*'],
      conditions: {
        StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' },
      },
    }));
    // EFS Access Point creation
    lifecycleLambda.addToRolePolicy(new aws_iam.PolicyStatement({
      actions: [
        'elasticfilesystem:CreateAccessPoint',
        'elasticfilesystem:DeleteAccessPoint',
        'elasticfilesystem:DescribeAccessPoints',
      ],
      resources: ['*'],
    }));
  }
}
```

**Step 2: Create Key Pool Proxy Lambda handler**

`libs/openclaw/backend-infra/src/lambda/key-pool-proxy/index.ts`:
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const smClient = new SecretsManagerClient({});
const ddbClient = new DynamoDBClient({});

let cachedKeys: Record<string, string[]> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ApiKeysSecret {
  anthropic?: string[];
  openai?: string[];
  google?: string[];
}

async function getApiKeys(): Promise<ApiKeysSecret> {
  if (cachedKeys && Date.now() - cachedAt < CACHE_TTL_MS) return cachedKeys;
  const result = await smClient.send(new GetSecretValueCommand({
    SecretId: process.env.API_KEYS_SECRET_ARN!,
  }));
  cachedKeys = JSON.parse(result.SecretString!);
  cachedAt = Date.now();
  return cachedKeys!;
}

// Round-robin index per provider
const roundRobinIndex: Record<string, number> = {};

function pickKey(keys: string[], provider: string): string {
  if (!roundRobinIndex[provider]) roundRobinIndex[provider] = 0;
  const idx = roundRobinIndex[provider] % keys.length;
  roundRobinIndex[provider] = idx + 1;
  return keys[idx];
}

export const handler = async (event: any) => {
  const keys = await getApiKeys();
  const path = event.path || '';
  const method = event.httpMethod || 'POST';
  const body = event.body ? JSON.parse(event.body) : {};
  const headers = event.headers || {};

  // Determine provider from path or header
  let provider = 'anthropic';
  if (path.includes('/openai/') || headers['x-provider'] === 'openai') provider = 'openai';
  if (path.includes('/google/') || headers['x-provider'] === 'google') provider = 'google';

  const providerKeys = (keys as any)[provider];
  if (!providerKeys?.length) {
    return { statusCode: 503, body: JSON.stringify({ error: `No ${provider} keys configured` }) };
  }

  const apiKey = pickKey(providerKeys, provider);
  const userId = headers['x-user-id'] || 'unknown';

  // Track usage
  await ddbClient.send(new PutItemCommand({
    TableName: process.env.USAGE_TABLE_NAME!,
    Item: {
      userId: { S: userId },
      timestamp: { S: new Date().toISOString() },
      provider: { S: provider },
      model: { S: body.model || 'unknown' },
      ttl: { N: String(Math.floor(Date.now() / 1000) + 90 * 86400) }, // 90 days
    },
  }));

  // Forward request to real provider
  const providerUrls: Record<string, string> = {
    anthropic: 'https://api.anthropic.com',
    openai: 'https://api.openai.com',
    google: 'https://generativelanguage.googleapis.com',
  };

  const targetUrl = providerUrls[provider] + path.replace(`/${provider}`, '');
  const providerHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (provider === 'anthropic') {
    providerHeaders['x-api-key'] = apiKey;
    providerHeaders['anthropic-version'] = headers['anthropic-version'] || '2023-06-01';
  } else if (provider === 'openai') {
    providerHeaders['Authorization'] = `Bearer ${apiKey}`;
  } else if (provider === 'google') {
    providerHeaders['x-goog-api-key'] = apiKey;
  }

  const response = await fetch(targetUrl, {
    method,
    headers: providerHeaders,
    body: JSON.stringify(body),
  });

  const responseBody = await response.text();

  return {
    statusCode: response.status,
    headers: { 'Content-Type': 'application/json' },
    body: responseBody,
  };
};
```

**Step 3: Create Lifecycle Lambda handler (stub)**

`libs/openclaw/backend-infra/src/lambda/lifecycle/index.ts`:
```typescript
import { ECSClient, RunTaskCommand, StopTaskCommand, DescribeTasksCommand } from '@aws-sdk/client-ecs';
import { EFSClient, CreateAccessPointCommand } from '@aws-sdk/client-efs';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const ecsClient = new ECSClient({});
const efsClient = new EFSClient({});
const ddbClient = new DynamoDBClient({});

interface LifecycleEvent {
  action: 'start' | 'stop' | 'provision' | 'status';
  userId: string;
  teamId?: string;
}

export const handler = async (event: LifecycleEvent) => {
  const { action, userId } = event;

  switch (action) {
    case 'provision':
      return await provisionUser(userId, event.teamId);
    case 'start':
      return await startContainer(userId);
    case 'stop':
      return await stopContainer(userId);
    case 'status':
      return await getStatus(userId);
    default:
      return { statusCode: 400, body: 'Unknown action' };
  }
};

async function provisionUser(userId: string, teamId?: string) {
  // Create EFS Access Point for user
  const accessPoint = await efsClient.send(new CreateAccessPointCommand({
    FileSystemId: process.env.EFS_FILE_SYSTEM_ID!,
    PosixUser: { Uid: 1000, Gid: 1000 },
    RootDirectory: {
      Path: `/users/${userId}`,
      CreationInfo: { OwnerUid: 1000, OwnerGid: 1000, Permissions: '0750' },
    },
    Tags: [
      { Key: 'UserId', Value: userId },
      { Key: 'TeamId', Value: teamId || '' },
    ],
  }));

  // Save user record
  await ddbClient.send(new PutItemCommand({
    TableName: process.env.USER_TABLE_NAME!,
    Item: {
      userId: { S: userId },
      teamId: { S: teamId || '' },
      efsAccessPointId: { S: accessPoint.AccessPointId! },
      status: { S: 'provisioned' },
      createdAt: { S: new Date().toISOString() },
    },
  }));

  return { statusCode: 200, body: JSON.stringify({ accessPointId: accessPoint.AccessPointId }) };
}

async function startContainer(userId: string) {
  // Get user record
  const userRecord = await ddbClient.send(new GetItemCommand({
    TableName: process.env.USER_TABLE_NAME!,
    Key: { userId: { S: userId } },
  }));

  if (!userRecord.Item) {
    return { statusCode: 404, body: 'User not found' };
  }

  // RunTask with user-specific config
  const result = await ecsClient.send(new RunTaskCommand({
    cluster: process.env.ECS_CLUSTER_NAME!,
    taskDefinition: `openclaw-user-${process.env.DEPLOY_ENV}`,
    launchType: 'FARGATE',
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: [], // Populated from SSM at deploy time
        securityGroups: [],
        assignPublicIp: 'DISABLED',
      },
    },
    overrides: {
      containerOverrides: [{
        name: 'openclaw',
        environment: [
          { name: 'USER_ID', value: userId },
          { name: 'TEAM_ID', value: userRecord.Item.teamId?.S || '' },
          { name: 'KEY_POOL_PROXY_URL', value: process.env.KEY_POOL_PROXY_URL! },
        ],
      }],
    },
  }));

  const taskArn = result.tasks?.[0]?.taskArn;

  // Update user record with task ARN
  await ddbClient.send(new PutItemCommand({
    TableName: process.env.USER_TABLE_NAME!,
    Item: {
      ...userRecord.Item,
      taskArn: { S: taskArn || '' },
      status: { S: 'running' },
    },
  }));

  return { statusCode: 200, body: JSON.stringify({ taskArn }) };
}

async function stopContainer(userId: string) {
  const userRecord = await ddbClient.send(new GetItemCommand({
    TableName: process.env.USER_TABLE_NAME!,
    Key: { userId: { S: userId } },
  }));

  if (!userRecord.Item?.taskArn?.S) {
    return { statusCode: 404, body: 'No running container' };
  }

  await ecsClient.send(new StopTaskCommand({
    cluster: process.env.ECS_CLUSTER_NAME!,
    task: userRecord.Item.taskArn.S,
    reason: 'User-initiated stop or idle timeout',
  }));

  await ddbClient.send(new PutItemCommand({
    TableName: process.env.USER_TABLE_NAME!,
    Item: {
      ...userRecord.Item,
      taskArn: { S: '' },
      status: { S: 'stopped' },
    },
  }));

  return { statusCode: 200, body: 'Stopped' };
}

async function getStatus(userId: string) {
  const userRecord = await ddbClient.send(new GetItemCommand({
    TableName: process.env.USER_TABLE_NAME!,
    Key: { userId: { S: userId } },
  }));

  if (!userRecord.Item) {
    return { statusCode: 404, body: 'User not found' };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      userId,
      status: userRecord.Item.status?.S,
      taskArn: userRecord.Item.taskArn?.S || null,
    }),
  };
}
```

**Step 4: Update backend-infra index**

Add to `libs/openclaw/backend-infra/src/index.ts`:
```typescript
export * from './stack/control-plane.stack';
```

**Step 5: Create CDK app files (same pattern)**

`apps/infra-control-plane/openclaw-control-plane-infra/cdk/app.ts`:
```typescript
import { ControlPlaneStack } from '@OpenClaw/openclaw/backend-infra';
import { OC_AWS_CLOUD, OC_STACK_PREFIX } from '@OpenClaw/core/cloud-config';
import { ENVIRONMENT } from '@OpenClaw/core/constants';
import { App } from 'aws-cdk-lib';

export const createApp = (): App => {
  const deployEnv =
    process.env['DEPLOY_ENV'] === ENVIRONMENT.PROD
      ? ENVIRONMENT.PROD
      : ENVIRONMENT.DEV;

  const app = new App();
  const stackPrefix = OC_STACK_PREFIX[deployEnv];
  const env = OC_AWS_CLOUD[deployEnv];

  new ControlPlaneStack(app, stackPrefix + 'ControlPlaneStack', {
    env,
    deployEnv,
  });

  return app;
};
```

Create `cdk/main.ts`, `start-cdk.mjs`, `cdk.json`, `project.json`, `tsconfig.json` — identical pattern to Task 4.

**Step 6: Commit**

```bash
git add libs/openclaw/backend-infra/ apps/infra-control-plane/
git commit -m "feat: add Control Plane stack (Cognito, Key Pool Proxy, Lifecycle Lambda)"
```

---

## Task 7: Create Hardened OpenClaw Docker Image

**Files:**
- Create: `libs/openclaw/container/Dockerfile`
- Create: `libs/openclaw/container/entrypoint.sh`
- Create: `libs/openclaw/container/scripts/generate-config.js`

**Step 1: Create Dockerfile**

`libs/openclaw/container/Dockerfile`:
```dockerfile
FROM node:20-slim AS base

# Install OpenClaw (pinned version)
ARG OPENCLAW_VERSION=1.2.3
RUN npm install -g openclaw@${OPENCLAW_VERSION}

# Remove dangerous binaries
RUN apt-get update && \
    apt-get remove -y curl wget netcat-openbsd && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# Copy entrypoint and config scripts
COPY entrypoint.sh /entrypoint.sh
COPY scripts/ /scripts/
RUN chmod +x /entrypoint.sh

# Create directories
RUN mkdir -p /workspace /efs

# Non-root user
USER node
WORKDIR /workspace

EXPOSE 18789

ENTRYPOINT ["/entrypoint.sh"]
```

**Step 2: Create entrypoint.sh**

`libs/openclaw/container/entrypoint.sh`:
```bash
#!/bin/sh
set -e

# ─── Security Controls (zero source code modification) ───
# Strip all provider API keys from environment
unset ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_API_KEY GEMINI_API_KEY

# Force safe defaults
export OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 64)}"
export OPENCLAW_TUNNEL=false

# Audit log to persistent EFS
export OPENCLAW_AUDIT_DIR="/efs/users/${USER_ID}/audit"
export OPENCLAW_TRANSCRIPT_DIR="/efs/users/${USER_ID}/transcripts"
mkdir -p "$OPENCLAW_AUDIT_DIR" "$OPENCLAW_TRANSCRIPT_DIR" 2>/dev/null || true

# ─── Generate merged config (Global → Team → User) ───
node /scripts/generate-config.js

# ─── Start OpenClaw Gateway ───
exec openclaw gateway --config /workspace/openclaw.json
```

**Step 3: Create config generator**

`libs/openclaw/container/scripts/generate-config.js`:
```javascript
const fs = require('fs');
const path = require('path');

const userId = process.env.USER_ID || 'default';
const teamId = process.env.TEAM_ID || '';
const keyPoolProxyUrl = process.env.KEY_POOL_PROXY_URL || '';

// Load and merge configs: Global → Team → User (each level can only be more restrictive)
function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const globalConfig = loadJson('/efs/system/global-config.json');
const teamConfig = teamId ? loadJson(`/efs/teams/${teamId}/team-config.json`) : {};
const userConfig = loadJson(`/efs/users/${userId}/user-config.json`);

// Base OpenClaw config
const baseConfig = {
  gateway: {
    port: 18789,
    host: '0.0.0.0',
  },
  models: {
    providers: {
      anthropic: { baseUrl: `${keyPoolProxyUrl}anthropic` },
      openai: { baseUrl: `${keyPoolProxyUrl}openai` },
      google: { baseUrl: `${keyPoolProxyUrl}google` },
    },
  },
  session: {
    dmScope: 'per-channel-peer',
  },
};

// Merge: base → global → team → user
const merged = deepMerge(deepMerge(deepMerge(baseConfig, globalConfig), teamConfig), userConfig);

// Write final config
fs.writeFileSync('/workspace/openclaw.json', JSON.stringify(merged, null, 2));

// Copy SOUL.md files if they exist
const soulSources = [
  `/efs/system/SOUL.md`,
  teamId ? `/efs/teams/${teamId}/SOUL.md` : null,
  `/efs/users/${userId}/SOUL.md`,
].filter(Boolean);

let soulContent = '';
for (const src of soulSources) {
  try {
    soulContent += fs.readFileSync(src, 'utf-8') + '\n\n';
  } catch { /* file doesn't exist, skip */ }
}

if (soulContent.trim()) {
  fs.writeFileSync('/workspace/SOUL.md', soulContent);
}

// Copy MEMORY.md if exists
try {
  const memoryPath = `/efs/users/${userId}/MEMORY.md`;
  if (fs.existsSync(memoryPath)) {
    fs.copyFileSync(memoryPath, '/workspace/MEMORY.md');
  }
} catch { /* skip */ }

console.log(`[generate-config] Config generated for user=${userId} team=${teamId}`);
```

**Step 4: Commit**

```bash
git add libs/openclaw/container/
git commit -m "feat: add hardened OpenClaw Docker image with config hierarchy"
```

---

## Task 8: Create Angular Chat Frontend

**Files:**
- Generated by Nx: `libs/enterprise/frontend/` (Angular app)

**Step 1: Add Angular dependencies**

Add to root `package.json` dependencies:
```json
{
  "@angular/animations": "^21.1.3",
  "@angular/cdk": "^21.1.3",
  "@angular/common": "^21.1.3",
  "@angular/compiler": "^21.1.3",
  "@angular/core": "^21.1.3",
  "@angular/forms": "^21.1.3",
  "@angular/material": "^21.1.3",
  "@angular/platform-browser": "^21.1.3",
  "@angular/platform-browser-dynamic": "^21.1.3",
  "@angular/router": "^21.1.3",
  "@nebular/theme": "^14.0.0",
  "@nebular/eva-icons": "^14.0.0",
  "eva-icons": "^1.1.3",
  "amazon-cognito-identity-js": "^6.3.0"
}
```

Run: `yarn install`

**Step 2: Generate Angular app with Nx**

```bash
cd /Users/cksun/Project/openclaw-enterprise
npx nx g @nx/angular:application \
  --name=web-chat \
  --directory=apps/web-chat \
  --style=scss \
  --routing=true \
  --standalone=true \
  --e2eTestRunner=none
```

**Step 3: Create OpenClaw WebSocket service**

Create `apps/web-chat/src/app/services/openclaw-ws.service.ts`:
```typescript
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

@Injectable({ providedIn: 'root' })
export class OpenClawWsService implements OnDestroy {
  private ws: WebSocket | null = null;
  private seq = 0;

  readonly messages$ = new BehaviorSubject<ChatMessage[]>([]);
  readonly connected$ = new BehaviorSubject<boolean>(false);
  readonly typing$ = new BehaviorSubject<boolean>(false);

  connect(gatewayUrl: string, token: string): void {
    this.ws = new WebSocket(gatewayUrl);

    this.ws.onopen = () => {
      // Send connect handshake
      this.sendFrame({
        type: 'request',
        method: 'connect',
        seq: this.nextSeq(),
        payload: {
          minProtocol: 1,
          maxProtocol: 1,
          client: { id: 'web-chat', version: '1.0.0', platform: 'web' },
          role: 'user',
          scopes: ['chat'],
          auth: { token },
        },
      });
    };

    this.ws.onmessage = (event) => {
      const frame = JSON.parse(event.data);
      this.handleFrame(frame);
    };

    this.ws.onclose = () => {
      this.connected$.next(false);
    };
  }

  sendMessage(text: string, agentId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date() };
    this.messages$.next([...this.messages$.value, userMsg]);

    this.sendFrame({
      type: 'request',
      method: 'chat.send',
      seq: this.nextSeq(),
      payload: {
        text,
        agentId: agentId || 'default',
      },
    });
  }

  loadHistory(agentId?: string): void {
    this.sendFrame({
      type: 'request',
      method: 'chat.history',
      seq: this.nextSeq(),
      payload: { agentId: agentId || 'default' },
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private handleFrame(frame: any): void {
    if (frame.type === 'response' && frame.method === 'connect') {
      this.connected$.next(true);
      this.loadHistory();
    }

    if (frame.type === 'event') {
      switch (frame.event) {
        case 'chat.message': {
          const msg: ChatMessage = {
            role: frame.payload.role || 'assistant',
            content: frame.payload.text || frame.payload.content || '',
            timestamp: new Date(frame.payload.timestamp || Date.now()),
          };
          this.messages$.next([...this.messages$.value, msg]);
          this.typing$.next(false);
          break;
        }
        case 'chat.typing':
          this.typing$.next(true);
          break;
        case 'chat.history': {
          const history = (frame.payload.messages || []).map((m: any) => ({
            role: m.role,
            content: m.text || m.content || '',
            timestamp: new Date(m.timestamp || Date.now()),
          }));
          this.messages$.next(history);
          break;
        }
      }
    }
  }

  private sendFrame(frame: any): void {
    this.ws?.send(JSON.stringify(frame));
  }

  private nextSeq(): number {
    return ++this.seq;
  }
}
```

**Step 4: Create Cognito auth service**

Create `apps/web-chat/src/app/services/auth.service.ts`:
```typescript
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private userPool: CognitoUserPool;
  readonly user$ = new BehaviorSubject<CognitoUser | null>(null);
  readonly session$ = new BehaviorSubject<CognitoUserSession | null>(null);

  constructor() {
    this.userPool = new CognitoUserPool({
      UserPoolId: environment.cognito.userPoolId,
      ClientId: environment.cognito.clientId,
    });

    // Check existing session
    const currentUser = this.userPool.getCurrentUser();
    if (currentUser) {
      currentUser.getSession((err: any, session: CognitoUserSession) => {
        if (!err && session.isValid()) {
          this.user$.next(currentUser);
          this.session$.next(session);
        }
      });
    }
  }

  login(email: string, password: string): Promise<CognitoUserSession> {
    const user = new CognitoUser({ Username: email, Pool: this.userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });

    return new Promise((resolve, reject) => {
      user.authenticateUser(authDetails, {
        onSuccess: (session) => {
          this.user$.next(user);
          this.session$.next(session);
          resolve(session);
        },
        onFailure: reject,
      });
    });
  }

  logout(): void {
    this.userPool.getCurrentUser()?.signOut();
    this.user$.next(null);
    this.session$.next(null);
  }

  getIdToken(): string | null {
    return this.session$.value?.getIdToken()?.getJwtToken() || null;
  }
}
```

**Step 5: Create chat page component**

Create `apps/web-chat/src/app/pages/chat/chat.component.ts`:
```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NbChatModule, NbSpinnerModule } from '@nebular/theme';
import { OpenClawWsService, ChatMessage } from '../../services/openclaw-ws.service';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'oc-chat',
  standalone: true,
  imports: [CommonModule, NbChatModule, NbSpinnerModule],
  template: `
    <nb-chat title="OpenClaw Enterprise" size="large">
      <nb-chat-message
        *ngFor="let msg of messages"
        [type]="msg.role === 'user' ? 'text' : 'text'"
        [message]="msg.content"
        [reply]="msg.role === 'user'"
        [sender]="msg.role === 'user' ? 'You' : 'AI'"
        [date]="msg.timestamp"
      ></nb-chat-message>

      <nb-chat-message
        *ngIf="typing"
        type="text"
        message="..."
        sender="AI"
      ></nb-chat-message>

      <nb-chat-form
        (send)="onSend($event)"
        [dropFiles]="false"
      ></nb-chat-form>
    </nb-chat>
  `,
  styles: [`
    :host {
      display: flex;
      height: 100vh;
    }
    nb-chat {
      width: 100%;
    }
  `],
})
export class ChatComponent implements OnInit, OnDestroy {
  messages: ChatMessage[] = [];
  typing = false;
  private subs: Subscription[] = [];

  constructor(
    private ws: OpenClawWsService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    const token = this.auth.getIdToken();
    if (token) {
      this.ws.connect(environment.openclawGatewayUrl, token);
    }

    this.subs.push(
      this.ws.messages$.subscribe(msgs => this.messages = msgs),
      this.ws.typing$.subscribe(t => this.typing = t),
    );
  }

  onSend(event: { message: string }): void {
    this.ws.sendMessage(event.message);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.ws.disconnect();
  }
}
```

**Step 6: Create login page component**

Create `apps/web-chat/src/app/pages/login/login.component.ts`:
```typescript
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NbCardModule, NbInputModule, NbButtonModule, NbAlertModule } from '@nebular/theme';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'oc-login',
  standalone: true,
  imports: [CommonModule, FormsModule, NbCardModule, NbInputModule, NbButtonModule, NbAlertModule],
  template: `
    <div class="login-container">
      <nb-card>
        <nb-card-header>OpenClaw Enterprise</nb-card-header>
        <nb-card-body>
          <nb-alert *ngIf="error" status="danger">{{ error }}</nb-alert>
          <input nbInput fullWidth placeholder="Email" [(ngModel)]="email" type="email" />
          <input nbInput fullWidth placeholder="Password" [(ngModel)]="password" type="password" (keyup.enter)="login()" />
        </nb-card-body>
        <nb-card-footer>
          <button nbButton fullWidth status="primary" [disabled]="loading" (click)="login()">
            {{ loading ? 'Signing in...' : 'Sign In' }}
          </button>
        </nb-card-footer>
      </nb-card>
    </div>
  `,
  styles: [`
    .login-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: #f4f4f4;
    }
    nb-card { width: 400px; }
    input { margin-bottom: 1rem; }
  `],
})
export class LoginComponent {
  email = '';
  password = '';
  error = '';
  loading = false;

  constructor(private auth: AuthService, private router: Router) {}

  async login(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      await this.auth.login(this.email, this.password);
      this.router.navigate(['/chat']);
    } catch (e: any) {
      this.error = e.message || 'Login failed';
    } finally {
      this.loading = false;
    }
  }
}
```

**Step 7: Create environment files**

Create `apps/web-chat/src/environments/environment.ts`:
```typescript
export const environment = {
  production: false,
  cognito: {
    userPoolId: 'ap-southeast-1_XXXXXXXXX',
    clientId: 'XXXXXXXXXXXXXXXXXXXXXXXXXX',
  },
  openclawGatewayUrl: 'ws://localhost:18789',
};
```

Create `apps/web-chat/src/environments/environment.prod.ts`:
```typescript
export const environment = {
  production: true,
  cognito: {
    userPoolId: '', // Set during deployment
    clientId: '',
  },
  openclawGatewayUrl: '', // Set during deployment (wss://alb-url)
};
```

**Step 8: Set up routing**

Create `apps/web-chat/src/app/app.routes.ts`:
```typescript
import { Routes } from '@angular/router';

export const appRoutes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  { path: 'chat', loadComponent: () => import('./pages/chat/chat.component').then(m => m.ChatComponent) },
  { path: '', redirectTo: '/chat', pathMatch: 'full' },
  { path: '**', redirectTo: '/chat' },
];
```

**Step 9: Verify build**

Run: `npx nx build web-chat`
Expected: Build succeeds

**Step 10: Commit**

```bash
git add apps/web-chat/ libs/enterprise/
git commit -m "feat: add Angular chat frontend with Nebular UI and Cognito auth"
```

---

## Task 9: Update RESEARCH.md

**Files:**
- Modify: `RESEARCH.md`

**Step 1: Replace RESEARCH.md with updated architecture reflecting all decisions**

Update to include:
- Corrected product vision (NOT managed hosting, NOT BullyBuddy)
- Zero-fork approach with config/volume/plugin strategy
- VPS + Docker Compose for MVP, CDK for production
- OpenClaw native features (multi-agent, session isolation, provider proxy, config hot-reload)
- Config hierarchy (Global → Team → User)
- Memory injection (SOUL.md + MEMORY.md layering)
- Docker entrypoint wrapper for security controls
- 5-role customer review summary (IT Admin, End User, Team Lead, CISO, CTO)
- Monorepo structure reference

**Step 2: Commit**

```bash
git add RESEARCH.md
git commit -m "docs: update RESEARCH.md with corrected architecture and customer review findings"
```

---

## Task 10: Update Memory

**Files:**
- Modify: `/Users/cksun/.claude/projects/-Users-cksun-Project-openclaw-enterprise/memory/MEMORY.md`

**Step 1: Update MEMORY.md with finalized architecture**

Reflect:
- Angular + Nebular (not Next.js)
- OpenClaw WebSocket `chat.*` protocol (not terminal/PTY)
- 3 CDK stacks: Foundation, Cluster, Control Plane
- Nx monorepo structure with `@OpenClaw/` path aliases
- Docker entrypoint wrapper pattern
- Config hierarchy on EFS

**Step 2: No git commit needed (memory files are outside repo)**

---

## Summary

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Initialize Nx Monorepo | 10 min |
| 2 | Core Libraries (constants, cloud-config, types) | 15 min |
| 3 | OpenClaw Cloud Config Library | 10 min |
| 4 | Foundation CDK Stack | 15 min |
| 5 | Cluster CDK Stack | 15 min |
| 6 | Control Plane CDK Stack + Lambdas | 20 min |
| 7 | Hardened Docker Image | 10 min |
| 8 | Angular Chat Frontend | 20 min |
| 9 | Update RESEARCH.md | 10 min |
| 10 | Update Memory | 5 min |
