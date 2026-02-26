import { Global, Module } from '@nestjs/common';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { AuthenticationModule } from '@modules/authentication/authentication.module';

@Global()
@Module({
  imports: [AuthenticationModule],
  providers: [NotificationGateway, NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
