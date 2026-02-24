import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TEAM_ID_HEADER } from './guards/team-context.guard';
import {
  ApiSuccessArrayResponse,
  ApiSuccessResponse,
} from '@common/decorators/response.decorator';
import { User } from '@common/decorators/user.decorator';
import { CheckPolicies } from '@modules/authentication/casl/check-policies.decorator';
import { CaslAction, CaslSubject } from '@common/enums';
import { TeamMemberService } from './team-member.service';
import {
  TeamMemberResponseModel,
  TeamMemberUpdateRoleRequestModel,
  TeamTransferOwnershipRequestModel,
} from './team.model';

@Controller('Team/Members')
@ApiTags('Team / Members')
@ApiCookieAuth()
@ApiHeader({
  name: TEAM_ID_HEADER,
  required: true,
  description: 'Team ID to operate on',
})
export class TeamMemberController {
  constructor(private readonly teamMemberService: TeamMemberService) {}

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Read, CaslSubject.TeamMember),
  )
  @Get()
  @ApiSuccessArrayResponse(TeamMemberResponseModel)
  @ApiOperation({ summary: 'List team members' })
  async List(@User() User: UserContext): Promise<TeamMemberResponseModel[]> {
    if (!User.TeamId) {
      return [];
    }
    return this.teamMemberService.List(User.TeamId);
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Update, CaslSubject.TeamMember),
  )
  @Put(':MemberId/Role')
  @ApiSuccessResponse(TeamMemberResponseModel)
  @ApiOperation({ summary: 'Change member role' })
  async UpdateRole(
    @User() User: UserContext,
    @Param('MemberId') MemberId: string,
    @Body() Model: TeamMemberUpdateRoleRequestModel,
  ): Promise<TeamMemberResponseModel> {
    return this.teamMemberService.UpdateRole(
      User.TeamId,
      MemberId,
      Model.Role,
      User,
    );
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Delete, CaslSubject.TeamMember),
  )
  @Delete(':MemberId')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Remove a member from team' })
  async Remove(
    @User() User: UserContext,
    @Param('MemberId') MemberId: string,
  ): Promise<boolean> {
    return this.teamMemberService.Remove(User.TeamId, MemberId, User);
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Read, CaslSubject.TeamMember),
  )
  @Post('Leave')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Leave the team' })
  async Leave(@User() User: UserContext): Promise<boolean> {
    return this.teamMemberService.Leave(User.TeamId, User);
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Manage, CaslSubject.Team),
  )
  @Post('TransferOwnership')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Transfer team ownership' })
  async TransferOwnership(
    @User() User: UserContext,
    @Body() Model: TeamTransferOwnershipRequestModel,
  ): Promise<boolean> {
    return this.teamMemberService.TransferOwnership(
      User.TeamId,
      Model,
      User,
    );
  }
}
