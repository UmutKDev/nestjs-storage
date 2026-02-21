import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SubscriptionPostBodyRequestModel,
  SubscriptionPutBodyRequestModel,
  UserSubscriptionResponseModel,
  SubscriptionListResponseModel,
  SubscriptionFindResponseModel,
} from './subscription.model';
import { SubscriptionEntity } from '@entities/subscription.entity';
import { UserSubscriptionEntity } from '@entities/user-subscription.entity';
import { UserEntity } from '@entities/user.entity';
import { plainToInstance } from 'class-transformer';
import { SubscriptionStatus } from '@common/enums/subscription.enum';
import { RedisService } from '@modules/redis/redis.service';
import { SubscriptionKeys } from '@modules/redis/redis.keys';

@Injectable()
export class SubscriptionService {
  /** Cache TTL for subscription list (seconds) */
  private readonly ListCacheTtl = 1800; // 30 minutes

  /** Cache TTL for user subscription (seconds) */
  private readonly UserSubscriptionCacheTtl = 600; // 10 minutes

  constructor(
    @InjectRepository(SubscriptionEntity)
    private subscriptionRepository: Repository<SubscriptionEntity>,
    @InjectRepository(UserSubscriptionEntity)
    private userSubscriptionRepository: Repository<UserSubscriptionEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private readonly RedisService: RedisService,
  ) {}

  async List(): Promise<SubscriptionListResponseModel[]> {
    const cached = await this.RedisService.Get<SubscriptionListResponseModel[]>(
      SubscriptionKeys.List,
    );
    if (cached) return cached;

    const result = await this.subscriptionRepository.find({
      withDeleted: true,
    });
    const mapped = plainToInstance(SubscriptionListResponseModel, result);
    await this.RedisService.Set(
      SubscriptionKeys.List,
      mapped,
      this.ListCacheTtl,
    );
    return mapped;
  }

  async Find({ id }: { id: string }): Promise<SubscriptionFindResponseModel> {
    const entity = await this.subscriptionRepository.findOneOrFail({
      where: { Id: id },
    });
    return plainToInstance(SubscriptionFindResponseModel, entity);
  }

  async Create({
    model,
  }: {
    model: SubscriptionPostBodyRequestModel;
  }): Promise<boolean> {
    const newEntity = this.subscriptionRepository.create({
      Name: model.Name,
      Slug: model.Slug,
      Description: model.Description,
      Price: model.Price,
      Currency: model.Currency,
      BillingCycle: model.BillingCycle,
      StorageLimitBytes: model.StorageLimitBytes,
      MaxObjectCount: model.MaxObjectCount,
      Features: model.Features,
      Status: model.Status,
    });
    await this.subscriptionRepository.save(newEntity);
    await this.RedisService.Delete(SubscriptionKeys.List);
    return true;
  }

  async Edit({
    id,
    model,
  }: {
    id: string;
    model: SubscriptionPutBodyRequestModel;
  }): Promise<boolean> {
    await this.subscriptionRepository.findOneOrFail({ where: { Id: id } });
    await this.subscriptionRepository.update(
      { Id: id },
      {
        Name: model.Name,
        Description: model.Description,
        Price: model.Price,
        Currency: model.Currency,
        BillingCycle: model.BillingCycle,
        StorageLimitBytes: model.StorageLimitBytes,
        MaxObjectCount: model.MaxObjectCount,
        Features: model.Features,
        Status: model.Status,
      },
    );
    await this.RedisService.Delete(SubscriptionKeys.List);
    return true;
  }

  async Delete({ id }: { id: string }): Promise<boolean> {
    await this.subscriptionRepository.findOneOrFail({ where: { Id: id } });
    await this.subscriptionRepository.softDelete({ Id: id });
    await this.RedisService.Delete(SubscriptionKeys.List);
    return true;
  }

