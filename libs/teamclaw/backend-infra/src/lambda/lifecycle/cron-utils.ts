/**
 * Shift a cron minute field back by 2 minutes for pre-wakeup.
 * Input: standard cron expression (min hour dom month dow)
 * Output: same expression with minute shifted back by 2.
 *
 * If the minute or hour fields are not simple numeric values
 * (e.g. *​/5, 0,30, 10-20, *), the expression is returned unchanged.
 *
 * Examples:
 *   "0 9 * * MON-FRI"  -> "58 8 * * MON-FRI"
 *   "30 14 * * *"      -> "28 14 * * *"
 *   "1 0 * * *"        -> "59 23 * * *"
 *   "*​/5 * * * *"      -> "*​/5 * * * *"  (unchanged)
 *   "0,30 * * * *"     -> "0,30 * * * *"  (unchanged)
 */
export function shiftCronBack2Min(cron: string): string {
  const parts = cron.split(/\s+/);
  if (parts.length < 5) return cron;

  const minuteField = parts[0];
  const hourField = parts[1];
  let minute = parseInt(minuteField, 10);
  let hour = parseInt(hourField, 10);

  // Only shift if both minute and hour are simple numeric values
  if (isNaN(minute) || isNaN(hour)) return cron;
  if (minuteField !== String(minute) || hourField !== String(hour)) return cron;

  minute -= 2;
  if (minute < 0) {
    minute += 60;
    hour -= 1;
    if (hour < 0) {
      hour = 23;
    }
  }

  parts[0] = String(minute);
  parts[1] = String(hour);
  return parts.join(' ');
}
