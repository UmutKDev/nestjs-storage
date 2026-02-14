import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Put,
  Delete,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  ApiSuccessArrayResponse,
  ApiSuccessResponse,
} from '@common/decorators/response.decorator';
import { BaseIdRequestModel } from '@common/models/base.model';
import { PaginationRequestModel } from '@common/models/pagination.model';
import { User } from '@common/decorators/user.decorator';
// Replace __Name__ with module name (PascalCase), __kebab__ with kebab-case

@Controller('__Name__')
@ApiTags('__Name__')
@ApiCookieAuth()
export class __Name__Controller {
  constructor(private readonly __name__Service: __Name__Service) {}

  @Get('List')
  @ApiSuccessArrayResponse(__Name__ListResponseModel)
  async List(
    @Query() model: PaginationRequestModel,
  ): Promise<__Name__ListResponseModel[]> {
    return this.__name__Service.List({ model });
  }

  @Get('Find/:id')
  @ApiSuccessResponse(__Name__FindResponseModel)
  async Find(
    @Param() model: BaseIdRequestModel,
  ): Promise<__Name__FindResponseModel> {
    return this.__name__Service.Find({ model });
  }

  @Post('Create')
  @ApiSuccessResponse('boolean')
  async Create(@Body() model: __Name__PostBodyRequestModel): Promise<boolean> {
    return this.__name__Service.Create({ model });
  }

  @Put('Edit/:id')
  @ApiSuccessResponse('boolean')
  async Edit(
    @Param() { Id }: BaseIdRequestModel,
    @Body() model: __Name__PutBodyRequestModel,
  ): Promise<boolean> {
    return this.__name__Service.Edit({ id: Id, model });
  }

  @Delete('Delete/:id')
  @ApiSuccessResponse('boolean')
  async Delete(
    @User() user: UserContext,
    @Param() model: BaseIdRequestModel,
  ): Promise<boolean> {
    return this.__name__Service.Delete({ user, model });
  }
}
