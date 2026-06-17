// Local env-int helper (mirrors the pattern in redis.ttl.ts, which doesn't
// export it). Clamps to >= 1 so retention can never be 0/negative — a guard
// against an accidental "delete everything".
const envInt = (key: string, fallback: number): number =>
  Math.max(1, parseInt(process.env[key] ?? String(fallback), 10));

/** Days of notification history to retain before the prune job deletes it. */
export const NOTIFICATION_RETENTION_DAYS = envInt(
  'NOTIFICATION_RETENTION_DAYS',
  30,
);

/** Cron schedule for the notification-prune job. Default: daily at 03:00. */
export const NOTIFICATION_CLEANUP_CRON =
  process.env.NOTIFICATION_CLEANUP_CRON ?? '0 3 * * *';
