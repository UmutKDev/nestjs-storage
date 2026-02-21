import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { HttpException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CloudUserStorageUsageResponseModel } from './cloud.model';
import { UserSubscriptionEntity } from '@entities/user-subscription.entity';
import { CloudS3Service } from './cloud.s3.service';
import { KeyBuilder } from '@common/helpers/cast.helper';
import { RedisService } from '@modules/redis/redis.service';

@Injectable()
export class CloudUsageService {
  private readonly MaxObjectSizeBytes = 50 * 1024 * 1024; // 50 MB

  private readonly DefaultDownloadSpeeds: Record<string, number> = {
    free: 50 * 1024, // 50 KB/s
    pro: 500 * 1024, // 500 KB/s
    enterprise: 5 * 1024 * 1024, // 5 MB/s
  };

  private readonly DefaultDownloadSpeedBytesPerSec = 50 * 1024; // 50 KB/s fallback

  @InjectRepository(UserSubscriptionEntity)
  private UserSubscriptionRepository: Repository<UserSubscriptionEntity>;

  constructor(
    private readonly CloudS3Service: CloudS3Service,
    private readonly RedisService: RedisService,
  ) {}

  async GetDownloadSpeedBytesPerSec(User: UserContext): Promise<number> {
    const userSubscription = await this.UserSubscriptionRepository.findOne({
      where: {
        User: {
          Id: User.Id,
        },
      },
      relations: ['Subscription'],
    });

    if (!userSubscription || !userSubscription.Subscription) {
      return this.DefaultDownloadSpeedBytesPerSec;
    }

    const sub = userSubscription.Subscription;
    if (sub.Features && typeof sub.Features === 'object') {
      const raw = (sub.Features as Record<string, never>)[
        'downloadSpeedBytesPerSec'
      ];
      if (typeof raw === 'number' && raw > 0) {
        return raw;
      }
    }

    if (sub.Slug && this.DefaultDownloadSpeeds[sub.Slug]) {
      return this.DefaultDownloadSpeeds[sub.Slug];
    }

    return this.DefaultDownloadSpeedBytesPerSec;
  }

  async UserStorageUsage(
    User: UserContext,
  ): Promise<CloudUserStorageUsageResponseModel> {
    const userSubscription = await this.UserSubscriptionRepository.findOne({
      where: {
        User: {
          Id: User.Id,
        },
      },
      relations: ['Subscription'],
    });

    if (!userSubscription || !userSubscription?.Subscription) {
      throw new HttpException(Codes.Error.Subscription.NOT_FOUND, 404);
    }

    const totalSize = await this.GetOrSeedUsage(User.Id);

    return plainToInstance(CloudUserStorageUsageResponseModel, {
      UsedStorageInBytes: totalSize,
      MaxStorageInBytes: userSubscription
        ? userSubscription.Subscription.StorageLimitBytes
        : null,
      IsLimitExceeded: userSubscription
        ? userSubscription.Subscription.StorageLimitBytes !== null &&
          totalSize > userSubscription.Subscription.StorageLimitBytes
        : false,
      UsagePercentage:
        userSubscription && userSubscription.Subscription.StorageLimitBytes
          ? (totalSize / userSubscription.Subscription.StorageLimitBytes) * 100
          : null,
      MaxUploadSizeBytes:
        userSubscription.Subscription.MaxUploadSizeBytes ||
        this.MaxObjectSizeBytes,
    });
  }

  async IncrementUsage(userId: string, deltaBytes: number): Promise<number> {
    if (!deltaBytes) {
      const current = await this.GetOrSeedUsage(userId);
      return current;
    }
    const current = await this.GetOrSeedUsage(userId);
    const next = Math.max(0, current + deltaBytes);
    await this.SetUsage(userId, next);
    return next;
  }

  async DecrementUsage(userId: string, deltaBytes: number): Promise<number> {
    if (!deltaBytes) {
      const current = await this.GetOrSeedUsage(userId);
      return current;
    }
    return this.IncrementUsage(userId, -Math.abs(deltaBytes));
  }

  private async GetOrSeedUsage(userId: string): Promise<number> {
    const cached = await this.GetUsage(userId);
    if (typeof cached === 'number') {
      return cached;
    }

    const totalSize = await this.ComputeUsageFromS3(userId);
    await this.SetUsage(userId, totalSize);
    return totalSize;
  }

  private BuildUsageKey(userId: string): string {
    return `cloud:usage:${userId}`;
  }

  private async GetUsage(userId: string): Promise<number | null> {
    const raw = await this.RedisService.Get<string>(this.BuildUsageKey(userId));
    if (raw === undefined || raw === null) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private async SetUsage(userId: string, value: number): Promise<void> {
    await this.RedisService.Set(this.BuildUsageKey(userId), String(value));
  }

  private async ComputeUsageFromS3(userId: string): Promise<number> {
    let continuationToken: string | undefined = undefined;
    let totalSize = 0;

    do {
      const command = await this.CloudS3Service.Send(
        new ListObjectsV2Command({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
          Prefix: KeyBuilder([userId, '']),
          ContinuationToken: continuationToken,
        }),
      );

      const contents = command.Contents || [];
      for (const content of contents) {
        if (content.Size) {
          totalSize += content.Size;
        }
      }

      continuationToken = command.IsTruncated
        ? command.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return totalSize;
  }
}
