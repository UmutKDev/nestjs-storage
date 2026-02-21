import { GetObjectCommand } from '@aws-sdk/client-s3';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Readable } from 'stream';
import { Job, Queue, Worker } from 'bullmq';
import IORedis, { RedisOptions } from 'ioredis';
import * as net from 'net';
import { CloudS3Service } from './cloud.s3.service';
import { RedisService } from '@modules/redis/redis.service';
import { CloudKeys } from '@modules/redis/redis.keys';
import { KeyBuilder } from '@common/helpers/cast.helper';

type ScanJobData = {
  userId: string;
  key: string;
};

type ScanResult = {
  status: 'pending' | 'clean' | 'infected' | 'error' | 'skipped';
  reason?: string;
  signature?: string;
  scannedAt?: string;
};

@Injectable()
export class CloudScanService implements OnModuleInit, OnModuleDestroy {
  private readonly Logger = new Logger(CloudScanService.name);
  private readonly IsRedisEnabled =
    (process.env.REDIS_ENABLED ?? 'true').toLowerCase() !== 'false';
  private readonly IsScanEnabled =
    (process.env.CLOUD_AV_ENABLED ?? 'false').toLowerCase() === 'true';
  private readonly QueueName = 'cloud-av-scan';
  private readonly MaxScanBytes = Math.max(
    1,
    parseInt(process.env.CLOUD_AV_MAX_BYTES ?? `${200 * 1024 * 1024}`, 10),
  );
  private readonly SocketTimeoutMs = Math.max(
    1000,
    parseInt(process.env.CLOUD_AV_SOCKET_TIMEOUT_MS ?? '60000', 10),
  );
  private readonly Concurrency = Math.max(
    1,
    parseInt(process.env.CLOUD_AV_CONCURRENCY ?? '2', 10),
  );

  private Queue?: Queue<ScanJobData, void>;
  private Worker?: Worker<ScanJobData, void>;
  private QueueConnection?: IORedis;
  private WorkerConnection?: IORedis;

  constructor(
    private readonly CloudS3Service: CloudS3Service,
    private readonly RedisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.IsRedisEnabled || !this.IsScanEnabled) {
      return;
    }

    const options = this.BuildRedisConnectionOptions();
    if (!options) {
      this.Logger.warn('Redis config missing; AV scan queue disabled.');
      return;
    }

    this.QueueConnection = new IORedis(options);
    this.WorkerConnection = new IORedis(options);

    this.Queue = new Queue(this.QueueName, {
      connection: this.QueueConnection,
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      },
    });

    this.Worker = new Worker(
      this.QueueName,
      async (job) => this.ProcessScanJob(job),
      {
        connection: this.WorkerConnection,
        concurrency: this.Concurrency,
      },
    );

    this.Worker.on('error', (error) => {
      this.Logger.error('AV worker error', error);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.Worker) {
      await this.Worker.close();
    }
    if (this.Queue) {
      await this.Queue.close();
    }
    if (this.WorkerConnection) {
      await this.WorkerConnection.quit();
    }
    if (this.QueueConnection) {
      await this.QueueConnection.quit();
    }
  }

  async EnqueueScan(userId: string, key: string): Promise<void> {
    if (!this.IsScanEnabled || !this.Queue) {
      return;
    }
    await this.SetStatus(userId, key, { status: 'pending' });
    await this.Queue.add('scan', { userId, key });
  }

  async GetScanStatus(userId: string, key: string): Promise<ScanResult | null> {
    const statusKey = CloudKeys.ScanStatus(userId, key);
    const raw = await this.RedisService.Get<string>(statusKey);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as ScanResult;
    } catch {
      return null;
    }
  }

  private async ProcessScanJob(job: Job<ScanJobData, void>): Promise<void> {
    const { userId, key } = job.data;
    try {
      const object = await this.CloudS3Service.Send(
        new GetObjectCommand({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
          Key: KeyBuilder([userId, key]),
        }),
      );
      const size = Number(object.ContentLength ?? 0);
      if (size > this.MaxScanBytes) {
        await this.SetStatus(userId, key, {
          status: 'skipped',
          reason: 'size_limit',
          scannedAt: new Date().toISOString(),
        });
        return;
      }

      const stream = object.Body as Readable;
      const result = await this.ScanStreamWithClamAV(stream);
      await this.SetStatus(userId, key, {
        ...result,
        scannedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.Logger.error(`AV scan failed for ${key}`, error as Error);
      await this.SetStatus(userId, key, {
        status: 'error',
        reason: 'scan_failed',
        scannedAt: new Date().toISOString(),
      });
    }
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

  private async SetStatus(
    userId: string,
    key: string,
    result: ScanResult,
  ): Promise<void> {
    const statusKey = CloudKeys.ScanStatus(userId, key);
    await this.RedisService.Set(statusKey, JSON.stringify(result));
  }

  private async ScanStreamWithClamAV(stream: Readable): Promise<ScanResult> {
    const host = process.env.CLOUD_AV_HOST;
    const port = parseInt(process.env.CLOUD_AV_PORT ?? '', 10);
    if (!host || Number.isNaN(port)) {
      return { status: 'error', reason: 'clamav_not_configured' };
    }

    return new Promise<ScanResult>((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      let response = '';
      let timedOut = false;

      const cleanup = () => {
        socket.removeAllListeners();
      };

      const fail = (err: Error) => {
        if (!timedOut) {
          cleanup();
          reject(err);
        }
      };

      socket.setTimeout(this.SocketTimeoutMs, () => {
        timedOut = true;
        socket.destroy(new Error('ClamAV socket timeout'));
      });

      socket.on('error', fail);
      socket.on('data', (chunk) => {
        response += chunk.toString('utf8');
      });
      socket.on('end', () => {
        cleanup();
        const normalized = response.trim();
        if (normalized.endsWith('OK')) {
          resolve({ status: 'clean' });
          return;
        }
        if (normalized.includes('FOUND')) {
          const signature = normalized.split('FOUND')[0]?.trim();
          resolve({ status: 'infected', signature });
          return;
        }
        resolve({ status: 'error', reason: 'clamav_unknown_response' });
      });

      socket.on('connect', async () => {
        try {
          socket.write('zINSTREAM\0');
          for await (const chunk of stream) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            const size = Buffer.alloc(4);
            size.writeUInt32BE(buffer.length, 0);
            if (!socket.write(size)) {
              await new Promise((r) => socket.once('drain', r));
            }
            if (!socket.write(buffer)) {
              await new Promise((r) => socket.once('drain', r));
            }
          }
          socket.write(Buffer.alloc(4));
          socket.end();
        } catch (err) {
          fail(err as Error);
        }
      });
    });
  }
}
