import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { NotificationType } from '@common/enums';

export class NotificationPayloadModel {
  @Expose()
  @ApiProperty({ enum: NotificationType, enumName: 'NotificationType' })
  Type: NotificationType;

  @Expose()
  @ApiProperty()
  Title: string;

  @Expose()
  @ApiProperty()
  Message: string;

  @Expose()
  @ApiProperty({ type: Object, required: false, nullable: true })
  Data?: Record<string, unknown>;

  @Expose()
  @ApiProperty()
  Timestamp: string;
}

// ============================================================================
// RESPONSE MODELS
// ============================================================================

export class NotificationHistoryItemModel {
  @Expose()
  @ApiProperty()
  Id: string;

  @Expose()
  @ApiProperty({ enum: NotificationType, enumName: 'NotificationType' })
  Type: NotificationType;

  @Expose()
  @ApiProperty()
  Title: string;

  @Expose()
  @ApiProperty()
  Message: string;

  @Expose()
  @ApiProperty({ type: Object, required: false, nullable: true })
  Data?: Record<string, unknown> | null;

  @Expose()
  @ApiProperty()
  IsRead: boolean;

  @Expose()
  @ApiProperty({ description: 'ISO timestamp the notification was created' })
  CreatedAt: string;

  @Expose()
  @ApiProperty({ required: false, description: 'ISO timestamp it was read' })
  ReadAt?: string;
}

export class UnreadCountResponseModel {
  @Expose()
  @ApiProperty()
  Count: number;
}
