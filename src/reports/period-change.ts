import type { RecordBatch } from '../sources/contracts/index.js';
import {
  buildObservationCells,
  compareGroups,
  compareValues,
  getGroupValue,
  type ObservationCell,
} from './report-observation-grid.js';
import {
  REPORT_ENGINE_VERSION,
  type ChangeUnavailableReason,
  type ChangeValue,
  type PeriodChangeResult,
  type PeriodChangeRow,
  type PeriodEndpoint,
  type PrimaryChangeKind,
  type ValidatedReportPlan,
} from './report.models.js';

export function calculatePeriodChange(
  plan: ValidatedReportPlan,
  batch: RecordBatch,
): PeriodChangeResult {
  const { fromYear, toYear } = plan.definition.period;
  const cells = buildObservationCells(plan, batch, [fromYear, toYear]);
  const rows: PeriodChangeRow[] = [];

  for (let index = 0; index < cells.length; index += 2) {
    const startCell = cells[index];
    const endCell = cells[index + 1];

    // buildObservationCells emits exactly two consecutive endpoints per
    // group/measure because this call supplies exactly two years.
    const [startEndpoint, endEndpoint] = [startCell, endCell] as [
      ObservationCell,
      ObservationCell,
    ];

    const start = toEndpoint(startEndpoint);
    const end = toEndpoint(endEndpoint);
    const changeKind: PrimaryChangeKind =
      startEndpoint.measure.semanticType === 'percentage'
        ? 'percentage_points'
        : 'absolute';
    const endpointReason = getEndpointReason(startEndpoint, endEndpoint);
    const change: ChangeValue =
      endpointReason === undefined
        ? {
            status: 'available',
            kind: changeKind,
            value:
              (endEndpoint.value as number) - (startEndpoint.value as number),
          }
        : { status: 'unavailable', kind: changeKind, reason: endpointReason };
    const relativeChangePercent = calculateRelativeChange(
      startEndpoint,
      endEndpoint,
      endpointReason,
    );

    rows.push({
      group: startEndpoint.group,
      measureId: startEndpoint.measure.id,
      unit: startEndpoint.measure.unit,
      start,
      end,
      change,
      relativeChangePercent,
    });
  }

  rows.sort((left, right) => {
    const configured = compareConfiguredSort(left, right, plan);
    if (configured !== 0) {
      return configured;
    }

    return (
      compareGroups(left.group, right.group, plan.definition.groupBy) ||
      plan.definition.measures.findIndex(
        (measure) => measure.id === left.measureId,
      ) -
        plan.definition.measures.findIndex(
          (measure) => measure.id === right.measureId,
        )
    );
  });

  return {
    kind: 'period_change',
    engineVersion: REPORT_ENGINE_VERSION,
    rows,
    coverage: batch.coverage,
    warnings: batch.warnings,
    provenance: batch.provenance,
    transportComplete: true,
    sourceRecords: batch.records,
  };
}

function toEndpoint(cell: ObservationCell): PeriodEndpoint {
  if (cell.availability === 'available') {
    return {
      status: 'available',
      year: cell.year,
      value: cell.value as number,
    };
  }

  return {
    status: 'unavailable',
    year: cell.year,
    value: null,
    reason:
      cell.availability === 'absent' ? 'OBSERVATION_ABSENT' : 'VALUE_NULL',
  };
}

function getEndpointReason(
  start: ObservationCell,
  end: ObservationCell,
): ChangeUnavailableReason | undefined {
  if (start.availability === 'absent') {
    return 'START_OBSERVATION_ABSENT';
  }
  if (start.availability === 'null') {
    return 'START_VALUE_NULL';
  }
  if (end.availability === 'absent') {
    return 'END_OBSERVATION_ABSENT';
  }
  if (end.availability === 'null') {
    return 'END_VALUE_NULL';
  }

  return undefined;
}

function calculateRelativeChange(
  start: ObservationCell,
  end: ObservationCell,
  endpointReason: ChangeUnavailableReason | undefined,
): ChangeValue {
  if (endpointReason !== undefined) {
    return {
      status: 'unavailable',
      kind: 'relative_percent',
      reason: endpointReason,
    };
  }

  if ((start.value as number) <= 0) {
    return {
      status: 'unavailable',
      kind: 'relative_percent',
      reason: 'NON_POSITIVE_START',
    };
  }

  return {
    status: 'available',
    kind: 'relative_percent',
    value:
      (((end.value as number) - (start.value as number)) /
        (start.value as number)) *
      100,
  };
}

function compareConfiguredSort(
  left: PeriodChangeRow,
  right: PeriodChangeRow,
  plan: ValidatedReportPlan,
): number {
  const sort = plan.definition.sort;
  if (sort === undefined) {
    return 0;
  }

  const comparison = compareValues(
    getGroupValue(left.group, sort.field),
    getGroupValue(right.group, sort.field),
  );
  return sort.direction === 'asc' ? comparison : -comparison;
}
