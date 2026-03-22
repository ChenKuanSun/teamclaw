/**
 * Shared formatting utilities for the admin app
 */

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 3_600_000;
const ONE_DAY_MS = 86_400_000;

/**
 * Format snake_case or SCREAMING_SNAKE_CASE to Title Case
 */
export function formatSnakeCaseToTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format Unix timestamp to localized date string
 * Handles both number and string timestamps (postgres bigint returns as string)
 */
export function formatDate(timestamp: number | string): string {
  const ts = typeof timestamp === 'string' ? Number(timestamp) : timestamp;
  return new Date(ts).toLocaleDateString();
}

/**
 * Format Unix timestamp to localized date and time string
 * Handles both number and string timestamps (postgres bigint returns as string)
 */
export function formatDateTime(timestamp: number | string): string {
  const ts = typeof timestamp === 'string' ? Number(timestamp) : timestamp;
  const date = new Date(ts);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

/**
 * Format Unix timestamp to relative time (e.g., "5m ago", "2h ago")
 * Handles both number and string timestamps (postgres bigint returns as string)
 */
export function formatRelativeTime(timestamp: number | string): string {
  const ts = typeof timestamp === 'string' ? Number(timestamp) : timestamp;
  const now = Date.now();
  const diff = now - ts;

  if (diff < ONE_MINUTE_MS) return 'Just now';
  if (diff < ONE_HOUR_MS) return `${Math.floor(diff / ONE_MINUTE_MS)}m ago`;
  if (diff < ONE_DAY_MS) return `${Math.floor(diff / ONE_HOUR_MS)}h ago`;

  return formatDate(timestamp);
}
