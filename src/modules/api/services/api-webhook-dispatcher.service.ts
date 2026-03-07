import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '@modules/redis/redis.service';
import { WebhookEntity } from '@entities/webhook.entity';
import { WebhookDeliveryEntity } from '@entities/webhook-delivery.entity';
import { WebhookDeliveryStatus } from '@common/enums/api.enum';
import { NotificationType } from '@common/enums';
import { NotificationService } from '@modules/notification/notification.service';
import { ApiSignatureService } from './api-signature.service';
import {
  WEBHOOK_MAX_CONSECUTIVE_FAILURES,
  WEBHOOK_RETRY_BACKOFFS,
  WEBHOOK_RETRY_CRON,
} from '../api.constants';

@Injectable()
export class ApiWebhookDispatcherService {
  private readonly Logger = new Logger(ApiWebhookDispatcherService.name);

  constructor(
    private readonly HttpService: HttpService,
    @InjectRepository(WebhookDeliveryEntity)
    private readonly DeliveryRepository: Repository<WebhookDeliveryEntity>,
    @InjectRepository(WebhookEntity)
    private readonly WebhookRepository: Repository<WebhookEntity>,
    private readonly RedisService: RedisService,
    private readonly NotificationService: NotificationService,
    private readonly ApiSignatureService: ApiSignatureService,
  ) {}

  /**
   * Deliver a webhook payload to the configured URL.
   *
   * On success (2xx): marks delivery as SUCCESS, resets consecutive failures.
   * On failure: retries with exponential back-off or marks as FAILED after exhausting retries.
   */
  async Deliver(
    Delivery: WebhookDeliveryEntity,
    Webhook: WebhookEntity,
  ): Promise<void> {
    const StartTime = Date.now();

    try {
      const PayloadString = JSON.stringify(Delivery.Payload);
      const Timestamp = Math.floor(Date.now() / 1000).toString();
      const Signature = this.ApiSignatureService.GenerateWebhookSignature(
        Webhook.Secret,
        PayloadString,
        Timestamp,
      );

      const Headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Id': Webhook.Id,
        'X-Webhook-Signature': `sha256=${Signature}`,
        'X-Webhook-Timestamp': Timestamp,
        'User-Agent': 'NestJS-Storage-Webhook/1.0',
        ...(Webhook.Headers ?? {}),
      };

      const Response = await firstValueFrom(
        this.HttpService.post(Webhook.Url, PayloadString, {
          headers: Headers,
          timeout: Webhook.TimeoutSeconds * 1000,
        }),
      );

      // ── Success ─────────────────────────────────────────────────────────
      const ResponseTimeMs = Date.now() - StartTime;

      Delivery.Status = WebhookDeliveryStatus.SUCCESS;
      Delivery.DeliveredAt = new Date();
      Delivery.HttpStatusCode = Response.status;
      Delivery.ResponseTimeMs = ResponseTimeMs;
      Delivery.ResponseBody =
        typeof Response.data === 'string'
          ? Response.data.slice(0, 1024)
          : JSON.stringify(Response.data).slice(0, 1024);

      Webhook.ConsecutiveFailures = 0;
      Webhook.LastDeliveredAt = new Date();

      await this.DeliveryRepository.save(Delivery);
      await this.WebhookRepository.save(Webhook);
    } catch (error) {
      // ── Failure ─────────────────────────────────────────────────────────
      const ResponseTimeMs = Date.now() - StartTime;

      Delivery.AttemptCount = (Delivery.AttemptCount ?? 0) + 1;
      Delivery.ResponseTimeMs = ResponseTimeMs;
      Delivery.ErrorMessage = error.message ?? 'Unknown error';

      if (error.response) {
        Delivery.HttpStatusCode = error.response.status;
      }

      if (Delivery.AttemptCount < Webhook.MaxRetries) {
        // ── Schedule retry ──────────────────────────────────────────────
        Delivery.Status = WebhookDeliveryStatus.RETRYING;

        const BackoffIndex = Math.min(
          Delivery.AttemptCount - 1,
          WEBHOOK_RETRY_BACKOFFS.length - 1,
        );
        const BackoffSeconds = WEBHOOK_RETRY_BACKOFFS[BackoffIndex];

        Delivery.NextRetryAt = new Date(Date.now() + BackoffSeconds * 1000);
      } else {
        // ── Exhausted retries ───────────────────────────────────────────
        Delivery.Status = WebhookDeliveryStatus.FAILED;

        Webhook.ConsecutiveFailures = (Webhook.ConsecutiveFailures ?? 0) + 1;

        if (Webhook.ConsecutiveFailures >= WEBHOOK_MAX_CONSECUTIVE_FAILURES) {
          Webhook.IsActive = false;

          this.NotificationService.EmitToUser(
            Webhook.UserId,
            NotificationType.WEBHOOK_DELIVERY_FAILED,
            'Webhook Disabled',
            `Your webhook "${Webhook.Name}" has been disabled after ${WEBHOOK_MAX_CONSECUTIVE_FAILURES} consecutive failures.`,
            { WebhookId: Webhook.Id, WebhookName: Webhook.Name },
          );
        }
      }

      await this.DeliveryRepository.save(Delivery);
      await this.WebhookRepository.save(Webhook);

      this.Logger.warn(
        `Webhook delivery ${Delivery.Id} failed (attempt ${Delivery.AttemptCount}/${Webhook.MaxRetries}): ${error.message}`,
      );
    }
  }

  /**
   * Process all deliveries that are in RETRYING status and due for retry.
   *
   * Runs on a cron schedule defined by `WEBHOOK_RETRY_CRON`.
   */
  @Cron(WEBHOOK_RETRY_CRON)
  async ProcessRetries(): Promise<void> {
    const Deliveries = await this.DeliveryRepository.find({
      where: {
        Status: WebhookDeliveryStatus.RETRYING,
        NextRetryAt: LessThanOrEqual(new Date()),
      },
      relations: ['Webhook'],
    });

    if (Deliveries.length === 0) {
      return;
    }

    this.Logger.log(`Processing ${Deliveries.length} webhook retries...`);

    for (const Delivery of Deliveries) {
      if (!Delivery.Webhook) {
        this.Logger.warn(
          `Skipping delivery ${Delivery.Id} — webhook relation not loaded`,
        );
        continue;
      }

      this.Deliver(Delivery, Delivery.Webhook).catch((err) =>
        this.Logger.error(
          `Retry failed for delivery ${Delivery.Id}: ${err.message}`,
          err.stack,
        ),
      );
    }
  }
}
