import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from './system.types.js';
import { SystemService } from './system.service.js';

@Controller('health')
export class SystemController {
  constructor(
    @Inject(SystemService) private readonly systemService: SystemService,
  ) {}

  @Get()
  getHealth(): HealthResponse {
    return this.systemService.getHealth();
  }
}
