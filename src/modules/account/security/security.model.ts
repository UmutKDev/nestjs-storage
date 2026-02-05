import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsIP,
} from 'class-validator';
import { Expose } from 'class-transformer';
import {
  ApiKeyEnvironment,
  ApiKeyScope,
} from '@common/enums/authentication.enum';
import { DeviceInfo } from '../../authentication/session/session.interface';

// ============ SESSION MODELS ============

export class SessionViewModel {
  @Expose()
  @ApiProperty()
  Id: string;

  @Expose()
  @ApiProperty()
  DeviceInfo: DeviceInfo;

  @Expose()
  @ApiProperty()
  IpAddress: string;

  @Expose()
  @ApiProperty()
  CreatedAt: Date;

  @Expose()
  @ApiProperty()
  LastActivityAt: Date;

  @Expose()
  @ApiProperty()
  IsCurrent: boolean;
}

// ============ PASSKEY MODELS ============

export class PasskeyRegistrationBeginRequestModel {
  @ApiProperty({
    description: 'Name for the passkey device',
    example: 'iPhone 15 Pro',
  })
  @IsString()
  @IsNotEmpty()
  DeviceName: string;
}

export class PasskeyRegistrationBeginResponseModel {
  @Expose()
  @ApiProperty()
  Challenge: string;

  @Expose()
  @ApiProperty()
  Options: object;
}

export class PasskeyRegistrationFinishRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  DeviceName: string;

  @ApiProperty()
  @IsNotEmpty()
  Credential: Record<string, unknown>;
}

export class PasskeyViewModel {
  @Expose()
  @ApiProperty()
  Id: string;

  @Expose()
  @ApiProperty()
  DeviceName: string;

  @Expose()
  @ApiProperty()
  DeviceType: string;

  @Expose()
  @ApiProperty()
  CreatedAt: Date;

  @Expose()
  @ApiProperty()
  LastUsedAt: Date;
}

// ============ TWO-FACTOR MODELS ============

export class TwoFactorSetupResponseModel {
  @Expose()
  @ApiProperty()
  Secret: string;

  @Expose()
  @ApiProperty()
  Issuer: string;

  @Expose()
  @ApiProperty()
  AccountName: string;

  @Expose()
  @ApiProperty()
  OtpAuthUrl: string;
}

export class TwoFactorVerifyRequestModel {
  @ApiProperty({
    description: 'TOTP code from authenticator app',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  Code: string;
}

export class TwoFactorBackupCodesResponseModel {
  @Expose()
  @ApiProperty({ type: [String] })
  BackupCodes: string[];
}

export class TwoFactorStatusResponseModel {
  @Expose()
  @ApiProperty()
  IsEnabled: boolean;

  @Expose()
  @ApiProperty()
  Method: string;

  @Expose()
  @ApiProperty()
  HasPasskey: boolean;

  @Expose()
  @ApiProperty()
  BackupCodesRemaining: number;
}

// ============ API KEY MODELS ============

export class ApiKeyCreateRequestModel {
  @ApiProperty({ example: 'Production API Key' })
  @IsString()
  @IsNotEmpty()
  Name: string;

  @ApiProperty({
    enum: ApiKeyScope,
    isArray: true,
    example: [ApiKeyScope.READ, ApiKeyScope.WRITE],
  })
  @IsArray()
  @IsEnum(ApiKeyScope, { each: true })
  Scopes: ApiKeyScope[];

  @ApiProperty({ enum: ApiKeyEnvironment, example: ApiKeyEnvironment.LIVE })
  @IsEnum(ApiKeyEnvironment)
  Environment: ApiKeyEnvironment;

  @ApiProperty({ required: false, type: [String], example: ['192.168.1.1'] })
  @IsOptional()
  @IsArray()
  @IsIP(undefined, { each: true })
  IpWhitelist?: string[];

  @ApiProperty({ required: false, example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  RateLimitPerMinute?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  ExpiresAt?: string;
}

export class ApiKeyCreatedResponseModel {
  @Expose()
  @ApiProperty()
  Id: string;

  @Expose()
  @ApiProperty()
  Name: string;

  @Expose()
  @ApiProperty({ description: 'Public key - can be shared' })
  PublicKey: string;

  @Expose()
  @ApiProperty({ description: 'Secret key - shown only once!' })
  SecretKey: string;

  @Expose()
  @ApiProperty()
  Environment: ApiKeyEnvironment;

  @Expose()
  @ApiProperty()
  Scopes: ApiKeyScope[];

  @Expose()
  @ApiProperty()
  CreatedAt: Date;
}

export class ApiKeyViewModel {
  @Expose()
  @ApiProperty()
  Id: string;

  @Expose()
  @ApiProperty()
  Name: string;

  @Expose()
  @ApiProperty()
  PublicKey: string;

  @Expose()
  @ApiProperty({ description: 'First 8 characters of secret key' })
  SecretKeyPrefix: string;

  @Expose()
  @ApiProperty()
  Environment: ApiKeyEnvironment;

  @Expose()
  @ApiProperty()
  Scopes: ApiKeyScope[];

  @Expose()
  @ApiProperty()
  IpWhitelist: string[];

  @Expose()
  @ApiProperty()
  RateLimitPerMinute: number;

  @Expose()
  @ApiProperty()
  LastUsedAt: Date;

  @Expose()
  @ApiProperty()
  ExpiresAt: Date;

  @Expose()
  @ApiProperty()
  IsRevoked: boolean;

  @Expose()
  @ApiProperty()
  CreatedAt: Date;
}

export class ApiKeyUpdateRequestModel {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  Name?: string;

  @ApiProperty({ required: false, enum: ApiKeyScope, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ApiKeyScope, { each: true })
  Scopes?: ApiKeyScope[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsIP(undefined, { each: true })
  IpWhitelist?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  RateLimitPerMinute?: number;
}

export class ApiKeyRotateResponseModel {
  @Expose()
  @ApiProperty()
  Id: string;

  @Expose()
  @ApiProperty()
  PublicKey: string;

  @Expose()
  @ApiProperty({ description: 'New secret key - shown only once!' })
  SecretKey: string;
}
