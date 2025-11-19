import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticationService } from './authentication.service';
import { ApiSuccessResponse } from '@common/decorators/response.decorator';
import {
  AuthenticationDecodeTokenBodyRequestModel,
  AuthenticationRefreshTokenRequestModel,
  AuthenticationResetPasswordRequestModel,
  AuthenticationSignInRequestModel,
  AuthenticationSignUpRequestModel,
  AuthenticationTokenResponseModel,
  JWTTokenDecodeResponseModel,
} from './authentication.model';
import { Public } from '@common/decorators/public.decorator';
import { Request } from 'express';
import { JwtAuthenticationGuard } from './guards/jwt-authentication.guard';

@Controller('Authentication')
@ApiTags('Authentication')
@Public()
export class AuthenticationController {
  constructor(private readonly authenticationService: AuthenticationService) {}

  @Post('Login')
  @ApiSuccessResponse(AuthenticationTokenResponseModel)
  async Login(
    @Body() { email, password }: AuthenticationSignInRequestModel,
    @Req() request: Request,
  ): Promise<AuthenticationTokenResponseModel> {
    return this.authenticationService.Login(
      {
        email,
        password,
      },
      request,
    );
  }

  @Post('Register')
  @Public()
  @ApiSuccessResponse(AuthenticationTokenResponseModel)
  @ApiOperation({ deprecated: false })
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
  @Public()
  @ApiSuccessResponse(AuthenticationTokenResponseModel)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
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

  @Post('DecodeToken')
  @Public()
  @ApiSuccessResponse(JWTTokenDecodeResponseModel)
  async DecodeToken(
    @Body() { token }: AuthenticationDecodeTokenBodyRequestModel,
  ) {
    return this.authenticationService.DecodeToken({ token });
  }

  @Post('ResetPassword')
  @Public()
  @ApiSuccessResponse('boolean')
  async ResetPassword(
    @Body()
    { email }: AuthenticationResetPasswordRequestModel,
  ): Promise<boolean> {
    return this.authenticationService.ResetPassword({ email });
  }
}
