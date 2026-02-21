import { Injectable, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TwoFactorEntity } from '@entities/two-factor.entity';
import { TwoFactorMethod } from '@common/enums/authentication.enum';
import { authenticator } from 'otplib';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { TwoFactorVerifyRequestModel } from '../authentication.model';
import {
  TwoFactorSetupResponseModel,
  TwoFactorBackupCodesResponseModel,
  TwoFactorStatusResponseModel,
} from '../../account/security/security.model';
import { plainToInstance } from 'class-transformer';
import { RedisService } from '@modules/redis/redis.service';
import { AuthKeys } from '@modules/redis/redis.keys';

@Injectable()
export class TwoFactorService {
  private readonly ISSUER = process.env.APP_NAME || 'Storage';
  private readonly BACKUP_CODE_COUNT = 10;

  /** Cache TTL for isTwoFactorEnabled check (seconds) */
  private readonly TwoFactorCacheTtl = 300; // 5 minutes

  constructor(
    @InjectRepository(TwoFactorEntity)
    private readonly twoFactorRepository: Repository<TwoFactorEntity>,
    private readonly RedisService: RedisService,
  ) {
    // Configure TOTP settings
    authenticator.options = {
      digits: 6,
      step: 30,
      window: 1,
    };
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < this.BACKUP_CODE_COUNT; i++) {
      const code = randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }
    return codes;
  }

  private async hashBackupCodes(codes: string[]): Promise<string[]> {
    return Promise.all(codes.map((code) => argon2.hash(code)));
  }

  async setupTotp(User: UserContext): Promise<TwoFactorSetupResponseModel> {
    // Check if already has 2FA enabled
    const existing = await this.twoFactorRepository.findOne({
      where: { UserId: User.Id, IsEnabled: true },
    });

    if (existing) {
      throw new HttpException(
        'Two-factor authentication is already enabled',
        400,
      );
    }

    // Generate secret
    const secret = authenticator.generateSecret();
    const otpAuthUrl = authenticator.keyuri(User.Email, this.ISSUER, secret);

    // Create or update 2FA record (not enabled yet)
    let twoFactor = await this.twoFactorRepository.findOne({
      where: { UserId: User.Id },
    });

    if (twoFactor) {
      twoFactor.Secret = secret;
      twoFactor.Method = TwoFactorMethod.TOTP;
      twoFactor.IsVerified = false;
    } else {
      twoFactor = new TwoFactorEntity({
        UserId: User.Id,
        Method: TwoFactorMethod.TOTP,
        Secret: secret,
        IsEnabled: false,
        IsVerified: false,
      });
    }

    await this.twoFactorRepository.save(twoFactor);

    return plainToInstance(TwoFactorSetupResponseModel, {
      Secret: secret,
      Issuer: this.ISSUER,
      AccountName: User.Email,
      OtpAuthUrl: otpAuthUrl,
    });
  }

  async verifyAndEnableTotp({
    User,
    Code,
  }: {
    User: UserContext;
  } & TwoFactorVerifyRequestModel): Promise<TwoFactorBackupCodesResponseModel> {
    const twoFactor = await this.twoFactorRepository.findOne({
      where: { UserId: User.Id, Method: TwoFactorMethod.TOTP },
    });

    if (!twoFactor || !twoFactor.Secret) {
      throw new HttpException('TOTP setup not found', 400);
    }

    // Verify the code
    const isValid = authenticator.verify({
      token: Code,
      secret: twoFactor.Secret,
    });

    if (!isValid) {
      throw new HttpException('Invalid verification code', 400);
    }

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();
    const hashedCodes = await this.hashBackupCodes(backupCodes);

    // Enable 2FA
    twoFactor.IsEnabled = true;
    twoFactor.IsVerified = true;
    twoFactor.BackupCodes = hashedCodes;
    twoFactor.LastVerifiedAt = new Date();

    await this.twoFactorRepository.save(twoFactor);

    // Invalidate 2FA cache
    await this.RedisService.Delete(AuthKeys.TwoFactorEnabled(User.Id));

    return plainToInstance(TwoFactorBackupCodesResponseModel, {
      BackupCodes: backupCodes,
    });
  }

  async verifyCode(userId: string, code: string): Promise<boolean> {
    const twoFactor = await this.twoFactorRepository.findOne({
      where: { UserId: userId, IsEnabled: true },
    });

    if (!twoFactor) {
      return false;
    }

    // Try TOTP first
    if (twoFactor.Secret) {
      const isValid = authenticator.verify({
        token: code,
        secret: twoFactor.Secret,
      });

      if (isValid) {
        await this.twoFactorRepository.update(
          { Id: twoFactor.Id },
          { LastVerifiedAt: new Date() },
        );
        return true;
      }
    }

    // Try backup codes
    for (let i = 0; i < twoFactor.BackupCodes.length; i++) {
      const hashedCode = twoFactor.BackupCodes[i];
      if (hashedCode) {
        try {
          const isValid = await argon2.verify(
            hashedCode,
            code.replaceAll('-', '').toUpperCase(),
          );
          if (isValid) {
            // Remove used backup code
            const newCodes = [...twoFactor.BackupCodes];
            newCodes[i] = null;
            await this.twoFactorRepository.update(
              { Id: twoFactor.Id },
              {
                BackupCodes: newCodes.filter(Boolean),
                LastVerifiedAt: new Date(),
              },
            );
            return true;
          }
        } catch {
          continue;
        }
      }
    }

    return false;
  }

  async disableTotp({
    User,
    Code,
  }: { User: UserContext } & TwoFactorVerifyRequestModel): Promise<boolean> {
    const isValid = await this.verifyCode(User.Id, Code);
    if (!isValid) {
      throw new HttpException('Invalid verification code', 400);
    }

    await this.twoFactorRepository.delete({ UserId: User.Id });
    // Invalidate 2FA cache
    await this.RedisService.Delete(AuthKeys.TwoFactorEnabled(User.Id));
    return true;
  }

  async regenerateBackupCodes({
    User,
    Code,
  }: {
    User: UserContext;
  } & TwoFactorVerifyRequestModel): Promise<TwoFactorBackupCodesResponseModel> {
    const isValid = await this.verifyCode(User.Id, Code);
    if (!isValid) {
      throw new HttpException('Invalid verification code', 400);
    }

    const twoFactor = await this.twoFactorRepository.findOne({
      where: { UserId: User.Id, IsEnabled: true },
    });

    if (!twoFactor) {
      throw new HttpException('Two-factor authentication not enabled', 400);
    }

    const backupCodes = this.generateBackupCodes();
    const hashedCodes = await this.hashBackupCodes(backupCodes);

    twoFactor.BackupCodes = hashedCodes;
    await this.twoFactorRepository.save(twoFactor);

    return plainToInstance(TwoFactorBackupCodesResponseModel, {
      BackupCodes: backupCodes,
    });
  }

  async getStatus(
    User: UserContext,
    hasPasskey: boolean,
  ): Promise<TwoFactorStatusResponseModel> {
    const twoFactor = await this.twoFactorRepository.findOne({
      where: { UserId: User.Id },
    });

    const backupCodesRemaining =
      twoFactor?.BackupCodes?.filter(Boolean).length || 0;

    return plainToInstance(TwoFactorStatusResponseModel, {
      IsEnabled: twoFactor?.IsEnabled || false,
      Method: twoFactor?.Method || null,
      HasPasskey: hasPasskey,
      BackupCodesRemaining: backupCodesRemaining,
    });
  }

  async isTwoFactorEnabled(userId: string): Promise<boolean> {
    const cacheKey = AuthKeys.TwoFactorEnabled(userId);
    const cached = await this.RedisService.Get<boolean>(cacheKey);
    if (cached !== undefined && cached !== null) return cached;

    const twoFactor = await this.twoFactorRepository.findOne({
      where: { UserId: userId, IsEnabled: true },
    });
    const result = !!twoFactor;
    await this.RedisService.Set(cacheKey, result, this.TwoFactorCacheTtl);
    return result;
  }
}
