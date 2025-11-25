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

      // Sentry
      SENTRY_DSN?: string;
      SENTRY_AUTH_TOKEN?: string;

      // AWS S3
      S3_PROTOCOL_ACCESS_KEY_ID?: string;
      S3_PROTOCOL_ACCESS_KEY_SECRET?: string;

      STORAGE_S3_BUCKET?: string;
      STORAGE_S3_MAX_SOCKETS?: string;
      STORAGE_S3_ENDPOINT?: string;
      STORAGE_S3_PUBLIC_ENDPOINT?: string;
      STORAGE_S3_FORCE_PATH_STYLE?: string;
      STORAGE_S3_REGION?: string;

      // Mail Configuration
      MAIL_HOST: string;
      MAIL_SECURE: string;
      MAIL_FROM: string;
      MAIL_PORT: string;
      MAIL_USER: string;
      MAIL_PASS: string;

      // Application Configuration
      TZ: string;
      NODE_ENV: string;
      PORT: string;
      APP_URL: string;
    }
  }

  interface UserContext {
    id: string;
    fullName: string;
    email: string;
    role: Role;
    status: Status;
  }

  interface Request {
    user: UserContext;
    totalRowCount: number;
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
