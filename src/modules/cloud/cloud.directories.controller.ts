import { Body, Controller, Delete, Headers, Post, Put } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiTags,
  ApiHeader,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { CloudService } from './cloud.service';
import {
  DirectoryCreateRequestModel,
  DirectoryRenameRequestModel,
  DirectoryDeleteRequestModel,
  DirectoryUnlockRequestModel,
  DirectoryUnlockResponseModel,
  DirectoryLockRequestModel,
  DirectoryConvertToEncryptedRequestModel,
  DirectoryDecryptRequestModel,
  DirectoryResponseModel,
} from './cloud.model';
import { ApiSuccessResponse } from '@common/decorators/response.decorator';
import { User } from '@common/decorators/user.decorator';
import {
  FOLDER_SESSION_HEADER,
  FOLDER_PASSPHRASE_HEADER,
} from './cloud.constants';

@Controller('Cloud/Directories')
@ApiTags('Cloud / Directories')
@ApiCookieAuth()
export class CloudDirectoriesController {
  constructor(private readonly cloudService: CloudService) {}

  @ApiOperation({
    summary: 'Create a directory',
    description:
      'Creates a new directory. For encrypted directories, set IsEncrypted=true and provide passphrase via X-Folder-Passphrase header.',
  })
  @Post()
  @ApiHeader({
    name: FOLDER_PASSPHRASE_HEADER,
    required: false,
    description: 'Passphrase for encrypted directory (min 8 chars)',
  })
  @ApiHeader({
    name: FOLDER_SESSION_HEADER,
    required: false,
    description: 'Session token for encrypted folder access',
  })
  @ApiSuccessResponse(DirectoryResponseModel)
  async DirectoryCreate(
    @Body() model: DirectoryCreateRequestModel,
    @User() user: UserContext,
    @Headers(FOLDER_PASSPHRASE_HEADER) passphrase?: string,
    @Headers(FOLDER_SESSION_HEADER) sessionToken?: string,
  ): Promise<DirectoryResponseModel> {
    return this.cloudService.DirectoryCreate(
      model,
      passphrase,
      user,
      sessionToken,
    );
  }

  @ApiOperation({
    summary: 'Rename a directory',
    description:
      'Renames a directory. For encrypted directories, provide passphrase via X-Folder-Passphrase header.',
  })
  @Put('Rename')
  @ApiHeader({
    name: FOLDER_PASSPHRASE_HEADER,
    required: false,
    description: 'Passphrase for encrypted directory',
  })
  @ApiHeader({
    name: FOLDER_SESSION_HEADER,
    required: false,
    description: 'Session token for encrypted folder access',
  })
  @ApiSuccessResponse(DirectoryResponseModel)
  async DirectoryRename(
    @Body() model: DirectoryRenameRequestModel,
    @User() user: UserContext,
    @Headers(FOLDER_PASSPHRASE_HEADER) passphrase?: string,
    @Headers(FOLDER_SESSION_HEADER) sessionToken?: string,
  ): Promise<DirectoryResponseModel> {
    return this.cloudService.DirectoryRename(
      model,
      passphrase,
      user,
      sessionToken,
    );
  }

  @ApiOperation({
    summary: 'Delete a directory',
    description:
      'Deletes a directory and all its contents. For encrypted directories, provide passphrase via X-Folder-Passphrase header.',
  })
  @Delete()
  @ApiHeader({
    name: FOLDER_PASSPHRASE_HEADER,
    required: false,
    description: 'Passphrase for encrypted directory',
  })
  @ApiHeader({
    name: FOLDER_SESSION_HEADER,
    required: false,
    description: 'Session token for encrypted folder access',
  })
  @ApiResponse({
    status: 200,
    description: 'Directory deleted',
    schema: { type: 'boolean' },
  })
  async DirectoryDelete(
    @Body() model: DirectoryDeleteRequestModel,
    @User() user: UserContext,
    @Headers(FOLDER_PASSPHRASE_HEADER) passphrase?: string,
    @Headers(FOLDER_SESSION_HEADER) sessionToken?: string,
  ): Promise<boolean> {
    return this.cloudService.DirectoryDelete(
      model,
      passphrase,
      user,
      sessionToken,
    );
  }

  @ApiOperation({
    summary: 'Unlock an encrypted directory',
    description:
      'Validates passphrase and creates a session token for subsequent access. The session token should be passed via X-Folder-Session header in subsequent requests.',
  })
  @Post('Unlock')
  @ApiHeader({
    name: FOLDER_PASSPHRASE_HEADER,
    required: true,
    description: 'Passphrase for encrypted directory (min 8 chars)',
  })
  @ApiSuccessResponse(DirectoryUnlockResponseModel)
  async DirectoryUnlock(
    @Body() model: DirectoryUnlockRequestModel,
    @User() user: UserContext,
    @Headers(FOLDER_PASSPHRASE_HEADER) passphrase?: string,
  ): Promise<DirectoryUnlockResponseModel> {
    return this.cloudService.DirectoryUnlock(model, passphrase, user);
  }

  @ApiOperation({
    summary: 'Lock an encrypted directory',
    description: 'Invalidates the session token for an encrypted directory.',
  })
  @Post('Lock')
  @ApiResponse({
    status: 200,
    description: 'Directory locked',
    schema: { type: 'boolean' },
  })
  async DirectoryLock(
    @Body() model: DirectoryLockRequestModel,
    @User() user: UserContext,
  ): Promise<boolean> {
    return this.cloudService.DirectoryLock(model, user);
  }

  @ApiOperation({
    summary: 'Convert a directory to encrypted',
    description:
      'Marks an existing directory as encrypted. Provide passphrase via X-Folder-Passphrase header.',
  })
  @Post('Encrypt')
  @ApiHeader({
    name: FOLDER_PASSPHRASE_HEADER,
    required: true,
    description: 'Passphrase for encryption (min 8 chars)',
  })
  @ApiHeader({
    name: FOLDER_SESSION_HEADER,
    required: false,
    description: 'Session token for encrypted folder access',
  })
  @ApiSuccessResponse(DirectoryResponseModel)
  async DirectoryConvertToEncrypted(
    @Body() model: DirectoryConvertToEncryptedRequestModel,
    @User() user: UserContext,
    @Headers(FOLDER_PASSPHRASE_HEADER) passphrase?: string,
    @Headers(FOLDER_SESSION_HEADER) sessionToken?: string,
  ): Promise<DirectoryResponseModel> {
    return this.cloudService.DirectoryConvertToEncrypted(
      model,
      passphrase,
      user,
      sessionToken,
    );
  }

  @ApiOperation({
    summary: 'Remove encryption from a directory',
    description:
      'Removes encryption from a directory (keeps files). Provide passphrase via X-Folder-Passphrase header.',
  })
  @Post('Decrypt')
  @ApiHeader({
    name: FOLDER_PASSPHRASE_HEADER,
    required: true,
    description: 'Passphrase for decryption',
  })
  @ApiHeader({
    name: FOLDER_SESSION_HEADER,
    required: false,
    description: 'Session token for encrypted folder access',
  })
  @ApiSuccessResponse(DirectoryResponseModel)
  async DirectoryDecrypt(
    @Body() model: DirectoryDecryptRequestModel,
    @User() user: UserContext,
    @Headers(FOLDER_PASSPHRASE_HEADER) passphrase?: string,
    @Headers(FOLDER_SESSION_HEADER) sessionToken?: string,
  ): Promise<DirectoryResponseModel> {
    return this.cloudService.DirectoryDecrypt(
      model,
      passphrase,
      user,
      sessionToken,
    );
  }
}
