import { DatabaseModule } from './database/database.module';
import { CloudModule } from './cloud/cloud.module';
import { AccountModule } from './account/account.module';
import { AuthenticationModule } from './authentication/authentication.module';
import { UserModule } from './user/user.module';
import { HealthModule } from './health/health.module';

import { DefinitionModule } from './definition/definition.module';

export default [
  DatabaseModule,
  CloudModule,
  AccountModule,
  AuthenticationModule,
  UserModule,
  HealthModule,
  DefinitionModule,
];
