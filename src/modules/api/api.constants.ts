// ─── Header Names ────────────────────────────────────────────────────────────

export const X_API_KEY_HEADER = 'x-api-key';
export const X_API_SECRET_HEADER = 'x-api-secret';
export const X_API_SIGNATURE_HEADER = 'x-api-signature';
export const X_API_TIMESTAMP_HEADER = 'x-api-timestamp';
export const X_API_NONCE_HEADER = 'x-api-nonce';
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

// ─── Versioning ──────────────────────────────────────────────────────────────

export const API_VERSION = '1';

// ─── Signature ───────────────────────────────────────────────────────────────

/** Maximum age (in seconds) of a signed request timestamp — 5 minutes */
export const SIGNATURE_TIMESTAMP_WINDOW_SECONDS = 300;

// ─── Idempotency ─────────────────────────────────────────────────────────────

export const MAX_IDEMPOTENCY_KEY_LENGTH = 100;

// ─── Webhooks ────────────────────────────────────────────────────────────────

export const WEBHOOK_SECRET_PREFIX = 'whsec_';
export const WEBHOOK_MAX_CONSECUTIVE_FAILURES = 10;

/** Retry back-off delays in seconds: 30s, 2m, 10m, 30m, 1h */
export const WEBHOOK_RETRY_BACKOFFS = [30, 120, 600, 1800, 3600];

// ─── Usage Flushing ──────────────────────────────────────────────────────────

export const USAGE_FLUSH_BATCH_SIZE = 500;

/** Cron: every 5 minutes */
export const USAGE_FLUSH_CRON = '*/5 * * * *';

/** Cron: every 30 seconds */
export const WEBHOOK_RETRY_CRON = '*/30 * * * * *';

// ─── Tier Limits ─────────────────────────────────────────────────────────────

export interface ApiTierLimits {
  MonthlyRequestQuota: number;
  RateLimitPerMinute: number;
  RateLimitBurstPerSecond: number;
  HmacRequired: boolean;
  MaxWebhooks: number;
  RetentionDays: number;
}

/**
 * Default tier limits keyed by subscription slug.
 * A `MonthlyRequestQuota` of 0 means unlimited.
 */
export const DEFAULT_TIER_LIMITS: Record<string, ApiTierLimits> = {
  free: {
    MonthlyRequestQuota: 1_000,
    RateLimitPerMinute: 60,
    RateLimitBurstPerSecond: 5,
    HmacRequired: false,
    MaxWebhooks: 2,
    RetentionDays: 7,
  },
  pro: {
    MonthlyRequestQuota: 100_000,
    RateLimitPerMinute: 600,
    RateLimitBurstPerSecond: 20,
    HmacRequired: false,
    MaxWebhooks: 10,
    RetentionDays: 90,
  },
  enterprise: {
    MonthlyRequestQuota: 0,
    RateLimitPerMinute: 2_000,
    RateLimitBurstPerSecond: 50,
    HmacRequired: true,
    MaxWebhooks: 25,
    RetentionDays: 365,
  },
};
