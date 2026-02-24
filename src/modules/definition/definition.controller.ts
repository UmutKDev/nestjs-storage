import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { DefinitionService } from './definition.service';
import {
  DefinitionGroupResponseModel,
  DefinitionResponseModel,
} from './definition.model';
import { PaginationRequestModel } from '@common/models/pagination.model';
import { ApiSuccessArrayResponse } from '@common/decorators/response.decorator';
import { CheckPolicies } from '@modules/authentication/casl/check-policies.decorator';
import { CaslAction, CaslSubject } from '@common/enums';

@Controller('Definition')
@ApiTags('Definition')
@ApiCookieAuth()
@CheckPolicies((Ability) =>
  Ability.can(CaslAction.Read, CaslSubject.Definition),
)
export class DefinitionController {
  constructor(private readonly definitionService: DefinitionService) {}

  @Get('Group/List')
  @ApiSuccessArrayResponse(DefinitionGroupResponseModel)
  async ListGroup(
    @Query()
    model: PaginationRequestModel,
  ): Promise<DefinitionGroupResponseModel[]> {
    return this.definitionService.ListGroup({
      model: model,
    });
  }

  @Get('Group/Find/:groupCode')
  async FindGroup() {
    return 'Find';
  }

  @Get('List/:groupCode')
  async ListDefinition(
    @Param('groupCode') groupCode: string,
    @Query() model: PaginationRequestModel,
  ): Promise<DefinitionResponseModel[]> {
    return this.definitionService.ListDefinition({
      groupCode,
      model: model,
    });
  }

  @Get('Find/:groupCode/:code')
  async FindDefinition() {
    return 'Find';
  }
}
