import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import dayjs from 'dayjs';
import * as Sentry from '@sentry/nestjs';
import { BaseStatusModel } from '@common/models/base.model';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly logger: Logger,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catch(exception: any, host: ArgumentsHost): void {
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

    const statusResponse: BaseStatusModel = {
      messages: httpMessage instanceof Array ? httpMessage : [httpMessage],
      code: httpStatus,
      timestamp: dayjs().utc().format(),
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
    };

    httpAdapter.reply(
      ctx.getResponse(),
      {
        result: null,
        status: statusResponse,
      },
      httpStatus,
    );

    if (httpStatus === 500) {
      if (process.env.NODE_ENV === 'production') {
        Sentry.captureException(exception);
      } else if (process.env.NODE_ENV === 'development') {
        // console.error(exception);
        this.logger.error(exception, 'ExceptionHandler');
      }
    }
  }
}
