import { Inject, Injectable } from '@nestjs/common';

import { ReportDefinitionService } from '../reports/report-definition.service.js';
import { ReportEngineService } from '../reports/report-engine.service.js';
import { isSourceError } from '../sources/contracts/index.js';
import { SourceRegistry } from '../sources/source-registry.js';
import type { ExecutionDeadline } from './execution-deadline.js';
import { EXECUTION_ERROR_CODE, ExecutionError } from './execution.error.js';
import type { ReportRunError } from './execution.models.js';
import { InMemoryReportRunRepository } from './in-memory-report-run-repository.js';

@Injectable()
export class ReportExecutor {
  constructor(
    @Inject(InMemoryReportRunRepository)
    private readonly runs: InMemoryReportRunRepository,
    @Inject(SourceRegistry)
    private readonly sources: SourceRegistry,
    @Inject(ReportDefinitionService)
    private readonly definitions: ReportDefinitionService,
    @Inject(ReportEngineService)
    private readonly engine: ReportEngineService,
  ) {}

  async execute(runId: string, deadline: ExecutionDeadline): Promise<void> {
    const run = this.runs.claim(runId);

    try {
      deadline.throwIfInactive();
      const adapter = this.sources.get(run.definition.sourceId);
      const schema = await adapter.describeDataset(
        run.definition.datasetId,
        deadline.signal,
      );

      deadline.throwIfInactive();
      const plan = this.definitions.validateAndPlan(run.definition, schema);
      deadline.throwIfInactive();
      const batch = await adapter.fetchRecords(plan.query, deadline.signal);

      deadline.throwIfInactive();
      const result = this.engine.calculate(plan, batch);
      deadline.throwIfInactive();
      this.runs.complete(runId, result);
    } catch (error: unknown) {
      this.runs.fail(runId, toReportRunError(error, deadline));
    }
  }
}

function toReportRunError(
  error: unknown,
  deadline: ExecutionDeadline,
): ReportRunError {
  if (
    deadline.signal.aborted &&
    deadline.signal.reason instanceof ExecutionError
  ) {
    return {
      code: deadline.signal.reason.code,
      message: deadline.signal.reason.message,
      retryable: false,
    };
  }

  if (error instanceof ExecutionError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }

  if (isSourceError(error)) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }

  return {
    code: EXECUTION_ERROR_CODE.REPORT_EXECUTION_FAILED,
    message: 'Report execution failed',
    retryable: false,
  };
}
