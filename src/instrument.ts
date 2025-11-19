import * as Sentry from '@sentry/nestjs';
import {
  getAutoPerformanceIntegrations,
  postgresIntegration,
  nestIntegration,
  anrIntegration,
} from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    nestIntegration,
    nodeProfilingIntegration(),
    postgresIntegration(),
    anrIntegration({ captureStackTrace: true }),
    ...getAutoPerformanceIntegrations(),
  ],
  enabled: process.env.NODE_ENV === 'production',
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
  sampleRate: 0.25,
});
