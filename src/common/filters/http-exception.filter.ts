import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import dayjs from 'dayjs';
import * as Sentry from '@sentry/nestjs';
import { BaseStatusModel } from '@common/models/base.model';
import { NotificationService } from '@modules/notification/notification.service';
import { NotificationType } from '@common/enums';

/** HTTP status codes that trigger a notification to the authenticated user. */
const NOTIFIABLE_STATUS_CODES = new Set([
  429, // Too Many Requests
  413, // Payload Too Large
  507, // Insufficient Storage
]);

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly logger: Logger,
    @Optional()
    private readonly notificationService?: NotificationService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catch(exception: any, host: ArgumentsHost): void {
    // Only handle HTTP context — WebSocket exceptions are handled by the gateway
    if (host.getType() !== 'http') return;

    const { httpAdapter } = this.httpAdapterHost;

    const ctx = host.switchToHttp();

    const httpMessage = exception?.response?.message
      ? exception?.response?.message.length === 1
        ? exception?.response?.message[0]
        : exception?.response?.message
      : exception.response
        ? exception.response
        : 'Internal Server Error';

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const requestPath = httpAdapter.getRequestUrl(ctx.getRequest());

    const statusResponse: BaseStatusModel = {
      Messages: httpMessage instanceof Array ? httpMessage : [httpMessage],
      Code: httpStatus,
      Timestamp: dayjs().utc().format(),
      Path: requestPath,
    };

    httpAdapter.reply(
      ctx.getResponse(),
      {
        Result: null,
        Status: statusResponse,
      },
      httpStatus,
    );

    // --- Notification emission for critical errors ---
    if (this.notificationService) {
      const request = ctx.getRequest();
      const user: UserContext | undefined = request?.user;

      if (user?.Id) {
        const shouldNotify =
          httpStatus >= 500 || NOTIFIABLE_STATUS_CODES.has(httpStatus);

        if (shouldNotify) {
          const notificationType =
            httpStatus === 429
              ? NotificationType.RATE_LIMIT
              : NotificationType.ERROR;

          const title =
            httpStatus === 429
              ? 'Rate Limit Exceeded'
              : httpStatus === 413
                ? 'File Too Large'
                : httpStatus === 507
                  ? 'Insufficient Storage'
                  : 'Server Error';

          const message =
            httpMessage instanceof Array
              ? httpMessage.join(', ')
              : typeof httpMessage === 'string'
                ? httpMessage
                : 'An unexpected error occurred';

          this.notificationService.EmitToUser(
            user.Id,
            notificationType,
            title,
            message,
            { Code: httpStatus, Path: requestPath },
          );
        }
      }
    }

    if (httpStatus === 500) {
      if (process.env.NODE_ENV === 'production') {
        Sentry.captureException(exception);
        Sentry.logger.error(exception, {
          action: 'ExceptionHandler',
        });
      } else if (process.env.NODE_ENV === 'development') {
        // console.error(exception);
        this.logger.error(exception, 'ExceptionHandler');
      }
    }
  }
}
