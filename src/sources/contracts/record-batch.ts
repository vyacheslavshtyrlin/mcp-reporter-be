import type { DataValue } from './data-query.js';

export type DataRecord = Readonly<Record<string, DataValue>>;

export type RecordKey = Readonly<Record<string, DataValue>>;

export type DataQualityWarningCode =
  'MISSING_OBSERVATION' | 'SOURCE_FOOTNOTE' | 'SOURCE_STATUS';

export interface DataQualityWarning {
  readonly code: DataQualityWarningCode;
  readonly recordKey?: RecordKey;
  readonly details: Readonly<Record<string, DataValue>>;
}

export interface DataCoverage {
  readonly expectedPoints: number;
  readonly availablePoints: number;
  readonly missingPoints: number;
}

export interface SourceProvenance {
  readonly sourceId: string;
  readonly sourceDatasetId: string;
  readonly retrievedAt: string;
  readonly sourceUpdatedAt: string | null;
  readonly pagesFetched: number;
  readonly retrieval: 'live' | 'cache';
}

export interface RecordBatch {
  readonly records: readonly DataRecord[];
  readonly schemaVersion: number;
  readonly provenance: SourceProvenance;
  readonly transportComplete: true;
  readonly coverage: DataCoverage;
  readonly warnings: readonly DataQualityWarning[];
}
