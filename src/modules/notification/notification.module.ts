import { Global, Module } from '@nestjs/common';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { NotificationCleanupService } from './notification.cleanup.service';
import { NotificationController } from './notification.controller';
import { AuthenticationModule } from '@modules/authentication/authentication.module';

@Global()
@Module({
  imports: [AuthenticationModule],
  controllers: [NotificationController],
  providers: [
    NotificationGateway,
    NotificationService,
    NotificationCleanupService,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
