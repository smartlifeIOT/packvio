import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { HealthResponseDto } from './dto/health-response.dto';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Always 200 — a degraded dependency is reported in the body, not the status
   * code, so the process is not killed by an orchestrator while Postgres boots.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  check(): Promise<HealthResponseDto> {
    return this.healthService.check();
  }
}
