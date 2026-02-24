import { Injectable } from '@nestjs/common';
import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
} from '@casl/ability';
import { Role, CaslAction, CaslSubject } from '@common/enums';
import { AppAbility } from './casl.types';

@Injectable()
export class CaslAbilityFactory {
  CreateForUser(User: UserContext): AppAbility {
    const { can, build } = new AbilityBuilder<
      MongoAbility<[CaslAction, CaslSubject]>
    >(createMongoAbility);

    if (User.Role === Role.ADMIN) {
      can(CaslAction.Manage, CaslSubject.All);
    } else {
      // Cloud files
      can(CaslAction.Read, CaslSubject.Cloud);
      can(CaslAction.Update, CaslSubject.Cloud);
      can(CaslAction.Delete, CaslSubject.Cloud);
      can(CaslAction.Download, CaslSubject.Cloud);

      // Cloud directories
      can(CaslAction.Create, CaslSubject.CloudDirectory);
      can(CaslAction.Update, CaslSubject.CloudDirectory);
      can(CaslAction.Delete, CaslSubject.CloudDirectory);
      can(CaslAction.Execute, CaslSubject.CloudDirectory);

      // Cloud uploads
      can(CaslAction.Upload, CaslSubject.CloudUpload);

      // Cloud archives
      can(CaslAction.Read, CaslSubject.CloudArchive);
      can(CaslAction.Extract, CaslSubject.CloudArchive);
      can(CaslAction.Archive, CaslSubject.CloudArchive);

      // Account
      can(CaslAction.Read, CaslSubject.Account);
      can(CaslAction.Update, CaslSubject.Account);

      // Security: sessions, passkeys, 2FA, API keys
      can(CaslAction.Manage, CaslSubject.Session);
      can(CaslAction.Manage, CaslSubject.Passkey);
      can(CaslAction.Manage, CaslSubject.TwoFactor);
      can(CaslAction.Manage, CaslSubject.ApiKey);

      // Definitions: read-only
      can(CaslAction.Read, CaslSubject.Definition);

      // Own subscription
      can(CaslAction.Read, CaslSubject.MySubscription);
      can(CaslAction.Create, CaslSubject.MySubscription);
      can(CaslAction.Delete, CaslSubject.MySubscription);
    }

    return build() as AppAbility;
  }
}
