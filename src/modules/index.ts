import { DatabaseModule } from './database/database.module';
import { MongoModule } from './mongo/mongo.module';
import { CloudModule } from './cloud/cloud.module';
import { AccountModule } from './account/account.module';
import { AuthenticationModule } from './authentication/authentication.module';
import { UserModule } from './user/user.module';
import { HealthModule } from './health/health.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { RedisModule } from './redis/redis.module';
import { TeamModule } from './team/team.module';
import { NotificationModule } from './notification/notification.module';
import { DefinitionModule } from './definition/definition.module';
import { ApiModule } from './api/api.module';

export default [
  DatabaseModule,
  MongoModule,
  RedisModule,
  NotificationModule,
  CloudModule,
  AccountModule,
  AuthenticationModule,
  UserModule,
  TeamModule,
  SubscriptionModule,
  HealthModule,
  DefinitionModule,
  ApiModule,
];
