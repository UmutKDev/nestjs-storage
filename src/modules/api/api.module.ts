import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';

// Entities
import { WebhookEntity } from '@entities/webhook.entity';
import { WebhookDeliveryEntity } from '@entities/webhook-delivery.entity';

// External modules
import { CloudModule } from '@modules/cloud/cloud.module';
import { AuthenticationModule } from '@modules/authentication/authentication.module';
import { SubscriptionModule } from '@modules/subscription/subscription.module';

// Services
import { ApiSignatureService } from './services/api-signature.service';
import { ApiGeolocationService } from './services/api-geolocation.service';
import { ApiRateLimitService } from './services/api-rate-limit.service';
import { ApiQuotaService } from './services/api-quota.service';
import { ApiUsageService } from './services/api-usage.service';
import { ApiWebhookService } from './services/api-webhook.service';
import { ApiWebhookDispatcherService } from './services/api-webhook-dispatcher.service';

// Guards
import { ApiAuthGuard } from './guards/api-auth.guard';
import { ApiScopeGuard } from './guards/api-scope.guard';
import { ApiQuotaGuard } from './guards/api-quota.guard';
import { ApiRateLimitGuard } from './guards/api-rate-limit.guard';

// Interceptors
import { ApiGeolocationInterceptor } from './interceptors/api-geolocation.interceptor';
import { ApiIdempotencyInterceptor } from './interceptors/api-idempotency.interceptor';
import { ApiUsageTrackingInterceptor } from './interceptors/api-usage-tracking.interceptor';

// Controllers
import { ApiStorageController } from './controllers/api-storage.controller';
import { ApiUploadController } from './controllers/api-upload.controller';
import { ApiDownloadController } from './controllers/api-download.controller';
import { ApiDirectoryController } from './controllers/api-directory.controller';
import { ApiWebhookController } from './controllers/api-webhook.controller';
import { ApiUsageController } from './controllers/api-usage.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEntity, WebhookDeliveryEntity]),
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3,
    }),
    ScheduleModule.forRoot(),
    CloudModule,
    AuthenticationModule,
    SubscriptionModule,
  ],
  controllers: [
    ApiStorageController,
    ApiUploadController,
    ApiDownloadController,
    ApiDirectoryController,
    ApiWebhookController,
    ApiUsageController,
  ],
  providers: [
    // Services
    ApiSignatureService,
    ApiGeolocationService,
    ApiRateLimitService,
    ApiQuotaService,
    ApiUsageService,
    ApiWebhookService,
    ApiWebhookDispatcherService,

    // Guards
    ApiAuthGuard,
    ApiScopeGuard,
    ApiQuotaGuard,
    ApiRateLimitGuard,

    // Interceptors
    ApiGeolocationInterceptor,
    ApiIdempotencyInterceptor,
    ApiUsageTrackingInterceptor,
  ],
  exports: [ApiWebhookService, ApiUsageService, ApiQuotaService],
})
export class ApiModule {}
