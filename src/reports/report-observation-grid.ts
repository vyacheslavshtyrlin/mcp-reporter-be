import type {
  DataRecord,
  DataValue,
  FilterValue,
  MeasureDefinition,
  RecordBatch,
} from '../sources/contracts/index.js';
import { SOURCE_ERROR_CODE, SourceError } from '../sources/contracts/index.js';
import type {
  ObservationAvailability,
  ReportGroup,
  ValidatedReportPlan,
} from './report.models.js';

const MAX_GROUPS = 10;
const MAX_POINTS = 1_500;

export interface ObservationCell {
  readonly group: ReportGroup;
  readonly year: number;
  readonly measure: MeasureDefinition;
  readonly value: number | null;
  readonly availability: ObservationAvailability;
}

export function buildObservationCells(
  plan: ValidatedReportPlan,
  batch: RecordBatch,
  years: readonly number[],
): readonly ObservationCell[] {
  const groups = buildGroups(plan, batch.records);
  const pointCount = groups.length * plan.measures.length * years.length;

  if (groups.length > MAX_GROUPS || pointCount > MAX_POINTS) {
    throw new SourceError(
      SOURCE_ERROR_CODE.REPORT_LIMIT_EXCEEDED,
      'Calculated report grid exceeds the configured limits',
      {
        context: {
          groupCount: groups.length,
          pointCount,
          maxGroups: MAX_GROUPS,
          maxPoints: MAX_POINTS,
        },
      },
    );
  }

  const cells: ObservationCell[] = [];

  for (const group of groups) {
    for (const measure of plan.measures) {
      for (const year of years) {
        cells.push(findObservation(plan, batch.records, group, year, measure));
      }
    }
  }

  return cells;
}

export function compareGroups(
  left: ReportGroup,
  right: ReportGroup,
  groupBy: readonly string[],
): number {
  for (const field of groupBy) {
    const comparison = compareValues(
      getGroupValue(left, field),
      getGroupValue(right, field),
    );
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

export function getGroupValue(group: ReportGroup, field: string): DataValue {
  // Semantic validation restricts sort/group fields, and buildGroups writes
  // every declared groupBy field into every group object.
  return group[field] as DataValue;
}

export function compareValues(left: DataValue, right: DataValue): number {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return Number(left) - Number(right);
  }

  return String(left).localeCompare(String(right), 'en-US');
}

function buildGroups(
  plan: ValidatedReportPlan,
  records: readonly DataRecord[],
): readonly ReportGroup[] {
  let groups: readonly ReportGroup[] = [{}];

  for (const field of plan.definition.groupBy) {
    const filter = plan.definition.filters.find((item) => item.field === field);
    const values =
      filter === undefined
        ? uniqueRecordValues(records, field)
        : filter.operator === 'eq'
          ? [filter.value]
          : [...new Set(filter.value)];
    const nextGroups: ReportGroup[] = [];

    for (const group of groups) {
      for (const value of values) {
        nextGroups.push({ ...group, [field]: value });
      }
    }

    groups = nextGroups;
  }

  return groups;
}

function uniqueRecordValues(
  records: readonly DataRecord[],
  field: string,
): readonly FilterValue[] {
  const values = new Set<FilterValue>();

  for (const record of records) {
    const value = record[field];
    if (value !== undefined && value !== null) {
      values.add(value);
    }
  }

  return [...values].sort(compareValues);
}

function findObservation(
  plan: ValidatedReportPlan,
  records: readonly DataRecord[],
  group: ReportGroup,
  year: number,
  measure: MeasureDefinition,
): ObservationCell {
  const matches = records.filter(
    (record) =>
      record[plan.schema.temporalField] === year &&
      plan.definition.groupBy.every(
        (field) => record[field] === group[field],
      ) &&
      (measure.selector === undefined ||
        record[measure.selector.field] === measure.selector.value),
  );

  if (matches.length > 1) {
    throw new SourceError(
      SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      'Record batch contains duplicate report observations',
      {
        context: {
          sourceId: plan.definition.sourceId,
          measureId: measure.id,
          year,
        },
      },
    );
  }

  const record = matches[0];
  if (record === undefined) {
    return { group, year, measure, value: null, availability: 'absent' };
  }

  const value = record[measure.valueField];
  if (value === null) {
    return { group, year, measure, value: null, availability: 'null' };
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SourceError(
      SOURCE_ERROR_CODE.SOURCE_RESPONSE_INVALID,
      'Record batch contains a non-numeric measure value',
      {
        context: {
          sourceId: plan.definition.sourceId,
          measureId: measure.id,
          year,
        },
      },
    );
  }

  return { group, year, measure, value, availability: 'available' };
}
