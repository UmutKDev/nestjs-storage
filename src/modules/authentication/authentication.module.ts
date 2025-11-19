import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthenticationService } from './authentication.service';
import { AuthenticationController } from './authentication.controller';
import { jwtConstants } from './authentication.constants';
// import { AuthenticationGuard } from './guards/authentication.guard';
import { RoleGuard } from './guards/role.guard';
import { MailModule } from '../mail/mail.module';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';
import { JwtAuthenticationGuard } from './guards/jwt-authentication.guard';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '@entities/user.entity';
import { RefreshTokenEntity } from '@entities/refresh-token.entity';
import { UserSubscriber } from 'src/subscribers/user.subscriber';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, RefreshTokenEntity]),
    UserSubscriber,
    PassportModule,
    MailModule,
    JwtModule.register({
      global: true,
      secret: jwtConstants.secret,
      signOptions: { expiresIn: jwtConstants.accessTokenExpiresIn },
    }),
  ],
  controllers: [AuthenticationController],
  providers: [
    AuthenticationService,
    LocalStrategy,
    JwtStrategy,
    RefreshTokenStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthenticationGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RoleGuard,
    },
  ],
})
export class AuthenticationModule {}
