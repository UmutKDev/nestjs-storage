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

  @Get('List')
  @ApiSuccessResponse(CloudListResponseModel)
  async List(
    @Query() model: CloudListRequestModel,
    @User() user: UserContext,
  ): Promise<CloudListResponseModel> {
    return this.cloudService.List(model, user);
  }

  @Get('List/Breadcrumb')
  @ApiSuccessArrayResponse(CloudBreadCrumbModel)
  async ListBreadcrumb(
    @Query() model: CloudListBreadcrumbRequestModel,
  ): Promise<CloudBreadCrumbModel[]> {
    return this.cloudService.ListBreadcrumb(model);
  }

  @Get('List/Directories')
  @ApiSuccessArrayResponse(CloudDirectoryModel)
  async ListDirectories(
    @Query() model: CloudListDirectoriesRequestModel,
    @User() user: UserContext,
  ): Promise<CloudDirectoryModel[]> {
    return this.cloudService.ListDirectories(model, user);
  }

  @Get('List/Objects')
  @ApiSuccessArrayResponse(CloudObjectModel)
  async ListObjects(
    @Query() model: CloudListObjectsRequestModel,
    @User() user: UserContext,
  ): Promise<CloudObjectModel[]> {
    return this.cloudService.ListObjects(model, user);
  }

  @Get('User/StorageUsage')
  @ApiSuccessResponse(CloudUserStorageUsageResponseModel)
  async UserStorageUsage(
    @User() user: UserContext,
  ): Promise<CloudUserStorageUsageResponseModel> {
    return this.cloudService.UserStorageUsage(user);
  }

  @Get('Find')
  async Find(@Query() model: CloudKeyRequestModel, @User() user: UserContext) {
    return this.cloudService.Find(model, user);
  }

  @Get('PresignedUrl')
  async GetPresignedUrl(
    @Query() model: CloudKeyRequestModel,
    @User() user: UserContext,
  ) {
    return this.cloudService.GetPresignedUrl(model, user);
  }

  @Put('Move')
  async Move(
    @Body() model: CloudMoveRequestModel,
    @User() user: UserContext,
  ): Promise<boolean> {
    return this.cloudService.Move(model, user);
  }

  @Delete('Delete')
  async Delete(
    @Body() model: CloudDeleteRequestModel,
    @User() user: UserContext,
  ): Promise<boolean> {
    return this.cloudService.Delete(model, user);
  }

  @Post('CreateDirectory')
  async CreateDirectory(
    @Body() model: CloudKeyRequestModel,
    @User() user: UserContext,
  ): Promise<boolean> {
    return this.cloudService.CreateDirectory(model, user);
  }

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

  @Post('Upload/GetMultipartPartUrl')
  @ApiSuccessResponse(CloudGetMultipartPartUrlResponseModel)
  async UploadGetMultipartPartUrl(
    @Body() model: CloudGetMultipartPartUrlRequestModel,
    @User() user: UserContext,
  ): Promise<CloudGetMultipartPartUrlResponseModel> {
    return this.cloudService.UploadGetMultipartPartUrl(model, user);
  }

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

  @Post('Upload/CompleteMultipartUpload')
  @ApiSuccessResponse(CloudCompleteMultipartUploadResponseModel)
  async UploadCompleteMultipartUpload(
    @Body() model: CloudCompleteMultipartUploadRequestModel,
    @User() user: UserContext,
  ): Promise<CloudCompleteMultipartUploadResponseModel> {
    return this.cloudService.UploadCompleteMultipartUpload(model, user);
  }

  @Delete('Upload/AbortMultipartUpload')
  async UploadAbortMultipartUpload(
    @Body() model: CloudAbortMultipartUploadRequestModel,
    @User() user: UserContext,
  ): Promise<void> {
    return this.cloudService.UploadAbortMultipartUpload(model, user);
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
