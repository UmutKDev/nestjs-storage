import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsStrongPassword } from 'class-validator';
import { UserBodyRequestModel, UserViewModel } from '../user/user.model';
import { Match } from '@common/decorators/match.decorator';
import { Expose } from 'class-transformer';

// ============ AUTH BASE MODELS ============

// Step 1: Check email and get auth requirements
export class LoginCheckRequestModel extends PickType(UserViewModel, [
  'Email',
] as const) {}

export class LoginCheckResponseModel {
  @Expose()
  @ApiProperty({ description: 'Whether the user has passkey(s) registered' })
  HasPasskey: boolean;

  @Expose()
  @ApiProperty({ description: 'Whether the user has 2FA enabled' })
  HasTwoFactor: boolean;

  @Expose()
  @ApiProperty({ description: '2FA method if enabled (TOTP, etc.)' })
  TwoFactorMethod: string | null;

  @Expose()
  @ApiProperty({
    description: 'Available authentication methods',
    type: [String],
  })
  AvailableMethods: ('password' | 'passkey')[];

  @Expose()
  @ApiProperty({
    description: 'Passkey login options if passkey is available',
    required: false,
  })
  PasskeyOptions?: object;
}

// Step 2: Login with password
export class LoginRequestModel extends PickType(UserViewModel, [
  'Email',
] as const) {
  @ApiProperty()
  @IsNotEmpty({ message: Codes.Error.Password.CANNOT_BE_EMPTY })
  Password: string;
}

export class RegisterRequestModel extends PickType(UserBodyRequestModel, [
  'Email',
] as const) {
  @ApiProperty()
  @IsNotEmpty({ message: Codes.Error.Password.CANNOT_BE_EMPTY })
  @IsStrongPassword(undefined, {
    message: Codes.Error.Password.NOT_STRONG,
  })
  Password: string;

  @ApiProperty()
  @Match('Password', { message: Codes.Error.Password.NOT_MATCH })
  @IsNotEmpty({ message: Codes.Error.Password.CANNOT_BE_EMPTY })
  @IsStrongPassword(undefined, {
    message: Codes.Error.Password.NOT_STRONG,
  })
  PasswordConfirmation?: string;
}

export class ResetPasswordRequestModel extends PickType(UserBodyRequestModel, [
  'Email',
] as const) {}

export class AuthenticationResponseModel {
  @Expose()
  @ApiProperty()
  SessionId: string;

  @Expose()
  @ApiProperty()
  ExpiresAt: Date;
}

// ============ PASSKEY LOGIN MODELS ============

export class PasskeyLoginBeginRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  Email: string;
}

export class PasskeyLoginBeginResponseModel {
  @Expose()
  @ApiProperty()
  Challenge: string;

  @Expose()
  @ApiProperty()
  Options: object;
}

export class PasskeyLoginFinishRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  Email: string;

  @ApiProperty()
  @IsNotEmpty()
  Credential: Record<string, unknown>;
}

// ============ TWO-FACTOR VERIFICATION MODEL (for login) ============

export class TwoFactorVerifyRequestModel {
  @ApiProperty({
    description: 'TOTP code from authenticator app',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  Code: string;
}
