import { DynamoDBClient, PutItemCommand, QueryCommand, UpdateItemCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({});
const SKILLS_TABLE = process.env['SKILLS_TABLE_NAME']!;

// Request a skill installation (user-facing)
export async function requestSkillInstall(params: {
  skillId: string;
  skillName: string;
  source: string; // 'hub' | 'npm' | 'custom'
  requestedBy: string;
  teamId?: string;
}) {
  await ddb.send(new PutItemCommand({
    TableName: SKILLS_TABLE,
    Item: {
      skillId: { S: params.skillId },
      requestedBy: { S: params.requestedBy },
      skillName: { S: params.skillName },
      source: { S: params.source },
      status: { S: 'pending' },
      teamId: { S: params.teamId || '' },
      requestedAt: { S: new Date().toISOString() },
    },
  }));
  return { status: 'pending', skillId: params.skillId };
}

// Approve/reject a skill (admin-facing)
export async function reviewSkillRequest(params: {
  skillId: string;
  requestedBy: string;
  decision: 'approved' | 'rejected';
  reviewedBy: string;
  scope: 'global' | 'team' | 'user';
}) {
  await ddb.send(new UpdateItemCommand({
    TableName: SKILLS_TABLE,
    Key: {
      skillId: { S: params.skillId },
      requestedBy: { S: params.requestedBy },
    },
    UpdateExpression: 'SET #s = :status, reviewedBy = :reviewer, reviewedAt = :at, #sc = :scope',
    ExpressionAttributeNames: { '#s': 'status', '#sc': 'scope' },
    ExpressionAttributeValues: {
      ':status': { S: params.decision },
      ':reviewer': { S: params.reviewedBy },
      ':at': { S: new Date().toISOString() },
      ':scope': { S: params.scope },
    },
  }));
  return { status: params.decision, skillId: params.skillId };
}

// List pending requests (admin-facing)
export async function listPendingRequests() {
  const result = await ddb.send(new QueryCommand({
    TableName: SKILLS_TABLE,
    IndexName: 'by-status',
    KeyConditionExpression: '#s = :pending',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':pending': { S: 'pending' } },
  }));
  return {
    requests: (result.Items || []).map(item => ({
      skillId: item['skillId']?.S,
      skillName: item['skillName']?.S,
      source: item['source']?.S,
      requestedBy: item['requestedBy']?.S,
      teamId: item['teamId']?.S,
      requestedAt: item['requestedAt']?.S,
    })),
  };
}

// List approved skills
export async function listApprovedSkills(scope?: string) {
  const result = await ddb.send(new QueryCommand({
    TableName: SKILLS_TABLE,
    IndexName: 'by-status',
    KeyConditionExpression: '#s = :approved',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':approved': { S: 'approved' } },
  }));
  return {
    skills: (result.Items || []).map(item => ({
      skillId: item['skillId']?.S,
      skillName: item['skillName']?.S,
      source: item['source']?.S,
      scope: item['scope']?.S,
      approvedAt: item['reviewedAt']?.S,
    })),
  };
}
