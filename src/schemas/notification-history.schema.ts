import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type NotificationHistoryDocument = HydratedDocument<NotificationHistory>;

@Schema({
  collection: 'NotificationHistory',
  timestamps: { createdAt: 'CreatedAt', updatedAt: false },
  versionKey: false,
})
export class NotificationHistory {
  @Prop({ required: true, index: true })
  UserId: string;

  @Prop({ required: true })
  Type: string;

  @Prop({ required: true })
  Title: string;

  @Prop({ required: true })
  Message: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  Data: Record<string, unknown>;

  @Prop({ default: false, index: true })
  IsRead: boolean;

  @Prop({ type: Date })
  ReadAt: Date;

  @Prop({ type: Date, index: true })
  CreatedAt: Date;
}

export const NotificationHistorySchema =
  SchemaFactory.createForClass(NotificationHistory);

// Primary query: unread notifications for a user, newest first
NotificationHistorySchema.index({ UserId: 1, IsRead: 1, CreatedAt: -1 });

// TTL index: auto-expire after 90 days
NotificationHistorySchema.index(
  { CreatedAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);
