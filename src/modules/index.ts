import { DatabaseModule } from './database/database.module';
import { CloudModule } from './cloud/cloud.module';
import { AccountModule } from './account/account.module';
import { AuthenticationModule } from './authentication/authentication.module';
import { UserModule } from './user/user.module';
import { HealthModule } from './health/health.module';
import { SubscriptionModule } from './subscription/subscription.module';
// import { RedisModule } from './redis/redis.module';

import { DefinitionModule } from './definition/definition.module';

export default [
  DatabaseModule,
  // RedisModule,
  CloudModule,
  AccountModule,
  AuthenticationModule,
  UserModule,
  CloudModule,
  SubscriptionModule,
  HealthModule,
  DefinitionModule,
];
