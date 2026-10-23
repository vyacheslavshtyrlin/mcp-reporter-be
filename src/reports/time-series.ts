import type { RecordBatch } from '../sources/contracts/index.js';
import {
  buildObservationCells,
  compareGroups,
  compareValues,
  getGroupValue,
} from './report-observation-grid.js';
import {
  REPORT_ENGINE_VERSION,
  type TimeSeriesResult,
  type TimeSeriesRow,
  type ValidatedReportPlan,
} from './report.models.js';

export function calculateTimeSeries(
  plan: ValidatedReportPlan,
  batch: RecordBatch,
): TimeSeriesResult {
  const years = Array.from(
    {
      length:
        plan.definition.period.toYear - plan.definition.period.fromYear + 1,
    },
    (_, index) => plan.definition.period.fromYear + index,
  );
  const rows = buildObservationCells(plan, batch, years).map(
    (cell): TimeSeriesRow => ({
      group: cell.group,
      year: cell.year,
      measureId: cell.measure.id,
      unit: cell.measure.unit,
      value: cell.value,
      availability: cell.availability,
    }),
  );
  rows.sort((left, right) => {
    const configured = compareConfiguredSort(left, right, plan);
    if (configured !== 0) {
      return configured;
    }

    return (
      compareGroups(left.group, right.group, plan.definition.groupBy) ||
      left.year - right.year ||
      plan.definition.measures.findIndex(
        (measure) => measure.id === left.measureId,
      ) -
        plan.definition.measures.findIndex(
          (measure) => measure.id === right.measureId,
        )
    );
  });

  return {
    kind: 'time_series',
    engineVersion: REPORT_ENGINE_VERSION,
    rows,
    coverage: batch.coverage,
    warnings: batch.warnings,
    provenance: batch.provenance,
    transportComplete: true,
    sourceRecords: batch.records,
  };
}

function compareConfiguredSort(
  left: TimeSeriesRow,
  right: TimeSeriesRow,
  plan: ValidatedReportPlan,
): number {
  const sort = plan.definition.sort;
  if (sort === undefined) {
    return 0;
  }

  const comparison =
    sort.field === plan.schema.temporalField
      ? left.year - right.year
      : compareValues(
          getGroupValue(left.group, sort.field),
          getGroupValue(right.group, sort.field),
        );

  return sort.direction === 'asc' ? comparison : -comparison;
}
