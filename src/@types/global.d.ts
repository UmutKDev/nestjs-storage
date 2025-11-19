import { Role, Status } from '@common/enums';

export declare global {
  type AnyObject = Record<string, unknown>;

  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      PORT?: string;

      // Database
      DATABASE_HOST: string;
      DATABASE_PORT: string;
      DATABASE_USERNAME: string;
      DATABASE_PASSWORD: string;
      DATABASE_NAME: string;
      DATABASE_SCHEMA: string;
      DATABASE_SYNCHRONIZE: 'true' | 'false';
      DATABASE_CACERT?: string;

      // Sentry
      SENTRY_DSN?: string;
      SENTRY_AUTH_TOKEN?: string;

      // AWS S3
      AWS_S3_BUCKET?: string;
      AWS_CLOUDFRONT_ENDPOINT?: string;
      AWS_CLOUDFRONT_PUBLIC_ENDPOINT?: string;
      AWS_SECRET_ACCESS_KEY?: string;
      AWS_ACCESS_KEY_ID?: string;

      // Mail
      MAIL_HOST?: string;
      MAIL_SECURE?: 'true' | 'false';
      MAIL_FROM?: string;
      MAIL_PORT?: string;
      MAIL_USER?: string;
      MAIL_PASS?: string;

      // Application
      TZ?: string;
      APP_URL?: string;
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
    }
  }
}
