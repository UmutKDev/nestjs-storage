import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { MailService } from '../mail/mail.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSubscriber } from 'src/subscribers/user.subscriber';
import { UserEntity } from '@entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity]), UserSubscriber],
  controllers: [UserController],
  providers: [UserService, MailService],
})
export class UserModule {}
