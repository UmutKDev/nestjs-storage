import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsPositive,
  IsUUID,
} from 'class-validator';
import { BaseDateModel } from '@common/models/base.model';
import { SubscriptionEntity } from '@entities/subscription.entity';
import { BillingCycle, SubscriptionStatus } from '@common/enums';

export class SubscriptionDateModel extends BaseDateModel {}

export class SubscriptionViewModel implements SubscriptionEntity {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id: string;

  @Expose()
  @ApiProperty()
  @IsString()
  name: string;

  @Expose()
  @ApiProperty()
  @IsString()
  slug: string;

  @Expose()
  @ApiProperty({ required: false })
  @IsOptional()
  description?: string;

  @Expose()
  @ApiProperty({ description: 'Price in cents' })
  @IsInt()
  @IsPositive()
  price: number;

  @Expose()
  @ApiProperty({ default: 'USD' })
  @IsString()
  currency: string;

  @Expose()
  @ApiProperty({ enum: BillingCycle })
  billingCycle: string;

  @Expose()
  @ApiProperty({ description: 'Storage limit in bytes - 0 means unlimited' })
  @IsInt()
  storageLimitBytes: number;

  @Expose()
  @ApiProperty({ required: false })
  @IsOptional()
  maxFileSizeBytes?: number | null;

  @Expose()
  @ApiProperty({ required: false })
  @IsOptional()
  maxObjectCount?: number | null;

  @Expose()
  @ApiProperty({ required: false })
  @IsOptional()
  features?: Record<string, unknown> | null;

  @Expose()
  @ApiProperty({ enum: SubscriptionStatus })
  status: string;

  @Expose()
  @ApiProperty({ type: SubscriptionDateModel })
  date: SubscriptionDateModel;
}

export class SubscriptionResponseModel extends OmitType(SubscriptionViewModel, [
  'price',
] as const) {}

export class SubscriptionListResponseModel extends SubscriptionResponseModel {}

export class SubscriptionFindResponseModel extends SubscriptionResponseModel {}

export class SubscriptionBodyRequestModel extends OmitType(
  SubscriptionViewModel,
  ['id', 'date'] as const,
) {}

export class SubscriptionPostBodyRequestModel extends SubscriptionBodyRequestModel {}

export class SubscriptionPutBodyRequestModel extends OmitType(
  SubscriptionBodyRequestModel,
  ['slug'] as const,
) {}

/* -------------------------------------------- */
/* User subscription DTOs                        */
/* -------------------------------------------- */

export class UserSubscriptionViewModel {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @Expose()
  @ApiProperty({ format: 'uuid' })
  subscriptionId: string;

  @Expose()
  @ApiProperty()
  startAt: Date;

  @Expose()
  @ApiProperty({ required: false })
  endAt?: Date | null;

  @Expose()
  @ApiProperty()
  isTrial: boolean;

  @Expose()
  @ApiProperty({ description: 'Price as cents' })
  price: number;

  @Expose()
  @ApiProperty({ required: false })
  currency?: string;

  @Expose()
  @ApiProperty({ required: false })
  providerSubscriptionId?: string | null;

  @Expose()
  @ApiProperty({ required: false, type: SubscriptionResponseModel })
  @Type(() => SubscriptionResponseModel)
  subscription?: SubscriptionResponseModel;

  @Expose()
  @ApiProperty({ type: BaseDateModel })
  @Type(() => BaseDateModel)
  date: BaseDateModel;
}

export class UserSubscriptionResponseModel extends OmitType(
  UserSubscriptionViewModel,
  ['userId', 'subscriptionId', 'providerSubscriptionId'] as const,
) {}

export class SubscribeRequestModel {
  @ApiProperty({ format: 'uuid' })
  @IsNotEmpty()
  @IsUUID()
  subscriptionId: string;

  @ApiProperty({ required: false })
  isTrial?: boolean;

  @ApiProperty({ required: false })
  providerSubscriptionId?: string;
}

export class SubscribeAsAdminRequestModel extends SubscribeRequestModel {
  @ApiProperty({ format: 'uuid' })
  userId: string;
}

export class UnsubscribeRequestModel {
  @ApiProperty({ format: 'uuid' })
  id: string;
}
