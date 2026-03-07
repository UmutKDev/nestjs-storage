import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ApiUsageLogDocument = HydratedDocument<ApiUsageLog>;

@Schema({
  collection: 'ApiUsageLogs',
  timestamps: { createdAt: 'CreatedAt', updatedAt: false },
  versionKey: false,
})
export class ApiUsageLog {
  @Prop({ required: true, index: true })
  UserId: string;

  @Prop({ index: true })
  ApiKeyId: string;

  @Prop({ required: true })
  Method: string;

  @Prop({ required: true })
  Endpoint: string;

  @Prop({ required: true })
  StatusCode: number;

  @Prop({ required: true })
  ResponseTimeMs: number;

  @Prop({ default: 0 })
  RequestBodyBytes: number;

  @Prop({ default: 0 })
  ResponseBodyBytes: number;

  @Prop()
  IpAddress: string;

  @Prop()
  CountryCode: string;

  @Prop()
  City: string;

  @Prop()
  Latitude: number;

  @Prop()
  Longitude: number;

  @Prop()
  UserAgent: string;

  @Prop()
  IdempotencyKey: string;

  @Prop()
  ApiVersion: string;

  @Prop({ type: Date, index: true })
  CreatedAt: Date;
}

export const ApiUsageLogSchema = SchemaFactory.createForClass(ApiUsageLog);

// Compound index for usage history queries (user + date)
ApiUsageLogSchema.index({ UserId: 1, CreatedAt: -1 });

// Compound index for endpoint breakdown queries
ApiUsageLogSchema.index({ UserId: 1, Endpoint: 1, Method: 1, CreatedAt: -1 });

// TTL index: auto-expire after 365 days (enterprise max retention)
ApiUsageLogSchema.index(
  { CreatedAt: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60 },
);
