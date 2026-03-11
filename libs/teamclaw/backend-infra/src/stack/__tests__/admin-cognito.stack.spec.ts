import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ENVIRONMENT } from '@TeamClaw/core/cloud-config';
import { AdminCognitoStack } from '../admin-cognito.stack';

describe('AdminCognitoStack', () => {
  let template: Template;
  let devTemplate: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new AdminCognitoStack(app, 'TestAdminCognito', {
      deployEnv: ENVIRONMENT.PROD,
    });
    template = Template.fromStack(stack);

    const devApp = new App();
    const devStack = new AdminCognitoStack(devApp, 'TestAdminCognitoDev', {
      deployEnv: ENVIRONMENT.DEV,
    });
    devTemplate = Template.fromStack(devStack);
  });

  test('creates UserPool with email sign-in', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UsernameAttributes: ['email'],
      AutoVerifiedAttributes: ['email'],
    });
  });

  test('creates UserPool with self sign-up disabled', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: {
        AllowAdminCreateUserOnly: true,
      },
    });
  });

  test('creates UserPool with strong password policy', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      Policies: {
        PasswordPolicy: {
          MinimumLength: 12,
          RequireUppercase: true,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
        },
      },
    });
  });

  test('creates UserPoolClient with OAuth PKCE (no client secret, no SRP)', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthScopes: Match.arrayWith([
        'openid',
        'email',
        'profile',
      ]),
    });
    // Verify no explicit auth flows (SRP removed — OAuth PKCE only)
    const clients = template.findResources('AWS::Cognito::UserPoolClient');
    for (const key of Object.keys(clients)) {
      const authFlows = (clients[key] as any).Properties?.ExplicitAuthFlows;
      expect(authFlows).toBeUndefined();
    }
  });

  test('creates UserPoolDomain', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
      Domain: 'teamclaw-admin',
    });
  });

  test('creates SSM parameter for userPoolId', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/prod/admin-cognito/userPoolId',
    });
  });

  test('creates SSM parameter for userPoolClientId', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/prod/admin-cognito/userPoolClientId',
    });
  });

  test('creates SSM parameter for userPoolDomain', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/prod/admin-cognito/userPoolDomain',
      Value: 'teamclaw-admin',
    });
  });

  test('DEV env adds localhost callback URLs', () => {
    devTemplate.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      CallbackURLs: Match.arrayWith([
        'http://localhost:4900/auth/callback',
      ]),
      LogoutURLs: Match.arrayWith([
        'http://localhost:4900/auth/login',
      ]),
    });
  });

  test('PROD env does not include localhost callback URLs', () => {
    // In PROD, CallbackURLs should contain only the prod URL
    const clients = template.findResources('AWS::Cognito::UserPoolClient');
    const clientKeys = Object.keys(clients);
    expect(clientKeys.length).toBeGreaterThanOrEqual(1);

    for (const key of clientKeys) {
      const callbackUrls = (clients[key] as any).Properties?.CallbackURLs ?? [];
      expect(callbackUrls).not.toContain('http://localhost:4900/auth/callback');
    }
  });
});
