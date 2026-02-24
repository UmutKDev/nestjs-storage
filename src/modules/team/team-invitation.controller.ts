import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TEAM_ID_HEADER } from './guards/team-context.guard';
import {
  ApiSuccessArrayResponse,
  ApiSuccessResponse,
} from '@common/decorators/response.decorator';
import { User } from '@common/decorators/user.decorator';
import { CheckPolicies } from '@modules/authentication/casl/check-policies.decorator';
import { CaslAction, CaslSubject } from '@common/enums';
import { TeamInvitationService } from './team-invitation.service';
import {
  TeamInvitationCreateRequestModel,
  TeamInvitationAcceptRequestModel,
  TeamInvitationDeclineRequestModel,
  TeamInvitationResponseModel,
  TeamMemberResponseModel,
} from './team.model';

@Controller('Team/Invitations')
@ApiTags('Team / Invitations')
@ApiCookieAuth()
export class TeamInvitationController {
  constructor(
    private readonly teamInvitationService: TeamInvitationService,
  ) {}

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Create, CaslSubject.TeamInvitation),
  )
  @Post()
  @ApiHeader({
    name: TEAM_ID_HEADER,
    required: true,
    description: 'Team ID to operate on',
  })
  @ApiSuccessResponse(TeamInvitationResponseModel)
  @ApiOperation({ summary: 'Create team invitation' })
  async Create(
    @User() User: UserContext,
    @Body() Model: TeamInvitationCreateRequestModel,
  ): Promise<TeamInvitationResponseModel> {
    return this.teamInvitationService.Create(User.TeamId, Model, User);
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Read, CaslSubject.TeamInvitation),
  )
  @Get()
  @ApiHeader({
    name: TEAM_ID_HEADER,
    required: true,
    description: 'Team ID to operate on',
  })
  @ApiSuccessArrayResponse(TeamInvitationResponseModel)
  @ApiOperation({ summary: 'List team invitations' })
  async ListForTeam(
    @User() User: UserContext,
  ): Promise<TeamInvitationResponseModel[]> {
    return this.teamInvitationService.ListForTeam(User.TeamId);
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Delete, CaslSubject.TeamInvitation),
  )
  @Delete(':Id')
  @ApiHeader({
    name: TEAM_ID_HEADER,
    required: true,
    description: 'Team ID to operate on',
  })
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Cancel invitation' })
  async Cancel(
    @User() User: UserContext,
    @Param('Id') Id: string,
  ): Promise<boolean> {
    return this.teamInvitationService.Cancel(User.TeamId, Id);
  }

  @Post('Accept')
  @ApiSuccessResponse(TeamMemberResponseModel)
  @ApiOperation({ summary: 'Accept team invitation' })
  async Accept(
    @User() User: UserContext,
    @Body() Model: TeamInvitationAcceptRequestModel,
  ): Promise<TeamMemberResponseModel> {
    return this.teamInvitationService.Accept(Model.Token, User);
  }

  @Post('Decline')
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Decline team invitation' })
  async Decline(
    @User() User: UserContext,
    @Body() Model: TeamInvitationDeclineRequestModel,
  ): Promise<boolean> {
    return this.teamInvitationService.Decline(Model.Token, User);
  }

  @Get('Pending')
  @ApiSuccessArrayResponse(TeamInvitationResponseModel)
  @ApiOperation({ summary: "List user's pending invitations" })
  async ListPending(
    @User() User: UserContext,
  ): Promise<TeamInvitationResponseModel[]> {
    return this.teamInvitationService.ListPendingForUser(User);
  }
}
