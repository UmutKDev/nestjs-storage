import { BaseDateModel } from '@common/models/base.model';
import { ApiProperty, OmitType } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsPhoneNumber, IsString } from 'class-validator';
import { Role, Status } from '@common/enums';
import { UserSubscriptionResponseModel } from '../subscription/subscription.model';
import { Expose, Transform, Type } from 'class-transformer';
import { CDNPathResolver } from '@common/helpers/cast.helper';
import { UserSubscriptionEntity } from '@entities/user-subscription.entity';

export class UserDateModel extends BaseDateModel {
  @ApiProperty()
  @Expose()
  LastLogin: Date;
}

export class UserViewModel {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  Id: string;

  @Expose()
  @ApiProperty({
    format: 'email',
  })
  @IsEmail()
  Email: string;

  @Expose()
  @ApiProperty()
  @IsString()
  FullName: string;

  @Expose()
  @ApiProperty()
  @IsPhoneNumber('TR')
  PhoneNumber: string;

  @ApiProperty()
  Password: string;

  @Expose()
  @ApiProperty()
  @Transform(({ value }) => CDNPathResolver(value), {
    toClassOnly: true,
  })
  Image: string;

  @Expose()
  @ApiProperty({ enum: Role, default: Role.USER })
  Role: string;

  @Expose()
  @ApiProperty({ enum: Status })
  Status: string;

  @Expose()
  @ApiProperty({ type: UserSubscriptionResponseModel })
  @Type(() => UserSubscriptionResponseModel)
  Subscription: UserSubscriptionEntity;

  @Expose()
  @ApiProperty({ type: UserDateModel })
  Date: UserDateModel;
}

export class UserResponseModel extends OmitType(UserViewModel, [
  'Password',
] as const) {}

export class UserListResponseModel extends UserResponseModel {}

export class UserFindResponseModel extends UserResponseModel {}

export class UserBodyRequestModel extends OmitType(UserViewModel, [
  'Id',
  'Password',
  'Date',
] as const) {}

export class UserPostBodyRequestModel extends UserBodyRequestModel {
  @IsOptional()
  FullName: string;

  @IsOptional()
  Role: Role;

  @IsOptional()
  Status: Status;
}

export class UserPutBodyRequestModel extends OmitType(UserBodyRequestModel, [
  'Email',
] as const) {
  @IsOptional()
  FullName: string;

  @IsOptional()
  PhoneNumber: string;

  @IsOptional()
  Role: Role;

  @IsOptional()
  Status: Status;
}
