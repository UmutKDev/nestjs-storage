import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({
  collection: 'AuditLogs',
  timestamps: { createdAt: 'CreatedAt', updatedAt: false },
  versionKey: false,
})
export class AuditLog {
  @Prop({ required: true, index: true })
  UserId: string;

  @Prop({ index: true })
  TeamId: string;

  @Prop({ required: true, index: true })
  Action: string;

  @Prop({ required: true })
  Resource: string;

  @Prop()
  ResourceId: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  Details: Record<string, unknown>;

  @Prop()
  IpAddress: string;

  @Prop()
  UserAgent: string;

  @Prop({ required: true })
  Result: string;

  @Prop({ type: Date, index: true })
  CreatedAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Primary query: user activity timeline
AuditLogSchema.index({ UserId: 1, CreatedAt: -1 });

// Team audit trail
AuditLogSchema.index({ TeamId: 1, CreatedAt: -1 });

// Filter by action type
AuditLogSchema.index({ Action: 1, CreatedAt: -1 });

// TTL index: auto-expire after 365 days
AuditLogSchema.index(
  { CreatedAt: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60 },
);
