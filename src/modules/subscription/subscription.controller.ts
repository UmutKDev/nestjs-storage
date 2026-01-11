import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Delete,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import {
  SubscriptionFindResponseModel,
  SubscriptionListResponseModel,
  SubscriptionPostBodyRequestModel,
  SubscriptionPutBodyRequestModel,
  SubscribeAsAdminRequestModel,
  UserSubscriptionResponseModel,
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
@ApiBearerAuth()
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
    return await this.subscriptionService.Find({ id: model.id });
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
    @Param() { id }: BaseIdRequestModel,
    @Body() model: SubscriptionPutBodyRequestModel,
  ): Promise<boolean> {
    return await this.subscriptionService.Edit({ id, model });
  }

  @Delete('Delete/:id')
  @ApiSuccessResponse('boolean')
  async Delete(@Param() model: BaseIdRequestModel): Promise<boolean> {
    return await this.subscriptionService.Delete({ id: model.id });
  }

  @Post('Assign')
  @ApiSuccessResponse('boolean')
  async Assign(@Body() model: SubscribeAsAdminRequestModel): Promise<boolean> {
    return await this.subscriptionService.SubscribeAsAdmin({
      userId: model.userId,
      subscriptionId: model.subscriptionId,
      isTrial: model.isTrial,
    });
  }

  @Delete('Unsubscribe/:id')
  @ApiSuccessResponse('boolean')
  async Unsubscribe(@Param() model: BaseIdRequestModel): Promise<boolean> {
    return await this.subscriptionService.Unsubscribe({ id: model.id });
  }
}
