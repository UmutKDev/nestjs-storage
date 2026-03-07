import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from '@schemas/audit-log.schema';

export interface AuditLogEntry {
  UserId: string;
  TeamId?: string;
  Action: string;
  Resource: string;
  ResourceId?: string;
  Details?: Record<string, unknown>;
  IpAddress?: string;
  UserAgent?: string;
  Result: 'SUCCESS' | 'FAILURE';
}

@Injectable()
export class AuditLogService {
  private readonly Logger = new Logger(AuditLogService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly AuditLogModel: Model<AuditLogDocument>,
  ) {}

  /**
   * Record an audit log entry. Fire-and-forget — never throws.
   */
  async Record(Entry: AuditLogEntry): Promise<void> {
    try {
      await this.AuditLogModel.create(Entry);
    } catch (error) {
      this.Logger.error(
        `Failed to record audit log: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Get paginated audit log for a user.
   */
  async GetUserAuditLog(
    UserId: string,
    Skip: number,
    Take: number,
    Action?: string,
  ): Promise<{ Items: AuditLogDocument[]; Count: number }> {
    const filter: Record<string, unknown> = { UserId };
    if (Action) filter.Action = Action;

    const [Items, Count] = await Promise.all([
      this.AuditLogModel.find(filter)
        .sort({ CreatedAt: -1 })
        .skip(Skip)
        .limit(Take)
        .lean()
        .exec(),
      this.AuditLogModel.countDocuments(filter),
    ]);

    return { Items: Items as AuditLogDocument[], Count };
  }

  /**
   * Get paginated audit log for a team.
   */
  async GetTeamAuditLog(
    TeamId: string,
    Skip: number,
    Take: number,
  ): Promise<{ Items: AuditLogDocument[]; Count: number }> {
    const [Items, Count] = await Promise.all([
      this.AuditLogModel.find({ TeamId })
        .sort({ CreatedAt: -1 })
        .skip(Skip)
        .limit(Take)
        .lean()
        .exec(),
      this.AuditLogModel.countDocuments({ TeamId }),
    ]);

    return { Items: Items as AuditLogDocument[], Count };
  }
}
