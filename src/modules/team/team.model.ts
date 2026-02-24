import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TeamRole } from '@common/enums';

// ── Request Models ──────────────────────────────────────────────────────────

export class TeamCreateRequestModel {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  Name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  Description?: string;
}

export class TeamUpdateRequestModel {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  Name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  Description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  Image?: string;
}

export class TeamMemberUpdateRoleRequestModel {
  @ApiProperty({ enum: TeamRole })
  @IsEnum(TeamRole)
  Role: TeamRole;
}

export class TeamInvitationCreateRequestModel {
  @ApiProperty()
  @IsEmail()
  Email: string;

  @ApiProperty({ enum: TeamRole, default: TeamRole.MEMBER, required: false })
  @IsOptional()
  @IsEnum(TeamRole)
  Role?: TeamRole;
}

export class TeamInvitationAcceptRequestModel {
  @ApiProperty()
  @IsUUID()
  Token: string;
}

export class TeamInvitationDeclineRequestModel {
  @ApiProperty()
  @IsUUID()
  Token: string;
}

export class TeamTransferOwnershipRequestModel {
  @ApiProperty({ description: 'UserId of the new owner' })
  @IsUUID()
  UserId: string;
}

// ── Response Models ─────────────────────────────────────────────────────────

export class TeamResponseModel {
  @Expose()
  @ApiProperty()
  Id: string;

  @Expose()
  @ApiProperty()
  Name: string;

  @Expose()
  @ApiProperty()
  Slug: string;

  @Expose()
  @ApiProperty({ required: false })
  Description?: string;

  @Expose()
  @ApiProperty({ required: false })
  Image?: string;

  @Expose()
  @ApiProperty()
  Status: string;

  @Expose()
  @ApiProperty({ required: false })
  MemberCount?: number;

  @Expose()
  @ApiProperty({ required: false })
  MyRole?: string;

  @Expose()
  @ApiProperty()
  @Type(() => Date)
  CreatedAt: Date;
}

export class TeamDetailResponseModel extends TeamResponseModel {
  @Expose()
  @ApiProperty({ required: false })
  StorageLimitBytes?: number;

  @Expose()
  @ApiProperty({ required: false })
  MaxUploadSizeBytes?: number;

  @Expose()
  @ApiProperty({ required: false })
  MaxMembers?: number;
}

export class TeamMemberResponseModel {
  @Expose()
  @ApiProperty()
  Id: string;

  @Expose()
  @ApiProperty()
  UserId: string;

  @Expose()
  @ApiProperty()
  FullName: string;

  @Expose()
  @ApiProperty()
  Email: string;

  @Expose()
  @ApiProperty({ required: false })
  Image?: string;

  @Expose()
  @ApiProperty()
  Role: string;

  @Expose()
  @ApiProperty({ required: false })
  @Type(() => Date)
  JoinedAt?: Date;
}

export class TeamInvitationResponseModel {
  @Expose()
  @ApiProperty()
  Id: string;

  @Expose()
  @ApiProperty({ required: false })
  Token?: string;

  @Expose()
  @ApiProperty()
  Email: string;

  @Expose()
  @ApiProperty()
  Role: string;

  @Expose()
  @ApiProperty()
  Status: string;

  @Expose()
  @ApiProperty({ required: false })
  InvitedByName?: string;

  @Expose()
  @ApiProperty({ required: false })
  TeamName?: string;

  @Expose()
  @ApiProperty()
  @Type(() => Date)
  ExpiresAt: Date;

  @Expose()
  @ApiProperty()
  @Type(() => Date)
  CreatedAt: Date;
}
