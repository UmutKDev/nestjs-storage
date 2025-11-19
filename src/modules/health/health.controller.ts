import { Public } from '@common/decorators/public.decorator';
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@Controller('Health')
@ApiTags('Health')
@Public()
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private database: TypeOrmHealthIndicator,
    private http: HttpHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async () => this.http.pingCheck('service', 'https://nestjs.com'),
      async () => this.database.pingCheck('database'),
    ]);
  }
}
