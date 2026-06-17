import { Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { NotificationCleanupService } from './notification.cleanup.service';
import { NOTIFICATION_RETENTION_DAYS } from './notification.constants';

// The service uses `dayjs().utc()`; the plugin is extended in src/main.ts, which
// unit tests don't load — extend it here so the dayjs singleton matches runtime.
dayjs.extend(utc);

describe('NotificationCleanupService', () => {
  let deleteMany: jest.Mock;
  let service: NotificationCleanupService;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    deleteMany = jest.fn().mockResolvedValue({ deletedCount: 5 });
    service = new NotificationCleanupService({ deleteMany } as never);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('deletes everything older than the retention cutoff, regardless of read state', async () => {
    const before = dayjs()
      .utc()
      .subtract(NOTIFICATION_RETENTION_DAYS, 'day')
      .valueOf();

    await service.PruneExpiredNotifications();

    expect(deleteMany).toHaveBeenCalledTimes(1);
    const filter = deleteMany.mock.calls[0][0] as {
      CreatedAt: { $lt: Date };
    };
    // The only condition is the age cutoff — no IsRead filter.
    expect(Object.keys(filter)).toEqual(['CreatedAt']);
    const cutoff = filter.CreatedAt.$lt;
    expect(cutoff).toBeInstanceOf(Date);
    // Cutoff ≈ now − retention days (allow a few seconds of test drift).
    expect(Math.abs(cutoff.getTime() - before)).toBeLessThan(5000);
  });

  it('logs once when it removed records', async () => {
    await service.PruneExpiredNotifications();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('Pruned 5 notification(s)');
  });

  it('stays silent when nothing was old enough to delete', async () => {
    deleteMany.mockResolvedValue({ deletedCount: 0 });
    await service.PruneExpiredNotifications();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('swallows a DB error and logs it instead of throwing', async () => {
    deleteMany.mockRejectedValue(new Error('mongo down'));
    await expect(service.PruneExpiredNotifications()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('Notification pruning failed');
  });
});
