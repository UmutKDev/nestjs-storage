import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { RedisService } from '@modules/redis/redis.service';
import { WebhookKeys } from '@modules/redis/redis.keys';
import { WEBHOOK_USER_CACHE_TTL } from '@modules/redis/redis.ttl';
import { WebhookEntity } from '@entities/webhook.entity';
import { WebhookDeliveryEntity } from '@entities/webhook-delivery.entity';
import { WebhookEvent, WebhookDeliveryStatus } from '@common/enums/api.enum';
import { NotificationService } from '@modules/notification/notification.service';
import { ApiWebhookDispatcherService } from './api-webhook-dispatcher.service';
import { WEBHOOK_SECRET_PREFIX } from '../api.constants';

@Injectable()
export class ApiWebhookService {
  private readonly Logger = new Logger(ApiWebhookService.name);

  constructor(
    @InjectRepository(WebhookEntity)
    private readonly WebhookRepository: Repository<WebhookEntity>,
    @InjectRepository(WebhookDeliveryEntity)
    private readonly DeliveryRepository: Repository<WebhookDeliveryEntity>,
    private readonly RedisService: RedisService,
    private readonly DispatcherService: ApiWebhookDispatcherService,
    private readonly NotificationService: NotificationService,
  ) {}

  /**
   * Create a new webhook for a user.
   */
  async Create(
    UserId: string,
    Model: {
      Name: string;
      Url: string;
      Events: WebhookEvent[];
      MaxRetries?: number;
      TimeoutSeconds?: number;
      Headers?: Record<string, string>;
    },
  ): Promise<WebhookEntity> {
    const Secret = WEBHOOK_SECRET_PREFIX + randomBytes(32).toString('hex');

    const Webhook = this.WebhookRepository.create({
      UserId,
      Name: Model.Name,
      Url: Model.Url,
      Events: Model.Events,
      Secret,
      MaxRetries: Model.MaxRetries ?? 3,
      TimeoutSeconds: Model.TimeoutSeconds ?? 30,
      Headers: Model.Headers ?? null,
    });

    const Saved = await this.WebhookRepository.save(Webhook);

    await this.RedisService.Delete(WebhookKeys.UserWebhooks(UserId));

    return Saved;
  }

  /**
   * Update an existing webhook.
   */
  async Update(
    UserId: string,
    WebhookId: string,
    Model: Partial<{
      Name: string;
      Url: string;
      Events: WebhookEvent[];
      IsActive: boolean;
      MaxRetries: number;
      TimeoutSeconds: number;
      Headers: Record<string, string>;
    }>,
  ): Promise<WebhookEntity> {
    const Webhook = await this.WebhookRepository.findOne({
      where: { Id: WebhookId, UserId },
    });

    if (!Webhook) {
      throw new NotFoundException('Webhook not found');
    }

    if (Model.Name !== undefined) Webhook.Name = Model.Name;
    if (Model.Url !== undefined) Webhook.Url = Model.Url;
    if (Model.Events !== undefined) Webhook.Events = Model.Events;
    if (Model.IsActive !== undefined) Webhook.IsActive = Model.IsActive;
    if (Model.MaxRetries !== undefined) Webhook.MaxRetries = Model.MaxRetries;
    if (Model.TimeoutSeconds !== undefined)
      Webhook.TimeoutSeconds = Model.TimeoutSeconds;
    if (Model.Headers !== undefined) Webhook.Headers = Model.Headers;

    const Updated = await this.WebhookRepository.save(Webhook);

    await this.RedisService.Delete(WebhookKeys.UserWebhooks(UserId));

    return Updated;
  }

  /**
   * Soft-delete a webhook.
   */
  async Delete(UserId: string, WebhookId: string): Promise<boolean> {
    const Result = await this.WebhookRepository.softDelete({
      Id: WebhookId,
      UserId,
    });

    await this.RedisService.Delete(WebhookKeys.UserWebhooks(UserId));

    return (Result.affected ?? 0) > 0;
  }

  /**
   * List all active webhooks for a user (cached in Redis).
   */
  async List(UserId: string): Promise<WebhookEntity[]> {
    const CacheKey = WebhookKeys.UserWebhooks(UserId);
    const Cached = await this.RedisService.Get<WebhookEntity[]>(CacheKey);

    if (Cached) {
      return Cached;
    }

    const Webhooks = await this.WebhookRepository.find({
      where: { UserId, IsActive: true },
      order: { CreatedAt: 'DESC' },
    });

    await this.RedisService.Set(CacheKey, Webhooks, WEBHOOK_USER_CACHE_TTL);

    return Webhooks;
  }

  /**
   * Get a single webhook by ID (includes soft-deleted for viewing).
   */
  async GetById(UserId: string, WebhookId: string): Promise<WebhookEntity> {
    const Webhook = await this.WebhookRepository.findOne({
      where: { Id: WebhookId, UserId },
      withDeleted: true,
    });

    if (!Webhook) {
      throw new NotFoundException('Webhook not found');
    }

    return Webhook;
  }

  /**
   * Dispatch a webhook event to all matching user webhooks.
   */
  async DispatchEvent(
    UserId: string,
    Event: WebhookEvent,
    Payload: Record<string, unknown>,
  ): Promise<void> {
    const Webhooks = await this.List(UserId);

    const Matching = Webhooks.filter((w) => w.Events.includes(Event));

    for (const Webhook of Matching) {
      const Delivery = this.DeliveryRepository.create({
        WebhookId: Webhook.Id,
        Event,
        Payload,
        Status: WebhookDeliveryStatus.PENDING,
      });

      const SavedDelivery = await this.DeliveryRepository.save(Delivery);

      this.DispatcherService.Deliver(SavedDelivery, Webhook).catch((err) =>
        this.Logger.error(
          `Failed to dispatch webhook ${Webhook.Id}: ${err.message}`,
          err.stack,
        ),
      );
    }
  }

  /**
   * Send a test delivery for a webhook.
   */
  async TestWebhook(
    UserId: string,
    WebhookId: string,
  ): Promise<WebhookDeliveryEntity> {
    const Webhook = await this.GetById(UserId, WebhookId);

    const Event =
      Webhook.Events.length > 0
        ? Webhook.Events[0]
        : WebhookEvent.FILE_UPLOADED;

    const Delivery = this.DeliveryRepository.create({
      WebhookId: Webhook.Id,
      Event,
      Payload: {
        Test: true,
        Event,
        Timestamp: new Date().toISOString(),
        Data: { Message: 'This is a test webhook delivery' },
      },
      Status: WebhookDeliveryStatus.PENDING,
    });

    const SavedDelivery = await this.DeliveryRepository.save(Delivery);

    this.DispatcherService.Deliver(SavedDelivery, Webhook).catch((err) =>
      this.Logger.error(
        `Failed to deliver test webhook ${Webhook.Id}: ${err.message}`,
        err.stack,
      ),
    );

    return SavedDelivery;
  }

  /**
   * Get paginated delivery history for a webhook.
   */
  async GetDeliveries(
    WebhookId: string,
    Skip: number,
    Take: number,
  ): Promise<{ Items: WebhookDeliveryEntity[]; Count: number }> {
    const [Items, Count] = await this.DeliveryRepository.findAndCount({
      where: { WebhookId },
      order: { CreatedAt: 'DESC' },
      skip: Skip,
      take: Take,
    });

    return { Items, Count };
  }
}
