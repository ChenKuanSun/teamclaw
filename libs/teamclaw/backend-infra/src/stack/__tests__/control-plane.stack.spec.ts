import { ENVIRONMENT } from '@TeamClaw/core/cloud-config';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ControlPlaneStack } from '../control-plane.stack';

describe('ControlPlaneStack - Teams & Config tables', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new ControlPlaneStack(app, 'TestControlPlane', {
      deployEnv: ENVIRONMENT.DEV,
    });
    template = Template.fromStack(stack);
  });

  test('creates teamclaw-teams-dev table with teamId partition key', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      TableName: 'teamclaw-teams-dev',
      KeySchema: Match.arrayWith([
        { AttributeName: 'teamId', KeyType: 'HASH' },
      ]),
      AttributeDefinitions: Match.arrayWith([
        { AttributeName: 'teamId', AttributeType: 'S' },
      ]),
    });
  });

  test('creates teamclaw-config-dev table with scopeKey partition key and configKey sort key', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      TableName: 'teamclaw-config-dev',
      KeySchema: Match.arrayWith([
        { AttributeName: 'scopeKey', KeyType: 'HASH' },
        { AttributeName: 'configKey', KeyType: 'RANGE' },
      ]),
      AttributeDefinitions: Match.arrayWith([
        { AttributeName: 'scopeKey', AttributeType: 'S' },
        { AttributeName: 'configKey', AttributeType: 'S' },
      ]),
    });
  });

  test('teams table uses on-demand billing', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      TableName: 'teamclaw-teams-dev',
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  test('config table uses on-demand billing', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      TableName: 'teamclaw-config-dev',
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  test('creates SSM parameter for teams table name', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/dynamodb/teamsTableName',
    });
  });

  test('creates SSM parameter for teams table ARN', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/dynamodb/teamsTableArn',
    });
  });

  test('creates SSM parameter for config table name', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/dynamodb/configTableName',
    });
  });

  test('creates SSM parameter for config table ARN', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/dynamodb/configTableArn',
    });
  });

  test('teams table has RETAIN removal policy', () => {
    const tables = template.findResources('AWS::DynamoDB::GlobalTable', {
      Properties: {
        TableName: 'teamclaw-teams-dev',
      },
    });
    const tableKey = Object.keys(tables)[0];
    expect(tables[tableKey]['DeletionPolicy']).toBe('Retain');
  });

  test('config table has RETAIN removal policy', () => {
    const tables = template.findResources('AWS::DynamoDB::GlobalTable', {
      Properties: {
        TableName: 'teamclaw-config-dev',
      },
    });
    const tableKey = Object.keys(tables)[0];
    expect(tables[tableKey]['DeletionPolicy']).toBe('Retain');
  });

  test('matches snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });
});
