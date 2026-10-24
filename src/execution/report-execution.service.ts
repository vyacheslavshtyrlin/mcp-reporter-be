import { Inject, Injectable } from '@nestjs/common';

import type { ReportDefinitionInput } from '../reports/report.models.js';
import type {
  ReportRunPage,
  ReportRunPageRequest,
} from './execution.models.js';
import { InMemoryReportRunRepository } from './in-memory-report-run-repository.js';
import { InlineDispatcher } from './inline-dispatcher.js';

@Injectable()
export class ReportExecutionService {
  constructor(
    @Inject(InMemoryReportRunRepository)
    private readonly runs: InMemoryReportRunRepository,
    @Inject(InlineDispatcher)
    private readonly dispatcher: InlineDispatcher,
  ) {}

  async run(
    definition: ReportDefinitionInput,
    request: ReportRunPageRequest,
    signal?: AbortSignal,
  ): Promise<ReportRunPage> {
    const run = this.runs.create(definition);
    await this.dispatcher.submit(run.id, signal);
    return this.runs.getPage(run.id, request);
  }

  getReportRun(runId: string, request: ReportRunPageRequest): ReportRunPage {
    return this.runs.getPage(runId, request);
  }
}
