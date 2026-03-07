export enum WebhookEvent {
  FILE_UPLOADED = 'file.uploaded',
  FILE_DELETED = 'file.deleted',
  FILE_MOVED = 'file.moved',
  FILE_UPDATED = 'file.updated',
  DIRECTORY_CREATED = 'directory.created',
  DIRECTORY_DELETED = 'directory.deleted',
  DIRECTORY_RENAMED = 'directory.renamed',
  ARCHIVE_EXTRACT_COMPLETE = 'archive.extract.complete',
  ARCHIVE_EXTRACT_FAILED = 'archive.extract.failed',
  ARCHIVE_CREATE_COMPLETE = 'archive.create.complete',
  ARCHIVE_CREATE_FAILED = 'archive.create.failed',
  QUOTA_WARNING = 'quota.warning',
  QUOTA_EXCEEDED = 'quota.exceeded',
  API_KEY_ROTATED = 'api_key.rotated',
  API_KEY_REVOKED = 'api_key.revoked',
}

export enum WebhookDeliveryStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

export enum ApiErrorCode {
  // Authentication (AP-1xx)
  INVALID_API_KEY = 'AP-101',
  API_KEY_EXPIRED = 'AP-102',
  API_KEY_REVOKED = 'AP-103',
  INSUFFICIENT_SCOPES = 'AP-104',
  IP_NOT_WHITELISTED = 'AP-105',

  // Signature (AP-2xx)
  SIGNATURE_REQUIRED = 'AP-201',
  SIGNATURE_INVALID = 'AP-202',
  TIMESTAMP_EXPIRED = 'AP-203',
  NONCE_REUSED = 'AP-204',
  SIGNATURE_MALFORMED = 'AP-205',

  // Rate Limiting (AP-3xx)
  RATE_LIMIT_EXCEEDED = 'AP-301',
  BURST_LIMIT_EXCEEDED = 'AP-302',
  MONTHLY_QUOTA_EXCEEDED = 'AP-303',
  DAILY_QUOTA_EXCEEDED = 'AP-304',

  // Idempotency (AP-4xx)
  IDEMPOTENCY_KEY_REQUIRED = 'AP-401',
  IDEMPOTENCY_KEY_CONFLICT = 'AP-402',
  IDEMPOTENCY_KEY_TOO_LONG = 'AP-403',

  // Webhook (AP-5xx)
  WEBHOOK_NOT_FOUND = 'AP-501',
  WEBHOOK_URL_INVALID = 'AP-502',
  WEBHOOK_LIMIT_EXCEEDED = 'AP-503',
  WEBHOOK_DELIVERY_NOT_FOUND = 'AP-504',
  WEBHOOK_DISABLED = 'AP-505',

  // Usage (AP-6xx)
  USAGE_DATA_NOT_AVAILABLE = 'AP-601',

  // Version (AP-7xx)
  VERSION_NOT_SUPPORTED = 'AP-701',
  VERSION_DEPRECATED = 'AP-702',

  // General (AP-9xx)
  SUBSCRIPTION_REQUIRED = 'AP-901',
  TIER_UPGRADE_REQUIRED = 'AP-902',
  FEATURE_NOT_AVAILABLE = 'AP-903',
}
