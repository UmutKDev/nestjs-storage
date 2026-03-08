import {
  Body,
  Controller,
  Delete,
  Headers,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { User } from '@common/decorators/user.decorator';
import { ApiKeyScope } from '@common/enums/authentication.enum';
import { CloudService } from '@modules/cloud/cloud.service';
import {
  CloudCreateMultipartUploadRequestModel,
  CloudCreateMultipartUploadResponseModel,
  CloudGetMultipartPartUrlRequestModel,
  CloudGetMultipartPartUrlResponseModel,
  CloudGetMultipartPartUrlsBatchRequestModel,
  CloudGetMultipartPartUrlsBatchResponseModel,
  CloudCompleteMultipartUploadRequestModel,
  CloudCompleteMultipartUploadResponseModel,
  CloudAbortMultipartUploadRequestModel,
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
import { IDEMPOTENCY_KEY_HEADER } from '../api.constants';

@Controller({ path: 'Upload', version: '1' })
@ApiTags('API / Upload')
@Public()
@UseGuards(ApiAuthGuard, ApiScopeGuard, ApiQuotaGuard, ApiRateLimitGuard)
@UseInterceptors(
  ApiGeolocationInterceptor,
  ApiIdempotencyInterceptor,
  ApiUsageTrackingInterceptor,
)
@ApiHeader({ name: 'x-api-key', required: true })
@ApiHeader({ name: 'x-api-secret', required: true })
export class ApiUploadController {
  constructor(private readonly CloudService: CloudService) {}

  @Post('CreateMultipartUpload')
  @ApiScopes(ApiKeyScope.WRITE)
  @Idempotent()
  async CreateMultipartUpload(
    @Body() model: CloudCreateMultipartUploadRequestModel,
    @User() user: UserContext,
  ): Promise<CloudCreateMultipartUploadResponseModel> {
    return this.CloudService.UploadCreateMultipartUpload(model, user);
  }

  @Post('GetMultipartPartUrl')
  @ApiScopes(ApiKeyScope.WRITE)
  async GetMultipartPartUrl(
    @Body() model: CloudGetMultipartPartUrlRequestModel,
    @User() user: UserContext,
  ): Promise<CloudGetMultipartPartUrlResponseModel> {
    return this.CloudService.UploadGetMultipartPartUrl(model, user);
  }

  @Post('GetMultipartPartUrls')
  @ApiScopes(ApiKeyScope.WRITE)
  async GetMultipartPartUrls(
    @Body() model: CloudGetMultipartPartUrlsBatchRequestModel,
    @User() user: UserContext,
  ): Promise<CloudGetMultipartPartUrlsBatchResponseModel> {
    return this.CloudService.UploadGetMultipartPartUrlsBatch(model, user);
  }

  @Post('CompleteMultipartUpload')
  @ApiScopes(ApiKeyScope.WRITE)
  @Idempotent()
  async CompleteMultipartUpload(
    @Body() model: CloudCompleteMultipartUploadRequestModel,
    @User() user: UserContext,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey?: string,
  ): Promise<CloudCompleteMultipartUploadResponseModel> {
    return this.CloudService.UploadCompleteMultipartUpload(
      model,
      user,
      undefined,
      idempotencyKey,
    );
  }

  @Delete('AbortMultipartUpload')
  @ApiScopes(ApiKeyScope.WRITE)
  async AbortMultipartUpload(
    @Body() model: CloudAbortMultipartUploadRequestModel,
    @User() user: UserContext,
  ): Promise<void> {
    return this.CloudService.UploadAbortMultipartUpload(model, user);
  }
}
