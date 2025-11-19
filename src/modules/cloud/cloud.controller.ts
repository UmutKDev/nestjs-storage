import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CloudService } from './cloud.service';

@Controller('Cloud')
@ApiTags('Cloud')
export class CloudController {
  constructor(private readonly cloudService: CloudService) {}
}
