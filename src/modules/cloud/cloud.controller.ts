import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CloudService } from './cloud.service';
import {
  CloudFindRequestModel,
  CloudListRequestModel,
  CloudListResponseModel,
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
  async Find(@Query() model: CloudFindRequestModel) {
    return this.cloudService.Find(model);
  }

  @Get('PresignedUrl')
  async GetPresignedUrl(@Query() model: CloudFindRequestModel) {
    return this.cloudService.GetPresignedUrl(model);
  }
}
