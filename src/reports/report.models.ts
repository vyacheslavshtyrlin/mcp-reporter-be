import type {
  DataCoverage,
  DataFilter,
  DataPeriod,
  DataQualityWarning,
  DataQuery,
  DataRecord,
  DataValue,
  DatasetSchema,
  MeasureDefinition,
  SourceProvenance,
} from '../sources/contracts/index.js';

export const REPORT_ENGINE_VERSION = '1' as const;

export type ReportKind = 'time_series' | 'period_change';

export interface ReportMeasureInput {
  readonly id: string;
}

export interface ReportSort {
  readonly field: string;
  readonly direction: 'asc' | 'desc';
}

export interface ReportDefinitionInput {
  readonly sourceId: string;
  readonly datasetId: string;
  readonly schemaVersion: number;
  readonly kind: ReportKind;
  readonly filters: readonly DataFilter[];
  readonly groupBy: readonly string[];
  readonly measures: readonly ReportMeasureInput[];
  readonly period: DataPeriod;
  readonly missingPolicy: 'strict_endpoints';
  readonly sort?: ReportSort;
}

export interface ValidatedReportPlan {
  readonly definition: ReportDefinitionInput;
  readonly schema: DatasetSchema;
  readonly measures: readonly MeasureDefinition[];
  readonly query: DataQuery;
}

export type ReportGroup = Readonly<Record<string, DataValue>>;

export type ObservationAvailability = 'available' | 'null' | 'absent';

export interface TimeSeriesRow {
  readonly group: ReportGroup;
  readonly year: number;
  readonly measureId: string;
  readonly unit: string;
  readonly value: number | null;
  readonly availability: ObservationAvailability;
}

export type EndpointUnavailableReason = 'OBSERVATION_ABSENT' | 'VALUE_NULL';

export type ChangeUnavailableReason =
  | 'START_OBSERVATION_ABSENT'
  | 'START_VALUE_NULL'
  | 'END_OBSERVATION_ABSENT'
  | 'END_VALUE_NULL'
  | 'NON_POSITIVE_START';

export interface AvailableEndpoint {
  readonly status: 'available';
  readonly year: number;
  readonly value: number;
}

export interface UnavailableEndpoint {
  readonly status: 'unavailable';
  readonly year: number;
  readonly value: null;
  readonly reason: EndpointUnavailableReason;
}

export type PeriodEndpoint = AvailableEndpoint | UnavailableEndpoint;

export type PrimaryChangeKind = 'absolute' | 'percentage_points';

export interface AvailableChange {
  readonly status: 'available';
  readonly kind: PrimaryChangeKind | 'relative_percent';
  readonly value: number;
}

export interface UnavailableChange {
  readonly status: 'unavailable';
  readonly kind: PrimaryChangeKind | 'relative_percent';
  readonly reason: ChangeUnavailableReason;
}

export type ChangeValue = AvailableChange | UnavailableChange;

export interface PeriodChangeRow {
  readonly group: ReportGroup;
  readonly measureId: string;
  readonly unit: string;
  readonly start: PeriodEndpoint;
  readonly end: PeriodEndpoint;
  readonly change: ChangeValue;
  readonly relativeChangePercent: ChangeValue;
}

interface BaseReportResult {
  readonly engineVersion: typeof REPORT_ENGINE_VERSION;
  readonly coverage: DataCoverage;
  readonly warnings: readonly DataQualityWarning[];
  readonly provenance: SourceProvenance;
  readonly transportComplete: true;
  readonly sourceRecords: readonly DataRecord[];
}

export interface TimeSeriesResult extends BaseReportResult {
  readonly kind: 'time_series';
  readonly rows: readonly TimeSeriesRow[];
}

export interface PeriodChangeResult extends BaseReportResult {
  readonly kind: 'period_change';
  readonly rows: readonly PeriodChangeRow[];
}

export type ReportResult = TimeSeriesResult | PeriodChangeResult;
