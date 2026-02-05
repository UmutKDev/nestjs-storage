import { Module } from '@nestjs/common';
import { SecurityController } from './security.controller';
import { AuthenticationModule } from '../../authentication/authentication.module';

@Module({
  imports: [AuthenticationModule],
  controllers: [SecurityController],
})
export class SecurityModule {}
