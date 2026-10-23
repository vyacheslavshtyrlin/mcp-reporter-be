import { z } from 'zod';

import type { ReportDefinitionInput } from './report.models.js';

const filterValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
]);

const dataFilterSchema = z.discriminatedUnion('operator', [
  z
    .object({
      field: z.string().min(1),
      operator: z.literal('eq'),
      value: filterValueSchema,
    })
    .strict(),
  z
    .object({
      field: z.string().min(1),
      operator: z.literal('in'),
      value: z.array(filterValueSchema).min(1),
    })
    .strict(),
]);

const periodSchema = z
  .object({
    field: z.string().min(1),
    fromYear: z.number().int().min(1).max(9_999),
    toYear: z.number().int().min(1).max(9_999),
  })
  .strict()
  .refine((period) => period.fromYear <= period.toYear, {
    message: 'Period start must not be after period end',
    path: ['toYear'],
  });

export const reportDefinitionSchema = z
  .object({
    sourceId: z.string().min(1),
    datasetId: z.string().min(1),
    schemaVersion: z.number().int().positive(),
    kind: z.enum(['time_series', 'period_change']),
    filters: z.array(dataFilterSchema).min(1),
    groupBy: z.array(z.string().min(1)).min(1),
    measures: z.array(z.object({ id: z.string().min(1) }).strict()).min(1),
    period: periodSchema,
    missingPolicy: z.literal('strict_endpoints'),
    sort: z
      .object({
        field: z.string().min(1),
        direction: z.enum(['asc', 'desc']),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((definition, context) => {
    definition.filters.forEach((filter, index) => {
      if (filter.operator === 'in') {
        addUniqueIssue(
          filter.value,
          ['filters', index, 'value'],
          'Filter values must be unique',
          context,
        );
      }
    });
    addUniqueIssue(
      definition.filters.map((filter) => filter.field),
      ['filters'],
      'Filter fields must be unique',
      context,
    );
    addUniqueIssue(
      definition.groupBy,
      ['groupBy'],
      'Group fields must be unique',
      context,
    );
    addUniqueIssue(
      definition.measures.map((measure) => measure.id),
      ['measures'],
      'Measure IDs must be unique',
      context,
    );
  });

export function parseReportDefinition(input: unknown): ReportDefinitionInput {
  return reportDefinitionSchema.parse(input);
}

function addUniqueIssue(
  values: readonly unknown[],
  path: readonly PropertyKey[],
  message: string,
  context: z.RefinementCtx,
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: 'custom', message, path: [...path] });
  }
}
