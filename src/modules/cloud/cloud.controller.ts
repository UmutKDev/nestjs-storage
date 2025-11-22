import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
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
} from './cloud.model';
import { ApiSuccessResponse } from '@common/decorators/response.decorator';

@Controller('Cloud')
@ApiTags('Cloud')
@ApiBearerAuth()
export class CloudController {
  constructor(private readonly cloudService: CloudService) {}

  @Get('List')
  @ApiSuccessResponse(CloudListResponseModel)
  async List(
    @Query() model: CloudListRequestModel,
  ): Promise<CloudListResponseModel> {
    return this.cloudService.List(model);
  }

  @Get('Find')
  async Find(@Query() model: CloudKeyRequestModel) {
    return this.cloudService.Find(model);
  }

  @Get('PresignedUrl')
  async GetPresignedUrl(@Query() model: CloudKeyRequestModel) {
    return this.cloudService.GetPresignedUrl(model);
  }

  @Delete('Delete')
  async Delete(@Body() model: CloudDeleteRequestModel): Promise<boolean> {
    return this.cloudService.Delete(model);
  }

  @Post('CreateDirectory')
  async CreateDirectory(@Body() model: CloudKeyRequestModel): Promise<boolean> {
    return this.cloudService.CreateDirectory(model);
  }

  @Post('Upload/CreateMultipartUpload')
  @ApiSuccessResponse(CloudCreateMultipartUploadResponseModel)
  async UploadCreateMultipartUpload(
    @Body() model: CloudCreateMultipartUploadRequestModel,
  ): Promise<CloudCreateMultipartUploadResponseModel> {
    return this.cloudService.UploadCreateMultipartUpload(model);
  }

  @Post('Upload/GetMultipartPartUrl')
  @ApiSuccessResponse(CloudGetMultipartPartUrlResponseModel)
  async UploadGetMultipartPartUrl(
    @Body() model: CloudGetMultipartPartUrlRequestModel,
  ): Promise<CloudGetMultipartPartUrlResponseModel> {
    return this.cloudService.UploadGetMultipartPartUrl(model);
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
  ): Promise<CloudUploadPartResponseModel> {
    return this.cloudService.UploadPart(model, file);
  }

  @Post('Upload/CompleteMultipartUpload')
  @ApiSuccessResponse(CloudCompleteMultipartUploadResponseModel)
  async UploadCompleteMultipartUpload(
    @Body() model: CloudCompleteMultipartUploadRequestModel,
  ): Promise<CloudCompleteMultipartUploadResponseModel> {
    return this.cloudService.UploadCompleteMultipartUpload(model);
  }

  @Post('Upload/AbortMultipartUpload')
  async UploadAbortMultipartUpload(
    @Body() model: CloudAbortMultipartUploadRequestModel,
  ): Promise<void> {
    return this.cloudService.UploadAbortMultipartUpload(model);
  }
}
