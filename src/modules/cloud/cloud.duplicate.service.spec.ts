import { Test, TestingModule } from '@nestjs/testing';
import { CloudDuplicateService } from './cloud.duplicate.service';
import { CloudS3Service } from './cloud.s3.service';
import { CloudDirectoryService } from './cloud.directory.service';
import { RedisService } from '@modules/redis/redis.service';
import { NotificationService } from '@modules/notification/notification.service';
import { CloudKeys } from '@modules/redis/redis.keys';
import { DuplicateScanStatus, NotificationType } from '@common/enums';

describe('CloudDuplicateService.CancelDuplicateScan', () => {
  let service: CloudDuplicateService;

  // A keyed in-memory Redis stand-in so the active-lock compare-and-delete and
  // the status writes can be asserted directly.
  const store = new Map<string, unknown>();
  const mockRedisService = {
    Get: jest.fn(async (key: string) => store.get(key)),
    Set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    Delete: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
  const mockNotificationService = {
    EmitToUser: jest.fn(),
    EmitTransientToUser: jest.fn(),
  };
  // S3 + directory spies — used to prove a cancelled-while-queued job does NO
  // listing work (the worker skips it before touching either).
  const mockS3Service = {
    Send: jest.fn(),
    GetBuckets: jest.fn(() => ({ Storage: 'bucket' })),
    GetKey: jest.fn((key: string) => key),
  };
  const mockDirectoryService = {
    GetEncryptedFolderSet: jest.fn(async () => new Set<string>()),
    GetHiddenFolderSet: jest.fn(async () => new Set<string>()),
  };

  const testUser = {
    Id: 'user-1',
    Email: 'test@test.com',
    Role: [],
    Status: undefined,
  } as unknown as UserContext;

  const statusKey = (scanId: string) => CloudKeys.DuplicateScanStatus(scanId);
  const activeKey = CloudKeys.DuplicateScanActive('user-1');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudDuplicateService,
        { provide: CloudS3Service, useValue: mockS3Service },
        { provide: RedisService, useValue: mockRedisService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: CloudDirectoryService, useValue: mockDirectoryService },
      ],
    }).compile();

    service = module.get<CloudDuplicateService>(CloudDuplicateService);
  });

  afterEach(() => {
    store.clear();
    jest.clearAllMocks();
  });

  it('releases the per-owner active lock synchronously so an immediate re-scan is possible', async () => {
    const scanId = 'scan-1';
    store.set(
      statusKey(scanId),
      JSON.stringify({ ScanId: scanId, Status: DuplicateScanStatus.SCANNING }),
    );
    store.set(activeKey, scanId);

    const res = await service.CancelDuplicateScan(scanId, testUser);

    expect(res.Cancelled).toBe(true);
    // The active lock is gone — EnqueueDuplicateScan would no longer 409.
    expect(mockRedisService.Delete).toHaveBeenCalledWith(activeKey);
    expect(store.has(activeKey)).toBe(false);
    // The cancel flag is set (so a still-running worker aborts at its next checkpoint).
    expect(store.get(CloudKeys.DuplicateScanCancel(scanId))).toBeDefined();
    // Status is settled to CANCELLED.
    expect(
      (JSON.parse(store.get(statusKey(scanId)) as string) as { Status: string })
        .Status,
    ).toBe(DuplicateScanStatus.CANCELLED);
    // The terminal event the client settles the job on is emitted.
    expect(mockNotificationService.EmitToUser).toHaveBeenCalledWith(
      'user-1',
      NotificationType.DUPLICATE_SCAN_CANCELLED,
      expect.any(String),
      expect.any(String),
      { ScanId: scanId },
    );
  });

  it('does NOT clear the active lock when the owner has already started a newer scan (compare-and-delete)', async () => {
    const oldScan = 'scan-old';
    const newScan = 'scan-new';
    store.set(
      statusKey(oldScan),
      JSON.stringify({ ScanId: oldScan, Status: DuplicateScanStatus.SCANNING }),
    );
    // The owner's lock now points at a freshly-started scan.
    store.set(activeKey, newScan);

    await service.CancelDuplicateScan(oldScan, testUser);

    // The newer scan keeps its lock.
    expect(mockRedisService.Delete).not.toHaveBeenCalledWith(activeKey);
    expect(store.get(activeKey)).toBe(newScan);
  });

  it('returns Cancelled:false and leaves the lock untouched when the scan already finished', async () => {
    const scanId = 'scan-done';
    store.set(
      statusKey(scanId),
      JSON.stringify({ ScanId: scanId, Status: DuplicateScanStatus.COMPLETED }),
    );
    store.set(activeKey, 'someone-else');

    const res = await service.CancelDuplicateScan(scanId, testUser);

    expect(res.Cancelled).toBe(false);
    expect(mockRedisService.Delete).not.toHaveBeenCalled();
    expect(mockNotificationService.EmitToUser).not.toHaveBeenCalled();
  });

  // The worker must not waste a full S3 listing on a job that was already
  // cancelled while it sat queued — otherwise a backlog of cancelled jobs
  // starves the live scan behind the single-concurrency worker (it stays
  // PENDING). The skip happens before any listing/hashing.
  it('skips a job cancelled while queued without any S3 listing, and leaves the live scan’s lock intact', async () => {
    const scanId = 'queued-cancelled';
    store.set(
      statusKey(scanId),
      JSON.stringify({ ScanId: scanId, Status: DuplicateScanStatus.PENDING }),
    );
    store.set(CloudKeys.DuplicateScanCancel(scanId), JSON.stringify(true));
    store.set(activeKey, 'live-scan'); // a different, live scan owns the lock

    await (
      service as unknown as {
        ProcessDuplicateScanJob: (job: unknown) => Promise<void>;
      }
    ).ProcessDuplicateScanJob({
      data: {
        ScanId: scanId,
        UserId: 'user-1',
        OwnerId: 'user-1',
        Path: '/',
        Recursive: true,
        SimilarityThreshold: 95,
      },
    });

    // No listing, no manifest reads — the job cost ~nothing.
    expect(mockS3Service.Send).not.toHaveBeenCalled();
    expect(mockDirectoryService.GetEncryptedFolderSet).not.toHaveBeenCalled();
    // It settled to CANCELLED…
    expect(
      (JSON.parse(store.get(statusKey(scanId)) as string) as { Status: string })
        .Status,
    ).toBe(DuplicateScanStatus.CANCELLED);
    // …and (compare-and-delete) never touched the live scan's lock.
    expect(store.get(activeKey)).toBe('live-scan');
  });

  it('blocks a new scan only while the locked scan is genuinely running', async () => {
    store.set(activeKey, 'live-scan');
    store.set(
      statusKey('live-scan'),
      JSON.stringify({ ScanId: 'live-scan', Status: DuplicateScanStatus.SCANNING }),
    );
    (
      service as unknown as { ScanQueue: { add: jest.Mock } }
    ).ScanQueue = { add: jest.fn() };

    await expect(
      service.EnqueueDuplicateScan(
        { Path: '/', Recursive: true, SimilarityThreshold: 95 },
        testUser,
      ),
    ).rejects.toThrow(/already in progress/);
  });

  it('overwrites a STALE lock (locked scan already terminal) and starts a new scan', async () => {
    store.set(activeKey, 'stale-scan');
    store.set(
      statusKey('stale-scan'),
      JSON.stringify({ ScanId: 'stale-scan', Status: DuplicateScanStatus.COMPLETED }),
    );
    const add = jest.fn();
    (service as unknown as { ScanQueue: { add: jest.Mock } }).ScanQueue = { add };

    const res = await service.EnqueueDuplicateScan(
      { Path: '/', Recursive: true, SimilarityThreshold: 95 },
      testUser,
    );

    // A stale lock must not wedge the next scan — it starts, and the lock now
    // points at the new scan.
    expect(res.ScanId).toBeTruthy();
    expect(res.ScanId).not.toBe('stale-scan');
    expect(add).toHaveBeenCalledTimes(1);
    expect(store.get(activeKey)).toBe(res.ScanId);
  });
});
