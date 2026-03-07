import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { User } from '@common/decorators/user.decorator';
import { ApiKeyScope } from '@common/enums/authentication.enum';
import { PaginationRequestModel } from '@common/models/pagination.model';
import { plainToInstance } from 'class-transformer';
import { ApiAuthGuard } from '../guards/api-auth.guard';
import { ApiScopeGuard } from '../guards/api-scope.guard';
import { ApiQuotaGuard } from '../guards/api-quota.guard';
import { ApiRateLimitGuard } from '../guards/api-rate-limit.guard';
import { ApiGeolocationInterceptor } from '../interceptors/api-geolocation.interceptor';
import { ApiIdempotencyInterceptor } from '../interceptors/api-idempotency.interceptor';
import { ApiUsageTrackingInterceptor } from '../interceptors/api-usage-tracking.interceptor';
import { ApiScopes } from '../decorators/api-scopes.decorator';
import { Idempotent } from '../decorators/api-idempotent.decorator';
import { ApiWebhookService } from '../services/api-webhook.service';
import {
  WebhookCreateRequestModel,
  WebhookUpdateRequestModel,
  WebhookResponseModel,
  WebhookCreatedResponseModel,
  WebhookDeliveryResponseModel,
} from '../api.model';

@Controller({ path: 'Webhooks', version: '1' })
@ApiTags('API / Webhooks')
@Public()
@UseGuards(ApiAuthGuard, ApiScopeGuard, ApiQuotaGuard, ApiRateLimitGuard)
@UseInterceptors(
  ApiGeolocationInterceptor,
  ApiIdempotencyInterceptor,
  ApiUsageTrackingInterceptor,
)
@ApiHeader({ name: 'x-api-key', required: true })
@ApiHeader({ name: 'x-api-secret', required: true })
export class ApiWebhookController {
  constructor(private readonly ApiWebhookService: ApiWebhookService) {}

  @Get()
  @ApiScopes(ApiKeyScope.READ)
  async List(@User() user: UserContext): Promise<WebhookResponseModel[]> {
    const webhooks = await this.ApiWebhookService.List(user.Id);
    return plainToInstance(WebhookResponseModel, webhooks, {
      excludeExtraneousValues: true,
    });
  }

  @Get(':Id')
  @ApiScopes(ApiKeyScope.READ)
  async FindById(
    @Param('Id') Id: string,
    @User() user: UserContext,
  ): Promise<WebhookResponseModel> {
    const webhook = await this.ApiWebhookService.GetById(user.Id, Id);
    return plainToInstance(WebhookResponseModel, webhook, {
      excludeExtraneousValues: true,
    });
  }

  @Post()
  @ApiScopes(ApiKeyScope.ADMIN)
  @Idempotent()
  async Create(
    @Body() model: WebhookCreateRequestModel,
    @User() user: UserContext,
  ): Promise<WebhookCreatedResponseModel> {
    const webhook = await this.ApiWebhookService.Create(user.Id, model);
    return plainToInstance(WebhookCreatedResponseModel, webhook, {
      excludeExtraneousValues: true,
    });
  }

  @Put(':Id')
  @ApiScopes(ApiKeyScope.ADMIN)
  async Update(
    @Param('Id') Id: string,
    @Body() model: WebhookUpdateRequestModel,
    @User() user: UserContext,
  ): Promise<WebhookResponseModel> {
    const webhook = await this.ApiWebhookService.Update(user.Id, Id, model);
    return plainToInstance(WebhookResponseModel, webhook, {
      excludeExtraneousValues: true,
    });
  }

  @Delete(':Id')
  @ApiScopes(ApiKeyScope.ADMIN)
  async Remove(
    @Param('Id') Id: string,
    @User() user: UserContext,
  ): Promise<boolean> {
    return this.ApiWebhookService.Delete(user.Id, Id);
  }

  @Post(':Id/Test')
  @ApiScopes(ApiKeyScope.ADMIN)
  async Test(
    @Param('Id') Id: string,
    @User() user: UserContext,
  ): Promise<WebhookDeliveryResponseModel> {
    const delivery = await this.ApiWebhookService.TestWebhook(user.Id, Id);
    return plainToInstance(WebhookDeliveryResponseModel, delivery, {
      excludeExtraneousValues: true,
    });
  }

  @Get(':Id/Deliveries')
  @ApiScopes(ApiKeyScope.READ)
  async Deliveries(
    @Param('Id') Id: string,
    @Query() query: PaginationRequestModel,
  ): Promise<WebhookDeliveryResponseModel[]> {
    const { Items } = await this.ApiWebhookService.GetDeliveries(
      Id,
      query.Skip,
      query.Take,
    );
    return plainToInstance(WebhookDeliveryResponseModel, Items, {
      excludeExtraneousValues: true,
    });
  }
}
