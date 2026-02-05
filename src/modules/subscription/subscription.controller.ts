import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Delete,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import {
  SubscriptionFindResponseModel,
  SubscriptionListResponseModel,
  SubscriptionPostBodyRequestModel,
  SubscriptionPutBodyRequestModel,
  SubscribeAsAdminRequestModel,
} from './subscription.model';
import {
  ApiSuccessArrayResponse,
  ApiSuccessResponse,
} from '@common/decorators/response.decorator';
import { BaseIdRequestModel } from '@common/models/base.model';
import { Roles } from '@common/decorators/roles.decorator';
import { Role } from '@common/enums';

@Controller('Subscription')
@ApiTags('Subscription')
@ApiCookieAuth()
@Roles(Role.ADMIN)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('List')
  @ApiSuccessArrayResponse(SubscriptionListResponseModel)
  async List(): Promise<SubscriptionListResponseModel[]> {
    return await this.subscriptionService.List();
  }

  @Get('Find/:id')
  @ApiSuccessResponse(SubscriptionFindResponseModel)
  async Find(
    @Param() model: BaseIdRequestModel,
  ): Promise<SubscriptionFindResponseModel> {
    return await this.subscriptionService.Find({ id: model.Id });
  }

  @Post('Create')
  @ApiSuccessResponse('boolean')
  async Create(
    @Body() model: SubscriptionPostBodyRequestModel,
  ): Promise<boolean> {
    return await this.subscriptionService.Create({ model });
  }

  @Put('Edit/:id')
  @ApiSuccessResponse('boolean')
  async Edit(
    @Param() { Id }: BaseIdRequestModel,
    @Body() model: SubscriptionPutBodyRequestModel,
  ): Promise<boolean> {
    return await this.subscriptionService.Edit({ id: Id, model });
  }

  @Delete('Delete/:id')
  @ApiSuccessResponse('boolean')
  async Delete(@Param() model: BaseIdRequestModel): Promise<boolean> {
    return await this.subscriptionService.Delete({ id: model.Id });
  }

  @Post('Assign')
  @ApiSuccessResponse('boolean')
  async Assign(@Body() model: SubscribeAsAdminRequestModel): Promise<boolean> {
    return await this.subscriptionService.SubscribeAsAdmin({
      userId: model.UserId,
      subscriptionId: model.SubscriptionId,
      isTrial: model.IsTrial,
    });
  }

  @Delete('Unsubscribe/:id')
  @ApiSuccessResponse('boolean')
  async Unsubscribe(@Param() model: BaseIdRequestModel): Promise<boolean> {
    return await this.subscriptionService.Unsubscribe({ id: model.Id });
  }
}
