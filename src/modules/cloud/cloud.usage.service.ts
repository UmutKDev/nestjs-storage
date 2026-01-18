import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { HttpException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CloudUserStorageUsageResponseModel } from './cloud.model';
import { UserSubscriptionEntity } from '@entities/user-subscription.entity';
import { CloudS3Service } from './cloud.s3.service';
import { KeyBuilder } from '@common/helpers/cast.helper';

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

  constructor(private readonly CloudS3Service: CloudS3Service) {}

  async GetDownloadSpeedBytesPerSec(User: UserContext): Promise<number> {
    const userSubscription = await this.UserSubscriptionRepository.findOne({
      where: {
        user: {
          id: User.id,
        },
      },
      relations: ['subscription'],
    });

    if (!userSubscription || !userSubscription.subscription) {
      return this.DefaultDownloadSpeedBytesPerSec;
    }

    const sub = userSubscription.subscription;
    if (sub.features && typeof sub.features === 'object') {
      const raw = (sub.features as Record<string, never>)[
        'downloadSpeedBytesPerSec'
      ];
      if (typeof raw === 'number' && raw > 0) {
        return raw;
      }
    }

    if (sub.slug && this.DefaultDownloadSpeeds[sub.slug]) {
      return this.DefaultDownloadSpeeds[sub.slug];
    }

    return this.DefaultDownloadSpeedBytesPerSec;
  }

  async UserStorageUsage(
    User: UserContext,
  ): Promise<CloudUserStorageUsageResponseModel> {
    let continuationToken: string | undefined = undefined;
    let totalSize = 0;

    const userSubscription = await this.UserSubscriptionRepository.findOne({
      where: {
        user: {
          id: User.id,
        },
      },
    });

    do {
      const command = await this.CloudS3Service.Send(
        new ListObjectsV2Command({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
          Prefix: KeyBuilder([User.id, '']),
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

    if (!userSubscription || !userSubscription?.subscription) {
      throw new HttpException(Codes.Error.Subscription.NOT_FOUND, 404);
    }

    return plainToInstance(CloudUserStorageUsageResponseModel, {
      UsedStorageInBytes: totalSize,
      MaxStorageInBytes: userSubscription
        ? userSubscription.subscription.storageLimitBytes
        : null,
      IsLimitExceeded: userSubscription
        ? userSubscription.subscription.storageLimitBytes !== null &&
          totalSize > userSubscription.subscription.storageLimitBytes
        : false,
      UsagePercentage:
        userSubscription && userSubscription.subscription.storageLimitBytes
          ? (totalSize / userSubscription.subscription.storageLimitBytes) * 100
          : null,
      MaxUploadSizeBytes:
        userSubscription.subscription.maxUploadSizeBytes ||
        this.MaxObjectSizeBytes,
    });
  }
}
