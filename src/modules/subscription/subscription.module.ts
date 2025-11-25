import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionUserController } from './subscription.user.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionEntity } from '@entities/subscription.entity';
import { UserSubscriptionEntity } from '@entities/user-subscription.entity';
import { UserEntity } from '@entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubscriptionEntity,
      UserSubscriptionEntity,
      UserEntity,
    ]),
  ],
  controllers: [SubscriptionController, SubscriptionUserController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
