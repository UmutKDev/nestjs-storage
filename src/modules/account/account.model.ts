import { ApiProperty, PickType } from '@nestjs/swagger';
import { UserBodyRequestModel, UserResponseModel } from '../user/user.model';
import { IsNotEmpty, IsOptional, IsStrongPassword } from 'class-validator';
import { Match } from '@common/decorators/match.decorator';

export class AccountViewModel extends UserResponseModel {}

export class AccountResponseModel extends AccountViewModel {}

export class AccountProfileResponseModel extends AccountResponseModel {}

export class AccountBodyRequestModel extends PickType(UserBodyRequestModel, [
  'FullName',
  'PhoneNumber',
] as const) {
  @IsOptional()
  FullName: string;
}

export class AccountPostBodyRequestModel extends AccountBodyRequestModel {}

export class AccountPutBodyRequestModel extends AccountBodyRequestModel {}

export class AccountChangePasswordRequestModel {
  @ApiProperty()
  @IsNotEmpty({ message: Codes.Error.Password.CANNOT_BE_EMPTY })
  CurrentPassword: string;

  @ApiProperty()
  @IsNotEmpty({ message: Codes.Error.Password.CANNOT_BE_EMPTY })
  @IsStrongPassword(undefined, {
    message: Codes.Error.Password.NOT_STRONG,
  })
  NewPassword: string;

  @ApiProperty()
  @Match('NewPassword', { message: Codes.Error.Password.NOT_MATCH })
  @IsNotEmpty({ message: Codes.Error.Password.CANNOT_BE_EMPTY })
  @IsStrongPassword(undefined, {
    message: Codes.Error.Password.NOT_STRONG,
  })
  NewPasswordConfirmation: string;
}

export class AccountUploadImageRequestModel {
  @ApiProperty({
    type: 'string',
    format: 'binary',
  })
  Image: Express.Multer.File;
}
