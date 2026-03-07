import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import dayjs from 'dayjs';
import { RedisService } from '@modules/redis/redis.service';
import { ApiUsageKeys } from '@modules/redis/redis.keys';
import {
  API_USAGE_MONTHLY_TTL,
  API_USAGE_DAILY_TTL,
} from '@modules/redis/redis.ttl';
import {
  ApiUsageLog,
  ApiUsageLogDocument,
} from '@schemas/api-usage-log.schema';
import {
  USAGE_FLUSH_BATCH_SIZE,
  USAGE_FLUSH_CRON,
} from '@modules/api/api.constants';

export interface ApiUsageEntry {
  UserId: string;
  ApiKeyId: string;
  Method: string;
  Endpoint: string;
  StatusCode: number;
  ResponseTimeMs: number;
  RequestBodyBytes: number;
  ResponseBodyBytes: number;
  IpAddress?: string;
  CountryCode?: string;
  City?: string;
  Latitude?: number;
  Longitude?: number;
  UserAgent?: string;
  IdempotencyKey?: string;
  ApiVersion?: string;
}

@Injectable()
export class ApiUsageService {
  private readonly Logger = new Logger(ApiUsageService.name);

  /** In-memory buffer for usage entries pending DB flush */
  private Buffer: ApiUsageEntry[] = [];

  constructor(
    private readonly RedisService: RedisService,
    @InjectModel(ApiUsageLog.name)
    private readonly UsageLogModel: Model<ApiUsageLogDocument>,
  ) {}

  /**
   * Record a single API request.
   *
   * Increments monthly, daily, and per-endpoint Redis counters and pushes
   * the entry into an in-memory buffer that is periodically flushed to
   * the database.
   */
  async RecordRequest(Entry: ApiUsageEntry): Promise<void> {
    const yearMonth = dayjs().format('YYYY-MM');
    const date = dayjs().format('YYYY-MM-DD');

    // ── Increment monthly counter ──────────────────────────────────────────
    const monthlyKey = ApiUsageKeys.MonthlyCounter(Entry.UserId, yearMonth);
    const monthlyCount = (await this.RedisService.Get<number>(monthlyKey)) ?? 0;
    await this.RedisService.Set(
      monthlyKey,
      monthlyCount + 1,
      API_USAGE_MONTHLY_TTL,
    );

    // ── Increment daily counter ────────────────────────────────────────────
    const dailyKey = ApiUsageKeys.DailyCounter(Entry.UserId, date);
    const dailyCount = (await this.RedisService.Get<number>(dailyKey)) ?? 0;
    await this.RedisService.Set(dailyKey, dailyCount + 1, API_USAGE_DAILY_TTL);

    // ── Increment endpoint counter ─────────────────────────────────────────
    const endpointKey = ApiUsageKeys.EndpointCounter(
      Entry.UserId,
      yearMonth,
      Entry.Endpoint,
    );
    const endpointCount =
      (await this.RedisService.Get<number>(endpointKey)) ?? 0;
    await this.RedisService.Set(
      endpointKey,
      endpointCount + 1,
      API_USAGE_MONTHLY_TTL,
    );

    // ── Push to in-memory buffer ───────────────────────────────────────────
    this.Buffer.push(Entry);
  }

