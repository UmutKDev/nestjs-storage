import { Injectable, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { TeamMemberEntity } from '@entities/team-member.entity';
import { TeamRole } from '@common/enums';
import { RedisService } from '@modules/redis/redis.service';
import { TeamKeys } from '@modules/redis/redis.keys';
import {
  TeamMemberResponseModel,
  TeamTransferOwnershipRequestModel,
} from './team.model';

@Injectable()
export class TeamMemberService {
  constructor(
    @InjectRepository(TeamMemberEntity)
    private readonly teamMemberRepository: Repository<TeamMemberEntity>,
    private readonly RedisService: RedisService,
  ) {}

  async List(TeamId: string): Promise<TeamMemberResponseModel[]> {
    const members = await this.teamMemberRepository.find({
      where: { Team: { Id: TeamId } },
      relations: ['User'],
      order: { CreatedAt: 'ASC' },
    });

    return members.map((m) =>
      plainToInstance(TeamMemberResponseModel, {
        Id: m.Id,
        UserId: m.User.Id,
        FullName: m.User.FullName,
        Email: m.User.Email,
        Image: m.User.Image,
        Role: m.Role,
        JoinedAt: m.JoinedAt,
      }),
    );
  }

  async UpdateRole(
    TeamId: string,
    MemberId: string,
    NewRole: TeamRole,
    User: UserContext,
  ): Promise<TeamMemberResponseModel> {
    const actorMembership = await this.teamMemberRepository.findOne({
      where: { Team: { Id: TeamId }, User: { Id: User.Id } },
    });
    if (!actorMembership) {
      throw new HttpException('You are not a member of this team', 403);
    }

    const targetMembership = await this.teamMemberRepository.findOne({
      where: { Id: MemberId, Team: { Id: TeamId } },
      relations: ['User'],
    });
    if (!targetMembership) {
      throw new HttpException('Member not found', 404);
    }

    if (targetMembership.User.Id === User.Id) {
      throw new HttpException('You cannot change your own role', 400);
    }

    if (targetMembership.Role === TeamRole.OWNER) {
      throw new HttpException(
        "Cannot change the owner's role. Use transfer ownership instead.",
        403,
      );
    }

    if (NewRole === TeamRole.OWNER) {
      throw new HttpException(
        'Cannot assign owner role. Use transfer ownership instead.',
        400,
      );
    }

    targetMembership.Role = NewRole;
    await this.teamMemberRepository.save(targetMembership);

    await this.InvalidateMembershipCache(TeamId, targetMembership.User.Id);

    return plainToInstance(TeamMemberResponseModel, {
      Id: targetMembership.Id,
      UserId: targetMembership.User.Id,
      FullName: targetMembership.User.FullName,
      Email: targetMembership.User.Email,
      Image: targetMembership.User.Image,
      Role: targetMembership.Role,
      JoinedAt: targetMembership.JoinedAt,
    });
  }

  async Remove(
    TeamId: string,
    MemberId: string,
    User: UserContext,
  ): Promise<boolean> {
    const targetMembership = await this.teamMemberRepository.findOne({
      where: { Id: MemberId, Team: { Id: TeamId } },
      relations: ['User'],
    });
    if (!targetMembership) {
      throw new HttpException('Member not found', 404);
    }

    if (targetMembership.User.Id === User.Id) {
      throw new HttpException(
        'Use the leave endpoint to remove yourself',
        400,
      );
    }

    if (targetMembership.Role === TeamRole.OWNER) {
      throw new HttpException('Cannot remove the team owner', 403);
    }

    await this.teamMemberRepository.remove(targetMembership);

    await this.InvalidateMembershipCache(TeamId, targetMembership.User.Id);
    await this.RedisService.Delete(
      TeamKeys.UserTeams(targetMembership.User.Id),
    );

    return true;
  }

  async Leave(TeamId: string, User: UserContext): Promise<boolean> {
    const membership = await this.teamMemberRepository.findOne({
      where: { Team: { Id: TeamId }, User: { Id: User.Id } },
    });
    if (!membership) {
      throw new HttpException('You are not a member of this team', 404);
    }

    if (membership.Role === TeamRole.OWNER) {
      throw new HttpException(
        'Owner cannot leave the team. Transfer ownership first.',
        400,
      );
    }

    await this.teamMemberRepository.remove(membership);

    await this.InvalidateMembershipCache(TeamId, User.Id);
    await this.RedisService.Delete(TeamKeys.UserTeams(User.Id));

    return true;
  }

  async TransferOwnership(
    TeamId: string,
    Model: TeamTransferOwnershipRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    const currentOwner = await this.teamMemberRepository.findOne({
      where: { Team: { Id: TeamId }, User: { Id: User.Id } },
    });
    if (!currentOwner || currentOwner.Role !== TeamRole.OWNER) {
      throw new HttpException('Only the owner can transfer ownership', 403);
    }

    const newOwner = await this.teamMemberRepository.findOne({
      where: { Team: { Id: TeamId }, User: { Id: Model.UserId } },
    });
    if (!newOwner) {
      throw new HttpException(
        'Target user is not a member of this team',
        404,
      );
    }

    if (newOwner.User.Id === User.Id) {
      throw new HttpException('You are already the owner', 400);
    }

    // Transfer: old owner → ADMIN, new owner → OWNER
    currentOwner.Role = TeamRole.ADMIN;
    newOwner.Role = TeamRole.OWNER;

    await this.teamMemberRepository.save([currentOwner, newOwner]);

    await this.InvalidateMembershipCache(TeamId, User.Id);
    await this.InvalidateMembershipCache(TeamId, Model.UserId);

    return true;
  }

  private async InvalidateMembershipCache(
    teamId: string,
    userId: string,
  ): Promise<void> {
    await this.RedisService.Delete(TeamKeys.Membership(teamId, userId));
  }
}
