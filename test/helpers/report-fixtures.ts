import type {
  DataRecord,
  DatasetSchema,
  RecordBatch,
} from '../../src/sources/contracts/index.js';
import { ReportDefinitionService } from '../../src/reports/report-definition.service.js';
import type {
  ReportDefinitionInput,
  ReportKind,
  ValidatedReportPlan,
} from '../../src/reports/report.models.js';

export const REPORT_TEST_SCHEMA: DatasetSchema = {
  sourceId: 'fixture',
  datasetId: 'climate',
  version: 1,
  title: 'Climate fixture',
  description: 'Deterministic report calculation fixture',
  temporalField: 'year',
  keyFields: ['countryCode', 'indicatorCode', 'year'],
  fields: [
    {
      name: 'sourceId',
      label: 'Source',
      role: 'dimension',
      dataType: 'string',
      nullable: false,
      filterOperators: [],
      sortable: false,
    },
    {
      name: 'sourceDatasetId',
      label: 'Dataset',
      role: 'dimension',
      dataType: 'string',
      nullable: false,
      filterOperators: [],
      sortable: false,
    },
    {
      name: 'countryCode',
      label: 'Country',
      role: 'dimension',
      dataType: 'string',
      nullable: false,
      filterOperators: ['eq', 'in'],
      sortable: true,
    },
    {
      name: 'indicatorCode',
      label: 'Indicator',
      role: 'dimension',
      dataType: 'string',
      nullable: false,
      filterOperators: ['eq', 'in'],
      sortable: true,
    },
    {
      name: 'year',
      label: 'Year',
      role: 'temporal',
      dataType: 'integer',
      nullable: false,
      filterOperators: [],
      sortable: true,
    },
    {
      name: 'value',
      label: 'Value',
      role: 'measure',
      dataType: 'number',
      nullable: true,
      filterOperators: [],
      sortable: true,
    },
  ],
  measures: [
    {
      id: 'POP',
      label: 'Population',
      description: 'Population fixture',
      valueField: 'value',
      selector: { field: 'indicatorCode', value: 'POP' },
      unit: 'people',
      semanticType: 'count',
      allowedOperations: ['time_series', 'period_change'],
    },
    {
      id: 'RATE',
      label: 'Rate',
      description: 'Percentage fixture',
      valueField: 'value',
      selector: { field: 'indicatorCode', value: 'RATE' },
      unit: '%',
      semanticType: 'percentage',
      allowedOperations: ['time_series', 'period_change'],
    },
  ],
  capabilities: {
    filterOperators: ['eq', 'in'],
    supportsYearRange: true,
    supportsFieldSelection: false,
    searchableDimensions: ['countryCode'],
  },
};

export function reportDefinition(
  overrides: Partial<ReportDefinitionInput> = {},
): ReportDefinitionInput {
  return {
    sourceId: 'fixture',
    datasetId: 'climate',
    schemaVersion: 1,
    kind: 'time_series',
    filters: [
      {
        field: 'countryCode',
        operator: 'in',
        value: ['DEU', 'FIN'],
      },
    ],
    groupBy: ['countryCode'],
    measures: [{ id: 'POP' }, { id: 'RATE' }],
    period: { field: 'year', fromYear: 2020, toYear: 2022 },
    missingPolicy: 'strict_endpoints',
    ...overrides,
  };
}

export function validatedPlan(
  kind: ReportKind,
  overrides: Partial<ReportDefinitionInput> = {},
  schema: DatasetSchema = REPORT_TEST_SCHEMA,
): ValidatedReportPlan {
  return new ReportDefinitionService().validateAndPlan(
    reportDefinition({ kind, ...overrides }),
    schema,
  );
}

export function recordBatch(
  records: readonly DataRecord[],
  overrides: Partial<RecordBatch> = {},
): RecordBatch {
  const availablePoints = records.filter(
    (record) => typeof record.value === 'number',
  ).length;

  return {
    records,
    schemaVersion: 1,
    provenance: {
      sourceId: 'fixture',
      sourceDatasetId: 'climate',
      retrievedAt: '2026-10-23T10:00:00.000Z',
      sourceUpdatedAt: '2026-10-22',
      pagesFetched: 1,
      retrieval: 'live',
    },
    transportComplete: true,
    coverage: {
      expectedPoints: records.length,
      availablePoints,
      missingPoints: records.length - availablePoints,
    },
    warnings: [],
    ...overrides,
  };
}

export function observation(
  countryCode: string,
  indicatorCode: string,
  year: number,
  value: number | null,
): DataRecord {
  return {
    sourceId: 'fixture',
    sourceDatasetId: 'climate',
    countryCode,
    indicatorCode,
    year,
    value,
  };
}
