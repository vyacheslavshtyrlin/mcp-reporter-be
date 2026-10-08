import { Injectable } from '@nestjs/common';
import type { HealthResponse } from './system.types.js';

@Injectable()
export class SystemService {
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'mcp-reporter-be',
    };
  }
}
