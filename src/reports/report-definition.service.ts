import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type {
  DataFilter,
  DataQuery,
  DatasetSchema,
  FilterValue,
  MeasureDefinition,
  SourceErrorContextValue,
} from '../sources/contracts/index.js';
import { SOURCE_ERROR_CODE, SourceError } from '../sources/contracts/index.js';
import { parseReportDefinition } from './report-definition.schema.js';
import type {
  ReportDefinitionInput,
  ValidatedReportPlan,
} from './report.models.js';

const MAX_GROUPS = 10;
const MAX_MEASURES = 5;
const MAX_YEARS = 30;
const MAX_POINTS = 1_500;

@Injectable()
export class ReportDefinitionService {
  validateAndPlan(input: unknown, schema: DatasetSchema): ValidatedReportPlan {
    let definition: ReportDefinitionInput;

    try {
      definition = parseReportDefinition(input);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        throw invalidDefinition(
          'Report definition does not match the runtime contract',
          { issueCount: error.issues.length },
          error,
        );
      }

      throw error;
    }

    assertSchemaIdentity(definition, schema);
    const fieldsByName = new Map(
      schema.fields.map((field) => [field.name, field] as const),
    );

    for (const groupField of definition.groupBy) {
      const field = fieldsByName.get(groupField);

      if (field === undefined || field.role !== 'dimension') {
        throw invalidDefinition('Report grouping requires a dimension field', {
          field: groupField,
        });
      }
    }

    if (
      definition.period.field !== schema.temporalField ||
      !schema.capabilities.supportsYearRange
    ) {
      throw new SourceError(
        SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
        'Dataset does not support the requested report period',
        { context: { field: definition.period.field } },
      );
    }

    const yearCount = definition.period.toYear - definition.period.fromYear + 1;

    if (yearCount > MAX_YEARS) {
      throw limitExceeded('Report period exceeds the year limit', {
        yearCount,
        maxYears: MAX_YEARS,
      });
    }

    if (definition.measures.length > MAX_MEASURES) {
      throw limitExceeded('Report exceeds the measure limit', {
        measureCount: definition.measures.length,
        maxMeasures: MAX_MEASURES,
      });
    }

    const measuresById = new Map(
      schema.measures.map((measure) => [measure.id, measure] as const),
    );
    const measures = definition.measures.map(({ id }) => {
      const measure = measuresById.get(id);

      if (measure === undefined) {
        throw new SourceError(
          SOURCE_ERROR_CODE.UNKNOWN_MEASURE,
          'Report references an unknown measure',
          { context: { measureId: id } },
        );
      }

      if (!measure.allowedOperations.includes(definition.kind)) {
        throw new SourceError(
          SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
          'Measure does not support the report kind',
          { context: { measureId: id, operation: definition.kind } },
        );
      }

      return measure;
    });

    assertSort(definition, fieldsByName);
    const filters = addMeasureSelectorFilters(definition.filters, measures);
    assertFilters(filters, fieldsByName, schema);
    assertKnownPointLimit(definition, filters, yearCount);

    const query: DataQuery = {
      sourceId: definition.sourceId,
      datasetId: definition.datasetId,
      schemaVersion: definition.schemaVersion,
      filters,
      period: definition.period,
      fields: schema.fields.map((field) => field.name),
    };

    return { definition, schema, measures, query };
  }
}

function assertFilters(
  filters: readonly DataFilter[],
  fieldsByName: ReadonlyMap<string, DatasetSchema['fields'][number]>,
  schema: DatasetSchema,
): void {
  for (const filter of filters) {
    const field = fieldsByName.get(filter.field);

    if (field === undefined) {
      throw invalidDefinition('Report filter references an unknown field', {
        field: filter.field,
      });
    }

    if (
      !schema.capabilities.filterOperators.includes(filter.operator) ||
      !field.filterOperators.includes(filter.operator)
    ) {
      throw new SourceError(
        SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
        'Report filter operator is not supported for the field',
        { context: { field: filter.field, operator: filter.operator } },
      );
    }

    const values = filter.operator === 'eq' ? [filter.value] : filter.value;
    if (values.some((value) => !matchesFieldType(value, field.dataType))) {
      throw invalidDefinition(
        'Report filter value does not match the field data type',
        { field: filter.field, dataType: field.dataType },
      );
    }
  }
}

