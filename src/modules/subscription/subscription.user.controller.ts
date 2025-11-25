import { Body, Controller, Get, Post, Delete, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import {
  SubscribeRequestModel,
  UserSubscriptionResponseModel,
  UnsubscribeRequestModel,
} from './subscription.model';
import { User } from '@common/decorators/user.decorator';

@Controller('Subscription')
@ApiTags('Subscription')
@ApiBearerAuth()
export class SubscriptionUserController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('My')
  async My(
    @User() user: UserContext,
  ): Promise<UserSubscriptionResponseModel | null> {
    return await this.subscriptionService.GetCurrentForUser({
      userId: user.id,
    });
  }

  @Get('My/List')
  async ListMy(
    @User() user: UserContext,
  ): Promise<UserSubscriptionResponseModel[]> {
    return await this.subscriptionService.ListForUser({ userId: user.id });
  }

  @Post('My/Subscribe')
  async Subscribe(
    @User() user: UserContext,
    @Body() model: SubscribeRequestModel,
  ): Promise<boolean> {
    return await this.subscriptionService.SubscribeSelf({
      userId: user.id,
      subscriptionId: model.subscriptionId,
      isTrial: model.isTrial,
    });
  }

  @Delete('My/Unsubscribe/:id')
  async Unsubscribe(
    @User() user: UserContext,
    @Param() model: UnsubscribeRequestModel,
  ): Promise<boolean> {
    return await this.subscriptionService.UnsubscribeByUser({
      id: model.id,
      userId: user.id,
    });
  }
}
