import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { User } from '@common/decorators/user.decorator';
import { PaginationRequestModel } from '@common/models/pagination.model';
import { NotificationService } from './notification.service';

@Controller({ path: 'Notification', version: '1' })
@ApiTags('Notification')
export class NotificationController {
  constructor(private readonly NotificationService: NotificationService) {}

  @Get('History')
  async History(
    @Query() query: PaginationRequestModel,
    @User() user: UserContext,
  ) {
    return this.NotificationService.GetNotificationHistory(
      user.Id,
      query.Skip,
      query.Take,
    );
  }

  @Get('UnreadCount')
  async UnreadCount(@User() user: UserContext) {
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
