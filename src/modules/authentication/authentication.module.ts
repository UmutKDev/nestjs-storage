import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthenticationService } from './authentication.service';
import { AuthenticationController } from './authentication.controller';

import { SessionService } from './session/session.service';
import { PasskeyService } from './passkey/passkey.service';
import { TwoFactorService } from './two-factor/two-factor.service';
import { ApiKeyService } from './api-key/api-key.service';

import { CombinedAuthGuard } from './guards/combined-auth.guard';
import { RoleGuard } from './guards/role.guard';

import { UserEntity } from '@entities/user.entity';
import { PasskeyEntity } from '@entities/passkey.entity';
import { TwoFactorEntity } from '@entities/two-factor.entity';
import { ApiKeyEntity } from '@entities/api-key.entity';

import { MailModule } from '../mail/mail.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      PasskeyEntity,
      TwoFactorEntity,
      ApiKeyEntity,
    ]),
    MailModule,
    RedisModule,
  ],
  controllers: [AuthenticationController],
  providers: [
    AuthenticationService,
    SessionService,
    PasskeyService,
    TwoFactorService,
    ApiKeyService,
    {
      provide: APP_GUARD,
      useClass: CombinedAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RoleGuard,
    },
  ],
  exports: [
    AuthenticationService,
    SessionService,
    PasskeyService,
    TwoFactorService,
    ApiKeyService,
  ],
})
export class AuthenticationModule {}
