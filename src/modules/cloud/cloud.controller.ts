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
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CloudService } from './cloud.service';
import {
  CloudAbortMultipartUploadRequestModel,
  CloudCompleteMultipartUploadRequestModel,
  CloudCompleteMultipartUploadResponseModel,
  CloudCreateMultipartUploadRequestModel,
  CloudCreateMultipartUploadResponseModel,
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
} from './cloud.model';
import {
  ApiSuccessArrayResponse,
  ApiSuccessResponse,
} from '@common/decorators/response.decorator';
import { User } from '@common/decorators/user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { ByteToMB } from '@common/helpers/cast.helper';
import { ThrottleTransform } from '@common/helpers/throttle.transform';
import { pipeline } from 'stream';
import { promisify } from 'util';
import type { Response } from 'express';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

@Controller('Cloud')
@ApiTags('Cloud')
@ApiBearerAuth()
export class CloudController {
  constructor(private readonly cloudService: CloudService) {}

  @ApiOperation({
    summary: 'List files and directories',
    description:
      'Returns a view (breadcrumbs, directories and objects) for the given user-scoped path. Supports delimiter and metadata processing flags.',
  })
  @Get('List')
  @ApiSuccessResponse(CloudListResponseModel)
  async List(
    @Query() model: CloudListRequestModel,
    @User() user: UserContext,
  ): Promise<CloudListResponseModel> {
    return this.cloudService.List(model, user);
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
    description: 'Returns directory prefixes (folders) for a given path.',
  })
  @Get('List/Directories')
  @ApiSuccessArrayResponse(CloudDirectoryModel)
  async ListDirectories(
    @Query() model: CloudListDirectoriesRequestModel,
    @User() user: UserContext,
  ): Promise<CloudDirectoryModel[]> {
    return this.cloudService.ListDirectories(model, user);
  }

  @ApiOperation({
    summary: 'List objects (files) inside a path',
    description: 'Returns files at a given path for the authenticated user.',
  })
  @Get('List/Objects')
  @ApiSuccessArrayResponse(CloudObjectModel)
  async ListObjects(
    @Query() model: CloudListObjectsRequestModel,
    @User() user: UserContext,
  ): Promise<CloudObjectModel[]> {
    return this.cloudService.ListObjects(model, user);
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
  @Get('PresignedUrl')
  async GetPresignedUrl(
    @Query() model: CloudKeyRequestModel,
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
    summary: 'Create directory (prefix)',
    description: 'Creates a directory/prefix within the user scoped storage.',
  })
  @ApiResponse({
    status: 200,
    description: 'Directory created',
    schema: { type: 'boolean' },
  })
  @Post('CreateDirectory')
  async CreateDirectory(
    @Body() model: CloudKeyRequestModel,
    @User() user: UserContext,
  ): Promise<boolean> {
    return this.cloudService.CreateDirectory(model, user);
  }

  @ApiOperation({
    summary: 'Create a multipart upload session',
    description: 'Creates an UploadId and starts a multipart upload flow.',
  })
  @Post('Upload/CreateMultipartUpload')
  @ApiSuccessResponse(CloudCreateMultipartUploadResponseModel)
  async UploadCreateMultipartUpload(
    @Body() model: CloudCreateMultipartUploadRequestModel,
    @User() user: UserContext,
  ): Promise<CloudCreateMultipartUploadResponseModel> {
    if (model.TotalSize) {
      const UserStorage = await this.cloudService.UserStorageUsage(user);
      const usedStorageInMB = ByteToMB(UserStorage.UsedStorageInBytes);
      const maxStoragePerUserInMB = ByteToMB(UserStorage.MaxStorageInBytes);
      const newTotalStorageInMB = ByteToMB(model.TotalSize);

      if (model.TotalSize > UserStorage.MaxUploadSizeBytes) {
        throw new HttpException(
          `File size exceeds the maximum upload size of ${ByteToMB(
            UserStorage.MaxUploadSizeBytes,
          )} MB.`,
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

    return this.cloudService.UploadCreateMultipartUpload(model, user);
  }

  @ApiOperation({
    summary: 'Get a multipart upload part URL',
    description:
      'Returns an expiring URL to upload a single part for the provided UploadId and PartNumber.',
  })
  @Post('Upload/GetMultipartPartUrl')
  @ApiSuccessResponse(CloudGetMultipartPartUrlResponseModel)
  async UploadGetMultipartPartUrl(
    @Body() model: CloudGetMultipartPartUrlRequestModel,
    @User() user: UserContext,
  ): Promise<CloudGetMultipartPartUrlResponseModel> {
    return this.cloudService.UploadGetMultipartPartUrl(model, user);
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
  @ApiSuccessResponse(CloudUploadPartResponseModel)
  async UploadPart(
    @Body() model: CloudUploadPartRequestModel,
    @UploadedFile() file: Express.Multer.File,
    @User() user: UserContext,
  ): Promise<CloudUploadPartResponseModel> {
    return this.cloudService.UploadPart(model, file, user);
  }

  @ApiOperation({
    summary: 'Complete multipart upload',
    description:
      'Completes a multipart upload by providing the list of parts and finalizes the object.',
  })
  @Post('Upload/CompleteMultipartUpload')
  @ApiSuccessResponse(CloudCompleteMultipartUploadResponseModel)
  async UploadCompleteMultipartUpload(
    @Body() model: CloudCompleteMultipartUploadRequestModel,
    @User() user: UserContext,
  ): Promise<CloudCompleteMultipartUploadResponseModel> {
    return this.cloudService.UploadCompleteMultipartUpload(model, user);
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
    console.log('first');
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
}