  async SubscribeAsAdmin({
    userId,
    subscriptionId,
    isTrial,
  }: {
    userId: string;
    subscriptionId: string;
    isTrial?: boolean;
  }): Promise<boolean> {
    await this.userRepository.findOneOrFail({ where: { Id: userId } });

    const subscription = await this.subscriptionRepository.findOneOrFail({
      where: { Id: subscriptionId },
    });

    // Mevcut aktif abonelik varsa sonlandır
    const existingSubscription = await this.userSubscriptionRepository.findOne({
      where: { User: { Id: userId } },
    });

    if (existingSubscription) {
      existingSubscription.EndAt = new Date();
      existingSubscription.Status = SubscriptionStatus.CANCELLED;
      await this.userSubscriptionRepository.save(existingSubscription);
      // Eski aboneliği sil
      await this.userSubscriptionRepository.remove(existingSubscription);
    }

    const entity = this.userSubscriptionRepository.create({
      User: {
        Id: userId,
      },
      Subscription: {
        Id: subscriptionId,
      },
      Status: isTrial ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
      StartAt: new Date(),
      Currency: subscription.Currency,
      BillingCycle: subscription.BillingCycle,
    });

    await this.userSubscriptionRepository.save(entity);

    // Invalidate user subscription cache
    await this.RedisService.Delete(SubscriptionKeys.UserSubscription(userId));

    return true;
  }

  async SubscribeSelf({
    userId,
    subscriptionId,
    isTrial,
  }: {
    userId: string;
    subscriptionId: string;
    isTrial?: boolean;
  }): Promise<boolean> {
    // ensure user exists
    await this.userRepository.findOneOrFail({ where: { Id: userId } });

    const subscription = await this.subscriptionRepository.findOneOrFail({
      where: { Id: subscriptionId },
    });

    // Mevcut aktif abonelik varsa sonlandır
    const existingSubscription = await this.userSubscriptionRepository.findOne({
      where: { User: { Id: userId } },
    });

    if (existingSubscription) {
      existingSubscription.EndAt = new Date();
      existingSubscription.Status = SubscriptionStatus.CANCELLED;
      await this.userSubscriptionRepository.save(existingSubscription);
      // Eski aboneliği sil
      await this.userSubscriptionRepository.remove(existingSubscription);
    }

    const entity = this.userSubscriptionRepository.create({
      User: {
        Id: userId,
      },
      Subscription: {
        Id: subscriptionId,
      },
      Status: isTrial ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
      StartAt: new Date(),
      Currency: subscription.Currency,
      BillingCycle: subscription.BillingCycle,
    });

    await this.userSubscriptionRepository.save(entity);

    // Invalidate user subscription cache
    await this.RedisService.Delete(SubscriptionKeys.UserSubscription(userId));

    return true;
  }

  async GetCurrentForUser({
    userId,
  }: {
    userId: string;
  }): Promise<UserSubscriptionResponseModel | null> {
    // Try Redis cache first
    const cacheKey = SubscriptionKeys.UserSubscription(userId);
    const cached =
      await this.RedisService.Get<UserSubscriptionResponseModel>(cacheKey);
    if (cached !== undefined && cached !== null) return cached;

    const entity = await this.userSubscriptionRepository.findOne({
      where: {
        User: { Id: userId },
      },
      relations: ['Subscription'],
    });

    if (!entity) return null;

    const result = plainToInstance(UserSubscriptionResponseModel, entity);
    await this.RedisService.Set(
      cacheKey,
      result,
      this.UserSubscriptionCacheTtl,
    );
    return result;
  }

  async Unsubscribe({ id }: { id: string }): Promise<boolean> {
    const entity = await this.userSubscriptionRepository.findOneOrFail({
      where: { Id: id },
      relations: ['User'],
    });
    const userId = entity.User?.Id;
    entity.EndAt = new Date();
    entity.Status = SubscriptionStatus.CANCELLED;
    await this.userSubscriptionRepository.save(entity);
    // Aboneliği tamamen sil
    await this.userSubscriptionRepository.remove(entity);
    if (userId) {
      await this.RedisService.Delete(SubscriptionKeys.UserSubscription(userId));
    }
    return true;
  }

  async UnsubscribeByUser({ userId }: { userId: string }): Promise<boolean> {
    const entity = await this.userSubscriptionRepository.findOne({
      where: { User: { Id: userId } },
    });

    if (!entity) throw new ForbiddenException('No active subscription found');

    entity.EndAt = new Date();
    entity.Status = SubscriptionStatus.CANCELLED;
    await this.userSubscriptionRepository.save(entity);
    // Aboneliği tamamen sil
    await this.userSubscriptionRepository.remove(entity);
    await this.RedisService.Delete(SubscriptionKeys.UserSubscription(userId));
    return true;
  }
}
