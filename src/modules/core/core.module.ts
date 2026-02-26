import Modules from '@modules';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CoreController } from './core.controller';
import { CoreService } from './core.service';
import { SentryModule } from '@sentry/nestjs/setup';
import { HttpExceptionFilter } from '@common/filters/http-exception.filter';
import { APP_FILTER, HttpAdapterHost } from '@nestjs/core';
import { RequireRoleConstraint } from '@common/decorators/role-field.decorator';
import { NotificationService } from '@modules/notification/notification.service';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 1000,
      },
    ]),
    ...Modules,
  ],
  controllers: [CoreController],
  providers: [
    CoreService,
    Logger,
    RequireRoleConstraint,
    {
      provide: APP_FILTER,
      useFactory: (
        httpAdapterHost: HttpAdapterHost,
        logger: Logger,
        notificationService: NotificationService,
      ) =>
        new HttpExceptionFilter(httpAdapterHost, logger, notificationService),
      inject: [HttpAdapterHost, Logger, NotificationService],
    },
  ],
})
export class CoreModule {}
