import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Put,
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
  CloudListRequestModel,
  CloudListResponseModel,
  CloudObjectModel,
  CloudKeyRequestModel,
  CloudSearchRequestModel,
  CloudSearchResponseModel,
  CloudMoveRequestModel,
  CloudDeleteRequestModel,
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

@Controller({ path: 'Storage', version: '1' })
@ApiTags('API / Storage')
@Public()
@UseGuards(ApiAuthGuard, ApiScopeGuard, ApiQuotaGuard, ApiRateLimitGuard)
@UseInterceptors(
  ApiGeolocationInterceptor,
  ApiIdempotencyInterceptor,
  ApiUsageTrackingInterceptor,
)
@ApiHeader({ name: 'x-api-key', required: true })
@ApiHeader({ name: 'x-api-secret', required: true })
export class ApiStorageController {
  constructor(private readonly CloudService: CloudService) {}

  @Get('List')
  @ApiScopes(ApiKeyScope.READ)
  async List(
    @Query() model: CloudListRequestModel,
    @User() user: UserContext,
  ): Promise<CloudListResponseModel> {
    return this.CloudService.List(model, user);
  }

  @Get('Find')
  @ApiScopes(ApiKeyScope.READ)
  async Find(
    @Query() model: CloudKeyRequestModel,
    @User() user: UserContext,
  ): Promise<CloudObjectModel> {
    return this.CloudService.Find(model, user);
  }

  @Get('Search')
  @ApiScopes(ApiKeyScope.READ)
  async Search(
    @Query() model: CloudSearchRequestModel,
    @User() user: UserContext,
  ): Promise<CloudSearchResponseModel> {
    return this.CloudService.Search(model, user);
  }

  @Put('Move')
  @ApiScopes(ApiKeyScope.WRITE)
  @Idempotent()
  async Move(
    @Body() model: CloudMoveRequestModel,
    @User() user: UserContext,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey?: string,
  ): Promise<boolean> {
    return this.CloudService.Move(model, user, idempotencyKey);
  }

  @Delete('Delete')
  @ApiScopes(ApiKeyScope.DELETE)
  @Idempotent()
  async Delete(
    @Body() model: CloudDeleteRequestModel,
    @User() user: UserContext,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey?: string,
  ): Promise<boolean> {
    return this.CloudService.Delete(model, user, undefined, idempotencyKey);
  }
}
