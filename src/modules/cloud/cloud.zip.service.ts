import {
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { PassThrough, Readable } from 'stream';
import { Job, Queue, Worker } from 'bullmq';
import IORedis, { RedisOptions } from 'ioredis';
import * as unzipper from 'unzipper';
import {
  CloudExtractZipStartRequestModel,
  CloudExtractZipStartResponseModel,
  CloudExtractZipStatusRequestModel,
  CloudExtractZipStatusResponseModel,
  CloudExtractZipCancelRequestModel,
  CloudExtractZipCancelResponseModel,
} from './cloud.model';
import { CloudS3Service } from './cloud.s3.service';
import { CloudMetadataService } from './cloud.metadata.service';
import { KeyBuilder, MimeTypeFromExtension } from '@common/helpers/cast.helper';
import {
  BuildZipExtractPrefix,
  IsZipKey,
  JoinKey,
  NormalizeZipEntryPath,
} from './cloud.utils';
import { RedisService } from '@modules/redis/redis.service';

type ZipExtractJobData = {
  userId: string;
  key: string;
};

type ZipExtractJobResult = {
  extractedPath: string;
};

type ZipExtractProgress = {
  phase: 'extract';
  entriesProcessed: number;
  totalEntries: number | null;
  bytesRead: number;
  totalBytes: number;
  currentEntry?: string;
};

@Injectable()
export class CloudZipService implements OnModuleInit, OnModuleDestroy {
  private readonly Logger = new Logger(CloudZipService.name);
  private readonly EmptyFolderPlaceholder = '.emptyFolderPlaceholder';
  private readonly IsRedisEnabled =
    (process.env.REDIS_ENABLED ?? 'true').toLowerCase() !== 'false';
  private readonly ZipExtractQueueName = 'cloud-zip-extract';
  private readonly ZipExtractCancelKeyPrefix = 'cloud:zip-extract:cancel:';
  private readonly ZipExtractCancelTtlSeconds = 6 * 60 * 60; // 6 hours
  private readonly ZipExtractJobConcurrency = Math.max(
    1,
    parseInt(process.env.ZIP_EXTRACT_JOB_CONCURRENCY ?? '1', 10),
  );
  private readonly ZipExtractEntryConcurrency = Math.max(
    1,
    parseInt(process.env.ZIP_EXTRACT_ENTRY_CONCURRENCY ?? '3', 10),
  );
  private readonly ZipExtractProgressEntriesStep = Math.max(
    1,
    parseInt(process.env.ZIP_EXTRACT_PROGRESS_ENTRIES ?? '5', 10),
  );
  private readonly ZipExtractProgressBytesStep = Math.max(
    1,
    parseInt(
      process.env.ZIP_EXTRACT_PROGRESS_BYTES ?? `${5 * 1024 * 1024}`,
      10,
    ),
  );

  private ZipExtractQueue?: Queue<ZipExtractJobData, ZipExtractJobResult>;
  private ZipExtractWorker?: Worker<ZipExtractJobData, ZipExtractJobResult>;
  private ZipExtractQueueConnection?: IORedis;
  private ZipExtractWorkerConnection?: IORedis;

  constructor(
    private readonly RedisService: RedisService,
    private readonly CloudS3Service: CloudS3Service,
    private readonly CloudMetadataService: CloudMetadataService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.IsRedisEnabled) {
      this.Logger.warn(
        'Redis is disabled; zip extraction queue will not be available.',
      );
      return;
    }

    const options = this.BuildRedisConnectionOptions();
    if (!options) {
      this.Logger.warn(
        'Redis connection options are missing; zip extraction queue will not be available.',
      );
      return;
    }

    this.ZipExtractQueueConnection = new IORedis(options);
    this.ZipExtractWorkerConnection = new IORedis(options);

    this.ZipExtractQueue = new Queue(this.ZipExtractQueueName, {
      connection: this.ZipExtractQueueConnection,
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    });

    this.ZipExtractWorker = new Worker(
      this.ZipExtractQueueName,
      async (job) => this.ProcessZipExtractJob(job),
      {
        connection: this.ZipExtractWorkerConnection,
        concurrency: this.ZipExtractJobConcurrency,
      },
    );

    this.ZipExtractWorker.on('error', (error) => {
      this.Logger.error('Zip extraction worker error', error);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.ZipExtractWorker) {
      await this.ZipExtractWorker.close();
    }
    if (this.ZipExtractQueue) {
      await this.ZipExtractQueue.close();
    }
    if (this.ZipExtractWorkerConnection) {
      await this.ZipExtractWorkerConnection.quit();
    }
    if (this.ZipExtractQueueConnection) {
      await this.ZipExtractQueueConnection.quit();
    }
  }

  async ExtractZipStart(
    { Key }: CloudExtractZipStartRequestModel,
    User: UserContext,
  ): Promise<CloudExtractZipStartResponseModel> {
    if (!IsZipKey(Key)) {
      throw new HttpException(
        'Only .zip files can be extracted.',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.EnsureZipExtractQueue();

    const job = await this.ZipExtractQueue.add('extract', {
      key: Key,
      userId: User.id,
    });

    return plainToInstance(CloudExtractZipStartResponseModel, {
      JobId: job.id?.toString() ?? '',
    });
  }

  async ExtractZipStatus(
    { JobId }: CloudExtractZipStatusRequestModel,
    User: UserContext,
  ): Promise<CloudExtractZipStatusResponseModel> {
    this.EnsureZipExtractQueue();

    const job = await this.ZipExtractQueue.getJob(JobId);
    if (!job) {
      throw new HttpException('Job not found.', HttpStatus.NOT_FOUND);
    }
    if (job.data.userId !== User.id) {
      throw new HttpException('Access denied.', HttpStatus.FORBIDDEN);
    }

    const state = await job.getState();
    const progress = job.progress as ZipExtractProgress | undefined;
    const result = job.returnvalue as ZipExtractJobResult | undefined;

    return plainToInstance(CloudExtractZipStatusResponseModel, {
      JobId: job.id?.toString() ?? JobId,
      State: state,
      Progress: progress,
      ExtractedPath: result?.extractedPath,
      FailedReason: job.failedReason || undefined,
    });
  }

  async ExtractZipCancel(
    { JobId }: CloudExtractZipCancelRequestModel,
    User: UserContext,
  ): Promise<CloudExtractZipCancelResponseModel> {
    this.EnsureZipExtractQueue();

    const job = await this.ZipExtractQueue.getJob(JobId);
    if (!job) {
      throw new HttpException('Job not found.', HttpStatus.NOT_FOUND);
    }
    if (job.data.userId !== User.id) {
      throw new HttpException('Access denied.', HttpStatus.FORBIDDEN);
    }

    const state = await job.getState();
    if (state === 'completed' || state === 'failed') {
      return plainToInstance(CloudExtractZipCancelResponseModel, {
        Cancelled: false,
      });
    }

    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      return plainToInstance(CloudExtractZipCancelResponseModel, {
        Cancelled: true,
      });
    }

    await this.RedisService.set(
      this.GetZipExtractCancelKey(JobId),
      true,
      this.ZipExtractCancelTtlSeconds,
    );

    return plainToInstance(CloudExtractZipCancelResponseModel, {
      Cancelled: true,
    });
  }

  private BuildRedisConnectionOptions(): RedisOptions | null {
    const host = process.env.REDIS_HOSTNAME;
    const portValue = process.env.REDIS_PORT ?? '';
    const port = parseInt(portValue, 10);
    if (!host || Number.isNaN(port)) {
      return null;
    }
    return {
      host,
      port,
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }

  private EnsureZipExtractQueue(): void {
    if (!this.ZipExtractQueue) {
      throw new HttpException(
        'Zip extraction queue is not available.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private GetZipExtractCancelKey(jobId: string): string {
    return `${this.ZipExtractCancelKeyPrefix}${jobId}`;
  }

  private async ProcessZipExtractJob(
    job: Job<ZipExtractJobData, ZipExtractJobResult>,
  ): Promise<ZipExtractJobResult> {
    const cancelKey = this.GetZipExtractCancelKey(job.id?.toString() ?? '');
    const key = job.data.key;

    if (!IsZipKey(key)) {
      throw new Error('Only .zip files can be extracted.');
    }

    const user = { id: job.data.userId } as UserContext;

    try {
      const extractedPrefix = await this.ExtractZipToFolder(key, user, {
        onProgress: async (progress) => {
          await job.updateProgress(progress);
        },
        shouldCancel: async () => {
          const cancelled = await this.RedisService.get<boolean>(cancelKey);
          return cancelled === true;
        },
      });

      return { extractedPath: extractedPrefix };
    } finally {
      if (cancelKey) {
        await this.RedisService.del(cancelKey);
      }
    }
  }

  private async ExtractZipToFolder(
    key: string,
    User: UserContext,
    options?: {
      onProgress?: (progress: ZipExtractProgress) => Promise<void> | void;
      shouldCancel?: () => Promise<boolean> | boolean;
    },
  ): Promise<string> {
    const sourceKey = KeyBuilder([User.id, key]);
    const extractPrefix = BuildZipExtractPrefix(key);

    try {
      const object = await this.CloudS3Service.Send(
        new GetObjectCommand({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
          Key: sourceKey,
        }),
      );

      const body = object.Body as Readable;
      if (!body) {
        throw new HttpException(
          'Zip file is empty or unreadable.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const totalBytes = Number(object.ContentLength ?? 0);
      const progress = {
        entriesProcessed: 0,
        totalEntries: null as number | null,
        bytesRead: 0,
        totalBytes,
      };
      let lastProgressEntries = 0;
      let lastProgressBytes = 0;

      const maybeReportProgress = async (
        currentEntry?: string,
        force = false,
      ) => {
        if (!options?.onProgress) {
          return;
        }
        const entriesDelta = progress.entriesProcessed - lastProgressEntries;
        const bytesDelta = progress.bytesRead - lastProgressBytes;
        if (
          !force &&
          entriesDelta < this.ZipExtractProgressEntriesStep &&
          bytesDelta < this.ZipExtractProgressBytesStep
        ) {
          return;
        }
        lastProgressEntries = progress.entriesProcessed;
        lastProgressBytes = progress.bytesRead;
        await options.onProgress({
          phase: 'extract',
          entriesProcessed: progress.entriesProcessed,
          totalEntries: progress.totalEntries,
          bytesRead: progress.bytesRead,
          totalBytes: progress.totalBytes,
          currentEntry,
        });
      };

      const countingStream = new PassThrough();
      countingStream.on('data', (chunk) => {
        progress.bytesRead += chunk.length;
      });

      const parser = body
        .pipe(countingStream)
        .pipe(unzipper.Parse({ forceStream: true }));

      const inFlight = new Set<Promise<void>>();
      const enqueue = async (task: Promise<void>) => {
        inFlight.add(task);
        const cleanup = () => inFlight.delete(task);
        task.then(cleanup).catch(cleanup);
        if (inFlight.size >= this.ZipExtractEntryConcurrency) {
          await Promise.race(inFlight);
        }
      };

      let progressInterval: NodeJS.Timeout | null = null;
      if (options?.onProgress) {
        progressInterval = setInterval(() => {
          void maybeReportProgress();
        }, 1000);
        await options.onProgress({
          phase: 'extract',
          entriesProcessed: progress.entriesProcessed,
          totalEntries: progress.totalEntries,
          bytesRead: progress.bytesRead,
          totalBytes: progress.totalBytes,
        });
      }

      try {
        for await (const entry of parser) {
          if (options?.shouldCancel) {
            const cancelled = await options.shouldCancel();
            if (cancelled) {
              entry.autodrain();
              throw new Error('Zip extraction cancelled.');
            }
          }

          const normalizedPath = NormalizeZipEntryPath(entry.path);
          if (!normalizedPath) {
            entry.autodrain();
            continue;
          }

          if (entry.type === 'Directory') {
            const directoryKey = JoinKey(
              extractPrefix,
              normalizedPath,
              this.EmptyFolderPlaceholder,
            );
            const task = this.CloudS3Service.Send(
              new PutObjectCommand({
                Bucket: this.CloudS3Service.GetBuckets().Storage,
                Key: KeyBuilder([User.id, directoryKey]),
                Body: '',
              }),
            ).then(async () => {
              progress.entriesProcessed += 1;
              await maybeReportProgress(normalizedPath);
            });
            await enqueue(task);
            entry.autodrain();
            continue;
          }

          const targetKey = JoinKey(extractPrefix, normalizedPath);
          const filename = normalizedPath.split('/').pop() || '';
          const extension = filename.includes('.')
            ? filename.split('.').pop() || ''
            : '';
          const contentType = extension
            ? MimeTypeFromExtension(extension) || undefined
            : undefined;

          const task = this.CloudS3Service.Send(
            new PutObjectCommand({
              Bucket: this.CloudS3Service.GetBuckets().Storage,
              Key: KeyBuilder([User.id, targetKey]),
              Body: entry,
              ContentType: contentType,
            }),
          ).then(async () => {
            await this.CloudMetadataService.MetadataProcessor(
              KeyBuilder([User.id, targetKey]),
            );
            progress.entriesProcessed += 1;
            await maybeReportProgress(normalizedPath);
          });
          await enqueue(task);
        }

        await Promise.all(inFlight);
        if (options?.onProgress) {
          await options.onProgress({
            phase: 'extract',
            entriesProcessed: progress.entriesProcessed,
            totalEntries: progress.totalEntries,
            bytesRead: progress.bytesRead,
            totalBytes: progress.totalBytes,
          });
        }
      } finally {
        if (progressInterval) {
          clearInterval(progressInterval);
        }
      }
    } catch (error) {
      this.Logger.error(
        `Failed to extract zip for key ${key} into ${extractPrefix}`,
        error,
      );
      throw error;
    }

    return extractPrefix;
  }
}
