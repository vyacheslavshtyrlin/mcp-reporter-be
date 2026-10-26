import {
  REPORT_TEST_SCHEMA,
  reportDefinition,
} from '../../test/helpers/report-fixtures.js';
import { SOURCE_ERROR_CODE } from '../sources/contracts/index.js';
import { ReportDefinitionService } from './report-definition.service.js';

describe('ReportDefinitionService', () => {
  const service = new ReportDefinitionService();

  it('validates semantics and builds a generic query with measure selectors', () => {
    const plan = service.validateAndPlan(
      reportDefinition(),
      REPORT_TEST_SCHEMA,
    );

    expect(plan.measures.map((measure) => measure.id)).toEqual(['POP', 'RATE']);
    expect(plan.query).toEqual({
      sourceId: 'fixture',
      datasetId: 'climate',
      schemaVersion: 1,
      filters: [
        {
          field: 'countryCode',
          operator: 'in',
          value: ['DEU', 'FIN'],
        },
        {
          field: 'indicatorCode',
          operator: 'in',
          value: ['POP', 'RATE'],
        },
      ],
      period: { field: 'year', fromYear: 2020, toYear: 2022 },
      fields: REPORT_TEST_SCHEMA.fields.map((field) => field.name),
    });
  });

  it('uses an equality selector filter for one measure', () => {
    const plan = service.validateAndPlan(
      reportDefinition({ measures: [{ id: 'POP' }] }),
      REPORT_TEST_SCHEMA,
    );

    expect(plan.query.filters.at(-1)).toEqual({
      field: 'indicatorCode',
      operator: 'eq',
      value: 'POP',
    });
  });

  it.each([
    {
      name: 'malformed structure',
      definition: { ...reportDefinition(), measures: [] },
      schema: REPORT_TEST_SCHEMA,
      code: SOURCE_ERROR_CODE.INVALID_REPORT_DEFINITION,
    },
    {
      name: 'another source',
      definition: reportDefinition({ sourceId: 'other' }),
      schema: REPORT_TEST_SCHEMA,
      code: SOURCE_ERROR_CODE.SOURCE_NOT_FOUND,
    },
    {
      name: 'another dataset',
      definition: reportDefinition({ datasetId: 'other' }),
      schema: REPORT_TEST_SCHEMA,
      code: SOURCE_ERROR_CODE.DATASET_NOT_FOUND,
    },
    {
      name: 'an obsolete schema version',
      definition: reportDefinition({ schemaVersion: 2 }),
      schema: REPORT_TEST_SCHEMA,
      code: SOURCE_ERROR_CODE.SCHEMA_VERSION_MISMATCH,
    },
    {
      name: 'an unknown filter field',
      definition: reportDefinition({
        filters: [{ field: 'unknown', operator: 'eq', value: 'x' }],
      }),
      schema: REPORT_TEST_SCHEMA,
      code: SOURCE_ERROR_CODE.INVALID_REPORT_DEFINITION,
    },
    {
      name: 'an unsupported filter operator',
      definition: reportDefinition({
        filters: [{ field: 'countryCode', operator: 'eq', value: 'DEU' }],
      }),
      schema: {
        ...REPORT_TEST_SCHEMA,
        fields: REPORT_TEST_SCHEMA.fields.map((field) =>
          field.name === 'countryCode'
            ? { ...field, filterOperators: [] }
            : field,
        ),
      },
      code: SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
    },
    {
      name: 'an operator disabled by dataset capabilities',
      definition: reportDefinition(),
      schema: {
        ...REPORT_TEST_SCHEMA,
        capabilities: {
          ...REPORT_TEST_SCHEMA.capabilities,
          filterOperators: ['eq'] as const,
        },
      },
      code: SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
    },
    {
      name: 'a filter value with the wrong field type',
      definition: reportDefinition({
        filters: [{ field: 'countryCode', operator: 'eq', value: true }],
      }),
      schema: REPORT_TEST_SCHEMA,
      code: SOURCE_ERROR_CODE.INVALID_REPORT_DEFINITION,
    },
    {
      name: 'a non-dimension group field',
      definition: reportDefinition({ groupBy: ['value'] }),
      schema: REPORT_TEST_SCHEMA,
      code: SOURCE_ERROR_CODE.INVALID_REPORT_DEFINITION,
    },
    {
      name: 'an unsupported period field',
      definition: reportDefinition({
        period: { field: 'createdAt', fromYear: 2020, toYear: 2022 },
      }),
      schema: REPORT_TEST_SCHEMA,
      code: SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
    },
    {
      name: 'an unknown measure',
      definition: reportDefinition({ measures: [{ id: 'UNKNOWN' }] }),
      schema: REPORT_TEST_SCHEMA,
      code: SOURCE_ERROR_CODE.UNKNOWN_MEASURE,
    },
    {
      name: 'an unsupported measure operation',
      definition: reportDefinition({ kind: 'period_change' }),
      schema: {
        ...REPORT_TEST_SCHEMA,
        measures: REPORT_TEST_SCHEMA.measures.map((measure) => ({
          ...measure,
          allowedOperations: ['time_series'] as const,
        })),
      },
      code: SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
    },
    {
      name: 'a direct measure selector filter',
      definition: reportDefinition({
        filters: [
          { field: 'countryCode', operator: 'eq', value: 'DEU' },
          { field: 'indicatorCode', operator: 'eq', value: 'POP' },
        ],
      }),
      schema: REPORT_TEST_SCHEMA,
      code: SOURCE_ERROR_CODE.INVALID_REPORT_DEFINITION,
    },
    {
      name: 'a measure selector used as a group field',
      definition: reportDefinition({ groupBy: ['indicatorCode'] }),
      schema: REPORT_TEST_SCHEMA,
      code: SOURCE_ERROR_CODE.INVALID_REPORT_DEFINITION,
    },
    {
      name: 'a selector for an unknown field',
      definition: reportDefinition({ measures: [{ id: 'POP' }] }),
      schema: {
        ...REPORT_TEST_SCHEMA,
        measures: REPORT_TEST_SCHEMA.measures.map((measure) =>
          measure.id === 'POP'
            ? { ...measure, selector: { field: 'unknown', value: 'POP' } }
            : measure,
        ),
      },
      code: SOURCE_ERROR_CODE.INVALID_REPORT_DEFINITION,
    },
    {
      name: 'a combined selector unsupported by its field',
      definition: reportDefinition(),
      schema: {
        ...REPORT_TEST_SCHEMA,
        fields: REPORT_TEST_SCHEMA.fields.map((field) =>
          field.name === 'indicatorCode'
            ? { ...field, filterOperators: ['eq'] as const }
            : field,
        ),
      },
      code: SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
    },
    {
      name: 'an unavailable sort field',
      definition: reportDefinition({
        sort: { field: 'value', direction: 'desc' },
      }),
      schema: REPORT_TEST_SCHEMA,
      code: SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
    },
    {
      name: 'too many years',
      definition: reportDefinition({
        period: { field: 'year', fromYear: 1990, toYear: 2020 },
      }),
      schema: REPORT_TEST_SCHEMA,
      code: SOURCE_ERROR_CODE.REPORT_LIMIT_EXCEEDED,
    },
    {
      name: 'too many groups',
      definition: reportDefinition({
        filters: [
          {
            field: 'countryCode',
            operator: 'in',
            value: Array.from({ length: 11 }, (_, index) => `C${index}`),
          },
        ],
      }),
      schema: REPORT_TEST_SCHEMA,
      code: SOURCE_ERROR_CODE.REPORT_LIMIT_EXCEEDED,
    },
  ])('rejects $name', ({ definition, schema, code }) => {
    expect(() => service.validateAndPlan(definition, schema)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it('allows a sortable period field only for time series', () => {
    expect(() =>
      service.validateAndPlan(
        reportDefinition({ sort: { field: 'year', direction: 'desc' } }),
        REPORT_TEST_SCHEMA,
      ),
    ).not.toThrow();

    expect(() =>
      service.validateAndPlan(
        reportDefinition({
          kind: 'period_change',
          sort: { field: 'year', direction: 'desc' },
        }),
        REPORT_TEST_SCHEMA,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: SOURCE_ERROR_CODE.UNSUPPORTED_OPERATION,
      }),
    );
  });
});
