import { Injectable } from '@nestjs/common';
import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
} from '@casl/ability';
import { Role, CaslAction, CaslSubject, TeamRole } from '@common/enums';
import { AppAbility } from './casl.types';

type CanFn = AbilityBuilder<MongoAbility<[CaslAction, CaslSubject]>>['can'];

@Injectable()
export class CaslAbilityFactory {
  CreateForUser(User: UserContext): AppAbility {
    const { can, build } = new AbilityBuilder<
      MongoAbility<[CaslAction, CaslSubject]>
    >(createMongoAbility);

    // Platform ADMIN always has full access
    if (User.Role === Role.ADMIN) {
      can(CaslAction.Manage, CaslSubject.All);
      return build() as AppAbility;
    }

    // Personal context abilities (always granted)
    this.BuildPersonalAbilities(can);

    // Team context abilities (only when TeamRole is present)
    if (User.TeamId && User.TeamRole) {
      this.BuildTeamAbilities(can, User.TeamRole);
    }

    return build() as AppAbility;
  }

  private BuildPersonalAbilities(can: CanFn): void {
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

    // Team management (personal context: create teams, read own teams)
    can(CaslAction.Create, CaslSubject.Team);
    can(CaslAction.Read, CaslSubject.Team);
  }

  private BuildTeamAbilities(can: CanFn, teamRole: TeamRole): void {
    switch (teamRole) {
      case TeamRole.OWNER:
        can(CaslAction.Manage, CaslSubject.Team);
        can(CaslAction.Manage, CaslSubject.TeamMember);
        can(CaslAction.Manage, CaslSubject.TeamInvitation);
        can(CaslAction.Manage, CaslSubject.TeamCloud);
        can(CaslAction.Manage, CaslSubject.TeamCloudDirectory);
        can(CaslAction.Manage, CaslSubject.TeamCloudUpload);
        can(CaslAction.Manage, CaslSubject.TeamCloudArchive);
        break;

      case TeamRole.ADMIN:
        can(CaslAction.Read, CaslSubject.Team);
        can(CaslAction.Update, CaslSubject.Team);
        can(CaslAction.Manage, CaslSubject.TeamMember);
        can(CaslAction.Manage, CaslSubject.TeamInvitation);
        can(CaslAction.Manage, CaslSubject.TeamCloud);
        can(CaslAction.Manage, CaslSubject.TeamCloudDirectory);
        can(CaslAction.Manage, CaslSubject.TeamCloudUpload);
        can(CaslAction.Manage, CaslSubject.TeamCloudArchive);
        break;

      case TeamRole.MEMBER:
        can(CaslAction.Read, CaslSubject.Team);
        can(CaslAction.Read, CaslSubject.TeamMember);
        can(CaslAction.Read, CaslSubject.TeamCloud);
        can(CaslAction.Update, CaslSubject.TeamCloud);
        can(CaslAction.Delete, CaslSubject.TeamCloud);
        can(CaslAction.Download, CaslSubject.TeamCloud);
        can(CaslAction.Create, CaslSubject.TeamCloudDirectory);
        can(CaslAction.Update, CaslSubject.TeamCloudDirectory);
        can(CaslAction.Delete, CaslSubject.TeamCloudDirectory);
        can(CaslAction.Execute, CaslSubject.TeamCloudDirectory);
        can(CaslAction.Upload, CaslSubject.TeamCloudUpload);
        can(CaslAction.Read, CaslSubject.TeamCloudArchive);
        can(CaslAction.Extract, CaslSubject.TeamCloudArchive);
        can(CaslAction.Archive, CaslSubject.TeamCloudArchive);
        break;

      case TeamRole.VIEWER:
        can(CaslAction.Read, CaslSubject.Team);
        can(CaslAction.Read, CaslSubject.TeamMember);
        can(CaslAction.Read, CaslSubject.TeamCloud);
        can(CaslAction.Download, CaslSubject.TeamCloud);
        can(CaslAction.Read, CaslSubject.TeamCloudArchive);
        break;
    }
  }
}
