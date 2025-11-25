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
      where: { id },
    });
    return plainToInstance(SubscriptionFindResponseModel, entity);
  }

  async Create({
    model,
  }: {
    model: SubscriptionPostBodyRequestModel;
  }): Promise<boolean> {
    const newEntity = this.subscriptionRepository.create(model);
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
    await this.subscriptionRepository.findOneOrFail({ where: { id } });
    await this.subscriptionRepository.update({ id }, model);
    return true;
  }

  async Delete({ id }: { id: string }): Promise<boolean> {
    await this.subscriptionRepository.findOneOrFail({ where: { id } });
    await this.subscriptionRepository.softDelete({ id });
    return true;
  }

  async SubscribeAsAdmin({
    userId,
    subscriptionId,
    isTrial,
    providerSubscriptionId,
  }: {
    userId: string;
    subscriptionId: string;
    isTrial?: boolean;
    providerSubscriptionId?: string;
  }): Promise<boolean> {
    await this.userRepository.findOneOrFail({ where: { id: userId } });

    const subscription = await this.subscriptionRepository.findOneOrFail({
      where: { id: subscriptionId },
    });

    const entity = this.userSubscriptionRepository.create({
      user: {
        id: userId,
      },
      subscription: {
        id: subscriptionId,
      },
      status: isTrial ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
      startAt: new Date(),
      currency: subscription.currency,
      billingCycle: subscription.billingCycle,
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
    await this.userRepository.findOneOrFail({ where: { id: userId } });

    const subscription = await this.subscriptionRepository.findOneOrFail({
      where: { id: subscriptionId },
    });

    const entity = this.userSubscriptionRepository.create({
      user: {
        id: userId,
      },
      subscription: {
        id: subscriptionId,
      },
      status: isTrial ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
      startAt: new Date(),
      currency: subscription.currency,
      billingCycle: subscription.billingCycle,
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
        user: { id: userId },
        status: SubscriptionStatus.ACTIVE || SubscriptionStatus.TRIALING,
      },
      relations: ['subscription'],
    });

    if (!entity) return null;

    return plainToInstance(UserSubscriptionResponseModel, entity);
  }

  async ListForUser({
    userId,
  }: {
    userId: string;
  }): Promise<UserSubscriptionResponseModel[]> {
    const result = await this.userSubscriptionRepository.find({
      where: { user: { id: userId } },
      relations: ['subscription'],
    });
    return plainToInstance(UserSubscriptionResponseModel, result);
  }

  async Unsubscribe({ id }: { id: string }): Promise<boolean> {
    const entity = await this.userSubscriptionRepository.findOneOrFail({
      where: { id },
    });
    entity.endAt = new Date();
    await this.userSubscriptionRepository.save(entity);
    return true;
  }

  async UnsubscribeByUser({
    id,
    userId,
  }: {
    id: string;
    userId: string;
  }): Promise<boolean> {
    const entity = await this.userSubscriptionRepository.findOneOrFail({
      where: { id },
    });
    if (entity.user.id !== userId) throw new ForbiddenException('Not owner');
    entity.endAt = new Date();
    await this.userSubscriptionRepository.save(entity);
    return true;
  }
}
