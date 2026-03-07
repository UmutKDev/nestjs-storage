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
import { CloudUsageService } from '@modules/cloud/cloud.usage.service';
import {
  CloudListRequestModel,
  CloudListResponseModel,
  CloudListBreadcrumbRequestModel,
  CloudListDirectoriesRequestModel,
  CloudListObjectsRequestModel,
  CloudBreadCrumbModel,
  CloudDirectoryModel,
  CloudObjectModel,
  CloudKeyRequestModel,
  CloudPreSignedUrlRequestModel,
  CloudSearchRequestModel,
  CloudSearchResponseModel,
  CloudMoveRequestModel,
  CloudUpdateRequestModel,
  CloudDeleteRequestModel,
  CloudUserStorageUsageResponseModel,
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
  constructor(
    private readonly CloudService: CloudService,
    private readonly CloudUsageService: CloudUsageService,
  ) {}

  @Get('List')
  @ApiScopes(ApiKeyScope.READ)
  async List(
    @Query() model: CloudListRequestModel,
    @User() user: UserContext,
  ): Promise<CloudListResponseModel> {
    return this.CloudService.List(model, user);
  }

  @Get('List/Directories')
  @ApiScopes(ApiKeyScope.READ)
  async ListDirectories(
    @Query() model: CloudListDirectoriesRequestModel,
    @User() user: UserContext,
  ): Promise<CloudDirectoryModel[]> {
    return this.CloudService.ListDirectories(model, user);
  }

  @Get('List/Objects')
  @ApiScopes(ApiKeyScope.READ)
  async ListObjects(
    @Query() model: CloudListObjectsRequestModel,
    @User() user: UserContext,
  ): Promise<CloudObjectModel[]> {
    return this.CloudService.ListObjects(model, user);
  }

  @Get('List/Breadcrumb')
  @ApiScopes(ApiKeyScope.READ)
  async ListBreadcrumb(
    @Query() model: CloudListBreadcrumbRequestModel,
  ): Promise<CloudBreadCrumbModel[]> {
    return this.CloudService.ListBreadcrumb(model);
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

  @Get('PresignedUrl')
  @ApiScopes(ApiKeyScope.READ)
  async GetPresignedUrl(
    @Query() model: CloudPreSignedUrlRequestModel,
    @User() user: UserContext,
  ): Promise<string> {
    return this.CloudService.GetPresignedUrl(model, user);
  }

  @Get('Usage')
  @ApiScopes(ApiKeyScope.READ)
  async Usage(
    @User() user: UserContext,
  ): Promise<CloudUserStorageUsageResponseModel> {
    return this.CloudUsageService.UserStorageUsage(user);
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

  @Put('Update')
  @ApiScopes(ApiKeyScope.WRITE)
  @Idempotent()
  async Update(
    @Body() model: CloudUpdateRequestModel,
    @User() user: UserContext,
  ): Promise<CloudObjectModel> {
    return this.CloudService.Update(model, user);
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
