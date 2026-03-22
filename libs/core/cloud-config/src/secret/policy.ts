import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export const getTCApiKeysReadPolicy = (
  deployEnv: string,
  region: string,
  account: string,
) =>
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['secretsmanager:GetSecretValue'],
    resources: [
      `arn:aws:secretsmanager:${region}:${account}:secret:${deployEnv}/teamclaw/*`,
    ],
  });
