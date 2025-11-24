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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import {
  UserFindResponseModel,
  UserListResponseModel,
  UserPostBodyRequestModel,
  UserPutBodyRequestModel,
} from './user.model';
import {
  ApiSuccessArrayResponse,
  ApiSuccessResponse,
} from '@common/decorators/response.decorator';
import { BaseIdRequestModel } from '@common/models/base.model';
import { PaginationRequestModel } from '@common/models/pagination.model';
import { Roles } from '@common/decorators/roles.decorator';
import { Role } from '@common/enums';
import { User } from '@common/decorators/user.decorator';

@Controller('User')
@ApiTags('User')
@ApiBearerAuth()
@Roles(Role.ADMIN)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('List')
  @ApiSuccessArrayResponse(UserListResponseModel)
  async List(
    @Query()
    model: PaginationRequestModel,
  ): Promise<UserListResponseModel[]> {
    return await this.userService.List({
      model: model,
    });
  }

  @Get('Find/:id')
  @ApiSuccessResponse(UserFindResponseModel)
  async Find(
    @Param() model: BaseIdRequestModel,
  ): Promise<UserFindResponseModel> {
    return await this.userService.Find({ model: model });
  }

  @Post('Create')
  @ApiSuccessResponse('boolean')
  async Create(
    @Body()
    model: UserPostBodyRequestModel,
  ): Promise<boolean> {
    return await this.userService.Create({
      model: model,
    });
  }

  @Put('Edit/:id')
  @ApiSuccessResponse('boolean')
  async Edit(
    @Param() { id }: BaseIdRequestModel,
    @Body() model: UserPutBodyRequestModel,
  ): Promise<boolean> {
    return await this.userService.Edit({
      id,
      model: model,
    });
  }

  @Delete('Delete/:id')
  @ApiSuccessResponse('boolean')
  async Delete(
    @User() user: UserContext,
    @Param() model: BaseIdRequestModel,
  ): Promise<boolean> {
    return await this.userService.Delete({
      user,
      model: model,
    });
  }
}
