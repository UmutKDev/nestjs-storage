import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';
import {
  getAutoPerformanceIntegrations,
  postgresIntegration,
  nestIntegration,
  consoleLoggingIntegration,
} from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  enabled: process.env.NODE_ENV === 'production',
  environment: process.env.NODE_ENV,
  dsn: process.env.SENTRY_DSN,
  integrations: [
    nodeProfilingIntegration(),
    postgresIntegration(),
    nestIntegration(),
    consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    ...getAutoPerformanceIntegrations(),
  ],
  enableLogs: true,
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  profileSessionSampleRate: 1.0,
  profileLifecycle: 'trace',
  sendDefaultPii: true,
});

Sentry.metrics.count('button_click', 1);
Sentry.metrics.gauge('page_load_time', 150);
Sentry.metrics.distribution('response_time', 200);
