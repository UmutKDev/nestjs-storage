import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
  Res,
  Headers,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiTags,
  ApiHeader,
} from '@nestjs/swagger';
import { CloudService } from './cloud.service';
import {
  CloudAbortMultipartUploadRequestModel,
  CloudCompleteMultipartUploadRequestModel,
  CloudCompleteMultipartUploadResponseModel,
  CloudCreateMultipartUploadRequestModel,
  CloudCreateMultipartUploadResponseModel,
  CloudExtractZipStartRequestModel,
  CloudExtractZipStartResponseModel,
  CloudExtractZipStatusRequestModel,
  CloudExtractZipStatusResponseModel,
  CloudExtractZipCancelRequestModel,
  CloudExtractZipCancelResponseModel,
  CloudKeyRequestModel,
  CloudGetMultipartPartUrlRequestModel,
  CloudGetMultipartPartUrlResponseModel,
  CloudUpdateRequestModel,
  CloudListRequestModel,
  CloudListResponseModel,
  CloudDeleteRequestModel,
  CloudMoveRequestModel,
  CloudBreadCrumbModel,
  CloudDirectoryModel,
  CloudObjectModel,
  CloudListBreadcrumbRequestModel,
  CloudListDirectoriesRequestModel,
  CloudListObjectsRequestModel,
  CloudUploadPartRequestModel,
  CloudUploadPartResponseModel,
  CloudUserStorageUsageResponseModel,
  CloudPreSignedUrlRequestModel,
  // New Directories API
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
import {
  ApiSuccessArrayResponse,
  ApiSuccessResponse,
} from '@common/decorators/response.decorator';
import { User } from '@common/decorators/user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottleTransform } from '@common/helpers/throttle.transform';
import { pipeline } from 'stream';
import { promisify } from 'util';
import type { Response } from 'express';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { SizeFormatter } from '@common/helpers/cast.helper';
import {
  FOLDER_SESSION_HEADER,
  FOLDER_PASSPHRASE_HEADER,
} from './cloud.constants';

@Controller('Cloud')
@ApiTags('Cloud')
@ApiBearerAuth()
export class CloudController {
  constructor(private readonly cloudService: CloudService) {}

  @ApiOperation({
    summary: 'List files and directories',
    description:
      'Returns a view (breadcrumbs, directories and objects) for the given user-scoped path. Supports delimiter and metadata processing flags. For encrypted folders, provide session token via X-Folder-Session header.',
  })
  @Get('List')
  @ApiHeader({
    name: FOLDER_SESSION_HEADER,
    required: false,
    description: 'Session token for encrypted folder access',
  })
  @ApiSuccessResponse(CloudListResponseModel)
  async List(
    @Query() model: CloudListRequestModel,
    @User() user: UserContext,
    @Headers(FOLDER_SESSION_HEADER) sessionToken?: string,
  ): Promise<CloudListResponseModel> {
    return this.cloudService.List(model, user, sessionToken);
  }

  @ApiOperation({
    summary: 'Get breadcrumb for a path',
    description:
      'Returns breadcrumb entries (path pieces) for the supplied path.',
  })
  @Get('List/Breadcrumb')
  @ApiSuccessArrayResponse(CloudBreadCrumbModel)
  async ListBreadcrumb(
    @Query() model: CloudListBreadcrumbRequestModel,
  ): Promise<CloudBreadCrumbModel[]> {
    return this.cloudService.ListBreadcrumb(model);
  }

  @ApiOperation({
    summary: 'List directories inside a path',
    description:
      'Returns directory prefixes (folders) for a given path. For encrypted folders, provide session token via X-Folder-Session header.',
  })
  @Get('List/Directories')
  @ApiHeader({
    name: FOLDER_SESSION_HEADER,
    required: false,
    description: 'Session token for encrypted folder access',
  })
  @ApiSuccessArrayResponse(CloudDirectoryModel)
  async ListDirectories(
    @Query() model: CloudListDirectoriesRequestModel,
    @User() user: UserContext,
    @Headers(FOLDER_SESSION_HEADER) sessionToken?: string,
  ): Promise<CloudDirectoryModel[]> {
    return this.cloudService.ListDirectories(model, user, sessionToken);
  }

  @ApiOperation({
    summary: 'List objects (files) inside a path',
    description:
      'Returns files at a given path for the authenticated user. For encrypted folders, provide session token via X-Folder-Session header.',
  })
  @Get('List/Objects')
  @ApiHeader({
    name: FOLDER_SESSION_HEADER,
    required: false,
    description: 'Session token for encrypted folder access',
  })
  @ApiSuccessArrayResponse(CloudObjectModel)
  async ListObjects(
    @Query() model: CloudListObjectsRequestModel,
    @User() user: UserContext,
    @Headers(FOLDER_SESSION_HEADER) sessionToken?: string,
  ): Promise<CloudObjectModel[]> {
    return this.cloudService.ListObjects(model, user, sessionToken);
  }

  @ApiOperation({
    summary: "Get user's storage usage",
    description: 'Returns the authenticated user storage usage and limits.',
  })
  @Get('User/StorageUsage')
  @ApiSuccessResponse(CloudUserStorageUsageResponseModel)
  async UserStorageUsage(
    @User() user: UserContext,
  ): Promise<CloudUserStorageUsageResponseModel> {
    return this.cloudService.UserStorageUsage(user);
  }

  @ApiOperation({
    summary: 'Get object metadata',
    description:
      'Find a single object by key (user scoped) and return its metadata.',
  })
  @Get('Find')
  async Find(@Query() model: CloudKeyRequestModel, @User() user: UserContext) {
    return this.cloudService.Find(model, user);
  }

  @ApiOperation({
    summary: 'Get a presigned URL for upload/download',
    description:
      'Returns a presigned URL for a specific object key to allow direct client access.',
  })
  @ApiSuccessResponse('string')
  @Get('PresignedUrl')
  async GetPresignedUrl(
    @Query() model: CloudPreSignedUrlRequestModel,
    @User() user: UserContext,
  ) {
    return this.cloudService.GetPresignedUrl(model, user);
  }

  @ApiOperation({
    summary: 'Move/rename an object',
    description:
      'Move an object from SourceKey to DestinationKey within the user scope.',
  })
  @ApiResponse({
    status: 200,
    description: 'Move succeeded',
    schema: { type: 'boolean' },
  })
  @Put('Move')
  async Move(
    @Body() model: CloudMoveRequestModel,
    @User() user: UserContext,
  ): Promise<boolean> {
    return this.cloudService.Move(model, user);
  }

  @ApiOperation({
    summary: 'Delete objects',
    description:
      'Deletes one or more objects (or directories) belonging to the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Delete succeeded',
    schema: { type: 'boolean' },
  })
  @Delete('Delete')
  async Delete(
    @Body() model: CloudDeleteRequestModel,
    @User() user: UserContext,
  ): Promise<boolean> {
    return this.cloudService.Delete(model, user);
  }

  @ApiOperation({
    summary: 'Create a multipart upload session',
    description: 'Creates an UploadId and starts a multipart upload flow.',
  })
  @Post('Upload/CreateMultipartUpload')
  @ApiHeader({
    name: FOLDER_SESSION_HEADER,
    required: false,
    description: 'Session token for encrypted folder access',
  })
  @ApiSuccessResponse(CloudCreateMultipartUploadResponseModel)
  async UploadCreateMultipartUpload(
    @Body() model: CloudCreateMultipartUploadRequestModel,
    @User() user: UserContext,
    @Headers(FOLDER_SESSION_HEADER) sessionToken?: string,
  ): Promise<CloudCreateMultipartUploadResponseModel> {
    if (model.TotalSize) {
      const UserStorage = await this.cloudService.UserStorageUsage(user);
      const usedStorageInMB = SizeFormatter({
        From: UserStorage.UsedStorageInBytes,
        FromUnit: 'B',
        ToUnit: 'MB',
      });
      const maxStoragePerUserInMB = SizeFormatter({
        From: UserStorage.MaxStorageInBytes,
        FromUnit: 'B',
        ToUnit: 'MB',
      });
      const newTotalStorageInMB = SizeFormatter({
        From: model.TotalSize,
        FromUnit: 'B',
        ToUnit: 'MB',
      });

      if (model.TotalSize > UserStorage.MaxUploadSizeBytes) {
        throw new HttpException(
          `File size exceeds the maximum upload size of ${SizeFormatter({ From: UserStorage.MaxUploadSizeBytes, FromUnit: 'B', ToUnit: 'MB' })} MB.`,
          HttpStatus.BAD_REQUEST,
        );
      }

      if (usedStorageInMB + newTotalStorageInMB > maxStoragePerUserInMB) {
        throw new HttpException(
          'Storage limit exceeded. Please upgrade your subscription.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    return this.cloudService.UploadCreateMultipartUpload(
      model,
      user,
      sessionToken,
    );
  }

  @ApiOperation({
    summary: 'Get a multipart upload part URL',
    description:
      'Returns an expiring URL to upload a single part for the provided UploadId and PartNumber.',
  })
  @Post('Upload/GetMultipartPartUrl')
  @ApiHeader({
    name: FOLDER_SESSION_HEADER,
    required: false,
    description: 'Session token for encrypted folder access',
  })
  @ApiSuccessResponse(CloudGetMultipartPartUrlResponseModel)
  async UploadGetMultipartPartUrl(
    @Body() model: CloudGetMultipartPartUrlRequestModel,
    @User() user: UserContext,
    @Headers(FOLDER_SESSION_HEADER) sessionToken?: string,
  ): Promise<CloudGetMultipartPartUrlResponseModel> {
    return this.cloudService.UploadGetMultipartPartUrl(
      model,
      user,
      sessionToken,
    );
  }

  @ApiOperation({
    summary: 'Upload a multipart part',
    description:
      'Accepts a single file part for a multipart upload. The request must be multipart/form-data.',
  })
  @Post('Upload/UploadPart')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    type: CloudUploadPartRequestModel,
  })
  @UseInterceptors(FileInterceptor('File'))
  @ApiHeader({
    name: FOLDER_SESSION_HEADER,
    required: false,
    description: 'Session token for encrypted folder access',
  })
  @ApiSuccessResponse(CloudUploadPartResponseModel)
  async UploadPart(
    @Body() model: CloudUploadPartRequestModel,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: Number(process.env.CLOUD_UPLOAD_PART_MAX_BYTES ?? 5242880),
          }),
        ],
      }),
    )
    file: Express.Multer.File,
    @User() user: UserContext,
    @Headers(FOLDER_SESSION_HEADER) sessionToken?: string,
  ): Promise<CloudUploadPartResponseModel> {
    return this.cloudService.UploadPart(model, file, user, sessionToken);
  }

  @ApiOperation({
    summary: 'Complete multipart upload',
    description:
      'Completes a multipart upload by providing the list of parts and finalizes the object.',
  })
  @Post('Upload/CompleteMultipartUpload')
  @ApiHeader({
    name: FOLDER_SESSION_HEADER,
    required: false,
    description: 'Session token for encrypted folder access',
  })
  @ApiSuccessResponse(CloudCompleteMultipartUploadResponseModel)
  async UploadCompleteMultipartUpload(
    @Body() model: CloudCompleteMultipartUploadRequestModel,
    @User() user: UserContext,
    @Headers(FOLDER_SESSION_HEADER) sessionToken?: string,
  ): Promise<CloudCompleteMultipartUploadResponseModel> {
    return this.cloudService.UploadCompleteMultipartUpload(
      model,
      user,
      sessionToken,
    );
  }

  @ApiOperation({
    summary: 'Start zip extraction',
    description:
      'Starts an async job to extract a previously uploaded .zip file.',
  })
  @Post('Upload/ExtractZip/Start')
  @ApiHeader({
    name: FOLDER_SESSION_HEADER,
    required: false,
    description: 'Session token for encrypted folder access',
  })
  @ApiSuccessResponse(CloudExtractZipStartResponseModel)
  async ExtractZipStart(
    @Body() model: CloudExtractZipStartRequestModel,
    @User() user: UserContext,
    @Headers(FOLDER_SESSION_HEADER) sessionToken?: string,
  ): Promise<CloudExtractZipStartResponseModel> {
    return this.cloudService.ExtractZipStart(model, user, sessionToken);
  }

  @ApiOperation({
    summary: 'Get zip extraction status',
    description: 'Returns the current status/progress of a zip extraction job.',
  })
  @Get('Upload/ExtractZip/Status')
  @ApiSuccessResponse(CloudExtractZipStatusResponseModel)
  async ExtractZipStatus(
    @Query() model: CloudExtractZipStatusRequestModel,
    @User() user: UserContext,
  ): Promise<CloudExtractZipStatusResponseModel> {
    return this.cloudService.ExtractZipStatus(model, user);
  }

  @ApiOperation({
    summary: 'Cancel zip extraction',
    description: 'Cancels a zip extraction job if it is pending or running.',
  })
  @Post('Upload/ExtractZip/Cancel')
  @ApiSuccessResponse(CloudExtractZipCancelResponseModel)
  async ExtractZipCancel(
    @Body() model: CloudExtractZipCancelRequestModel,
    @User() user: UserContext,
  ): Promise<CloudExtractZipCancelResponseModel> {
    return this.cloudService.ExtractZipCancel(model, user);
  }

  @ApiOperation({
    summary: 'Abort a multipart upload',
    description:
      'Abort an ongoing multipart upload and clean up temporary state.',
  })
  @Delete('Upload/AbortMultipartUpload')
  async UploadAbortMultipartUpload(
    @Body() model: CloudAbortMultipartUploadRequestModel,
    @User() user: UserContext,
  ): Promise<void> {
    return this.cloudService.UploadAbortMultipartUpload(model, user);
  }

  @ApiOperation({
    summary: 'Update object metadata or rename',
    description:
      'Update an existing object by changing metadata or renaming the file (name only).',
  })
  @Put('Update')
  @ApiSuccessResponse(CloudObjectModel)
  async Update(
    @Body() model: CloudUpdateRequestModel,
    @User() user: UserContext,
  ): Promise<CloudObjectModel> {
    return this.cloudService.Update(model, user);
  }

  @Get('Download')
  @ApiOperation({
    summary: 'Download a file for the authenticated user (streamed)',
    description:
      'Streams a file that belongs to the authenticated user. The server enforces a static per-user download speed (bytes/sec).',
  })
  @ApiQuery({
    name: 'Key',
    required: true,
    description: 'Path/key to the file (user-scoped)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Binary file stream. Content-Type and Content-Length headers set where available.',
    content: {
      'application/octet-stream': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'File not found' })
  async Download(
    @Query() model: CloudKeyRequestModel,
    @User() user: UserContext,
    @Res() res: Response,
  ) {
    // verify the object exists and get its metadata
    const obj = await this.cloudService.Find(model, user);

    // set headers
    res.setHeader('Content-Type', obj.MimeType || 'application/octet-stream');
    if (obj.Size) res.setHeader('Content-Length', String(obj.Size));
    const filename =
      obj.Name || (model.Key ? model.Key.split('/').pop() : 'file');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // get node stream and throttle for this user (static per subscription)
    const rawStream = await this.cloudService.GetObjectReadable(model, user);
    const bytesPerSec =
      await this.cloudService.GetDownloadSpeedBytesPerSec(user);

    const throttle = new ThrottleTransform(bytesPerSec);

    const pipe = promisify(pipeline);
    try {
      await pipe(rawStream, throttle, res);
    } catch (err) {
      // can't modify headers here once started; ensure stream closed
      try {
        rawStream.destroy(err as Error);
      } catch (er) {
        new HttpException(er, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  // ============================================================================
  // DIRECTORIES API - Unified Directory Management
  // ============================================================================

  @ApiOperation({
    summary: 'Create a directory',
    description:
      'Creates a new directory. For encrypted directories, set IsEncrypted=true and provide passphrase via X-Folder-Passphrase header.',
  })
  @Post('Directories')
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
  @Put('Directories/Rename')
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
  @Delete('Directories')
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
  @Post('Directories/Unlock')
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
  @Post('Directories/Lock')
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
  @Post('Directories/Encrypt')
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
  @Post('Directories/Decrypt')
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
