import { Injectable } from '@nestjs/common';

import type { RecordBatch } from '../sources/contracts/index.js';
import { SOURCE_ERROR_CODE, SourceError } from '../sources/contracts/index.js';
import { calculatePeriodChange } from './period-change.js';
import type { ReportResult, ValidatedReportPlan } from './report.models.js';
import { calculateTimeSeries } from './time-series.js';

@Injectable()
export class ReportEngineService {
  calculate(plan: ValidatedReportPlan, batch: RecordBatch): ReportResult {
    assertBatchMatchesPlan(plan, batch);

    switch (plan.definition.kind) {
      case 'time_series':
        return calculateTimeSeries(plan, batch);
      case 'period_change':
        return calculatePeriodChange(plan, batch);
    }
  }
}

function assertBatchMatchesPlan(
  plan: ValidatedReportPlan,
  batch: RecordBatch,
): void {
  const matches =
    batch.schemaVersion === plan.definition.schemaVersion &&
    batch.provenance.sourceId === plan.definition.sourceId &&
    batch.provenance.sourceDatasetId === plan.definition.datasetId;

  if (!matches) {
    throw new SourceError(
      SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      'Record batch does not match the validated report plan',
      {
        context: {
          sourceId: plan.definition.sourceId,
          datasetId: plan.definition.datasetId,
          schemaVersion: plan.definition.schemaVersion,
        },
      },
    );
  }
}
