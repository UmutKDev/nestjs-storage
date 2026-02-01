import { Role, Status } from '@common/enums';

export declare global {
  type AnyObject = Record<string, unknown>;

  namespace NodeJS {
    interface ProcessEnv {
      // Database Configuration
      PG_HOSTNAME: string;
      PG_USERNAME: string;
      PG_PASSWORD: string;
      PG_DATABASE: string;
      PG_PORT: string;
      PG_SCHEMA: string;
      PG_SYNCHRONIZE: string;
      PG_CACERT?: string;

      // Swagger Configuration
      SWAGGER_USER: string;
      SWAGGER_PASSWORD: string;

      // WebAuthn/Passkey Configuration
      WEBAUTHN_RP_ID?: string;
      WEBAUTHN_RP_NAME?: string;

      // Session Configuration
      SESSION_TTL_SECONDS?: string;

      // Sentry
      SENTRY_DSN?: string;
      SENTRY_AUTH_TOKEN?: string;

      // AWS S3
      S3_PROTOCOL_ACCESS_KEY_ID?: string;
      S3_PROTOCOL_ACCESS_KEY_SECRET?: string;
      S3_PROTOCOL_SIGNED_URL_PROCESSING?: string;

      S3_MAX_SOCKETS?: string;
      S3_ENDPOINT?: string;
      S3_PUBLIC_ENDPOINT?: string;
      S3_FORCE_PATH_STYLE?: string;
      S3_REGION?: string;

      // Redis Configuration
      REDIS_HOSTNAME: string;
      REDIS_PORT: string;
      REDIS_PASSWORD: string;
      REDIS_TTL: string;

      // Cloud Listing Limits
      CLOUD_LIST_METADATA_CONCURRENCY?: string;
      CLOUD_LIST_METADATA_MAX?: string;

      // Cloud Upload Limits
      CLOUD_UPLOAD_PART_MAX_BYTES?: string;

      // Cloud Rate Limits
      CLOUD_UPLOAD_RATE_TTL?: string;
      CLOUD_UPLOAD_RATE_LIMIT?: string;
      CLOUD_DOWNLOAD_RATE_TTL?: string;
      CLOUD_DOWNLOAD_RATE_LIMIT?: string;

      // Cloud Antivirus
      CLOUD_AV_ENABLED?: string;
      CLOUD_AV_HOST?: string;
      CLOUD_AV_PORT?: string;
      CLOUD_AV_MAX_BYTES?: string;
      CLOUD_AV_SOCKET_TIMEOUT_MS?: string;
      CLOUD_AV_CONCURRENCY?: string;

      // Cloud Idempotency
      CLOUD_IDEMPOTENCY_TTL_SECONDS?: string;

      // Zip Extraction Limits
      ZIP_EXTRACT_MAX_ENTRIES?: string;
      ZIP_EXTRACT_MAX_ENTRY_BYTES?: string;
      ZIP_EXTRACT_MAX_TOTAL_BYTES?: string;
      ZIP_EXTRACT_MAX_RATIO?: string;

      // Mail Configuration
      MAIL_HOST: string;
      MAIL_SECURE: string;
      MAIL_FROM: string;
      MAIL_PORT: string;
      MAIL_USER: string;
      MAIL_PASSWORD: string;

      // Application Configuration
      TZ: string;
      NODE_ENV: string;
      PORT: string;
      APP_NAME?: string;
      APP_URL: string;
    }
  }

  interface UserContext {
    Id: string;
    FullName: string;
    Email: string;
    Role: Role;
    Status: Status;
    Image?: string;
  }

  interface Request {
    user: UserContext;
    TotalRowCount: number;
  }

  namespace Codes {
    namespace Error {
      const enum Global {}

      const enum Database {
        EntityMetadataNotFoundError = 'EntityMetadataNotFoundError',
        EntityNotFoundError = 'EntityNotFoundError',
        EntityConflictError = '23505',
        QueryFailedError = 'QueryFailedError',
      }

      const enum Cloud {
        FILE_NOT_FOUND = 'CL-001',
      }

      const enum User {
        NOT_FOUND = 'UR-001',
        CANNOT_BE_EMPTY = 'UR-002',
        INACTIVE = 'UR-003',
        SUSPENDED = 'UR-004',
      }

      const enum Username {
        ALREADY_EXISTS = 'UN-001',
        CANNOT_BE_EMPTY = 'UN-002',
      }

      const enum Email {
        ALREADY_EXISTS = 'ER-001',
        NOT_FOUND = 'ER-002',
        CANNOT_BE_EMPTY = 'ER-003',
        INVALID = 'ER-004',
      }

      const enum PhoneNumber {
        ALREADY_EXISTS = 'PN-001',
      }

      const enum Password {
        WRONG = 'PR-001',
        CANNOT_BE_EMPTY = 'PR-002',
        NOT_STRONG = 'PR-003',
        NOT_MATCH = 'PR-004',
      }

      const enum Subscription {
        NOT_FOUND = 'SU-001',
      }
    }
  }
}
