import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccountService } from './account.service';
import { ApiSuccessResponse } from '@common/decorators/response.decorator';
import {
  AccountChangePasswordRequestModel,
  AccountProfileResponseModel,
  AccountPutBodyRequestModel,
} from './account.model';
import { User } from '@common/decorators/user.decorator';
import { AuthenticationService } from '../authentication/authentication.service';

@Controller('Account')
@ApiTags('Account')
@ApiBearerAuth()
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly authenticationService: AuthenticationService,
  ) {}

  @Get('Profile')
  @ApiSuccessResponse(AccountProfileResponseModel)
  async Profile(
    @User() user: UserContext,
  ): Promise<AccountProfileResponseModel> {
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

  // @Post('Upload/Image')
  // @ApiConsumes('multipart/form-data')
  // @UseInterceptors(FileInterceptor('image'))
  // @ApiBody({
  //   type: AccountUploadImageRequestModel,
  // })
  // @ApiSuccessResponse('string')
  // async UploadImage(
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
  //   image: Express.Multer.File,
  // ): Promise<string> {
  //   return await this.accountService.UploadImage({
  //     user,
  //     image,
  //   });
  // }
}
