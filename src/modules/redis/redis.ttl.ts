/**
 * Centralized Redis TTL / duration constants (all values in **seconds**).
 *
 * Environment-variable overrides are resolved here so every consumer
 * references a single source of truth.
 */

// ─── Helper ──────────────────────────────────────────────────────────────────

const envInt = (key: string, fallback: number): number =>
  Math.max(1, parseInt(process.env[key] ?? String(fallback), 10));

// ─── Session ─────────────────────────────────────────────────────────────────

/** Session data TTL — 7 days */
export const SESSION_TTL = 60 * 60 * 24 * 7;

/** Minimum interval between `updateSessionActivity` Redis writes */
export const SESSION_ACTIVITY_THROTTLE = 60;

// ─── Authentication ──────────────────────────────────────────────────────────

/** WebAuthn challenge TTL — 5 minutes */
export const PASSKEY_CHALLENGE_TTL = 300;

/** `hasPasskey` boolean cache — 5 minutes */
export const HAS_PASSKEY_CACHE_TTL = 300;

/** `isTwoFactorEnabled` boolean cache — 5 minutes */
export const TWO_FACTOR_ENABLED_CACHE_TTL = 300;

/** 2FA brute-force lockout window — 15 minutes */
export const TWO_FACTOR_LOCKOUT_TTL = 900;

/** Maximum failed 2FA attempts before lockout */
export const TWO_FACTOR_MAX_ATTEMPTS = 5;

// ─── API Key ─────────────────────────────────────────────────────────────────

/** Cached API-key entity lookup by PublicKey — 5 minutes */
export const API_KEY_ENTITY_CACHE_TTL = 300;

/** Per-minute rate-limit counter TTL — 60 seconds */
export const API_KEY_RATE_LIMIT_TTL = 60;

// ─── Account ─────────────────────────────────────────────────────────────────

/** User profile cache — 5 minutes */
export const ACCOUNT_PROFILE_CACHE_TTL = 300;

// ─── Subscription ────────────────────────────────────────────────────────────

/** Subscription plan list cache — 30 minutes */
export const SUBSCRIPTION_LIST_CACHE_TTL = 1800;

/** Per-user subscription cache — 10 minutes */
export const USER_SUBSCRIPTION_CACHE_TTL = 600;

// ─── Definition ──────────────────────────────────────────────────────────────

/** Definition group / list cache — 1 hour */
export const DEFINITION_CACHE_TTL = 3600;

// ─── Cloud ───────────────────────────────────────────────────────────────────

/** Cloud listing cache (objects, directories, combined) */
export const CLOUD_LIST_CACHE_TTL = envInt('CLOUD_LIST_CACHE_TTL_SECONDS', 3600);

/** Directory thumbnail cache */
export const CLOUD_THUMBNAIL_CACHE_TTL = envInt(
  'CLOUD_LIST_THUMBNAIL_CACHE_TTL_SECONDS',
  86400,
);

/** Encrypted folder manifest cache — 10 minutes */
export const ENCRYPTED_MANIFEST_CACHE_TTL = 600;

/** Encrypted folder unlock-session TTL — 15 minutes */
export const ENCRYPTED_FOLDER_SESSION_TTL = 15 * 60;

/** Idempotency key cache for cloud mutations */
export const CLOUD_IDEMPOTENCY_TTL = envInt(
  'CLOUD_IDEMPOTENCY_TTL_SECONDS',
  300,
);
