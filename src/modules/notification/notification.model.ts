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
