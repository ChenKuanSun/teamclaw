import { shiftCronBack2Min } from './cron-utils';

describe('shiftCronBack2Min', () => {
  describe('standard shifts', () => {
    it('should shift 30 14 back to 28 14', () => {
      expect(shiftCronBack2Min('30 14 * * *')).toBe('28 14 * * *');
    });

    it('should shift 15 9 back to 13 9', () => {
      expect(shiftCronBack2Min('15 9 * * MON-FRI')).toBe('13 9 * * MON-FRI');
    });

    it('should shift 2 12 back to 0 12', () => {
      expect(shiftCronBack2Min('2 12 * * *')).toBe('0 12 * * *');
    });

    it('should shift 45 23 back to 43 23', () => {
      expect(shiftCronBack2Min('45 23 * * *')).toBe('43 23 * * *');
    });
  });

  describe('hour boundary wrapping', () => {
    it('should wrap minute 0 to 58 and decrement hour', () => {
      expect(shiftCronBack2Min('0 9 * * MON-FRI')).toBe('58 8 * * MON-FRI');
    });

    it('should wrap minute 1 to 59 and decrement hour', () => {
      expect(shiftCronBack2Min('1 9 * * *')).toBe('59 8 * * *');
    });

    it('should wrap minute 0 hour 0 to 58 23 (midnight boundary)', () => {
      expect(shiftCronBack2Min('0 0 * * *')).toBe('58 23 * * *');
    });

    it('should wrap minute 1 hour 0 to 59 23 (midnight boundary)', () => {
      expect(shiftCronBack2Min('1 0 * * *')).toBe('59 23 * * *');
    });
  });

  describe('non-shiftable expressions (returned unchanged)', () => {
    it('should not shift */5 minute pattern', () => {
      expect(shiftCronBack2Min('*/5 * * * *')).toBe('*/5 * * * *');
    });

    it('should not shift comma-separated minutes', () => {
      expect(shiftCronBack2Min('0,30 * * * *')).toBe('0,30 * * * *');
    });

    it('should not shift range minute field', () => {
      expect(shiftCronBack2Min('10-20 9 * * *')).toBe('10-20 9 * * *');
    });

    it('should not shift wildcard minute', () => {
      expect(shiftCronBack2Min('* 9 * * *')).toBe('* 9 * * *');
    });

    it('should not shift non-numeric hour pattern', () => {
      expect(shiftCronBack2Min('15 */2 * * *')).toBe('15 */2 * * *');
    });

    it('should not shift wildcard hour', () => {
      expect(shiftCronBack2Min('15 * * * *')).toBe('15 * * * *');
    });
  });

  describe('edge cases', () => {
    it('should return unchanged for fewer than 5 fields', () => {
      expect(shiftCronBack2Min('0 9 *')).toBe('0 9 *');
    });

    it('should return unchanged for empty string', () => {
      expect(shiftCronBack2Min('')).toBe('');
    });

    it('should handle 6-field cron (with seconds)', () => {
      // 6-field cron: first field is minute, second is hour
      // The function parses first two fields as minute/hour
      expect(shiftCronBack2Min('30 14 * * * *')).toBe('28 14 * * * *');
    });

    it('should preserve day-of-week fields', () => {
      expect(shiftCronBack2Min('0 9 1 1 MON')).toBe('58 8 1 1 MON');
    });
  });
});
