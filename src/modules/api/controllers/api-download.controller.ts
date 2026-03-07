import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { User } from '@common/decorators/user.decorator';
import { ApiKeyScope } from '@common/enums/authentication.enum';
import { ThrottleTransform } from '@common/helpers/throttle.transform';
import { CloudService } from '@modules/cloud/cloud.service';
import { CloudKeyRequestModel } from '@modules/cloud/cloud.model';
import { ApiAuthGuard } from '../guards/api-auth.guard';
import { ApiScopeGuard } from '../guards/api-scope.guard';
import { ApiQuotaGuard } from '../guards/api-quota.guard';
import { ApiRateLimitGuard } from '../guards/api-rate-limit.guard';
import { ApiGeolocationInterceptor } from '../interceptors/api-geolocation.interceptor';
import { ApiIdempotencyInterceptor } from '../interceptors/api-idempotency.interceptor';
import { ApiUsageTrackingInterceptor } from '../interceptors/api-usage-tracking.interceptor';
import { ApiScopes } from '../decorators/api-scopes.decorator';
import { pipeline } from 'stream';
import { promisify } from 'util';
import type { Response } from 'express';

@Controller({ path: 'Download', version: '1' })
@ApiTags('API / Download')
@Public()
@UseGuards(ApiAuthGuard, ApiScopeGuard, ApiQuotaGuard, ApiRateLimitGuard)
@UseInterceptors(
  ApiGeolocationInterceptor,
  ApiIdempotencyInterceptor,
  ApiUsageTrackingInterceptor,
)
@ApiHeader({ name: 'x-api-key', required: true })
@ApiHeader({ name: 'x-api-secret', required: true })
export class ApiDownloadController {
  constructor(private readonly CloudService: CloudService) {}

  @Get()
  @ApiScopes(ApiKeyScope.READ)
  async Download(
    @Query() model: CloudKeyRequestModel,
    @User() user: UserContext,
    @Res() res: Response,
  ) {
    const obj = await this.CloudService.Find(model, user);

    res.setHeader('Content-Type', obj.MimeType || 'application/octet-stream');
    if (obj.Size) res.setHeader('Content-Length', String(obj.Size));

    const rawFilename =
      obj.Name || (model.Key ? model.Key.split('/').pop() : 'file');
    const sanitizedFilename = rawFilename
      .replace(/["\\\r\n]/g, '_')
      .replace(/[^\x20-\x7E]/g, '_');
    const encodedFilename = encodeURIComponent(rawFilename);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodedFilename}`,
    );

    const rawStream = await this.CloudService.GetObjectReadable(model, user);
    const bytesPerSec =
      await this.CloudService.GetDownloadSpeedBytesPerSec(user);

    const throttle = new ThrottleTransform(bytesPerSec);

    const pipe = promisify(pipeline);
    try {
      await pipe(rawStream, throttle, res);
    } catch (err) {
      try {
        rawStream.destroy(err as Error);
      } catch (er) {
        new HttpException(er, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }
}
