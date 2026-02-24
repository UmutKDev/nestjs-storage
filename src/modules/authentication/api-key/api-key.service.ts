import { Injectable, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyEntity } from '@entities/api-key.entity';
import {
  ApiKeyEnvironment,
  ApiKeyScope,
} from '@common/enums/authentication.enum';
import * as argon2 from 'argon2';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import {
  ApiKeyCreateRequestModel,
  ApiKeyCreatedResponseModel,
  ApiKeyViewModel,
  ApiKeyUpdateRequestModel,
  ApiKeyRotateResponseModel,
} from '../../account/security/security.model';
import { plainToInstance } from 'class-transformer';
import { RedisService } from '@modules/redis/redis.service';
import { ApiKeyKeys } from '@modules/redis/redis.keys';
import {
  API_KEY_ENTITY_CACHE_TTL,
  API_KEY_RATE_LIMIT_TTL,
} from '@modules/redis/redis.ttl';
import { UserEntity } from '@entities/user.entity';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly apiKeyRepository: Repository<ApiKeyEntity>,
    private readonly redisService: RedisService,
  ) {}

  private generatePublicKey(environment: ApiKeyEnvironment): string {
    const prefix =
      environment === ApiKeyEnvironment.LIVE ? 'pk_live_' : 'pk_test_';
    return prefix + randomBytes(16).toString('hex');
  }

  private generateSecretKey(environment: ApiKeyEnvironment): string {
    const prefix =
      environment === ApiKeyEnvironment.LIVE ? 'sk_live_' : 'sk_test_';
    return prefix + randomBytes(24).toString('hex');
  }

  async createApiKey({
    User,
    Name,
    Scopes,
    Environment,
    IpWhitelist,
    RateLimitPerMinute,
    ExpiresAt,
  }: {
    User: UserContext;
  } & ApiKeyCreateRequestModel): Promise<ApiKeyCreatedResponseModel> {
    const publicKey = this.generatePublicKey(Environment);
    const secretKey = this.generateSecretKey(Environment);
    const secretKeyHash = await argon2.hash(secretKey);

    const apiKey = new ApiKeyEntity({
      User: { Id: User.Id } as UserEntity,
      Name: Name,
      PublicKey: publicKey,
      SecretKeyHash: secretKeyHash,
      SecretKeyPrefix: secretKey.substring(0, 15),
      Scopes: Scopes,
      Environment: Environment,
      IpWhitelist: IpWhitelist || null,
      RateLimitPerMinute: RateLimitPerMinute || 100,
      ExpiresAt: ExpiresAt ? new Date(ExpiresAt) : null,
    });

    const saved = await this.apiKeyRepository.save(apiKey);

    return plainToInstance(ApiKeyCreatedResponseModel, {
      Id: saved.Id,
      Name: saved.Name,
      PublicKey: saved.PublicKey,
      SecretKey: secretKey,
      Environment: saved.Environment,
      Scopes: saved.Scopes,
      CreatedAt: saved.CreatedAt,
    });
  }

  async validateApiKey(
    publicKey: string,
    signature: string,
    timestamp: string,
    payload: string,
    ipAddress: string,
  ): Promise<{ ApiKey: ApiKeyEntity; UserId: string }> {
    const apiKey = await this.GetApiKeyByPublicKey(publicKey);

    if (!apiKey) {
      throw new HttpException('Invalid API key', 401);
    }

    // Check expiration
    if (apiKey.ExpiresAt && new Date() > apiKey.ExpiresAt) {
      throw new HttpException('API key expired', 401);
    }

    // Check IP whitelist
    if (apiKey.IpWhitelist && apiKey.IpWhitelist.length > 0) {
      if (!apiKey.IpWhitelist.includes(ipAddress)) {
        throw new HttpException('IP not whitelisted', 403);
      }
    }

    // Validate timestamp (prevent replay attacks - 5 minute window)
    const requestTime = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - requestTime) > 300) {
      throw new HttpException('Request timestamp too old', 401);
    }

    // Validate HMAC signature
    const isValidSignature = await this.verifySignature(
      apiKey.Id,
      signature,
      payload,
      timestamp,
    );

    if (!isValidSignature) {
      throw new HttpException('Invalid signature', 401);
    }

    // Check rate limit
    await this.checkRateLimit(apiKey);

    // Update last used
    await this.apiKeyRepository.update(
      { Id: apiKey.Id },
      { LastUsedAt: new Date() },
    );

    return { ApiKey: apiKey, UserId: apiKey.User.Id };
  }

  async validateSimpleApiKey(
    publicKey: string,
    secretKey: string,
    ipAddress: string,
  ): Promise<{ ApiKey: ApiKeyEntity; UserId: string }> {
    const apiKey = await this.GetApiKeyByPublicKey(publicKey);

    if (!apiKey) {
      throw new HttpException('Invalid API key', 401);
    }

    // Verify secret key
    const isValid = await argon2.verify(apiKey.SecretKeyHash, secretKey);
    if (!isValid) {
      throw new HttpException('Invalid API key', 401);
    }

    // Check expiration
    if (apiKey.ExpiresAt && new Date() > apiKey.ExpiresAt) {
      throw new HttpException('API key expired', 401);
    }

    // Check IP whitelist
    if (apiKey.IpWhitelist && apiKey.IpWhitelist.length > 0) {
      if (!apiKey.IpWhitelist.includes(ipAddress)) {
        throw new HttpException('IP not whitelisted', 403);
      }
    }

    // Check rate limit
    await this.checkRateLimit(apiKey);

    // Update last used
    await this.apiKeyRepository.update(
      { Id: apiKey.Id },
      { LastUsedAt: new Date() },
    );

    return { ApiKey: apiKey, UserId: apiKey.User.Id };
  }

  private generateSignature(
    secret: string,
    payload: string,
    timestamp: string,
  ): string {
    const data = `${timestamp}.${payload}`;
    return createHmac('sha256', secret).update(data).digest('hex');
  }

  private async verifySignature(
    apiKeyId: string,
    signature: string,
    payload: string,
    timestamp: string,
  ): Promise<boolean> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { Id: apiKeyId },
    });

    if (!apiKey) {
      return false;
    }

    const expectedSignature = this.generateSignature(
      apiKey.SecretKeyHash,
      payload,
      timestamp,
    );

    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  }

  private async checkRateLimit(apiKey: ApiKeyEntity): Promise<void> {
    const key = ApiKeyKeys.RateLimit(apiKey.Id);
    const current = await this.redisService.Get<number>(key);

    if (current && current >= apiKey.RateLimitPerMinute) {
      throw new HttpException('Rate limit exceeded', 429);
    }

    await this.redisService.Set(
      key,
      (current || 0) + 1,
      API_KEY_RATE_LIMIT_TTL,
    );
  }

  async getUserApiKeys(User: UserContext): Promise<ApiKeyViewModel[]> {
    const apiKeys = await this.apiKeyRepository.find({
      where: { User: { Id: User.Id } },
      order: { CreatedAt: 'DESC' },
    });

    return apiKeys.map((key) =>
      plainToInstance(ApiKeyViewModel, {
        Id: key.Id,
        Name: key.Name,
        PublicKey: key.PublicKey,
        SecretKeyPrefix: key.SecretKeyPrefix,
        Environment: key.Environment,
        Scopes: key.Scopes,
        IpWhitelist: key.IpWhitelist,
        RateLimitPerMinute: key.RateLimitPerMinute,
        LastUsedAt: key.LastUsedAt,
        ExpiresAt: key.ExpiresAt,
        IsRevoked: key.IsRevoked,
        CreatedAt: key.CreatedAt,
      }),
    );
  }

  async updateApiKey({
    User,
    ApiKeyId,
    Name,
    Scopes,
    IpWhitelist,
    RateLimitPerMinute,
  }: {
    User: UserContext;
    ApiKeyId: string;
  } & ApiKeyUpdateRequestModel): Promise<ApiKeyViewModel> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { Id: ApiKeyId, User: { Id: User.Id } },
    });

    if (!apiKey) {
      throw new HttpException('API key not found', 404);
    }

    if (apiKey.IsRevoked) {
      throw new HttpException('Cannot update revoked API key', 400);
    }

    if (Name) apiKey.Name = Name;
    if (Scopes) apiKey.Scopes = Scopes;
    if (IpWhitelist !== undefined) apiKey.IpWhitelist = IpWhitelist;
    if (RateLimitPerMinute) apiKey.RateLimitPerMinute = RateLimitPerMinute;

    await this.apiKeyRepository.save(apiKey);

    // Invalidate cached entity
    await this.InvalidateApiKeyCache(apiKey.PublicKey);

    return plainToInstance(ApiKeyViewModel, {
      Id: apiKey.Id,
      Name: apiKey.Name,
      PublicKey: apiKey.PublicKey,
      SecretKeyPrefix: apiKey.SecretKeyPrefix,
      Environment: apiKey.Environment,
      Scopes: apiKey.Scopes,
      IpWhitelist: apiKey.IpWhitelist,
      RateLimitPerMinute: apiKey.RateLimitPerMinute,
      LastUsedAt: apiKey.LastUsedAt,
      ExpiresAt: apiKey.ExpiresAt,
      IsRevoked: apiKey.IsRevoked,
      CreatedAt: apiKey.CreatedAt,
    });
  }

  async revokeApiKey(User: UserContext, apiKeyId: string): Promise<boolean> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { Id: apiKeyId, User: { Id: User.Id } },
    });

    const result = await this.apiKeyRepository.update(
      { Id: apiKeyId, User: { Id: User.Id } },
      { IsRevoked: true },
    );

    if (apiKey) {
      await this.InvalidateApiKeyCache(apiKey.PublicKey);
    }

    return result.affected > 0;
  }

  async rotateApiKey(
    User: UserContext,
    apiKeyId: string,
  ): Promise<ApiKeyRotateResponseModel> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { Id: apiKeyId, User: { Id: User.Id } },
    });

    if (!apiKey) {
      throw new HttpException('API key not found', 404);
    }

    if (apiKey.IsRevoked) {
      throw new HttpException('Cannot rotate revoked API key', 400);
    }

    // Generate new secret key (keep same public key)
    const newSecretKey = this.generateSecretKey(apiKey.Environment);
    const newSecretKeyHash = await argon2.hash(newSecretKey);

    apiKey.SecretKeyHash = newSecretKeyHash;
    apiKey.SecretKeyPrefix = newSecretKey.substring(0, 15);

    await this.apiKeyRepository.save(apiKey);

    // Invalidate cached entity
    await this.InvalidateApiKeyCache(apiKey.PublicKey);

    return plainToInstance(ApiKeyRotateResponseModel, {
      Id: apiKey.Id,
      PublicKey: apiKey.PublicKey,
      SecretKey: newSecretKey,
    });
  }

  hasScope(apiKey: ApiKeyEntity, requiredScope: ApiKeyScope): boolean {
    return (
      apiKey.Scopes.includes(ApiKeyScope.ADMIN) ||
      apiKey.Scopes.includes(requiredScope)
    );
  }

  /**
   * Look up an API key by PublicKey, using Redis cache to avoid DB round-trips.
   */
  private async GetApiKeyByPublicKey(
    publicKey: string,
  ): Promise<ApiKeyEntity | null> {
    const cacheKey = ApiKeyKeys.Entity(publicKey);
    const cached = await this.redisService.Get<ApiKeyEntity>(cacheKey);
    if (cached) return cached;

    const apiKey = await this.apiKeyRepository.findOne({
      where: { PublicKey: publicKey, IsRevoked: false },
      relations: ['User'],
    });

    if (apiKey) {
      await this.redisService.Set(cacheKey, apiKey, API_KEY_ENTITY_CACHE_TTL);
    }

    return apiKey;
  }

  /**
   * Invalidate a cached API key entity.
   */
  private async InvalidateApiKeyCache(publicKey: string): Promise<void> {
    await this.redisService.Delete(ApiKeyKeys.Entity(publicKey));
  }
}
