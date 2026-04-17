import { aws_lambda_nodejs, Duration } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';

// Monorepo root lockfile — ensures CDK NodejsFunction finds esbuild in root node_modules
// and scopes bundling correctly (prevents bundling the entire monorepo).
const DEPS_LOCK_FILE_PATH = path.join(__dirname, '../../../../..', 'package-lock.json');

export const TC_LAMBDA_DEFAULT_PROPS: aws_lambda_nodejs.NodejsFunctionProps = {
  runtime: Runtime.NODEJS_22_X,
  memorySize: 1024,
  timeout: Duration.seconds(30),
  depsLockFilePath: DEPS_LOCK_FILE_PATH,
  bundling: {
    minify: true,
    externalModules: [
      '@aws-sdk/*',
      'aws-lambda',
    ],
  },
};

export const TC_LIFECYCLE_LAMBDA_PROPS: aws_lambda_nodejs.NodejsFunctionProps = {
  runtime: Runtime.NODEJS_22_X,
  memorySize: 1024,
  timeout: Duration.minutes(5),
  depsLockFilePath: DEPS_LOCK_FILE_PATH,
  bundling: {
    minify: true,
    externalModules: [
      '@aws-sdk/*',
      'aws-lambda',
    ],
  },
};
