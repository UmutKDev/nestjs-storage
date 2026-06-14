import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User } from '@common/decorators/user.decorator';
import {
  ApiSuccessArrayResponse,
  ApiSuccessResponse,
} from '@common/decorators/response.decorator';
import { PaginationRequestModel } from '@common/models/pagination.model';
import { NotificationService } from './notification.service';
import {
  NotificationHistoryItemModel,
  UnreadCountResponseModel,
} from './notification.model';

@Controller({ path: 'Notification', version: '1' })
@ApiTags('Notification')
export class NotificationController {
  constructor(private readonly NotificationService: NotificationService) {}

  @Get('History')
  @ApiSuccessArrayResponse(NotificationHistoryItemModel)
  async History(
    @Query() query: PaginationRequestModel,
    @User() user: UserContext,
  ): Promise<NotificationHistoryItemModel[]> {
    return this.NotificationService.GetNotificationHistory(
      user.Id,
      query.Skip,
      query.Take,
    );
  }

  @Get('UnreadCount')
  @ApiSuccessResponse(UnreadCountResponseModel)
  async UnreadCount(
    @User() user: UserContext,
  ): Promise<UnreadCountResponseModel> {
    const Count = await this.NotificationService.GetUnreadCount(user.Id);
    return { Count };
  }

  @Patch(':Id/Read')
  async MarkAsRead(@Param('Id') Id: string, @User() user: UserContext) {
    await this.NotificationService.MarkAsRead(user.Id, Id);
  }

  @Patch('ReadAll')
  async MarkAllAsRead(@User() user: UserContext) {
    await this.NotificationService.MarkAllAsRead(user.Id);
  }
}
