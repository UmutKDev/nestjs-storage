import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TEAM_ID_HEADER } from './guards/team-context.guard';
import {
  ApiSuccessArrayResponse,
  ApiSuccessResponse,
} from '@common/decorators/response.decorator';
import { User } from '@common/decorators/user.decorator';
import { CheckPolicies } from '@modules/authentication/casl/check-policies.decorator';
import { CaslAction, CaslSubject } from '@common/enums';
import { TeamService } from './team.service';
import {
  TeamCreateRequestModel,
  TeamUpdateRequestModel,
  TeamResponseModel,
  TeamDetailResponseModel,
} from './team.model';

@Controller('Team')
@ApiTags('Team')
@ApiCookieAuth()
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @CheckPolicies((Ability) => Ability.can(CaslAction.Create, CaslSubject.Team))
  @Post()
  @ApiSuccessResponse(TeamResponseModel)
  @ApiOperation({ summary: 'Create a new team' })
  async Create(
    @User() User: UserContext,
    @Body() Model: TeamCreateRequestModel,
  ): Promise<TeamResponseModel> {
    return this.teamService.Create(Model, User);
  }

  @CheckPolicies((Ability) => Ability.can(CaslAction.Read, CaslSubject.Team))
  @Get()
  @ApiSuccessArrayResponse(TeamResponseModel)
  @ApiOperation({ summary: "List user's teams" })
  async List(@User() User: UserContext): Promise<TeamResponseModel[]> {
    return this.teamService.List(User);
  }

  @CheckPolicies((Ability) => Ability.can(CaslAction.Read, CaslSubject.Team))
  @Get(':Id')
  @ApiHeader({
    name: TEAM_ID_HEADER,
    required: true,
    description: 'Team ID to operate on',
  })
  @ApiSuccessResponse(TeamDetailResponseModel)
  @ApiOperation({ summary: 'Get team details' })
  async Find(
    @User() User: UserContext,
    @Param('Id', ParseUUIDPipe) Id: string,
  ): Promise<TeamDetailResponseModel> {
    return this.teamService.Find(Id, User);
  }

  @CheckPolicies((Ability) => Ability.can(CaslAction.Update, CaslSubject.Team))
  @Put(':Id')
  @ApiHeader({
    name: TEAM_ID_HEADER,
    required: true,
    description: 'Team ID to operate on',
  })
  @ApiSuccessResponse(TeamResponseModel)
  @ApiOperation({ summary: 'Update team settings' })
  async Update(
    @User() User: UserContext,
    @Param('Id', ParseUUIDPipe) Id: string,
    @Body() Model: TeamUpdateRequestModel,
  ): Promise<TeamResponseModel> {
    return this.teamService.Update(Id, Model, User);
  }

  @CheckPolicies((Ability) => Ability.can(CaslAction.Delete, CaslSubject.Team))
  @Delete(':Id')
  @ApiHeader({
    name: TEAM_ID_HEADER,
    required: true,
    description: 'Team ID to operate on',
  })
  @ApiSuccessResponse('boolean')
  @ApiOperation({ summary: 'Delete team (owner only)' })
  async Delete(
    @User() User: UserContext,
    @Param('Id', ParseUUIDPipe) Id: string,
  ): Promise<boolean> {
    return this.teamService.Delete(Id, User);
  }
}
