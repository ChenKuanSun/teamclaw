import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ENVIRONMENT } from '@TeamClaw/core/cloud-config';
import { AdminAmplifyStack } from '../admin-amplify.stack';

describe('AdminAmplifyStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new AdminAmplifyStack(app, 'TestAdminAmplify', {
      deployEnv: ENVIRONMENT.DEV,
    });
    template = Template.fromStack(stack);
  });

  test('creates Amplify App with GitHub source', () => {
    template.hasResourceProperties('AWS::Amplify::App', {
      Repository: 'https://github.com/ChannelDAO/teamclaw',
      OauthToken: Match.anyValue(),
    });
  });

  test('sets AMPLIFY_MONOREPO_APP_ROOT to apps/enterprise-admin', () => {
    template.hasResourceProperties('AWS::Amplify::App', {
      EnvironmentVariables: Match.arrayWith([
        Match.objectLike({
          Name: 'AMPLIFY_MONOREPO_APP_ROOT',
          Value: 'apps/enterprise-admin',
        }),
      ]),
    });
  });

  test('creates main branch', () => {
    template.hasResourceProperties('AWS::Amplify::Branch', {
      BranchName: 'main',
      EnableAutoBuild: true,
    });
  });

  test('creates dev branch', () => {
    template.hasResourceProperties('AWS::Amplify::Branch', {
      BranchName: 'dev',
      EnableAutoBuild: true,
    });
  });

  test('adds SPA redirect custom rule', () => {
    template.hasResourceProperties('AWS::Amplify::App', {
      CustomRules: Match.arrayWith([
        Match.objectLike({
          Source: '</^[^.]+$/>',
          Target: '/index.html',
          Status: '200',
        }),
      ]),
    });
  });

  test('enables auto branch deletion', () => {
    template.hasResourceProperties('AWS::Amplify::App', {
      EnableBranchAutoDeletion: true,
    });
  });
});
