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

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(SubscriptionEntity)
    private subscriptionRepository: Repository<SubscriptionEntity>,
    @InjectRepository(UserSubscriptionEntity)
    private userSubscriptionRepository: Repository<UserSubscriptionEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
  ) {}

  async List(): Promise<SubscriptionListResponseModel[]> {
    const result = await this.subscriptionRepository.find({
      withDeleted: true,
    });
    return plainToInstance(SubscriptionListResponseModel, result);
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
    return true;
  }

  async Delete({ id }: { id: string }): Promise<boolean> {
    await this.subscriptionRepository.findOneOrFail({ where: { Id: id } });
    await this.subscriptionRepository.softDelete({ Id: id });
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

    return true;
  }

  async GetCurrentForUser({
    userId,
  }: {
    userId: string;
  }): Promise<UserSubscriptionResponseModel | null> {
    const entity = await this.userSubscriptionRepository.findOne({
      where: {
        User: { Id: userId },
      },
      relations: ['Subscription'],
    });

    if (!entity) return null;

    return plainToInstance(UserSubscriptionResponseModel, entity);
  }

  async Unsubscribe({ id }: { id: string }): Promise<boolean> {
    const entity = await this.userSubscriptionRepository.findOneOrFail({
      where: { Id: id },
    });
    entity.EndAt = new Date();
    entity.Status = SubscriptionStatus.CANCELLED;
    await this.userSubscriptionRepository.save(entity);
    // Aboneliği tamamen sil
    await this.userSubscriptionRepository.remove(entity);
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
    return true;
  }
}
