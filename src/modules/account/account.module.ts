import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { CloudModule } from '../cloud/cloud.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '@entities//user.entity';
import { UserSubscriber } from 'src/subscribers/user.subscriber';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    UserSubscriber,
    CloudModule,
  ],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
