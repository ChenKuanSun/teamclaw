import { aws_lambda_nodejs, Duration } from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

export const TC_LAMBDA_DEFAULT_PROPS: aws_lambda_nodejs.NodejsFunctionProps = {
  runtime: Runtime.NODEJS_22_X,
  memorySize: 1024,
  timeout: Duration.seconds(30),
  bundling: {
    minify: true,
    externalModules: [
      'sharp',
      'ffmpeg',
      'aws-sdk',
      '@aws-sdk/*',
      'aws-lambda',
    ],
  },
};

export const TC_LIFECYCLE_LAMBDA_PROPS: aws_lambda_nodejs.NodejsFunctionProps = {
  runtime: Runtime.NODEJS_22_X,
  memorySize: 1024,
  timeout: Duration.minutes(5),
  bundling: {
    minify: true,
    externalModules: [
      'sharp',
      'ffmpeg',
      'aws-sdk',
      '@aws-sdk/*',
      'aws-lambda',
    ],
  },
};
