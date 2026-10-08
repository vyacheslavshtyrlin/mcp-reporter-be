import type { DataQuery } from './data-query.js';
import type {
  DatasetSchema,
  DatasetSummary,
  DimensionValue,
  MeasureDefinition,
} from './dataset-schema.js';
import type { RecordBatch } from './record-batch.js';

export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface DimensionValuesRequest {
  readonly datasetId: string;
  readonly field: string;
  readonly query?: string;
  readonly cursor?: string;
  readonly limit: number;
}

export interface MeasuresRequest {
  readonly datasetId: string;
  readonly query?: string;
  readonly cursor?: string;
  readonly limit: number;
}

export interface DatasetCatalog {
  listDatasets(signal?: AbortSignal): Promise<readonly DatasetSummary[]>;

  describeDataset(
    datasetId: string,
    signal?: AbortSignal,
  ): Promise<DatasetSchema>;
}

export interface DatasetValuesCatalog {
  listDimensionValues(
    request: DimensionValuesRequest,
    signal?: AbortSignal,
  ): Promise<CursorPage<DimensionValue>>;

  listMeasures(
    request: MeasuresRequest,
    signal?: AbortSignal,
  ): Promise<CursorPage<MeasureDefinition>>;
}

export interface RecordSource {
  fetchRecords(query: DataQuery, signal: AbortSignal): Promise<RecordBatch>;
}

export interface DataSourceAdapter
  extends DatasetCatalog, DatasetValuesCatalog, RecordSource {
  readonly sourceId: string;
}
