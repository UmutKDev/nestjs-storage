import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import dayjs from 'dayjs';
import {
  NotificationHistory,
  NotificationHistoryDocument,
} from '@schemas/notification-history.schema';
import {
  NOTIFICATION_CLEANUP_CRON,
  NOTIFICATION_RETENTION_DAYS,
} from './notification.constants';

/**
 * Prunes aged notification history. Replaces the collection's former 90-day TTL
 * index with an explicit, env-configurable, logged job (the app owns retention,
 * not the DB). Discovered via the global `ScheduleModule.forRoot()` registered in
 * ApiModule — no `ScheduleModule` import needed here.
 */
@Injectable()
export class NotificationCleanupService {
  private readonly Logger = new Logger(NotificationCleanupService.name);

  constructor(
    @InjectModel(NotificationHistory.name)
    private readonly NotificationHistoryModel: Model<NotificationHistoryDocument>,
  ) {}

  /**
   * Delete every notification older than the retention cutoff, regardless of
   * read state. Runs on `NOTIFICATION_CLEANUP_CRON` (default daily at 03:00).
   * Logs only when it actually removed something (mirrors the api-module cron
   * services), and swallows errors so a transient DB blip never crashes the tick.
   */
  @Cron(NOTIFICATION_CLEANUP_CRON)
  async PruneExpiredNotifications(): Promise<void> {
    const cutoff = dayjs()
      .utc()
      .subtract(NOTIFICATION_RETENTION_DAYS, 'day')
      .toDate();

    try {
      const result = await this.NotificationHistoryModel.deleteMany({
        CreatedAt: { $lt: cutoff },
      });

      const deleted = result.deletedCount ?? 0;
      if (deleted > 0) {
        this.Logger.log(
          `Pruned ${deleted} notification(s) older than ${NOTIFICATION_RETENTION_DAYS} day(s) (cutoff ${cutoff.toISOString()})`,
        );
      }
    } catch (error) {
      this.Logger.error(
        `Notification pruning failed: ${error.message}`,
        error.stack,
      );
    }
  }
}
