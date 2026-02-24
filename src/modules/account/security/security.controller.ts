import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiSuccessArrayResponse,
  ApiSuccessResponse,
} from '@common/decorators/response.decorator';
import {
  SessionViewModel,
  PasskeyRegistrationBeginRequestModel,
  PasskeyRegistrationBeginResponseModel,
  PasskeyRegistrationFinishRequestModel,
  PasskeyViewModel,
  TwoFactorSetupResponseModel,
  TwoFactorVerifyRequestModel,
  TwoFactorBackupCodesResponseModel,
  TwoFactorStatusResponseModel,
  ApiKeyCreateRequestModel,
  ApiKeyCreatedResponseModel,
  ApiKeyViewModel,
  ApiKeyUpdateRequestModel,
  ApiKeyRotateResponseModel,
} from './security.model';
import { User } from '@common/decorators/user.decorator';
import { PasskeyService } from '../../authentication/passkey/passkey.service';
import { TwoFactorService } from '../../authentication/two-factor/two-factor.service';
import { ApiKeyService } from '../../authentication/api-key/api-key.service';
import { SessionService } from '../../authentication/session/session.service';
import { SESSION_HEADER } from '../../authentication/guards/session.guard';
import { Request } from 'express';
import { plainToInstance } from 'class-transformer';
import { CheckPolicies } from '@modules/authentication/casl/check-policies.decorator';
import { CaslAction, CaslSubject } from '@common/enums';

interface AuthenticatedRequest extends Request {
  user: UserContext;
  sessionId?: string;
}

@Controller('Account/Security')
@ApiTags('Account / Security')
@ApiCookieAuth()
export class SecurityController {
  constructor(
    private readonly passkeyService: PasskeyService,
    private readonly twoFactorService: TwoFactorService,
    private readonly apiKeyService: ApiKeyService,
    private readonly sessionService: SessionService,
  ) {}

  // ==================== SESSIONS ====================

