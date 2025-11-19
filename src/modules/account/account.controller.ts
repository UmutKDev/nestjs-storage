import { Controller, Get, Body, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountService } from './account.service';
import { ApiSuccessResponse } from '@common/decorators/response.decorator';
import {
  AccountChangePasswordRequestModel,
  AccountPutBodyRequestModel,
  AccountResponseModel,
} from './account.model';
import { User } from '@common/decorators/user.decorator';

@Controller('Account')
@ApiTags('Account')
@ApiBearerAuth()
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get('Profile')
  @ApiSuccessResponse(AccountResponseModel)
  async Profile(@User() user: UserContext): Promise<AccountResponseModel> {
    return await this.accountService.Profile({ user });
  }

  @Put('Edit')
  @ApiSuccessResponse('boolean')
  async Edit(
    @User() user: UserContext,
    @Body() model: AccountPutBodyRequestModel,
  ): Promise<boolean> {
    return await this.accountService.Edit({ user, model });
  }

  @Put('ChangePassword')
  @ApiSuccessResponse('boolean')
  async ChangePassword(
    @User() user: UserContext,
    @Body() model: AccountChangePasswordRequestModel,
  ): Promise<boolean> {
    return await this.accountService.ChangePassword({ user, model });
  }

  // @Post('Upload/Avatar')
  // @ApiConsumes('multipart/form-data')
  // @UseInterceptors(FileInterceptor('avatar'))
  // @ApiBody({
  //   type: AccountUploadAvatarRequestModel,
  // })
  // @ApiSuccessResponse('string')
  // async UploadAvatar(
  //   @User() user: UserContext,
  //   @UploadedFile(
  //     new ParseFilePipe({
  //       validators: [
  //         new MaxFileSizeValidator({
  //           maxSize: mbToBytes(5),
  //           message(maxSize) {
  //             return `File size should not exceed ${maxSize / 1024 / 1024} MB`;
  //           },
  //         }),
  //         new FileTypeValidator({ fileType: 'image/jpeg' }),
  //       ],
  //     }),
  //   )
  //   avatar: Express.Multer.File,
  // ): Promise<string> {
  //   return await this.accountService.UploadAvatar({
  //     user,
  //     avatar,
  //   });
  // }
}
