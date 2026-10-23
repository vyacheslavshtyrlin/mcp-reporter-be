import { Module } from '@nestjs/common';
import { ReportDefinitionService } from './report-definition.service.js';
import { ReportEngineService } from './report-engine.service.js';

@Module({
  providers: [ReportDefinitionService, ReportEngineService],
  exports: [ReportDefinitionService, ReportEngineService],
})
export class ReportsModule {}