  @CheckPolicies((Ability) => Ability.can(CaslAction.Read, CaslSubject.Session))
  @Get('Sessions')
  @ApiSuccessResponse(SessionViewModel)
  @ApiOperation({ summary: 'Get all active sessions' })
  async GetSessions(
    @User() User: UserContext,
    @Req() request: AuthenticatedRequest,
  ): Promise<SessionViewModel[]> {
    const currentSessionId =
      request.sessionId || (request.headers[SESSION_HEADER] as string);
    const sessions = await this.sessionService.getUserSessions(
      User.Id,
      currentSessionId,
    );
    return sessions.map((session) =>
      plainToInstance(SessionViewModel, session),
    );
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Delete, CaslSubject.Session),
  )
  @Delete('Sessions/:sessionId')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Revoke specific session' })
  async RevokeSession(
    @User() User: UserContext,
    @Param('sessionId') sessionId: string,
  ): Promise<boolean> {
    const session = await this.sessionService.getSession(sessionId);

    if (!session || session.UserId !== User.Id) {
      throw new HttpException('Session not found', 404);
    }

    await this.sessionService.revokeSession(sessionId);
    return true;
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Delete, CaslSubject.Session),
  )
  @Post('Sessions/LogoutAll')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Logout all sessions' })
  async LogoutAll(@User() User: UserContext): Promise<boolean> {
    const count = await this.sessionService.revokeAllUserSessions(User.Id);
    return count > 0;
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Delete, CaslSubject.Session),
  )
  @Post('Sessions/LogoutOthers')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Logout all other sessions except current' })
  async LogoutOthers(
    @User() User: UserContext,
    @Req() request: AuthenticatedRequest,
  ): Promise<boolean> {
    const sessionId =
      request.sessionId || (request.headers[SESSION_HEADER] as string);
    const count = await this.sessionService.revokeOtherSessions(
      User.Id,
      sessionId,
    );
    return count >= 0;
  }

  // ==================== PASSKEY ====================

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Create, CaslSubject.Passkey),
  )
  @Post('Passkey/Register/Begin')
  @ApiSuccessResponse(PasskeyRegistrationBeginResponseModel)
  @ApiOperation({ summary: 'Begin passkey registration' })
  async PasskeyRegisterBegin(
    @User() User: UserContext,
    @Body() Model: PasskeyRegistrationBeginRequestModel,
  ): Promise<PasskeyRegistrationBeginResponseModel> {
    return this.passkeyService.beginRegistration({ User, ...Model });
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Create, CaslSubject.Passkey),
  )
  @Post('Passkey/Register/Finish')
  @ApiSuccessResponse(PasskeyViewModel)
  @ApiOperation({ summary: 'Complete passkey registration' })
  async PasskeyRegisterFinish(
    @User() User: UserContext,
    @Body() Model: PasskeyRegistrationFinishRequestModel,
  ): Promise<PasskeyViewModel> {
    return this.passkeyService.finishRegistration({ User, ...Model });
  }

  @CheckPolicies((Ability) => Ability.can(CaslAction.Read, CaslSubject.Passkey))
  @Get('Passkey')
  @ApiSuccessArrayResponse(PasskeyViewModel)
  @ApiOperation({ summary: 'Get registered passkeys' })
  async GetPasskeys(@User() User: UserContext): Promise<PasskeyViewModel[]> {
    return this.passkeyService.getUserPasskeys(User);
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Delete, CaslSubject.Passkey),
  )
  @Delete('Passkey/:passkeyId')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Delete a passkey' })
  async DeletePasskey(
    @User() User: UserContext,
    @Param('passkeyId') passkeyId: string,
  ): Promise<boolean> {
    return this.passkeyService.deletePasskey(User, passkeyId);
  }

  // ==================== TWO-FACTOR ====================

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Create, CaslSubject.TwoFactor),
  )
  @Post('TwoFactor/TOTP/Setup')
  @ApiSuccessResponse(TwoFactorSetupResponseModel)
  @ApiOperation({ summary: 'Setup TOTP 2FA' })
  async TwoFactorSetup(
    @User() User: UserContext,
  ): Promise<TwoFactorSetupResponseModel> {
    return this.twoFactorService.setupTotp(User);
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Create, CaslSubject.TwoFactor),
  )
  @Post('TwoFactor/TOTP/Verify')
  @ApiSuccessResponse(TwoFactorBackupCodesResponseModel)
  @ApiOperation({ summary: 'Verify and enable TOTP 2FA' })
  async TwoFactorVerify(
    @User() User: UserContext,
    @Body() Model: TwoFactorVerifyRequestModel,
  ): Promise<TwoFactorBackupCodesResponseModel> {
    return this.twoFactorService.verifyAndEnableTotp({ User, ...Model });
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Delete, CaslSubject.TwoFactor),
  )
  @Post('TwoFactor/TOTP/Disable')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Disable TOTP 2FA' })
  async TwoFactorDisable(
    @User() User: UserContext,
    @Body() Model: TwoFactorVerifyRequestModel,
  ): Promise<boolean> {
    return this.twoFactorService.disableTotp({ User, ...Model });
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Read, CaslSubject.TwoFactor),
  )
  @Get('TwoFactor/Status')
  @ApiSuccessResponse(TwoFactorStatusResponseModel)
  @ApiOperation({ summary: 'Get 2FA status' })
  async TwoFactorStatus(
    @User() User: UserContext,
  ): Promise<TwoFactorStatusResponseModel> {
    const hasPasskey = await this.passkeyService.hasPasskey(User.Id);
    return this.twoFactorService.getStatus(User, hasPasskey);
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Update, CaslSubject.TwoFactor),
  )
  @Post('TwoFactor/BackupCodes/Regenerate')
  @ApiSuccessResponse(TwoFactorBackupCodesResponseModel)
  @ApiOperation({ summary: 'Regenerate backup codes' })
  async RegenerateBackupCodes(
    @User() User: UserContext,
    @Body() Model: TwoFactorVerifyRequestModel,
  ): Promise<TwoFactorBackupCodesResponseModel> {
    return this.twoFactorService.regenerateBackupCodes({ User, ...Model });
  }

  // ==================== API KEYS ====================

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Create, CaslSubject.ApiKey),
  )
  @Post('ApiKeys')
  @ApiSuccessResponse(ApiKeyCreatedResponseModel)
  @ApiOperation({ summary: 'Create new API key' })
  async CreateApiKey(
    @User() User: UserContext,
    @Body() Model: ApiKeyCreateRequestModel,
  ): Promise<ApiKeyCreatedResponseModel> {
    return this.apiKeyService.createApiKey({ User, ...Model });
  }

  @CheckPolicies((Ability) => Ability.can(CaslAction.Read, CaslSubject.ApiKey))
  @Get('ApiKeys')
  @ApiSuccessResponse(ApiKeyViewModel)
  @ApiOperation({ summary: 'Get all API keys' })
  async GetApiKeys(@User() User: UserContext): Promise<ApiKeyViewModel[]> {
    return this.apiKeyService.getUserApiKeys(User);
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Update, CaslSubject.ApiKey),
  )
  @Post('ApiKeys/:apiKeyId')
  @ApiSuccessResponse(ApiKeyViewModel)
  @ApiOperation({ summary: 'Update API key' })
  async UpdateApiKey(
    @User() User: UserContext,
    @Param('apiKeyId') apiKeyId: string,
    @Body() Model: ApiKeyUpdateRequestModel,
  ): Promise<ApiKeyViewModel> {
    return this.apiKeyService.updateApiKey({
      User,
      ApiKeyId: apiKeyId,
      ...Model,
    });
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Delete, CaslSubject.ApiKey),
  )
  @Delete('ApiKeys/:apiKeyId')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Revoke API key' })
  async RevokeApiKey(
    @User() User: UserContext,
    @Param('apiKeyId') apiKeyId: string,
  ): Promise<boolean> {
    return this.apiKeyService.revokeApiKey(User, apiKeyId);
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Update, CaslSubject.ApiKey),
  )
  @Post('ApiKeys/:apiKeyId/Rotate')
  @ApiSuccessResponse(ApiKeyRotateResponseModel)
  @ApiOperation({ summary: 'Rotate API key secret' })
  async RotateApiKey(
    @User() User: UserContext,
    @Param('apiKeyId') apiKeyId: string,
  ): Promise<ApiKeyRotateResponseModel> {
    return this.apiKeyService.rotateApiKey(User, apiKeyId);
  }
}
