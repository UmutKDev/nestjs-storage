import { BaseDateModel } from '@common/models/base.model';
import { UserEntity } from '@entities//user.entity';
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
  lastLogin: Date;
}

export class UserViewModel implements UserEntity {
  @Expose()
  @ApiProperty({ format: 'uuid' })
  id: string;

  @Expose()
  @ApiProperty({
    format: 'email',
  })
  @IsEmail()
  email: string;

  @Expose()
  @ApiProperty()
  @IsString()
  fullName: string;

  @Expose()
  @ApiProperty()
  @IsPhoneNumber('TR')
  phoneNumber: string;

  @ApiProperty()
  password: string;

  @Expose()
  @ApiProperty()
  @Transform(({ value }) => CDNPathResolver(value), {
    toClassOnly: true,
  })
  image: string;

  @Expose()
  @ApiProperty({ enum: Role, default: Role.USER })
  role: string;

  @Expose()
  @ApiProperty({ enum: Status })
  status: string;

  @Expose()
  @ApiProperty({ type: UserSubscriptionResponseModel })
  @Type(() => UserSubscriptionResponseModel)
  subscription: UserSubscriptionEntity;

  @Expose()
  @ApiProperty({ type: UserDateModel })
  date: UserDateModel;
}

export class UserResponseModel extends OmitType(UserViewModel, [
  'password',
] as const) {}

export class UserListResponseModel extends UserResponseModel {}

export class UserFindResponseModel extends UserResponseModel {}

export class UserBodyRequestModel extends OmitType(UserViewModel, [
  'id',
  'password',
  'date',
] as const) {}

export class UserPostBodyRequestModel extends UserBodyRequestModel {
  @IsOptional()
  fullName: string;

  @IsOptional()
  role: Role;

  @IsOptional()
  status: Status;
}

export class UserPutBodyRequestModel extends OmitType(UserBodyRequestModel, [
  'email',
] as const) {
  @IsOptional()
  fullName: string;

  @IsOptional()
  phoneNumber: string;

  @IsOptional()
  role: Role;

  @IsOptional()
  status: Status;
}
