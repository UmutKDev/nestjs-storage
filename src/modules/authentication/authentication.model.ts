import { ApiProperty, PickType } from '@nestjs/swagger';
import {
  IsEmail,
  IsJWT,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
  Matches,
} from 'class-validator';
import { UserBodyRequestModel, UserViewModel } from '../user/user.model';
import { Match } from '@common/decorators/match.decorator';
import { Expose } from 'class-transformer';

export class AuthenticationSignInRequestModel extends PickType(UserViewModel, [
  'email',
] as const) {
  @IsEmail(undefined, { message: Codes.Error.Email.INVALID })
  email: string;

  @ApiProperty()
  @IsNotEmpty({ message: Codes.Error.Password.CANNOT_BE_EMPTY })
  password: string;
}

export class AuthenticationSignUpRequestModel extends PickType(
  UserBodyRequestModel,
  ['email'] as const,
) {
  @ApiProperty()
  @IsNotEmpty({ message: Codes.Error.Password.CANNOT_BE_EMPTY })
  @IsStrongPassword(undefined, {
    message: Codes.Error.Password.NOT_STRONG,
  })
  password: string;

  @ApiProperty()
  @Match('password', { message: Codes.Error.Password.NOT_MATCH })
  @IsNotEmpty({ message: Codes.Error.Password.CANNOT_BE_EMPTY })
  @IsStrongPassword(undefined, {
    message: Codes.Error.Password.NOT_STRONG,
  })
  password_confirmation?: string;
}

export class AuthenticationResetPasswordRequestModel extends PickType(
  UserBodyRequestModel,
  ['email'] as const,
) {}

export class AuthenticationDecodeTokenBodyRequestModel {
  @ApiProperty()
  @IsString()
  @IsJWT()
  token: string;
}

export class AuthenticationRefreshTokenRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @IsJWT()
  refreshToken: string;
}

export class AuthenticationTokenResponseModel {
  @Expose()
  @ApiProperty({ required: false })
  accessToken?: string;

  @Expose()
  @ApiProperty({ required: false })
  refreshToken?: string;

  @Expose()
  @ApiProperty({ required: false })
  expiresIn?: number;
}

export class JWTPayloadModel extends PickType(UserViewModel, [
  'id',
  'fullName',
  'email',
  'role',
  'status',
  'image',
]) {
  lastLogin: Date;
}

export class JWTTokenDecodeResponseModel extends JWTPayloadModel {
  @ApiProperty()
  iat: number;

  @ApiProperty()
  exp: number;

  @ApiProperty()
  nbf: number;

  @ApiProperty()
  iss: string;

  @ApiProperty()
  aud: string;

  @ApiProperty()
  sub: string;
}
