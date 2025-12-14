import { ApiProperty, OmitType, PickType } from '@nestjs/swagger';
import { UserBodyRequestModel, UserResponseModel } from '../user/user.model';
import { IsNotEmpty, IsOptional, IsStrongPassword } from 'class-validator';
import { Match } from '@common/decorators/match.decorator';
import {
  SubscriptionFindResponseModel,
  SubscriptionResponseModel,
  UserSubscriptionResponseModel,
} from '@modules/subscription/subscription.model';
import { Expose, Type } from 'class-transformer';

export class AccountViewModel extends UserResponseModel {}

export class AccountResponseModel extends OmitType(AccountViewModel, [
  'subscription',
] as const) {
  @Expose()
  // @ApiProperty({ type: () => SubscriptionResponseModel })
  // @Type(() => SubscriptionResponseModel)
  subscription?: any;
}

export class AccountProfileResponseModel extends AccountResponseModel {}

export class AccountBodyRequestModel extends PickType(UserBodyRequestModel, [
  'fullName',
  'phoneNumber',
] as const) {
  @IsOptional()
  fullName: string;
}

export class AccountPostBodyRequestModel extends AccountBodyRequestModel {}

export class AccountPutBodyRequestModel extends AccountBodyRequestModel {}

export class AccountChangePasswordRequestModel {
  @ApiProperty()
  @IsNotEmpty({ message: Codes.Error.Password.CANNOT_BE_EMPTY })
  current_password: string;

  @ApiProperty()
  @IsNotEmpty({ message: Codes.Error.Password.CANNOT_BE_EMPTY })
  @IsStrongPassword(undefined, {
    message: Codes.Error.Password.NOT_STRONG,
  })
  new_password: string;

  @ApiProperty()
  @Match('new_password', { message: Codes.Error.Password.NOT_MATCH })
  @IsNotEmpty({ message: Codes.Error.Password.CANNOT_BE_EMPTY })
  @IsStrongPassword(undefined, {
    message: Codes.Error.Password.NOT_STRONG,
  })
  new_password_confirmation: string;
}

export class AccountUploadImageRequestModel {
  @ApiProperty({
    type: 'string',
    format: 'binary',
  })
  image: Express.Multer.File;
}
