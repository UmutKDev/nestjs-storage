import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CloudService } from './cloud.service';
import { CloudFindRequestModel } from './cloud.model';

@Controller('Cloud')
@ApiTags('Cloud')
@ApiBearerAuth()
export class CloudController {
  constructor(private readonly cloudService: CloudService) {}

  @Get('List')
  async List() {
    return this.cloudService.List();
  }

  @Get('Find/:Key')
  async Find(@Param() model: CloudFindRequestModel) {
    return this.cloudService.Find(model);
  }

  @Get('PresignedUrl/:Key')
  async GetPresignedUrl(@Param() model: CloudFindRequestModel) {
    return this.cloudService.GetPresignedUrl(model);
  }
}