function matchesFieldType(
  value: FilterValue,
  dataType: DatasetSchema['fields'][number]['dataType'],
): boolean {
  switch (dataType) {
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
  }
}

function assertSchemaIdentity(
  definition: ReportDefinitionInput,
  schema: DatasetSchema,
): void {
  if (definition.sourceId !== schema.sourceId) {
    throw new SourceError(
      SOURCE_ERROR_CODE.SOURCE_NOT_FOUND,
      'Report source does not match the dataset schema',
      { context: { sourceId: definition.sourceId } },
    );
  }

  if (definition.datasetId !== schema.datasetId) {
    throw new SourceError(
      SOURCE_ERROR_CODE.DATASET_NOT_FOUND,
      'Report dataset does not match the dataset schema',
      {
        context: {
          sourceId: definition.sourceId,
          datasetId: definition.datasetId,
        },
      },
    );
  }

  if (definition.schemaVersion !== schema.version) {
    throw new SourceError(
      SOURCE_ERROR_CODE.SCHEMA_VERSION_MISMATCH,
      'Report schema version does not match the current dataset schema',
      {
        context: {
          requestedVersion: definition.schemaVersion,
          currentVersion: schema.version,
        },
      },
    );
  }
}

function assertSort(
  definition: ReportDefinitionInput,
  fieldsByName: ReadonlyMap<string, DatasetSchema['fields'][number]>,
): void {
  if (definition.sort === undefined) {
    return;
  }

  const field = fieldsByName.get(definition.sort.field);
  const canSortTimeSeriesByPeriod =
    definition.kind === 'time_series' &&
    definition.sort.field === definition.period.field;
  const canSortByGroup = definition.groupBy.includes(definition.sort.field);

  if (
    field === undefined ||
    !field.sortable ||
    (!canSortByGroup && !canSortTimeSeriesByPeriod)
  ) {
    throw new SourceError(
      SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
      'Report sort field is not available in the result',
      { context: { field: definition.sort.field } },
    );
  }
}

function addMeasureSelectorFilters(
  definitionFilters: readonly DataFilter[],
  measures: readonly MeasureDefinition[],
): readonly DataFilter[] {
  const filters = [...definitionFilters];
  const existingFields = new Set(filters.map((filter) => filter.field));
  const selectorsByField = new Map<string, FilterValue[]>();

  for (const measure of measures) {
    if (measure.selector === undefined) {
      continue;
    }

    if (existingFields.has(measure.selector.field)) {
      throw invalidDefinition(
        'Measure selector fields must not be filtered directly',
        { field: measure.selector.field },
      );
    }

    const values = selectorsByField.get(measure.selector.field) ?? [];
    if (!values.includes(measure.selector.value)) {
      values.push(measure.selector.value);
    }
    selectorsByField.set(measure.selector.field, values);
  }

  for (const [field, values] of selectorsByField) {
    filters.push(
      values.length === 1
        ? { field, operator: 'eq', value: values[0] as FilterValue }
        : { field, operator: 'in', value: values },
    );
  }

  return filters;
}

function assertKnownPointLimit(
  definition: ReportDefinitionInput,
  filters: readonly DataFilter[],
  yearCount: number,
): void {
  let groupCount = 1;

  for (const groupField of definition.groupBy) {
    const filter = filters.find((item) => item.field === groupField);

    if (filter === undefined) {
      return;
    }

    groupCount *= filter.operator === 'eq' ? 1 : filter.value.length;
  }

  if (groupCount > MAX_GROUPS) {
    throw limitExceeded('Report exceeds the group limit', {
      groupCount,
      maxGroups: MAX_GROUPS,
    });
  }

  const expectedPoints = groupCount * definition.measures.length * yearCount;

  if (expectedPoints > MAX_POINTS) {
    throw limitExceeded('Report exceeds the observation limit', {
      expectedPoints,
      maxPoints: MAX_POINTS,
    });
  }
}

function invalidDefinition(
  message: string,
  context: Readonly<Record<string, SourceErrorContextValue>> = {},
  cause?: unknown,
): SourceError {
  return new SourceError(SOURCE_ERROR_CODE.INVALID_REPORT_DEFINITION, message, {
    cause,
    context,
  });
}

function limitExceeded(
  message: string,
  context: Readonly<Record<string, SourceErrorContextValue>>,
): SourceError {
  return new SourceError(SOURCE_ERROR_CODE.REPORT_LIMIT_EXCEEDED, message, {
    context,
  });
}
