import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { User } from '@common/decorators/user.decorator';
import { ApiKeyScope } from '@common/enums/authentication.enum';
import { CloudService } from '@modules/cloud/cloud.service';
import {
  CloudArchiveExtractStartRequestModel,
  CloudArchiveExtractStartResponseModel,
  CloudArchiveExtractCancelRequestModel,
  CloudArchiveExtractCancelResponseModel,
  CloudArchivePreviewRequestModel,
  CloudArchivePreviewResponseModel,
  CloudArchiveCreateStartRequestModel,
  CloudArchiveCreateStartResponseModel,
  CloudArchiveCreateCancelRequestModel,
  CloudArchiveCreateCancelResponseModel,
} from '@modules/cloud/cloud.model';
import { ApiAuthGuard } from '../guards/api-auth.guard';
import { ApiScopeGuard } from '../guards/api-scope.guard';
import { ApiQuotaGuard } from '../guards/api-quota.guard';
import { ApiRateLimitGuard } from '../guards/api-rate-limit.guard';
import { ApiGeolocationInterceptor } from '../interceptors/api-geolocation.interceptor';
import { ApiIdempotencyInterceptor } from '../interceptors/api-idempotency.interceptor';
import { ApiUsageTrackingInterceptor } from '../interceptors/api-usage-tracking.interceptor';
import { ApiScopes } from '../decorators/api-scopes.decorator';
import { Idempotent } from '../decorators/api-idempotent.decorator';

@Controller({ path: 'Archive', version: '1' })
@ApiTags('API / Archive')
@Public()
@UseGuards(ApiAuthGuard, ApiScopeGuard, ApiQuotaGuard, ApiRateLimitGuard)
@UseInterceptors(
  ApiGeolocationInterceptor,
  ApiIdempotencyInterceptor,
  ApiUsageTrackingInterceptor,
)
@ApiHeader({ name: 'x-api-key', required: true })
@ApiHeader({ name: 'x-api-secret', required: true })
export class ApiArchiveController {
  constructor(private readonly CloudService: CloudService) {}

  @Post('Extract/Start')
  @ApiScopes(ApiKeyScope.WRITE)
  @Idempotent()
  async ExtractStart(
    @Body() model: CloudArchiveExtractStartRequestModel,
    @User() user: UserContext,
  ): Promise<CloudArchiveExtractStartResponseModel> {
    return this.CloudService.ArchiveExtractStart(model, user);
  }

  @Post('Extract/Cancel')
  @ApiScopes(ApiKeyScope.WRITE)
  async ExtractCancel(
    @Body() model: CloudArchiveExtractCancelRequestModel,
    @User() user: UserContext,
  ): Promise<CloudArchiveExtractCancelResponseModel> {
    return this.CloudService.ArchiveExtractCancel(model, user);
  }

  @Get('Preview')
  @ApiScopes(ApiKeyScope.READ)
  async Preview(
    @Query() model: CloudArchivePreviewRequestModel,
    @User() user: UserContext,
  ): Promise<CloudArchivePreviewResponseModel> {
    return this.CloudService.ArchivePreview(model, user);
  }

  @Post('Create/Start')
  @ApiScopes(ApiKeyScope.WRITE)
  @Idempotent()
  async CreateStart(
    @Body() model: CloudArchiveCreateStartRequestModel,
    @User() user: UserContext,
  ): Promise<CloudArchiveCreateStartResponseModel> {
    return this.CloudService.ArchiveCreateStart(model, user);
  }

  @Post('Create/Cancel')
  @ApiScopes(ApiKeyScope.WRITE)
  async CreateCancel(
    @Body() model: CloudArchiveCreateCancelRequestModel,
    @User() user: UserContext,
  ): Promise<CloudArchiveCreateCancelResponseModel> {
    return this.CloudService.ArchiveCreateCancel(model, user);
  }
}
