import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticationService } from './authentication.service';
import { ApiSuccessResponse } from '@common/decorators/response.decorator';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';
import {
  LoginRequestModel,
  RegisterRequestModel,
  ResetPasswordRequestModel,
  AuthResponseModel,
  SessionViewModel,
  TwoFactorVerifyRequestModel,
  PasskeyRegistrationBeginRequestModel,
  PasskeyRegistrationBeginResponseModel,
  PasskeyRegistrationFinishRequestModel,
  PasskeyLoginBeginRequestModel,
  PasskeyLoginBeginResponseModel,
  PasskeyLoginFinishRequestModel,
  PasskeyViewModel,
  TwoFactorSetupResponseModel,
  TwoFactorBackupCodesResponseModel,
  TwoFactorStatusResponseModel,
  ApiKeyCreateRequestModel,
  ApiKeyCreatedResponseModel,
  ApiKeyViewModel,
  ApiKeyUpdateRequestModel,
  ApiKeyRotateResponseModel,
} from './authentication.model';
import { Public } from '@common/decorators/public.decorator';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { User } from '@common/decorators/user.decorator';
import { PasskeyService } from './passkey/passkey.service';
import { TwoFactorService } from './two-factor/two-factor.service';
import { ApiKeyService } from './api-key/api-key.service';
import { SESSION_HEADER } from './guards/session.guard';
import { SessionService } from './session/session.service';

interface AuthenticatedRequest extends Request {
  user: { Id: string; Email: string };
  sessionId?: string;
}