  /**
   * Periodically flush the in-memory buffer into MongoDB.
   *
   * Runs every 5 minutes (`USAGE_FLUSH_CRON`). Entries are inserted in
   * batches of `USAGE_FLUSH_BATCH_SIZE` to avoid overwhelming the database.
   */
  @Cron(USAGE_FLUSH_CRON)
  async FlushBufferToDatabase(): Promise<void> {
    if (this.Buffer.length === 0) {
      return;
    }

    // Swap the buffer so new entries can accumulate while we flush
    const entries = this.Buffer.splice(0);

    this.Logger.log(`Flushing ${entries.length} usage entries to MongoDB...`);

    for (let i = 0; i < entries.length; i += USAGE_FLUSH_BATCH_SIZE) {
      const batch = entries.slice(i, i + USAGE_FLUSH_BATCH_SIZE);

      try {
        await this.UsageLogModel.insertMany(
          batch.map((entry) => ({
            UserId: entry.UserId,
            ApiKeyId: entry.ApiKeyId,
            Method: entry.Method,
            Endpoint: entry.Endpoint,
            StatusCode: entry.StatusCode,
            ResponseTimeMs: entry.ResponseTimeMs,
            RequestBodyBytes: entry.RequestBodyBytes,
            ResponseBodyBytes: entry.ResponseBodyBytes,
            IpAddress: entry.IpAddress,
            CountryCode: entry.CountryCode,
            City: entry.City,
            Latitude: entry.Latitude,
            Longitude: entry.Longitude,
            UserAgent: entry.UserAgent,
            IdempotencyKey: entry.IdempotencyKey,
            ApiVersion: entry.ApiVersion,
          })),
          { ordered: false },
        );
      } catch (error) {
        this.Logger.error(
          `Failed to flush usage batch (${batch.length} entries): ${error.message}`,
          error.stack,
        );
        // Re-queue failed entries so they are retried on the next tick
        this.Buffer.unshift(...batch);
        break;
      }
    }
  }

  /**
   * Get the total request count for a user in a given month.
   *
   * @param YearMonth Format `YYYY-MM`. Defaults to the current month.
   */
  async GetMonthlyUsage(UserId: string, YearMonth?: string): Promise<number> {
    const ym = YearMonth ?? dayjs().format('YYYY-MM');
    const key = ApiUsageKeys.MonthlyCounter(UserId, ym);
    return (await this.RedisService.Get<number>(key)) ?? 0;
  }

  /**
   * Get the total request count for a user on a given day.
   *
   * @param Date Format `YYYY-MM-DD`. Defaults to today.
   */
  async GetDailyUsage(UserId: string, Date?: string): Promise<number> {
    const d = Date ?? dayjs().format('YYYY-MM-DD');
    const key = ApiUsageKeys.DailyCounter(UserId, d);
    return (await this.RedisService.Get<number>(key)) ?? 0;
  }

  /**
   * Paginated usage history aggregated by date.
   */
  async GetUsageHistory(
    UserId: string,
    Skip: number,
    Take: number,
  ): Promise<{ Items: Record<string, unknown>[]; Count: number }> {
    const [result] = await this.UsageLogModel.aggregate([
      { $match: { UserId } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$CreatedAt' },
          },
          RequestCount: { $sum: 1 },
          AvgResponseTimeMs: { $avg: '$ResponseTimeMs' },
          TotalRequestBytes: { $sum: '$RequestBodyBytes' },
          TotalResponseBytes: { $sum: '$ResponseBodyBytes' },
        },
      },
      { $sort: { _id: -1 } },
      {
        $facet: {
          Items: [
            { $skip: Skip },
            { $limit: Take },
            {
              $project: {
                Date: '$_id',
                RequestCount: 1,
                AvgResponseTimeMs: 1,
                TotalRequestBytes: 1,
                TotalResponseBytes: 1,
                _id: 0,
              },
            },
          ],
          Count: [{ $count: 'total' }],
        },
      },
    ]);

    return {
      Items: result.Items,
      Count: result.Count[0]?.total ?? 0,
    };
  }

  /**
   * Per-endpoint request breakdown for a user in a given month.
   */
  async GetEndpointBreakdown(
    UserId: string,
    YearMonth: string,
  ): Promise<Record<string, unknown>[]> {
    const [year, month] = YearMonth.split('-').map(Number);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    return this.UsageLogModel.aggregate([
      {
        $match: {
          UserId,
          CreatedAt: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: { Endpoint: '$Endpoint', Method: '$Method' },
          RequestCount: { $sum: 1 },
          AvgResponseTimeMs: { $avg: '$ResponseTimeMs' },
        },
      },
      { $sort: { RequestCount: -1 } },
      {
        $project: {
          Endpoint: '$_id.Endpoint',
          Method: '$_id.Method',
          RequestCount: 1,
          AvgResponseTimeMs: 1,
          _id: 0,
        },
      },
    ]);
  }
}
