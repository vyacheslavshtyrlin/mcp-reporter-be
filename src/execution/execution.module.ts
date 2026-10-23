import { Module } from '@nestjs/common';

import { ReportsModule } from '../reports/reports.module.js';
import { SourcesModule } from '../sources/sources.module.js';
import { InlineDispatcher } from './inline-dispatcher.js';
import { InMemoryReportRunRepository } from './in-memory-report-run-repository.js';
import { ReportExecutionService } from './report-execution.service.js';
import { ReportExecutor } from './report-executor.js';

@Module({
  imports: [SourcesModule, ReportsModule],
  providers: [
    InMemoryReportRunRepository,
    ReportExecutor,
    InlineDispatcher,
    ReportExecutionService,
  ],
  exports: [ReportExecutionService],
})
export class ExecutionModule {}
