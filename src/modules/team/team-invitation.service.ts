import { Injectable, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { TeamInvitationEntity } from '@entities/team-invitation.entity';
import { TeamMemberEntity } from '@entities/team-member.entity';
import { TeamEntity } from '@entities/team.entity';
import { UserEntity } from '@entities/user.entity';
import { TeamRole, TeamInvitationStatus } from '@common/enums';
import { RedisService } from '@modules/redis/redis.service';
import { TeamKeys } from '@modules/redis/redis.keys';
import {
  TEAM_INVITATION_EXPIRY,
  TEAM_MEMBERSHIP_CACHE_TTL,
} from '@modules/redis/redis.ttl';
import { uuidGenerator } from '@common/helpers/cast.helper';
import {
  TeamInvitationCreateRequestModel,
  TeamInvitationResponseModel,
  TeamMemberResponseModel,
} from './team.model';

@Injectable()
export class TeamInvitationService {
  constructor(
    @InjectRepository(TeamInvitationEntity)
    private readonly invitationRepository: Repository<TeamInvitationEntity>,
    @InjectRepository(TeamMemberEntity)
    private readonly teamMemberRepository: Repository<TeamMemberEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
    private readonly RedisService: RedisService,
  ) {}

  async Create(
    TeamId: string,
    Model: TeamInvitationCreateRequestModel,
    User: UserContext,
  ): Promise<TeamInvitationResponseModel> {
    // Check if already a member
    const existingMember = await this.teamMemberRepository
      .createQueryBuilder('tm')
      .innerJoin('tm.User', 'u')
      .where('tm.TeamId = :teamId', { teamId: TeamId })
      .andWhere('u.Email = :email', { email: Model.Email })
      .getOne();

    if (existingMember) {
      throw new HttpException('User is already a member of this team', 409);
    }

    if (Model.Role === TeamRole.OWNER) {
      throw new HttpException(
        'Cannot invite as owner. Use transfer ownership instead.',
        400,
      );
    }

    const team = await this.teamRepository.findOne({ where: { Id: TeamId } });
    if (!team) {
      throw new HttpException('Team not found', 404);
    }

    const token = uuidGenerator();
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + TEAM_INVITATION_EXPIRY);

    const invitation = await this.invitationRepository.save(
      new TeamInvitationEntity({
        Email: Model.Email,
        Role: Model.Role || TeamRole.MEMBER,
        Token: token,
        ExpiresAt: expiresAt,
        Team: team,
        InvitedBy: { Id: User.Id } as UserEntity,
      }),
    );

    await this.RedisService.Delete(TeamKeys.Invitations(TeamId));
    await this.RedisService.Delete(TeamKeys.UserInvitations(Model.Email));

    return plainToInstance(TeamInvitationResponseModel, {
      Id: invitation.Id,
      Email: invitation.Email,
      Role: invitation.Role,
      Status: invitation.Status,
      InvitedByName: User.FullName,
      TeamName: team.Name,
      ExpiresAt: invitation.ExpiresAt,
      CreatedAt: invitation.CreatedAt,
    });
  }

  async ListForTeam(TeamId: string): Promise<TeamInvitationResponseModel[]> {
    const invitations = await this.invitationRepository.find({
      where: { Team: { Id: TeamId }, Status: TeamInvitationStatus.PENDING },
      relations: ['InvitedBy', 'Team'],
      order: { CreatedAt: 'DESC' },
    });

    return invitations.map((inv) =>
      plainToInstance(TeamInvitationResponseModel, {
        Id: inv.Id,
        Email: inv.Email,
        Role: inv.Role,
        Status: inv.Status,
        InvitedByName: inv.InvitedBy?.FullName,
        TeamName: inv.Team?.Name,
        ExpiresAt: inv.ExpiresAt,
        CreatedAt: inv.CreatedAt,
      }),
    );
  }

  async Cancel(TeamId: string, InvitationId: string): Promise<boolean> {
    const invitation = await this.invitationRepository.findOne({
      where: {
        Id: InvitationId,
        Team: { Id: TeamId },
        Status: TeamInvitationStatus.PENDING,
      },
    });
    if (!invitation) {
      throw new HttpException('Invitation not found', 404);
    }

    invitation.Status = TeamInvitationStatus.CANCELLED;
    await this.invitationRepository.save(invitation);

    await this.RedisService.Delete(TeamKeys.Invitations(TeamId));
    await this.RedisService.Delete(TeamKeys.UserInvitations(invitation.Email));

    return true;
  }

  async Accept(
    Token: string,
    User: UserContext,
  ): Promise<TeamMemberResponseModel> {
    const invitation = await this.invitationRepository.findOne({
      where: { Token, Status: TeamInvitationStatus.PENDING },
      relations: ['Team'],
    });

    if (!invitation) {
      throw new HttpException('Invitation not found or already used', 404);
    }

    if (invitation.ExpiresAt < new Date()) {
      invitation.Status = TeamInvitationStatus.EXPIRED;
      await this.invitationRepository.save(invitation);
      throw new HttpException('Invitation has expired', 410);
    }

    if (invitation.Email !== User.Email) {
      throw new HttpException(
        'This invitation was sent to a different email address',
        403,
      );
    }

    // Check if already a member
    const existingMember = await this.teamMemberRepository.findOne({
      where: { Team: { Id: invitation.Team.Id }, User: { Id: User.Id } },
    });
    if (existingMember) {
      invitation.Status = TeamInvitationStatus.ACCEPTED;
      await this.invitationRepository.save(invitation);
      throw new HttpException('You are already a member of this team', 409);
    }

    // Create membership
    const member = await this.teamMemberRepository.save(
      new TeamMemberEntity({
        Team: invitation.Team,
        User: { Id: User.Id } as UserEntity,
        Role: invitation.Role,
        JoinedAt: new Date(),
      }),
    );

    invitation.Status = TeamInvitationStatus.ACCEPTED;
    await this.invitationRepository.save(invitation);

    // Invalidate caches
    await this.RedisService.Delete(TeamKeys.Invitations(invitation.Team.Id));
    await this.RedisService.Delete(TeamKeys.UserInvitations(User.Email));
    await this.RedisService.Delete(TeamKeys.UserTeams(User.Id));
    await this.RedisService.Delete(TeamKeys.Detail(invitation.Team.Id));

    // Warm membership cache so the guard finds it immediately
    await this.RedisService.Set(
      TeamKeys.Membership(invitation.Team.Id, User.Id),
      {
        Role: invitation.Role,
        TeamStatus: invitation.Team.Status,
        TeamSlug: invitation.Team.Slug,
        TeamName: invitation.Team.Name,
      },
      TEAM_MEMBERSHIP_CACHE_TTL,
    );

    return plainToInstance(TeamMemberResponseModel, {
      Id: member.Id,
      UserId: User.Id,
      FullName: User.FullName,
      Email: User.Email,
      Image: User.Image,
      Role: member.Role,
      JoinedAt: member.JoinedAt,
    });
  }

  async Decline(Token: string, User: UserContext): Promise<boolean> {
    const invitation = await this.invitationRepository.findOne({
      where: { Token, Status: TeamInvitationStatus.PENDING },
      relations: ['Team'],
    });

    if (!invitation) {
      throw new HttpException('Invitation not found or already used', 404);
    }

    if (invitation.Email !== User.Email) {
      throw new HttpException(
        'This invitation was sent to a different email address',
        403,
      );
    }

    invitation.Status = TeamInvitationStatus.DECLINED;
    await this.invitationRepository.save(invitation);

    await this.RedisService.Delete(TeamKeys.Invitations(invitation.Team.Id));
    await this.RedisService.Delete(TeamKeys.UserInvitations(User.Email));

    return true;
  }

  async ListPendingForUser(
    User: UserContext,
  ): Promise<TeamInvitationResponseModel[]> {
    const invitations = await this.invitationRepository.find({
      where: { Email: User.Email, Status: TeamInvitationStatus.PENDING },
      relations: ['Team', 'InvitedBy'],
      order: { CreatedAt: 'DESC' },
    });

    return invitations
      .filter((inv) => inv.ExpiresAt > new Date())
      .map((inv) =>
        plainToInstance(TeamInvitationResponseModel, {
          Id: inv.Id,
          Token: inv.Token,
          Email: inv.Email,
          Role: inv.Role,
          Status: inv.Status,
          InvitedByName: inv.InvitedBy?.FullName,
          TeamName: inv.Team?.Name,
          ExpiresAt: inv.ExpiresAt,
          CreatedAt: inv.CreatedAt,
        }),
      );
  }
}
