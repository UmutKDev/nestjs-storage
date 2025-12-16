import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticationService } from './authentication.service';
import { ApiSuccessResponse } from '@common/decorators/response.decorator';
import {
  AuthenticationRefreshTokenRequestModel,
  AuthenticationResetPasswordRequestModel,
  AuthenticationSignInRequestModel,
  AuthenticationSignUpRequestModel,
  AuthenticationTokenResponseModel,
  AuthenticationVerifyCredentialsRequestModel,
  AuthenticationVerifyCredentialsResponseModel,
} from './authentication.model';
import { Public } from '@common/decorators/public.decorator';
import { Request } from 'express';
import { JwtAuthenticationGuard } from './guards/jwt-authentication.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('Authentication')
@ApiTags('Authentication')
@Throttle({ default: { ttl: 60, limit: 10 } })
export class AuthenticationController {
  constructor(private readonly authenticationService: AuthenticationService) {}

  @Post('Login')
  @ApiSuccessResponse(AuthenticationTokenResponseModel)
  @Public()
  async Login(
    @Body() body: AuthenticationSignInRequestModel,
    @Req() request: Request,
  ): Promise<AuthenticationTokenResponseModel> {
    return this.authenticationService.Login(body, request);
  }

  @Post('VerifyCredentials')
  @ApiSuccessResponse(AuthenticationVerifyCredentialsResponseModel)
  @Public()
  @ApiOperation({
    summary: 'Check whether the provided email/password pair is valid and if 2FA applies',
  })
  async VerifyCredentials(
    @Body() body: AuthenticationVerifyCredentialsRequestModel,
  ): Promise<AuthenticationVerifyCredentialsResponseModel> {
    return this.authenticationService.VerifyCredentials(body);
  }

  @Post('Register')
  @ApiSuccessResponse(AuthenticationTokenResponseModel)
  @ApiOperation({ deprecated: false })
  @Public()
  async Register(
    @Body()
    { email, password }: AuthenticationSignUpRequestModel,
    @Req() request: Request,
  ): Promise<AuthenticationTokenResponseModel> {
    return this.authenticationService.Register(
      {
        email,
        password,
      },
      request,
    );
  }

  @Post('RefreshToken')
  @ApiSuccessResponse(AuthenticationTokenResponseModel)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @Public()
  async RefreshToken(
    @Body() { refreshToken }: AuthenticationRefreshTokenRequestModel,
    @Req() request: Request,
  ): Promise<AuthenticationTokenResponseModel> {
    return this.authenticationService.RefreshToken({ refreshToken, request });
  }

  @Post('Logout')
  @UseGuards(JwtAuthenticationGuard)
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  async Logout(
    @Body() { refreshToken }: AuthenticationRefreshTokenRequestModel,
  ): Promise<boolean> {
    return this.authenticationService.RevokeRefreshToken(refreshToken);
  }

  @Post('ResetPassword')
  @ApiSuccessResponse('boolean')
  @Public()
  async ResetPassword(
    @Body()
    { email }: AuthenticationResetPasswordRequestModel,
  ): Promise<boolean> {
    return this.authenticationService.ResetPassword({ email });
  }

}
