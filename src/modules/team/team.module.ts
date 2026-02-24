import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamEntity } from '@entities/team.entity';
import { TeamMemberEntity } from '@entities/team-member.entity';
import { TeamInvitationEntity } from '@entities/team-invitation.entity';
import { UserEntity } from '@entities/user.entity';
import { TeamController } from './team.controller';
import { TeamMemberController } from './team-member.controller';
import { TeamInvitationController } from './team-invitation.controller';
import { TeamService } from './team.service';
import { TeamMemberService } from './team-member.service';
import { TeamInvitationService } from './team-invitation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TeamEntity,
      TeamMemberEntity,
      TeamInvitationEntity,
      UserEntity,
    ]),
  ],
  controllers: [
    TeamMemberController,
    TeamInvitationController,
    TeamController,
  ],
  providers: [TeamService, TeamMemberService, TeamInvitationService],
  exports: [TeamService, TeamMemberService, TeamInvitationService],
})
export class TeamModule {}
