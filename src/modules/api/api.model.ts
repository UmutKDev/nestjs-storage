import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsUrl,
  IsArray,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { WebhookEvent } from '@common/enums/api.enum';

// ============================================================================
// USAGE RESPONSE MODELS
// ============================================================================

export class ApiUsageCurrentResponseModel {
  @Expose()
  @ApiProperty()
  MonthlyUsed: number;

  @Expose()
  @ApiProperty()
  MonthlyLimit: number;

  @Expose()
  @ApiProperty()
  MonthlyRemaining: number;

  @Expose()
  @ApiProperty()
  DailyUsed: number;

  @Expose()
  @ApiProperty()
  RateLimitPerMinute: number;

  @Expose()
  @ApiProperty()
  RateLimitBurstPerSecond: number;

  @Expose()
  @ApiProperty()
  BillingPeriod: string;
}

export class ApiUsageHistoryItemModel {
  @Expose()
  @ApiProperty()
  Date: string;

  @Expose()
  @ApiProperty()
  RequestCount: number;

  @Expose()
  @ApiProperty()
  AvgResponseTimeMs: number;
}

export class ApiEndpointUsageItemModel {
  @Expose()
  @ApiProperty()
  Endpoint: string;

  @Expose()
  @ApiProperty()
  Method: string;

  @Expose()
  @ApiProperty()
  RequestCount: number;

  @Expose()
  @ApiProperty()
  AvgResponseTimeMs: number;
}

// ============================================================================
// WEBHOOK REQUEST MODELS
// ============================================================================

export class WebhookCreateRequestModel {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  Name: string;

  @IsUrl()
  @ApiProperty()
  Url: string;

  @IsArray()
  @IsEnum(WebhookEvent, { each: true })
  @ApiProperty({ enum: WebhookEvent, isArray: true })
  Events: WebhookEvent[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  @ApiProperty({ required: false })
  MaxRetries?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  @ApiProperty({ required: false })
  TimeoutSeconds?: number;

  @IsOptional()
  @ApiProperty({ required: false })
  Headers?: Record<string, string>;
}

export class WebhookUpdateRequestModel {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ required: false })
  Name?: string;

  @IsOptional()
  @IsUrl()
  @ApiProperty({ required: false })
  Url?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(WebhookEvent, { each: true })
  @ApiProperty({ required: false, enum: WebhookEvent, isArray: true })
  Events?: WebhookEvent[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  @ApiProperty({ required: false })
  MaxRetries?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  @ApiProperty({ required: false })
  TimeoutSeconds?: number;

  @IsOptional()
  @ApiProperty({ required: false })
  Headers?: Record<string, string>;
}

// ============================================================================
// WEBHOOK RESPONSE MODELS
// ============================================================================

export class WebhookResponseModel {
  @Expose()
  @ApiProperty()
  Id: string;

  @Expose()
  @ApiProperty()
  Name: string;

  @Expose()
  @ApiProperty()
  Url: string;

  @Expose()
  @ApiProperty({ enum: WebhookEvent, isArray: true })
  Events: WebhookEvent[];

  @Expose()
  @ApiProperty()
  IsActive: boolean;

  @Expose()
  @ApiProperty()
  MaxRetries: number;

  @Expose()
  @ApiProperty()
  TimeoutSeconds: number;

  @Expose()
  @ApiProperty()
  Headers: Record<string, string>;

  @Expose()
  @ApiProperty({ required: false })
  LastDeliveredAt: Date;

  @Expose()
  @ApiProperty()
  ConsecutiveFailures: number;

  @Expose()
  @ApiProperty()
  CreatedAt: Date;
}

export class WebhookCreatedResponseModel extends WebhookResponseModel {
  @Expose()
  @ApiProperty()
  Secret: string;
}

export class WebhookDeliveryResponseModel {
  @Expose()
  @ApiProperty()
  Id: string;

  @Expose()
  @ApiProperty()
  Event: string;

  @Expose()
  @ApiProperty()
  Payload: Record<string, unknown>;

  @Expose()
  @ApiProperty()
  Status: string;

  @Expose()
  @ApiProperty()
  AttemptCount: number;

  @Expose()
  @ApiProperty({ required: false })
  HttpStatusCode: number;

  @Expose()
  @ApiProperty({ required: false })
  ResponseBody: string;

  @Expose()
  @ApiProperty({ required: false })
  ResponseTimeMs: number;

  @Expose()
  @ApiProperty({ required: false })
  ErrorMessage: string;

  @Expose()
  @ApiProperty({ required: false })
  NextRetryAt: Date;

  @Expose()
  @ApiProperty({ required: false })
  DeliveredAt: Date;

  @Expose()
  @ApiProperty()
  CreatedAt: Date;
}
