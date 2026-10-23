import { Injectable } from '@nestjs/common';

import type {
  CursorPage,
  DatasetSchema,
  DatasetSummary,
  DimensionValue,
  DimensionValuesRequest,
  MeasureDefinition,
  MeasuresRequest,
} from '../sources/contracts/index.js';
import { SourceRegistry } from '../sources/source-registry.js';

export interface DatasetCatalogSummary extends DatasetSummary {
  readonly sourceId: string;
}

@Injectable()
export class DatasetCatalogService {
  constructor(private readonly sources: SourceRegistry) {}

  async listDatasets(
    sourceId: string,
    signal?: AbortSignal,
  ): Promise<readonly DatasetCatalogSummary[]> {
    const datasets = await this.sources.get(sourceId).listDatasets(signal);

    return datasets.map((dataset) => ({ sourceId, ...dataset }));
  }

  describeDataset(
    sourceId: string,
    datasetId: string,
    signal?: AbortSignal,
  ): Promise<DatasetSchema> {
    return this.sources.get(sourceId).describeDataset(datasetId, signal);
  }

  listDimensionValues(
    sourceId: string,
    request: DimensionValuesRequest,
    signal?: AbortSignal,
  ): Promise<CursorPage<DimensionValue>> {
    return this.sources.get(sourceId).listDimensionValues(request, signal);
  }

  listMeasures(
    sourceId: string,
    request: MeasuresRequest,
    signal?: AbortSignal,
  ): Promise<CursorPage<MeasureDefinition>> {
    return this.sources.get(sourceId).listMeasures(request, signal);
  }
}
