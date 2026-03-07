import { Injectable, HttpException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { RedisService } from '@modules/redis/redis.service';
import { ApiSignatureKeys } from '@modules/redis/redis.keys';
import { API_SIGNATURE_NONCE_TTL } from '@modules/redis/redis.ttl';
import { SIGNATURE_TIMESTAMP_WINDOW_SECONDS } from '@modules/api/api.constants';

@Injectable()
export class ApiSignatureService {
  constructor(private readonly RedisService: RedisService) {}

  /**
   * Verify an HMAC-SHA256 request signature.
   *
   * Validates the timestamp window, ensures the nonce has not been replayed,
   * builds the canonical string, and performs a timing-safe comparison.
   */
  async VerifySignature(params: {
    PublicKey: string;
    ApiKeyId: string;
    SecretKeyHash: string;
    Signature: string;
    Timestamp: string;
    Nonce: string;
    Method: string;
    Path: string;
    BodyHash: string;
  }): Promise<boolean> {
    const {
      ApiKeyId,
      SecretKeyHash,
      Signature,
      Timestamp,
      Nonce,
      Method,
      Path,
      BodyHash,
    } = params;

    // ── Validate timestamp window ──────────────────────────────────────────
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      Math.abs(nowSeconds - parseInt(Timestamp, 10)) >
      SIGNATURE_TIMESTAMP_WINDOW_SECONDS
    ) {
      throw new HttpException('Timestamp expired', 401);
    }

    // ── Check nonce uniqueness (replay prevention) ─────────────────────────
    const nonceKey = ApiSignatureKeys.Nonce(ApiKeyId, Nonce);
    const existingNonce = await this.RedisService.Get<string>(nonceKey);

    if (existingNonce) {
      throw new HttpException('Nonce already used', 401);
    }

    await this.RedisService.Set(nonceKey, '1', API_SIGNATURE_NONCE_TTL);

    // ── Build canonical string and compute expected HMAC ────────────────────
    const canonical = `${Timestamp}.${Method.toUpperCase()}.${Path}.${BodyHash}`;
    const expected = createHmac('sha256', SecretKeyHash)
      .update(canonical)
      .digest('hex');

    // ── Timing-safe comparison ──────────────────────────────────────────────
    const sigBuffer = Buffer.from(Signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  }

  /**
   * Generate an HMAC-SHA256 signature for an outgoing webhook payload.
   */
  GenerateWebhookSignature(
    Secret: string,
    Payload: string,
    Timestamp: string,
  ): string {
    return createHmac('sha256', Secret)
      .update(`${Timestamp}.${Payload}`)
      .digest('hex');
  }
}
