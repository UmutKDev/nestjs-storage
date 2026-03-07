import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ApiGeolocationService } from '../services/api-geolocation.service';

@Injectable()
export class ApiGeolocationInterceptor implements NestInterceptor {
  constructor(private readonly apiGeolocationService: ApiGeolocationService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.socket?.remoteAddress;

    // ── Resolve geo data and attach to request ──────────────────────────────
    const geoData = await this.apiGeolocationService.Resolve(ip);
    request.geoData = geoData ?? null;

    return next.handle();
  }
}
