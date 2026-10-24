import { z } from 'zod';

import { EXECUTION_ERROR_CODE } from '../execution/execution.error.js';
import { reportDefinitionSchema } from '../reports/report-definition.schema.js';
import { SOURCE_ERROR_CODE } from '../sources/contracts/index.js';

const idSchema = z.string().min(1).max(100);
const cursorSchema = z.string().min(1).max(2_048).optional();
export const pageLimitSchema = z.number().int().min(1).max(100).default(20);

const dataValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const dataRecordSchema = z.record(z.string(), dataValueSchema);
const filterOperatorSchema = z.enum(['eq', 'in']);

const fieldDefinitionSchema = z
  .object({
    name: z.string(),
    label: z.string(),
    role: z.enum(['dimension', 'temporal', 'measure']),
    dataType: z.enum(['string', 'number', 'integer', 'boolean']),
    nullable: z.boolean(),
    filterOperators: z.array(filterOperatorSchema),
    sortable: z.boolean(),
  })
  .strict();

const measureDefinitionSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    valueField: z.string(),
    selector: z
      .object({ field: z.string(), value: z.string() })
      .strict()
      .optional(),
    unit: z.string(),
    semanticType: z.enum([
      'count',
      'currency_per_capita',
      'percentage',
      'temperature',
      'other',
    ]),
    allowedOperations: z.array(
      z.enum([
        'time_series',
        'period_change',
        'ranking',
        'sum',
        'average',
        'count',
      ]),
    ),
  })
  .strict();

const datasetSummarySchema = z
  .object({
    sourceId: z.string(),
    datasetId: z.string(),
    title: z.string(),
    description: z.string(),
    schemaVersion: z.number().int(),
  })
  .strict();

const datasetSchema = z
  .object({
    sourceId: z.string(),
    datasetId: z.string(),
    version: z.number().int(),
    title: z.string(),
    description: z.string(),
    temporalField: z.string(),
    keyFields: z.array(z.string()),
    fields: z.array(fieldDefinitionSchema),
    measures: z.array(measureDefinitionSchema),
    capabilities: z
      .object({
        filterOperators: z.array(filterOperatorSchema),
        supportsYearRange: z.boolean(),
        supportsFieldSelection: z.boolean(),
        searchableDimensions: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

const dimensionValueSchema = z
  .object({ value: z.string(), label: z.string() })
  .strict();

const coverageSchema = z
  .object({
    expectedPoints: z.number().int().nonnegative(),
    availablePoints: z.number().int().nonnegative(),
    missingPoints: z.number().int().nonnegative(),
  })
  .strict();

const warningSchema = z
  .object({
    code: z.enum(['MISSING_OBSERVATION', 'SOURCE_FOOTNOTE', 'SOURCE_STATUS']),
    recordKey: dataRecordSchema.optional(),
    details: dataRecordSchema,
  })
  .strict();

const provenanceSchema = z
  .object({
    sourceId: z.string(),
    sourceDatasetId: z.string(),
    retrievedAt: z.string(),
    sourceUpdatedAt: z.string().nullable(),
    pagesFetched: z.number().int().nonnegative(),
    retrieval: z.enum(['live', 'cache']),
  })
  .strict();

const reportResultMetadataSchema = z
  .object({
    kind: z.enum(['time_series', 'period_change']),
    engineVersion: z.literal('1'),
    coverage: coverageSchema,
    warnings: z.array(warningSchema),
    provenance: provenanceSchema,
    transportComplete: z.literal(true),
  })
  .strict();

const reportGroupSchema = z.record(z.string(), dataValueSchema);
const timeSeriesRowSchema = z
  .object({
    group: reportGroupSchema,
    year: z.number().int(),
    measureId: z.string(),
    unit: z.string(),
    value: z.number().finite().nullable(),
    availability: z.enum(['available', 'null', 'absent']),
  })
  .strict();

const endpointSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('available'),
      year: z.number().int(),
      value: z.number().finite(),
    })
    .strict(),
  z
    .object({
      status: z.literal('unavailable'),
      year: z.number().int(),
      value: z.null(),
      reason: z.enum(['OBSERVATION_ABSENT', 'VALUE_NULL']),
    })
    .strict(),
]);

