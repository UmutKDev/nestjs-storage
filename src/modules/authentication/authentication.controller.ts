import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticationService } from './authentication.service';
import { ApiSuccessResponse } from '@common/decorators/response.decorator';
import {
  LoginRequestModel,
  LoginCheckRequestModel,
  LoginCheckResponseModel,
  RegisterRequestModel,
  ResetPasswordRequestModel,
  AuthenticationResponseModel,
  TwoFactorVerifyRequestModel,
  PasskeyLoginBeginRequestModel,
  PasskeyLoginBeginResponseModel,
  PasskeyLoginFinishRequestModel,
} from './authentication.model';
import { Public } from '@common/decorators/public.decorator';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { PasskeyService } from './passkey/passkey.service';
import { SESSION_HEADER, SESSION_COOKIE_NAME } from './guards/session.guard';
import { SessionService } from './session/session.service';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

interface AuthenticatedRequest extends Request {
  user: UserContext;
  sessionId?: string;
}

@Controller('Authentication')
@ApiTags('Authentication')
@Throttle({ default: { ttl: 60, limit: 10 } })
export class AuthenticationController {
  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly passkeyService: PasskeyService,
    private readonly sessionService: SessionService,
  ) {}

  // ==================== BASE AUTH ====================

  @Post('Login/Check')
  @ApiSuccessResponse(LoginCheckResponseModel)
  @ApiOperation({
    summary: 'Step 1: Check email and get authentication requirements',
    description:
      'Returns available authentication methods (password, passkey), 2FA status, and passkey options if available. This should be the first step in the login flow.',
  })
  @Public()
  async LoginCheck(
    @Body() Model: LoginCheckRequestModel,
  ): Promise<LoginCheckResponseModel> {
    return this.authenticationService.LoginCheck(Model);
  }

  @Post('Login')
  @ApiSuccessResponse(AuthenticationResponseModel)
  @ApiOperation({
    summary: 'Step 2: Login with email and password',
    description:
      'After checking email with Login/Check, use this endpoint to authenticate with password. If 2FA is enabled, the response will have RequiresTwoFactor=true and you need to call Verify2FA.',
  })
  @Public()
  async Login(
    @Body() Model: LoginRequestModel,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticationResponseModel> {
    const result = await this.authenticationService.Login(Model, request);
    response.cookie(SESSION_COOKIE_NAME, result.SessionId, COOKIE_OPTIONS);
    return result;
  }

  @Post('Register')
  @ApiSuccessResponse(AuthenticationResponseModel)
  @ApiOperation({ summary: 'Register new user' })
  @Public()
  async Register(
    @Body() Model: RegisterRequestModel,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticationResponseModel> {
    const result = await this.authenticationService.Register(Model, request);
    response.cookie(SESSION_COOKIE_NAME, result.SessionId, COOKIE_OPTIONS);
    return result;
  }

  @Post('Logout')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Logout current session' })
  async Logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<boolean> {
    const sessionId =
      request.sessionId || (request.headers[SESSION_HEADER] as string);
    const result = await this.authenticationService.Logout(sessionId);
    response.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return result;
  }

  @Post('ResetPassword')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Reset password and send new password via email' })
  @Public()
  async ResetPassword(
    @Body() Model: ResetPasswordRequestModel,
  ): Promise<boolean> {
    return this.authenticationService.ResetPassword(Model);
  }

  @Post('Verify2FA')
  @ApiSuccessResponse(AuthenticationResponseModel)
  @ApiOperation({
    summary: 'Step 3: Verify 2FA code after login',
    description:
      'If Login or Passkey/Login/Finish returns RequiresTwoFactor=true, use this endpoint to complete authentication with a TOTP code or backup code.',
  })
  @Public()
  async Verify2FA(
    @Body() Model: TwoFactorVerifyRequestModel,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticationResponseModel> {
    const sessionId =
      request.cookies?.[SESSION_COOKIE_NAME] ||
      (request.headers[SESSION_HEADER] as string);
    const result = await this.authenticationService.Verify2FA(
      sessionId,
      Model.Code,
    );
    response.cookie(SESSION_COOKIE_NAME, result.SessionId, COOKIE_OPTIONS);
    return result;
  }

  // ==================== PASSKEY LOGIN ====================

  @Post('Passkey/Login/Begin')
  @ApiSuccessResponse(PasskeyLoginBeginResponseModel)
  @ApiOperation({
    summary: 'Step 2 (Alternative): Begin passkey login',
    description:
      'Alternative to password login. Use this if Login/Check returned HasPasskey=true. PasskeyOptions from Login/Check can also be used directly.',
  })
  @Public()
  async PasskeyLoginBegin(
    @Body() Model: PasskeyLoginBeginRequestModel,
  ): Promise<PasskeyLoginBeginResponseModel> {
    return this.passkeyService.beginLogin(Model);
  }

  @Post('Passkey/Login/Finish')
  @ApiSuccessResponse(AuthenticationResponseModel)
  @ApiOperation({
    summary: 'Step 2 (Alternative): Complete passkey login',
    description:
      'Complete the passkey authentication. Note: Passkey login bypasses 2FA requirement.',
  })
  @Public()
  async PasskeyLoginFinish(
    @Body() Model: PasskeyLoginFinishRequestModel,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticationResponseModel> {
    const user = await this.passkeyService.finishLogin(Model);

    const ipAddress = request?.ip || request?.socket?.remoteAddress || '';
    const userAgent = request?.headers['user-agent'] || '';

    const { SessionId, Session } = await this.sessionService.createSession(
      user,
      ipAddress,
      userAgent,
      false,
    );

    response.cookie(SESSION_COOKIE_NAME, SessionId, COOKIE_OPTIONS);

    return {
      SessionId,
      ExpiresAt: Session.ExpiresAt,
    };
  }
}
