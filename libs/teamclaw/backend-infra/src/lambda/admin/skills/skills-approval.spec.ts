const mockDdbSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDdbSend })),
  PutItemCommand: jest.fn((input: any) => ({ input, _type: 'PutItem' })),
  QueryCommand: jest.fn((input: any) => ({ input, _type: 'Query' })),
  UpdateItemCommand: jest.fn((input: any) => ({ input, _type: 'UpdateItem' })),
}));

process.env['SKILLS_TABLE_NAME'] = 'SkillsTable';

import {
  listApprovedSkills,
  listPendingRequests,
  requestSkillInstall,
  reviewSkillRequest,
} from './skills-approval';

describe('skills-approval', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('requestSkillInstall', () => {
    it('should create a pending skill request', async () => {
      mockDdbSend.mockResolvedValueOnce({});

      const result = await requestSkillInstall({
        skillId: 'skill-1',
        skillName: 'My Skill',
        source: 'hub',
        requestedBy: 'user-1',
        teamId: 'team-1',
      });

      expect(result).toEqual({ status: 'pending', skillId: 'skill-1' });
      expect(mockDdbSend).toHaveBeenCalledTimes(1);

      const putInput = mockDdbSend.mock.calls[0][0].input;
      expect(putInput.TableName).toBe('SkillsTable');
      expect(putInput.Item.skillId.S).toBe('skill-1');
      expect(putInput.Item.skillName.S).toBe('My Skill');
      expect(putInput.Item.source.S).toBe('hub');
      expect(putInput.Item.requestedBy.S).toBe('user-1');
      expect(putInput.Item.status.S).toBe('pending');
      expect(putInput.Item.teamId.S).toBe('team-1');
      expect(putInput.Item.requestedAt.S).toBeTruthy();
    });

    it('should default teamId to empty string when not provided', async () => {
      mockDdbSend.mockResolvedValueOnce({});

      await requestSkillInstall({
        skillId: 'skill-2',
        skillName: 'Another Skill',
        source: 'npm',
        requestedBy: 'user-2',
      });

      const putInput = mockDdbSend.mock.calls[0][0].input;
      expect(putInput.Item.teamId.S).toBe('');
    });

    it('should propagate DynamoDB errors', async () => {
      mockDdbSend.mockRejectedValueOnce(new Error('DDB error'));

      await expect(
        requestSkillInstall({
          skillId: 'skill-1',
          skillName: 'Skill',
          source: 'hub',
          requestedBy: 'user-1',
        }),
      ).rejects.toThrow('DDB error');
    });
  });

  describe('reviewSkillRequest', () => {
    it('should approve a skill request', async () => {
      mockDdbSend.mockResolvedValueOnce({});

      const result = await reviewSkillRequest({
        skillId: 'skill-1',
        requestedBy: 'user-1',
        decision: 'approved',
        reviewedBy: 'admin-1',
        scope: 'global',
      });

      expect(result).toEqual({ status: 'approved', skillId: 'skill-1' });

      const updateInput = mockDdbSend.mock.calls[0][0].input;
      expect(updateInput.TableName).toBe('SkillsTable');
      expect(updateInput.Key.skillId.S).toBe('skill-1');
      expect(updateInput.Key.requestedBy.S).toBe('user-1');
      expect(updateInput.ExpressionAttributeValues[':status'].S).toBe(
        'approved',
      );
      expect(updateInput.ExpressionAttributeValues[':reviewer'].S).toBe(
        'admin-1',
      );
      expect(updateInput.ExpressionAttributeValues[':scope'].S).toBe('global');
      expect(updateInput.ExpressionAttributeValues[':at'].S).toBeTruthy();
    });

    it('should reject a skill request', async () => {
      mockDdbSend.mockResolvedValueOnce({});

      const result = await reviewSkillRequest({
        skillId: 'skill-1',
        requestedBy: 'user-1',
        decision: 'rejected',
        reviewedBy: 'admin-1',
        scope: 'team',
      });

      expect(result).toEqual({ status: 'rejected', skillId: 'skill-1' });

      const updateInput = mockDdbSend.mock.calls[0][0].input;
      expect(updateInput.ExpressionAttributeValues[':status'].S).toBe(
        'rejected',
      );
      expect(updateInput.ExpressionAttributeValues[':scope'].S).toBe('team');
    });

    it('should propagate DynamoDB errors', async () => {
      mockDdbSend.mockRejectedValueOnce(new Error('DDB error'));

      await expect(
        reviewSkillRequest({
          skillId: 'skill-1',
          requestedBy: 'user-1',
          decision: 'approved',
          reviewedBy: 'admin-1',
          scope: 'global',
        }),
      ).rejects.toThrow('DDB error');
    });
  });

  describe('listPendingRequests', () => {
    it('should return pending skill requests', async () => {
      mockDdbSend.mockResolvedValueOnce({
        Items: [
          {
            skillId: { S: 'skill-1' },
            skillName: { S: 'My Skill' },
            source: { S: 'hub' },
            requestedBy: { S: 'user-1' },
            teamId: { S: 'team-1' },
            requestedAt: { S: '2026-03-01T00:00:00.000Z' },
          },
        ],
      });

      const result = await listPendingRequests();
      expect(result.requests).toHaveLength(1);
      expect(result.requests[0]).toEqual({
        skillId: 'skill-1',
        skillName: 'My Skill',
        source: 'hub',
        requestedBy: 'user-1',
        teamId: 'team-1',
        requestedAt: '2026-03-01T00:00:00.000Z',
      });

      const queryInput = mockDdbSend.mock.calls[0][0].input;
      expect(queryInput.IndexName).toBe('by-status');
      expect(queryInput.ExpressionAttributeValues[':pending'].S).toBe(
        'pending',
      );
    });

    it('should return empty array when no pending requests', async () => {
      mockDdbSend.mockResolvedValueOnce({ Items: [] });

      const result = await listPendingRequests();
      expect(result.requests).toHaveLength(0);
    });

    it('should handle undefined Items', async () => {
      mockDdbSend.mockResolvedValueOnce({});

      const result = await listPendingRequests();
      expect(result.requests).toHaveLength(0);
    });
  });

  describe('listApprovedSkills', () => {
    it('should return approved skills', async () => {
      mockDdbSend.mockResolvedValueOnce({
        Items: [
          {
            skillId: { S: 'skill-1' },
            skillName: { S: 'Approved Skill' },
            source: { S: 'hub' },
            scope: { S: 'global' },
            reviewedAt: { S: '2026-03-02T00:00:00.000Z' },
          },
        ],
      });

      const result = await listApprovedSkills();
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0]).toEqual({
        skillId: 'skill-1',
        skillName: 'Approved Skill',
        source: 'hub',
        scope: 'global',
        approvedAt: '2026-03-02T00:00:00.000Z',
      });

      const queryInput = mockDdbSend.mock.calls[0][0].input;
      expect(queryInput.IndexName).toBe('by-status');
      expect(queryInput.ExpressionAttributeValues[':approved'].S).toBe(
        'approved',
      );
    });

    it('should return empty array when no approved skills', async () => {
      mockDdbSend.mockResolvedValueOnce({ Items: [] });

      const result = await listApprovedSkills();
      expect(result.skills).toHaveLength(0);
    });

    it('should handle undefined Items', async () => {
      mockDdbSend.mockResolvedValueOnce({});

      const result = await listApprovedSkills();
      expect(result.skills).toHaveLength(0);
    });
  });
});
