import { Inject, Injectable } from '@nestjs/common';

import {
  DEFAULT_REPORT_DEADLINE_MS,
  ExecutionDeadline,
} from './execution-deadline.js';
import { ReportExecutor } from './report-executor.js';

@Injectable()
export class InlineDispatcher {
  constructor(
    @Inject(ReportExecutor) private readonly executor: ReportExecutor,
  ) {}

  async submit(runId: string, callerSignal?: AbortSignal): Promise<void> {
    const deadline = new ExecutionDeadline(
      DEFAULT_REPORT_DEADLINE_MS,
      callerSignal,
    );

    try {
      await this.executor.execute(runId, deadline);
    } finally {
      deadline.dispose();
    }
  }
}
