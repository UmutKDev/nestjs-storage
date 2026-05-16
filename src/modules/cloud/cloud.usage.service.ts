import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CloudUserStorageUsageResponseModel } from './cloud.model';
import { UserSubscriptionEntity } from '@entities/user-subscription.entity';
import { TeamEntity } from '@entities/team.entity';
import { CloudS3Service } from './cloud.s3.service';
import { KeyBuilder } from '@common/helpers/cast.helper';
import { GetStorageOwnerId } from './cloud.context';
import { RedisService } from '@modules/redis/redis.service';
import { NotificationService } from '@modules/notification/notification.service';
import { NotificationType } from '@common/enums';

const TEAM_OWNER_PREFIX = 'team/';

type QuotaContext = {
  limit: number | null;
  recipientUserIds: string[];
};

@Injectable()
export class CloudUsageService {
  private readonly Logger = new Logger(CloudUsageService.name);
  private readonly MaxObjectSizeBytes = 50 * 1024 * 1024; // 50 MB

  private readonly DefaultDownloadSpeeds: Record<string, number> = {
    free: 50 * 1024, // 50 KB/s
    pro: 500 * 1024, // 500 KB/s
    enterprise: 5 * 1024 * 1024, // 5 MB/s
  };

  private readonly DefaultDownloadSpeedBytesPerSec = 50 * 1024; // 50 KB/s fallback

  @InjectRepository(UserSubscriptionEntity)
  private UserSubscriptionRepository: Repository<UserSubscriptionEntity>;

  @InjectRepository(TeamEntity)
  private TeamRepository: Repository<TeamEntity>;

  constructor(
    private readonly CloudS3Service: CloudS3Service,
    private readonly RedisService: RedisService,
    private readonly NotificationService: NotificationService,
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

    const totalSize = await this.GetOrSeedUsage(GetStorageOwnerId(User));

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

  async IncrementUsage(ownerId: string, deltaBytes: number): Promise<number> {
    if (!deltaBytes) {
      const current = await this.GetOrSeedUsage(ownerId);
      return current;
    }
    const current = await this.GetOrSeedUsage(ownerId);
    const next = Math.max(0, current + deltaBytes);
    await this.SetUsage(ownerId, next);

    // Check quota thresholds and emit warnings
    await this.CheckAndEmitQuotaWarning(ownerId, current, next);

    return next;
  }

  async DecrementUsage(ownerId: string, deltaBytes: number): Promise<number> {
    if (!deltaBytes) {
      const current = await this.GetOrSeedUsage(ownerId);
      return current;
    }
    return this.IncrementUsage(ownerId, -Math.abs(deltaBytes));
  }

  private async GetOrSeedUsage(ownerId: string): Promise<number> {
    const cached = await this.GetUsage(ownerId);
    if (typeof cached === 'number') {
      return cached;
    }

    const totalSize = await this.ComputeUsageFromS3(ownerId);
    await this.SetUsage(ownerId, totalSize);
    return totalSize;
  }

  private BuildUsageKey(ownerId: string): string {
    return `cloud:usage:${ownerId}`;
  }

  private async GetUsage(ownerId: string): Promise<number | null> {
    const raw = await this.RedisService.Get<string>(this.BuildUsageKey(ownerId));
    if (raw === undefined || raw === null) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private async SetUsage(ownerId: string, value: number): Promise<void> {
    await this.RedisService.Set(this.BuildUsageKey(ownerId), String(value));
  }

  private async ComputeUsageFromS3(ownerId: string): Promise<number> {
    let continuationToken: string | undefined = undefined;
    let totalSize = 0;

    do {
      const command = await this.CloudS3Service.Send(
        new ListObjectsV2Command({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
          Prefix: KeyBuilder([ownerId, '']),
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

  /**
   * Emit quota warning notifications when usage crosses thresholds (80%, 90%, 100%).
   * Only emits when the threshold is newly crossed (previousUsage was below, currentUsage is above).
   *
   * ownerId may be either a personal user UUID or a team scope ("team/{teamId}").
   * Routing and recipient resolution happen in ResolveQuotaContext — for team scopes
   * the notification fans out to every team member.
   */
  private async CheckAndEmitQuotaWarning(
    ownerId: string,
    previousUsage: number,
    currentUsage: number,
  ): Promise<void> {
    try {
      const { limit, recipientUserIds } =
        await this.ResolveQuotaContext(ownerId);

      if (!limit || recipientUserIds.length === 0) return;

      const previousPct = (previousUsage / limit) * 100;
      const currentPct = (currentUsage / limit) * 100;

      const formatSize = (bytes: number): string => {
        if (bytes >= 1024 * 1024 * 1024)
          return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
        if (bytes >= 1024 * 1024)
          return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / 1024).toFixed(1)} KB`;
      };

      if (currentPct >= 100 && previousPct < 100) {
        this.NotificationService.EmitToUsers(
          recipientUserIds,
          NotificationType.QUOTA_EXCEEDED,
          'Storage Limit Exceeded',
          `Storage limit exceeded (${formatSize(currentUsage)} / ${formatSize(limit)}).`,
          {
            UsagePercentage: Math.round(currentPct),
            UsedBytes: currentUsage,
            LimitBytes: limit,
          },
        );
      } else if (currentPct >= 90 && previousPct < 90) {
        this.NotificationService.EmitToUsers(
          recipientUserIds,
          NotificationType.QUOTA_WARNING,
          'Storage Almost Full',
          `Using ${Math.round(currentPct)}% of storage (${formatSize(currentUsage)} / ${formatSize(limit)}).`,
          {
            UsagePercentage: Math.round(currentPct),
            UsedBytes: currentUsage,
            LimitBytes: limit,
          },
        );
      } else if (currentPct >= 80 && previousPct < 80) {
        this.NotificationService.EmitToUsers(
          recipientUserIds,
          NotificationType.QUOTA_WARNING,
          'Storage Usage Warning',
          `Using ${Math.round(currentPct)}% of storage (${formatSize(currentUsage)} / ${formatSize(limit)}).`,
          {
            UsagePercentage: Math.round(currentPct),
            UsedBytes: currentUsage,
            LimitBytes: limit,
          },
        );
      }
    } catch (error) {
      this.Logger.warn(
        `Failed to check quota thresholds for owner ${ownerId}: ${(error as Error).message}`,
      );
    }
  }

  private async ResolveQuotaContext(ownerId: string): Promise<QuotaContext> {
    if (ownerId.startsWith(TEAM_OWNER_PREFIX)) {
      const teamId = ownerId.slice(TEAM_OWNER_PREFIX.length);
      const team = await this.TeamRepository.findOne({
        where: { Id: teamId },
        relations: ['Members', 'Members.User'],
      });
      if (!team) return { limit: null, recipientUserIds: [] };
      return {
        limit: team.StorageLimitBytes ?? null,
        recipientUserIds: (team.Members ?? [])
          .map((m) => m.User?.Id)
          .filter((id): id is string => !!id),
      };
    }

    const subscription = await this.UserSubscriptionRepository.findOne({
      where: { User: { Id: ownerId } },
      relations: ['Subscription'],
    });
    return {
      limit: subscription?.Subscription?.StorageLimitBytes ?? null,
      recipientUserIds: subscription ? [ownerId] : [],
    };
  }
}
