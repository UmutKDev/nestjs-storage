import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { ApiUsageService, ApiUsageEntry } from '../services/api-usage.service';
import { GeoData } from '../services/api-geolocation.service';

@Injectable()
export class ApiUsageTrackingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ApiUsageTrackingInterceptor.name);

  constructor(private readonly apiUsageService: ApiUsageService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startTime = Date.now();
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const method = request.method;
    const url = request.url;
    const user = request.user;
    const apiKey = request.apiKey;
    const ipAddress = request.ip || request.socket?.remoteAddress;
    const userAgent = request.headers['user-agent'] || '';

    return next.handle().pipe(
      tap((responseBody) => {
        const responseTimeMs = Date.now() - startTime;
        const geoData: GeoData | null = request.geoData ?? null;

        const requestBodyBytes = request.headers['content-length']
          ? parseInt(request.headers['content-length'], 10)
          : 0;
        const responseBodyBytes = responseBody
          ? Buffer.byteLength(JSON.stringify(responseBody), 'utf8')
          : 0;

        const entry: ApiUsageEntry = {
          UserId: user?.Id,
          ApiKeyId: apiKey?.Id,
          Method: method,
          Endpoint: url,
          StatusCode: response.statusCode,
          ResponseTimeMs: responseTimeMs,
          RequestBodyBytes: requestBodyBytes,
          ResponseBodyBytes: responseBodyBytes,
          IpAddress: ipAddress,
          CountryCode: geoData?.CountryCode,
          City: geoData?.City,
          Latitude: geoData?.Latitude,
          Longitude: geoData?.Longitude,
          UserAgent: userAgent,
        };

        this.apiUsageService.RecordRequest(entry).catch((err) => {
          this.logger.error(
            `Failed to record API usage: ${err.message}`,
            err.stack,
          );
        });
      }),
      catchError((error) => {
        const responseTimeMs = Date.now() - startTime;
        const geoData: GeoData | null = request.geoData ?? null;

        const requestBodyBytes = request.headers['content-length']
          ? parseInt(request.headers['content-length'], 10)
          : 0;

        const entry: ApiUsageEntry = {
          UserId: user?.Id,
          ApiKeyId: apiKey?.Id,
          Method: method,
          Endpoint: url,
          StatusCode: error.status || error.getStatus?.() || 500,
          ResponseTimeMs: responseTimeMs,
          RequestBodyBytes: requestBodyBytes,
          ResponseBodyBytes: 0,
          IpAddress: ipAddress,
          CountryCode: geoData?.CountryCode,
          City: geoData?.City,
          Latitude: geoData?.Latitude,
          Longitude: geoData?.Longitude,
          UserAgent: userAgent,
        };

        this.apiUsageService.RecordRequest(entry).catch((err) => {
          this.logger.error(
            `Failed to record API usage: ${err.message}`,
            err.stack,
          );
        });

        throw error;
      }),
    );
  }
}
