import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeamMemberEntity } from '@entities/team-member.entity';
import { TeamStatus, TeamRole } from '@common/enums';
import { RedisService } from '@modules/redis/redis.service';
import { TeamKeys } from '@modules/redis/redis.keys';
import { TEAM_MEMBERSHIP_CACHE_TTL } from '@modules/redis/redis.ttl';
import { validate as isUUID } from 'uuid';

export const TEAM_ID_HEADER = 'x-team-id';

interface CachedMembership {
  Role: string;
  TeamStatus: string;
  TeamSlug: string;
  TeamName: string;
}

@Injectable()
export class TeamContextGuard implements CanActivate {
  constructor(
    @InjectRepository(TeamMemberEntity)
    private readonly teamMemberRepository: Repository<TeamMemberEntity>,
    private readonly RedisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const teamId = request.headers[TEAM_ID_HEADER] as string;

    // No team header = personal context, pass through
    if (!teamId) {
      return true;
    }

    const user = request.user as UserContext;
    if (!user) {
      return true; // Let CombinedAuthGuard handle missing user
    }

    // Validate UUID format
    if (!isUUID(teamId)) {
      throw new BadRequestException('Invalid team ID format');
    }

    // Check cache first
    const cacheKey = TeamKeys.Membership(teamId, user.Id);
    let membership = await this.RedisService.Get<CachedMembership>(cacheKey);

    if (!membership) {
      const dbMembership = await this.teamMemberRepository.findOne({
        where: {
          Team: { Id: teamId },
          User: { Id: user.Id },
        },
        relations: ['Team'],
      });

      if (!dbMembership) {
        throw new ForbiddenException('You are not a member of this team');
      }

      membership = {
        Role: dbMembership.Role,
        TeamStatus: dbMembership.Team.Status,
        TeamSlug: dbMembership.Team.Slug,
        TeamName: dbMembership.Team.Name,
      };

      await this.RedisService.Set(
        cacheKey,
        membership,
        TEAM_MEMBERSHIP_CACHE_TTL,
      );
    }

    if (membership.TeamStatus !== TeamStatus.ACTIVE) {
      throw new ForbiddenException('This team is not active');
    }

    // Enrich UserContext with team info
    user.TeamId = teamId;
    user.TeamRole = membership.Role as TeamRole;

    // Set rich team context on request
    request.TeamContext = {
      TeamId: teamId,
      TeamRole: membership.Role as TeamRole,
      TeamSlug: membership.TeamSlug,
      TeamName: membership.TeamName,
    };

    return true;
  }
}
