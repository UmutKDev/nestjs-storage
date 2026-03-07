import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { ApiKeyService } from '@modules/authentication/api-key/api-key.service';
import { ApiSignatureService } from '../services/api-signature.service';
import { ApiQuotaService } from '../services/api-quota.service';
import {
  X_API_KEY_HEADER,
  X_API_SECRET_HEADER,
  X_API_SIGNATURE_HEADER,
  X_API_TIMESTAMP_HEADER,
  X_API_NONCE_HEADER,
} from '../api.constants';
import { Role, Status } from '@common/enums';
import { AuthenticationType } from '@common/enums/authentication.enum';

@Injectable()
export class ApiAuthGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly apiSignatureService: ApiSignatureService,
    private readonly apiQuotaService: ApiQuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // ── Read API key headers ────────────────────────────────────────────────
    const publicKey = request.headers[X_API_KEY_HEADER] as string;
    const secretKey = request.headers[X_API_SECRET_HEADER] as string;

    if (!publicKey || !secretKey) {
      throw new UnauthorizedException('API key and secret are required');
    }

    // ── Validate API key ────────────────────────────────────────────────────
    const ipAddress = request.ip || request.socket?.remoteAddress;

    const { ApiKey } = await this.apiKeyService.validateSimpleApiKey(
      publicKey,
      secretKey,
      ipAddress,
    );

    // ── Get tier limits ─────────────────────────────────────────────────────
    const tierLimits = await this.apiQuotaService.GetTierLimits(ApiKey.User.Id);

    // ── HMAC signature verification ─────────────────────────────────────────
    const signatureHeader = request.headers[X_API_SIGNATURE_HEADER] as string;

    if (signatureHeader) {
      const timestamp = request.headers[X_API_TIMESTAMP_HEADER] as string;
      const nonce = request.headers[X_API_NONCE_HEADER] as string;
      const BodyHash = createHash('sha256')
        .update(JSON.stringify(request.body || ''))
        .digest('hex');

      const isValid = await this.apiSignatureService.VerifySignature({
        PublicKey: ApiKey.PublicKey,
        ApiKeyId: ApiKey.Id,
        SecretKeyHash: ApiKey.SecretKeyHash,
        Signature: signatureHeader,
        Timestamp: timestamp,
        Nonce: nonce,
        Method: request.method,
        Path: request.path,
        BodyHash,
      });

      if (!isValid) {
        throw new UnauthorizedException('Invalid HMAC signature');
      }
    } else if (tierLimits.HmacRequired) {
      throw new UnauthorizedException(
        'HMAC signature required for your API tier',
      );
    }

    // ── Build user context ──────────────────────────────────────────────────
    const userContext: UserContext = {
      Id: ApiKey.User.Id,
      Email: ApiKey.User.Email,
      FullName: ApiKey.User.FullName,
      Role: ApiKey.User.Role as Role,
      Status: ApiKey.User.Status as Status,
      Image: ApiKey.User.Image,
      ApiKeyId: ApiKey.Id,
    };

    // ── Attach to request ───────────────────────────────────────────────────
    request.user = userContext;
    request.apiKey = ApiKey;
    request.authenticationType = AuthenticationType.API_KEY;

    return true;
  }
}