@Controller('Authentication')
@ApiTags('Authentication')
@Throttle({ default: { ttl: 60, limit: 10 } })
export class AuthenticationController {
  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly passkeyService: PasskeyService,
    private readonly twoFactorService: TwoFactorService,
    private readonly apiKeyService: ApiKeyService,
    private readonly sessionService: SessionService,
  ) {}

  // ==================== BASE AUTH ====================

  @Post('Login')
  @ApiSuccessResponse(AuthResponseModel)
  @ApiOperation({ summary: 'Login with email and password' })
  @Public()
  async Login(
    @Body() body: LoginRequestModel,
    @Req() request: Request,
  ): Promise<AuthResponseModel> {
    return this.authenticationService.Login(body, request);
  }

  @Post('Register')
  @ApiSuccessResponse(AuthResponseModel)
  @ApiOperation({ summary: 'Register new user' })
  @Public()
  async Register(
    @Body() body: RegisterRequestModel,
    @Req() request: Request,
  ): Promise<AuthResponseModel> {
    return this.authenticationService.Register(body, request);
  }

  @Post('Logout')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Logout current session' })
  async Logout(@Req() request: AuthenticatedRequest): Promise<boolean> {
    const sessionId =
      request.sessionId || (request.headers[SESSION_HEADER] as string);
    return this.authenticationService.Logout(sessionId);
  }

  @Post('LogoutAll')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Logout all sessions' })
  async LogoutAll(@User('id') userId: string): Promise<boolean> {
    const count = await this.authenticationService.LogoutAll(userId);
    return count > 0;
  }

  @Post('LogoutOthers')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Logout all other sessions except current' })
  async LogoutOthers(@Req() request: AuthenticatedRequest): Promise<boolean> {
    const sessionId =
      request.sessionId || (request.headers[SESSION_HEADER] as string);
    const count = await this.authenticationService.LogoutOthers(
      request.user.Id,
      sessionId,
    );
    return count >= 0;
  }

  @Post('ResetPassword')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Reset password and send new password via email' })
  @Public()
  async ResetPassword(
    @Body() body: ResetPasswordRequestModel,
  ): Promise<boolean> {
    return this.authenticationService.ResetPassword(body);
  }

  @Post('Verify2FA')
  @ApiSuccessResponse(AuthResponseModel)
  @ApiOperation({ summary: 'Verify 2FA code after login' })
  @Public()
  async Verify2FA(
    @Body() body: TwoFactorVerifyRequestModel,
    @Req() request: Request,
  ): Promise<AuthResponseModel> {
    const sessionId = request.headers[SESSION_HEADER] as string;
    return this.authenticationService.Verify2FA(sessionId, body.Code);
  }

  // ==================== SESSIONS ====================

  @Get('Sessions')
  @ApiSuccessResponse(SessionViewModel)
  @ApiOperation({ summary: 'Get all active sessions' })
  async GetSessions(
    @User('id') userId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<SessionViewModel[]> {
    const currentSessionId =
      request.sessionId || (request.headers[SESSION_HEADER] as string);
    return this.authenticationService.GetSessions(userId, currentSessionId);
  }

  @Delete('Sessions/:sessionId')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Revoke specific session' })
  async RevokeSession(
    @User('id') userId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<boolean> {
    return this.authenticationService.RevokeSession(userId, sessionId);
  }

  // ==================== PASSKEY ====================

  @Post('Passkey/Register/Begin')
  @ApiSuccessResponse(PasskeyRegistrationBeginResponseModel)
  @ApiOperation({ summary: 'Begin passkey registration' })
  async PasskeyRegisterBegin(
    @User('id') userId: string,
    @Body() body: PasskeyRegistrationBeginRequestModel,
  ): Promise<PasskeyRegistrationBeginResponseModel> {
    return this.passkeyService.beginRegistration(userId, body.DeviceName);
  }

  @Post('Passkey/Register/Finish')
  @ApiSuccessResponse(PasskeyViewModel)
  @ApiOperation({ summary: 'Complete passkey registration' })
  async PasskeyRegisterFinish(
    @User('id') userId: string,
    @Body() body: PasskeyRegistrationFinishRequestModel,
  ): Promise<PasskeyViewModel> {
    return this.passkeyService.finishRegistration(
      userId,
      body.DeviceName,
      body.Credential as unknown as RegistrationResponseJSON,
    );
  }

  @Post('Passkey/Login/Begin')
  @ApiSuccessResponse(PasskeyLoginBeginResponseModel)
  @ApiOperation({ summary: 'Begin passkey login' })
  @Public()
  async PasskeyLoginBegin(
    @Body() body: PasskeyLoginBeginRequestModel,
  ): Promise<PasskeyLoginBeginResponseModel> {
    return this.passkeyService.beginLogin(body.Email);
  }

  @Post('Passkey/Login/Finish')
  @ApiSuccessResponse(AuthResponseModel)
  @ApiOperation({ summary: 'Complete passkey login' })
  @Public()
  async PasskeyLoginFinish(
    @Body() body: PasskeyLoginFinishRequestModel,
    @Req() request: Request,
  ): Promise<AuthResponseModel> {
    const user = await this.passkeyService.finishLogin(
      body.Email,
      body.Credential as unknown as AuthenticationResponseJSON,
    );

    const ipAddress = request?.ip || request?.socket?.remoteAddress || '';
    const userAgent = request?.headers['user-agent'] || '';

    const { SessionId, Session } = await this.sessionService.createSession(
      user,
      ipAddress,
      userAgent,
      false,
    );

    return {
      SessionId,
      ExpiresAt: Session.ExpiresAt,
      RequiresTwoFactor: false,
    };
  }

  @Get('Passkey')
  @ApiSuccessResponse(PasskeyViewModel)
  @ApiOperation({ summary: 'Get registered passkeys' })
  async GetPasskeys(@User('id') userId: string): Promise<PasskeyViewModel[]> {
    return this.passkeyService.getUserPasskeys(userId);
  }

  @Delete('Passkey/:passkeyId')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Delete a passkey' })
  async DeletePasskey(
    @User('id') userId: string,
    @Param('passkeyId') passkeyId: string,
  ): Promise<boolean> {
    return this.passkeyService.deletePasskey(userId, passkeyId);
  }

  // ==================== TWO-FACTOR ====================

  @Post('TwoFactor/TOTP/Setup')
  @ApiSuccessResponse(TwoFactorSetupResponseModel)
  @ApiOperation({ summary: 'Setup TOTP 2FA' })
  async TwoFactorSetup(
    @User('id') userId: string,
    @User('email') email: string,
  ): Promise<TwoFactorSetupResponseModel> {
    return this.twoFactorService.setupTotp(userId, email);
  }

  @Post('TwoFactor/TOTP/Verify')
  @ApiSuccessResponse(TwoFactorBackupCodesResponseModel)
  @ApiOperation({ summary: 'Verify and enable TOTP 2FA' })
  async TwoFactorVerify(
    @User('id') userId: string,
    @Body() body: TwoFactorVerifyRequestModel,
  ): Promise<TwoFactorBackupCodesResponseModel> {
    return this.twoFactorService.verifyAndEnableTotp(userId, body.Code);
  }

  @Post('TwoFactor/TOTP/Disable')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Disable TOTP 2FA' })
  async TwoFactorDisable(
    @User('id') userId: string,
    @Body() body: TwoFactorVerifyRequestModel,
  ): Promise<boolean> {
    return this.twoFactorService.disableTotp(userId, body.Code);
  }

  @Get('TwoFactor/Status')
  @ApiSuccessResponse(TwoFactorStatusResponseModel)
  @ApiOperation({ summary: 'Get 2FA status' })
  async TwoFactorStatus(
    @User('id') userId: string,
  ): Promise<TwoFactorStatusResponseModel> {
    const hasPasskey = await this.passkeyService.hasPasskey(userId);
    return this.twoFactorService.getStatus(userId, hasPasskey);
  }

  @Post('TwoFactor/BackupCodes/Regenerate')
  @ApiSuccessResponse(TwoFactorBackupCodesResponseModel)
  @ApiOperation({ summary: 'Regenerate backup codes' })
  async RegenerateBackupCodes(
    @User('id') userId: string,
    @Body() body: TwoFactorVerifyRequestModel,
  ): Promise<TwoFactorBackupCodesResponseModel> {
    return this.twoFactorService.regenerateBackupCodes(userId, body.Code);
  }

  // ==================== API KEYS ====================

  @Post('ApiKeys')
  @ApiSuccessResponse(ApiKeyCreatedResponseModel)
  @ApiOperation({ summary: 'Create new API key' })
  async CreateApiKey(
    @User('id') userId: string,
    @Body() body: ApiKeyCreateRequestModel,
  ): Promise<ApiKeyCreatedResponseModel> {
    return this.apiKeyService.createApiKey(userId, body);
  }

  @Get('ApiKeys')
  @ApiSuccessResponse(ApiKeyViewModel)
  @ApiOperation({ summary: 'Get all API keys' })
  async GetApiKeys(@User('id') userId: string): Promise<ApiKeyViewModel[]> {
    return this.apiKeyService.getUserApiKeys(userId);
  }

  @Post('ApiKeys/:apiKeyId')
  @ApiSuccessResponse(ApiKeyViewModel)
  @ApiOperation({ summary: 'Update API key' })
  async UpdateApiKey(
    @User('id') userId: string,
    @Param('apiKeyId') apiKeyId: string,
    @Body() body: ApiKeyUpdateRequestModel,
  ): Promise<ApiKeyViewModel> {
    return this.apiKeyService.updateApiKey(userId, apiKeyId, body);
  }

  @Delete('ApiKeys/:apiKeyId')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Revoke API key' })
  async RevokeApiKey(
    @User('id') userId: string,
    @Param('apiKeyId') apiKeyId: string,
  ): Promise<boolean> {
    return this.apiKeyService.revokeApiKey(userId, apiKeyId);
  }

  @Post('ApiKeys/:apiKeyId/Rotate')
  @ApiSuccessResponse(ApiKeyRotateResponseModel)
  @ApiOperation({ summary: 'Rotate API key secret' })
  async RotateApiKey(
    @User('id') userId: string,
    @Param('apiKeyId') apiKeyId: string,
  ): Promise<ApiKeyRotateResponseModel> {
    return this.apiKeyService.rotateApiKey(userId, apiKeyId);
  }
}