const changeKindSchema = z.enum([
  'absolute',
  'percentage_points',
  'relative_percent',
]);
const changeSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('available'),
      kind: changeKindSchema,
      value: z.number().finite(),
    })
    .strict(),
  z
    .object({
      status: z.literal('unavailable'),
      kind: changeKindSchema,
      reason: z.enum([
        'START_OBSERVATION_ABSENT',
        'START_VALUE_NULL',
        'END_OBSERVATION_ABSENT',
        'END_VALUE_NULL',
        'NON_POSITIVE_START',
      ]),
    })
    .strict(),
]);

const periodChangeRowSchema = z
  .object({
    group: reportGroupSchema,
    measureId: z.string(),
    unit: z.string(),
    start: endpointSchema,
    end: endpointSchema,
    change: changeSchema,
    relativeChangePercent: changeSchema,
  })
  .strict();

const reportRunBaseSchema = z.object({
  id: z.string().uuid(),
  definition: reportDefinitionSchema,
  createdAt: z.string(),
});
const runErrorSchema = z
  .object({
    code: z.union([z.enum(SOURCE_ERROR_CODE), z.enum(EXECUTION_ERROR_CODE)]),
    message: z.string(),
    retryable: z.boolean(),
  })
  .strict();
const reportRunSummarySchema = z.discriminatedUnion('status', [
  reportRunBaseSchema.extend({ status: z.literal('queued') }).strict(),
  reportRunBaseSchema
    .extend({ status: z.literal('running'), startedAt: z.string() })
    .strict(),
  reportRunBaseSchema
    .extend({
      status: z.literal('completed'),
      startedAt: z.string(),
      finishedAt: z.string(),
      result: reportResultMetadataSchema,
    })
    .strict(),
  reportRunBaseSchema
    .extend({
      status: z.literal('failed'),
      startedAt: z.string(),
      finishedAt: z.string(),
      error: runErrorSchema,
    })
    .strict(),
]);

export const listDatasetsInputSchema = z
  .object({ sourceId: idSchema, limit: pageLimitSchema })
  .strict();
export const describeDatasetInputSchema = z
  .object({ sourceId: idSchema, datasetId: idSchema })
  .strict();
export const listDimensionValuesInputSchema = z
  .object({
    sourceId: idSchema,
    datasetId: idSchema,
    field: idSchema,
    query: z.string().min(1).max(100).optional(),
    cursor: cursorSchema,
    limit: pageLimitSchema,
  })
  .strict();
export const listMeasuresInputSchema = z
  .object({
    sourceId: idSchema,
    datasetId: idSchema,
    query: z.string().min(1).max(100).optional(),
    cursor: cursorSchema,
    limit: pageLimitSchema,
  })
  .strict();
export const runReportInputSchema = z
  .object({ definition: reportDefinitionSchema, limit: pageLimitSchema })
  .strict();
export const getReportRunInputSchema = z
  .object({
    runId: z.string().uuid(),
    cursor: cursorSchema,
    limit: pageLimitSchema,
  })
  .strict();

const safeErrorSchema = z
  .object({ code: z.string(), message: z.string(), retryable: z.boolean() })
  .strict();

export function toolOutputSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data }).strict(),
    z.object({ ok: z.literal(false), error: safeErrorSchema }).strict(),
  ]);
}

export const listDatasetsOutputSchema = toolOutputSchema(
  z
    .object({
      datasets: z.array(datasetSummarySchema),
      truncated: z.boolean(),
    })
    .strict(),
);
export const describeDatasetOutputSchema = toolOutputSchema(
  z.object({ dataset: datasetSchema }).strict(),
);
export const listDimensionValuesOutputSchema = toolOutputSchema(
  z
    .object({
      items: z.array(dimensionValueSchema),
      nextCursor: z.string().nullable(),
    })
    .strict(),
);
export const listMeasuresOutputSchema = toolOutputSchema(
  z
    .object({
      items: z.array(measureDefinitionSchema),
      nextCursor: z.string().nullable(),
    })
    .strict(),
);
export const reportRunPageOutputSchema = toolOutputSchema(
  z
    .object({
      run: reportRunSummarySchema,
      rows: z.array(z.union([timeSeriesRowSchema, periodChangeRowSchema])),
      nextCursor: z.string().nullable(),
    })
    .strict(),
);
