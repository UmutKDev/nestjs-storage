import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CloudService } from './cloud.service';
import { FileInterceptor } from '@nestjs/platform-express';
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
  CloudUploadPartRequestModel,
  CloudUploadPartResponseModel,
  CloudDeleteRequestModel,
  CloudMoveRequestModel,
} from './cloud.model';
import { ApiSuccessResponse } from '@common/decorators/response.decorator';
import { User } from '@common/decorators/user.decorator';

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
    schema: {
      type: 'object',
      properties: {
        Key: { type: 'string' },
        UploadId: { type: 'string' },
        PartNumber: { type: 'integer' },
        File: {
          type: 'string',
          format: 'binary',
        },
      },
    },
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

  @Post('Upload/AbortMultipartUpload')
  async UploadAbortMultipartUpload(
    @Body() model: CloudAbortMultipartUploadRequestModel,
    @User() user: UserContext,
  ): Promise<void> {
    return this.cloudService.UploadAbortMultipartUpload(model, user);
  }
}
