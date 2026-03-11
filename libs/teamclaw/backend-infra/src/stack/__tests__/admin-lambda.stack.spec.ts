import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ENVIRONMENT } from '@TeamClaw/core/cloud-config';
import { AdminLambdaStack } from '../admin/admin-lambda.stack';

describe('AdminLambdaStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new AdminLambdaStack(app, 'TestAdminLambda', {
      deployEnv: ENVIRONMENT.DEV,
    });
    template = Template.fromStack(stack);
  });

  test('creates exactly 28 Lambda functions', () => {
    // AdminLambdaStack creates 28 NodejsFunctions
    // 1 dashboard + 4 users + 5 teams + 5 containers + 6 config + 4 api-keys + 3 analytics = 28
    const lambdas = template.findResources('AWS::Lambda::Function');
    const lambdaCount = Object.keys(lambdas).length;
    expect(lambdaCount).toBe(28);
  });

  test('all Lambdas use Node.js 22 runtime', () => {
    const lambdas = template.findResources('AWS::Lambda::Function');
    for (const [, lambda] of Object.entries(lambdas)) {
      expect((lambda as any).Properties.Runtime).toBe('nodejs22.x');
    }
  });

  test('all Lambdas have DEPLOY_ENV environment variable', () => {
    const lambdas = template.findResources('AWS::Lambda::Function');
    for (const [, lambda] of Object.entries(lambdas)) {
      expect((lambda as any).Properties.Environment.Variables.DEPLOY_ENV).toBe('dev');
    }
  });

  test('dashboard lambda has USERS_TABLE_NAME and USAGE_TABLE_NAME env vars', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          DEPLOY_ENV: 'dev',
          USERS_TABLE_NAME: Match.anyValue(),
          USAGE_TABLE_NAME: Match.anyValue(),
        }),
      },
    });
  });

  test('user management lambdas have COGNITO_USER_POOL_ID env var', () => {
    // updateUser and deleteUser lambdas should have COGNITO_USER_POOL_ID
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          COGNITO_USER_POOL_ID: Match.anyValue(),
        }),
      },
    });
  });

  test('DynamoDB read/write permissions granted via IAM policies', () => {
    // Verify at least one IAM policy exists with DynamoDB actions
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              'dynamodb:BatchGetItem',
            ]),
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  test('creates SSM parameters for all 28 Lambda function names', () => {
    const ssmParams = template.findResources('AWS::SSM::Parameter');
    const lambdaSsmParams = Object.entries(ssmParams).filter(
      ([, param]) =>
        (param as any).Properties?.Name?.includes('/admin-api/lambda/'),
    );
    expect(lambdaSsmParams).toHaveLength(28);
  });

  test('SSM parameters include all expected Lambda names', () => {
    const expectedSsmNames = [
      '/tc/dev/admin-api/lambda/getDashboardStatsLambdaName',
      '/tc/dev/admin-api/lambda/queryUsersLambdaName',
      '/tc/dev/admin-api/lambda/getUserLambdaName',
      '/tc/dev/admin-api/lambda/updateUserLambdaName',
      '/tc/dev/admin-api/lambda/deleteUserLambdaName',
      '/tc/dev/admin-api/lambda/queryTeamsLambdaName',
      '/tc/dev/admin-api/lambda/getTeamLambdaName',
      '/tc/dev/admin-api/lambda/createTeamLambdaName',
      '/tc/dev/admin-api/lambda/updateTeamLambdaName',
      '/tc/dev/admin-api/lambda/deleteTeamLambdaName',
      '/tc/dev/admin-api/lambda/queryContainersLambdaName',
      '/tc/dev/admin-api/lambda/getContainerLambdaName',
      '/tc/dev/admin-api/lambda/startContainerLambdaName',
      '/tc/dev/admin-api/lambda/stopContainerLambdaName',
      '/tc/dev/admin-api/lambda/provisionContainerLambdaName',
      '/tc/dev/admin-api/lambda/getGlobalConfigLambdaName',
      '/tc/dev/admin-api/lambda/updateGlobalConfigLambdaName',
      '/tc/dev/admin-api/lambda/getTeamConfigLambdaName',
      '/tc/dev/admin-api/lambda/updateTeamConfigLambdaName',
      '/tc/dev/admin-api/lambda/getUserConfigLambdaName',
      '/tc/dev/admin-api/lambda/updateUserConfigLambdaName',
      '/tc/dev/admin-api/lambda/getApiKeysLambdaName',
      '/tc/dev/admin-api/lambda/addApiKeyLambdaName',
      '/tc/dev/admin-api/lambda/removeApiKeyLambdaName',
      '/tc/dev/admin-api/lambda/getKeyUsageStatsLambdaName',
      '/tc/dev/admin-api/lambda/getSystemAnalyticsLambdaName',
      '/tc/dev/admin-api/lambda/queryUsersUsageLambdaName',
      '/tc/dev/admin-api/lambda/getUsageByProviderLambdaName',
    ];

    for (const name of expectedSsmNames) {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: name,
      });
    }
  });

  test('container lambdas have LIFECYCLE_LAMBDA_NAME env var', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          LIFECYCLE_LAMBDA_NAME: Match.anyValue(),
        }),
      },
    });
  });

  test('config lambdas have CONFIG_TABLE_NAME env var', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          CONFIG_TABLE_NAME: Match.anyValue(),
        }),
      },
    });
  });

  test('api-keys lambdas have API_KEYS_SECRET_ARN env var', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          API_KEYS_SECRET_ARN: Match.anyValue(),
        }),
      },
    });
  });
});
