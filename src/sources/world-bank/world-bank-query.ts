import { z } from 'zod';

import type { DataQuery } from '../contracts/data-query.js';
import { SOURCE_ERROR_CODE, SourceError } from '../contracts/source.error.js';
import {
  WORLD_BANK_DATASET_ID,
  WORLD_BANK_MEASURES,
  WORLD_BANK_RECORD_FIELDS,
  WORLD_BANK_SCHEMA_VERSION,
  WORLD_BANK_SOURCE_ID,
} from './world-bank-catalog.js';

const MAX_COUNTRIES = 10;
const MAX_MEASURES = 5;
const MAX_YEARS = 30;
const MAX_POINTS = 1_500;

const filterValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
]);

const dataQuerySchema = z
  .object({
    sourceId: z.string(),
    datasetId: z.string(),
    schemaVersion: z.number().int().positive(),
    filters: z.array(
      z.discriminatedUnion('operator', [
        z.object({
          field: z.string(),
          operator: z.literal('eq'),
          value: filterValueSchema,
        }),
        z.object({
          field: z.string(),
          operator: z.literal('in'),
          value: z.array(filterValueSchema).min(1),
        }),
      ]),
    ),
    period: z.object({
      field: z.string(),
      fromYear: z.number().int().min(1).max(9_999),
      toYear: z.number().int().min(1).max(9_999),
    }),
    fields: z.array(z.string()).min(1),
  })
  .strict();

export interface WorldBankQuerySelection {
  readonly countryCodes: readonly string[];
  readonly indicatorCodes: readonly string[];
  readonly fromYear: number;
  readonly toYear: number;
  readonly expectedPoints: number;
}

export function validateWorldBankQuery(
  query: DataQuery,
): WorldBankQuerySelection {
  const result = dataQuerySchema.safeParse(query);

  if (!result.success) {
    throw invalidQuery('Data query does not match the runtime contract', {
      cause: result.error,
      context: { issueCount: result.error.issues.length },
    });
  }

  const parsed = result.data;

  if (parsed.sourceId !== WORLD_BANK_SOURCE_ID) {
    throw new SourceError(
      SOURCE_ERROR_CODE.SOURCE_NOT_FOUND,
      'Data query targets a different source',
      { context: { sourceId: parsed.sourceId } },
    );
  }

  if (parsed.datasetId !== WORLD_BANK_DATASET_ID) {
    throw new SourceError(
      SOURCE_ERROR_CODE.DATASET_NOT_FOUND,
      'World Bank dataset is not supported',
      {
        context: {
          sourceId: WORLD_BANK_SOURCE_ID,
          datasetId: parsed.datasetId,
        },
      },
    );
  }

  if (parsed.schemaVersion !== WORLD_BANK_SCHEMA_VERSION) {
    throw new SourceError(
      SOURCE_ERROR_CODE.SCHEMA_VERSION_MISMATCH,
      'World Bank schema version does not match',
      {
        context: {
          sourceId: WORLD_BANK_SOURCE_ID,
          requestedVersion: parsed.schemaVersion,
          currentVersion: WORLD_BANK_SCHEMA_VERSION,
        },
      },
    );
  }

  if (parsed.period.field !== 'year') {
    throw new SourceError(
      SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
      'World Bank supports a period only over the year field',
      { context: { field: parsed.period.field } },
    );
  }

  if (parsed.period.fromYear > parsed.period.toYear) {
    throw invalidQuery('Period start must not be after period end');
  }

  assertExactFields(parsed.fields);

  const filtersByField = new Map<string, readonly string[]>();

  for (const filter of parsed.filters) {
    if (filter.field !== 'countryCode' && filter.field !== 'indicatorCode') {
      throw new SourceError(
        SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
        'World Bank does not support the requested filter field',
        { context: { field: filter.field } },
      );
    }

    if (filtersByField.has(filter.field)) {
      throw invalidQuery('A field must not have multiple filters', {
        context: { field: filter.field },
      });
    }

    const rawValues = filter.operator === 'eq' ? [filter.value] : filter.value;

    const values = rawValues.filter(
      (value): value is string => typeof value === 'string',
    );

    if (values.length !== rawValues.length) {
      throw invalidQuery('World Bank dimension filters require string values', {
        context: { field: filter.field },
      });
    }

    if (values.some((value) => value.length === 0)) {
      throw invalidQuery('World Bank dimension values must not be empty', {
        context: { field: filter.field },
      });
    }

    const uniqueValues = [...new Set(values)];

    if (uniqueValues.length !== values.length) {
      throw invalidQuery('World Bank dimension values must be unique', {
        context: { field: filter.field },
      });
    }

    filtersByField.set(filter.field, uniqueValues);
  }

  const countryCodes = filtersByField.get('countryCode');
  const indicatorCodes = filtersByField.get('indicatorCode');

  if (countryCodes === undefined || indicatorCodes === undefined) {
    throw invalidQuery(
      'World Bank query requires countryCode and indicatorCode filters',
    );
  }

  if (countryCodes.some((code) => !/^[A-Z]{3}$/.test(code))) {
    throw invalidQuery('Country codes must be ISO alpha-3 uppercase values');
  }

  const supportedMeasures = new Set<string>(
    WORLD_BANK_MEASURES.map((measure) => measure.id),
  );
  const unknownMeasure = indicatorCodes.find(
    (indicatorCode) => !supportedMeasures.has(indicatorCode),
  );

  if (unknownMeasure !== undefined) {
    throw new SourceError(
      SOURCE_ERROR_CODE.UNKNOWN_MEASURE,
      'World Bank measure is not supported',
      { context: { measureId: unknownMeasure } },
    );
  }

  const years = parsed.period.toYear - parsed.period.fromYear + 1;

  assertLimit(countryCodes.length, MAX_COUNTRIES, 'countries');
  assertLimit(indicatorCodes.length, MAX_MEASURES, 'measures');
  assertLimit(years, MAX_YEARS, 'years');

  const expectedPoints = countryCodes.length * indicatorCodes.length * years;
  assertLimit(expectedPoints, MAX_POINTS, 'points');

  return {
    countryCodes,
    indicatorCodes,
    fromYear: parsed.period.fromYear,
    toYear: parsed.period.toYear,
    expectedPoints,
  };
}

function assertExactFields(fields: readonly string[]): void {
  const uniqueFields = new Set(fields);
  const hasExactFields =
    uniqueFields.size === fields.length &&
    uniqueFields.size === WORLD_BANK_RECORD_FIELDS.length &&
    WORLD_BANK_RECORD_FIELDS.every((field) => uniqueFields.has(field));

  if (!hasExactFields) {
    throw new SourceError(
      SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
      'World Bank schema does not support field selection',
      { context: { fieldCount: fields.length } },
    );
  }
}

function assertLimit(actual: number, limit: number, limitName: string): void {
  if (actual > limit) {
    throw new SourceError(
      SOURCE_ERROR_CODE.REPORT_LIMIT_EXCEEDED,
      'World Bank query exceeds an application limit',
      { context: { limitName, actual, limit } },
    );
  }
}

function invalidQuery(
  message: string,
  options: {
    readonly cause?: unknown;
    readonly context?: Readonly<Record<string, string | number>>;
  } = {},
): SourceError {
  return new SourceError(SOURCE_ERROR_CODE.INVALID_REPORT_DEFINITION, message, {
    cause: options.cause,
    context: options.context,
  });
}
