import { Injectable, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasskeyEntity } from '@entities/passkey.entity';
import { UserEntity } from '@entities/user.entity';
import { RedisService } from '@modules/redis/redis.service';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types';
import {
  PasskeyRegistrationBeginResponseModel,
  PasskeyLoginBeginResponseModel,
  PasskeyViewModel,
} from '../authentication.model';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class PasskeyService {
  private readonly RP_NAME = process.env.APP_NAME || 'Storage';
  private readonly RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
  private readonly ORIGIN = process.env.APP_URL || 'http://localhost:3000';
  private readonly CHALLENGE_PREFIX = 'passkey:challenge';
  private readonly CHALLENGE_TTL = 300; // 5 minutes

  constructor(
    @InjectRepository(PasskeyEntity)
    private readonly passkeyRepository: Repository<PasskeyEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly redisService: RedisService,
  ) {}

  private getChallengeKey(
    userId: string,
    type: 'registration' | 'login',
  ): string {
    return `${this.CHALLENGE_PREFIX}:${type}:${userId}`;
  }

  async beginRegistration(
    userId: string,
    deviceName: string,
  ): Promise<PasskeyRegistrationBeginResponseModel> {
    const user = await this.userRepository.findOne({ where: { Id: userId } });
    if (!user) {
      throw new HttpException('User not found', 404);
    }

    // Get existing passkeys for this user
    const existingPasskeys = await this.passkeyRepository.find({
      where: { User: { Id: user.Id } },
    });

    const excludeCredentials = existingPasskeys.map((passkey) => ({
      id: passkey.CredentialId,
      transports: passkey.Transports
        ? (JSON.parse(passkey.Transports) as AuthenticatorTransportFuture[])
        : undefined,
    }));

    const options = await generateRegistrationOptions({
      rpName: this.RP_NAME,
      rpID: this.RP_ID,
      userName: user.Email,
      userDisplayName: user.FullName || user.Email,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',
      },
    });

    // Store challenge in Redis
    await this.redisService.set(
      this.getChallengeKey(userId, 'registration'),
      { challenge: options.challenge, deviceName },
      this.CHALLENGE_TTL,
    );

    return plainToInstance(PasskeyRegistrationBeginResponseModel, {
      Challenge: options.challenge,
      Options: options,
    });
  }

  async finishRegistration(
    userId: string,
    deviceName: string,
    credential: RegistrationResponseJSON,
  ): Promise<PasskeyViewModel> {
    // Get stored challenge
    const stored = await this.redisService.get<{
      challenge: string;
      deviceName: string;
    }>(this.getChallengeKey(userId, 'registration'));

    if (!stored) {
      throw new HttpException('Registration challenge expired', 400);
    }

    let verification: VerifiedRegistrationResponse;
    try {
      verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: stored.challenge,
        expectedOrigin: this.ORIGIN,
        expectedRPID: this.RP_ID,
      });
    } catch (error) {
      throw new HttpException(`Verification failed: ${error.message}`, 400);
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new HttpException('Registration verification failed', 400);
    }

    const { credential: regCredential, credentialDeviceType } =
      verification.registrationInfo;

    // Save passkey
    const passkey = new PasskeyEntity({
      User: { Id: userId } as UserEntity,
      CredentialId: Buffer.from(regCredential.id).toString('base64url'),
      PublicKey: Buffer.from(regCredential.publicKey).toString('base64'),
      Counter: Number(regCredential.counter),
      DeviceName: deviceName || stored.deviceName,
      DeviceType: credentialDeviceType,
      Transports: credential.response.transports
        ? JSON.stringify(credential.response.transports)
        : null,
    });

    const saved = await this.passkeyRepository.save(passkey);

    // Clear challenge
    await this.redisService.del(this.getChallengeKey(userId, 'registration'));

    return plainToInstance(PasskeyViewModel, {
      Id: saved.Id,
      DeviceName: saved.DeviceName,
      DeviceType: saved.DeviceType,
      CreatedAt: saved.CreatedAt,
      LastUsedAt: saved.LastUsedAt,
    });
  }

  async beginLogin(email: string): Promise<PasskeyLoginBeginResponseModel> {
    const user = await this.userRepository.findOne({ where: { Email: email } });
    if (!user) {
      throw new HttpException('User not found', 404);
    }

    const passkeys = await this.passkeyRepository.find({
      where: { User: { Id: user.Id } },
    });

    if (passkeys.length === 0) {
      throw new HttpException('No passkeys registered', 400);
    }

    const allowCredentials = passkeys.map((passkey) => ({
      id: passkey.CredentialId,
      transports: passkey.Transports
        ? (JSON.parse(passkey.Transports) as AuthenticatorTransportFuture[])
        : undefined,
    }));

    const options = await generateAuthenticationOptions({
      rpID: this.RP_ID,
      allowCredentials,
      userVerification: 'preferred',
    });

    // Store challenge
    await this.redisService.set(
      this.getChallengeKey(user.Id, 'login'),
      { challenge: options.challenge, userId: user.Id },
      this.CHALLENGE_TTL,
    );

    return plainToInstance(PasskeyLoginBeginResponseModel, {
      Challenge: options.challenge,
      Options: options,
    });
  }

  async finishLogin(
    email: string,
    credential: AuthenticationResponseJSON,
  ): Promise<UserEntity> {
    const user = await this.userRepository.findOne({ where: { Email: email } });
    if (!user) {
      throw new HttpException('User not found', 404);
    }

    // Get stored challenge
    const stored = await this.redisService.get<{
      challenge: string;
      userId: string;
    }>(this.getChallengeKey(user.Id, 'login'));

    if (!stored) {
      throw new HttpException('Login challenge expired', 400);
    }

    // Find the passkey
    const passkey = await this.passkeyRepository.findOne({
      where: {
        User: { Id: user.Id },
        CredentialId: credential.id,
      },
    });

    if (!passkey) {
      throw new HttpException('Passkey not found', 400);
    }

    let verification: VerifiedAuthenticationResponse;
    try {
      verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: stored.challenge,
        expectedOrigin: this.ORIGIN,
        expectedRPID: this.RP_ID,
        credential: {
          id: passkey.CredentialId,
          publicKey: Buffer.from(passkey.PublicKey, 'base64'),
          counter: Number(passkey.Counter),
          transports: passkey.Transports
            ? JSON.parse(passkey.Transports)
            : undefined,
        },
      });
    } catch (error) {
      throw new HttpException(`Authentication failed: ${error.message}`, 400);
    }

    if (!verification.verified) {
      throw new HttpException('Authentication verification failed', 400);
    }

    // Update counter and last used
    await this.passkeyRepository.update(
      { Id: passkey.Id },
      {
        Counter: verification.authenticationInfo.newCounter,
        LastUsedAt: new Date(),
      },
    );

    // Clear challenge
    await this.redisService.del(this.getChallengeKey(user.Id, 'login'));

    return user;
  }

  async getUserPasskeys(userId: string): Promise<PasskeyViewModel[]> {
    const passkeys = await this.passkeyRepository.find({
      where: { User: { Id: userId } },
      order: { CreatedAt: 'DESC' },
    });

    return passkeys.map((passkey) =>
      plainToInstance(PasskeyViewModel, {
        Id: passkey.Id,
        DeviceName: passkey.DeviceName,
        DeviceType: passkey.DeviceType,
        CreatedAt: passkey.CreatedAt,
        LastUsedAt: passkey.LastUsedAt,
      }),
    );
  }

  async deletePasskey(userId: string, passkeyId: string): Promise<boolean> {
    const result = await this.passkeyRepository.delete({
      Id: passkeyId,
      User: { Id: userId },
    });

    return result.affected > 0;
  }

  async hasPasskey(userId: string): Promise<boolean> {
    const count = await this.passkeyRepository.count({
      where: { User: { Id: userId } },
    });
    return count > 0;
  }
}
