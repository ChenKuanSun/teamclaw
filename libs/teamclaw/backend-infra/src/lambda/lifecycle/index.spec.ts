import { shiftCronBack2Min } from './cron-utils';

describe('shiftCronBack2Min', () => {
  it('should shift simple cron back by 2 minutes', () => {
    expect(shiftCronBack2Min('30 14 * * *')).toBe('28 14 * * *');
  });

  it('should wrap around hour boundary', () => {
    expect(shiftCronBack2Min('0 9 * * MON-FRI')).toBe('58 8 * * MON-FRI');
  });

  it('should wrap around midnight', () => {
    expect(shiftCronBack2Min('1 0 * * *')).toBe('59 23 * * *');
  });

  it('should return unchanged for */5 minute pattern', () => {
    expect(shiftCronBack2Min('*/5 * * * *')).toBe('*/5 * * * *');
  });

  it('should return unchanged for 0,30 minute pattern', () => {
    expect(shiftCronBack2Min('0,30 * * * *')).toBe('0,30 * * * *');
  });

  it('should return unchanged for non-numeric hour pattern', () => {
    expect(shiftCronBack2Min('15 */2 * * *')).toBe('15 */2 * * *');
  });

  it('should return unchanged for expressions with fewer than 5 fields', () => {
    expect(shiftCronBack2Min('0 9 *')).toBe('0 9 *');
  });

  it('should return unchanged for wildcard minute field', () => {
    expect(shiftCronBack2Min('* 9 * * *')).toBe('* 9 * * *');
  });

  it('should return unchanged for range minute field', () => {
    expect(shiftCronBack2Min('10-20 9 * * *')).toBe('10-20 9 * * *');
  });
});
