import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AccountService } from './account.service';
import { ApiSuccessResponse } from '@common/decorators/response.decorator';
import {
  AccountChangePasswordRequestModel,
  AccountProfileResponseModel,
  AccountPutBodyRequestModel,
} from './account.model';
import { User } from '@common/decorators/user.decorator';
import { CheckPolicies } from '@modules/authentication/casl/check-policies.decorator';
import { CaslAction, CaslSubject } from '@common/enums';

@Controller('Account')
@ApiTags('Account')
@ApiCookieAuth()
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @CheckPolicies((Ability) => Ability.can(CaslAction.Read, CaslSubject.Account))
  @Get('Profile')
  @ApiSuccessResponse(AccountProfileResponseModel)
  async Profile(
    @User() user: UserContext,
  ): Promise<AccountProfileResponseModel> {
    return await this.accountService.Profile({ user });
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Update, CaslSubject.Account),
  )
  @Put('Edit')
  @ApiSuccessResponse('boolean')
  async Edit(
    @User() user: UserContext,
    @Body() model: AccountPutBodyRequestModel,
  ): Promise<boolean> {
    return await this.accountService.Edit({ user, model });
  }

  @CheckPolicies((Ability) =>
    Ability.can(CaslAction.Update, CaslSubject.Account),
  )
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
