import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import type {
  DataSourceAdapter,
  DatasetSchema,
  DatasetSummary,
  DimensionValue,
  MeasureDefinition,
} from '../sources/contracts/index.js';
import { SOURCE_ERROR_CODE } from '../sources/contracts/index.js';
import { SourceRegistry } from '../sources/source-registry.js';
import { DATA_SOURCE_ADAPTERS } from '../sources/sources.tokens.js';
import { DatasetCatalogService } from './dataset-catalog.service.js';

interface FakeAdapter {
  readonly adapter: DataSourceAdapter;
  readonly listDatasets: ReturnType<typeof vi.fn>;
  readonly describeDataset: ReturnType<typeof vi.fn>;
  readonly listDimensionValues: ReturnType<typeof vi.fn>;
  readonly listMeasures: ReturnType<typeof vi.fn>;
}

function createFakeAdapter(sourceId: string, datasetId: string): FakeAdapter {
  const summary: DatasetSummary = {
    datasetId,
    title: `${sourceId} dataset`,
    description: 'Fake dataset for catalog contract tests',
    schemaVersion: 1,
  };
  const schema: DatasetSchema = {
    sourceId,
    datasetId,
    version: 1,
    title: summary.title,
    description: summary.description,
    temporalField: 'year',
    keyFields: ['location', 'year'],
    fields: [],
    measures: [],
    capabilities: {
      filterOperators: ['eq'],
      supportsYearRange: true,
      supportsFieldSelection: true,
      searchableDimensions: ['location'],
    },
  };
  const dimensionValue: DimensionValue = {
    value: 'north',
    label: 'North',
  };
  const measure: MeasureDefinition = {
    id: 'temperature',
    label: 'Temperature',
    description: 'Average temperature',
    valueField: 'value',
    unit: '°C',
    semanticType: 'temperature',
    allowedOperations: ['time_series', 'period_change'],
  };
  const listDatasets = vi.fn(async () => [summary]);
  const describeDataset = vi.fn(async () => schema);
  const listDimensionValues = vi.fn(async () => ({
    items: [dimensionValue],
    nextCursor: null,
  }));
  const listMeasures = vi.fn(async () => ({
    items: [measure],
    nextCursor: null,
  }));

  return {
    adapter: {
      sourceId,
      listDatasets,
      describeDataset,
      listDimensionValues,
      listMeasures,
      fetchRecords: async () => {
        throw new Error('Record loading is outside this catalog contract');
      },
    },
    listDatasets,
    describeDataset,
    listDimensionValues,
    listMeasures,
  };
}

describe('DatasetCatalogService contract', () => {
  let module: TestingModule;
  let catalog: DatasetCatalogService;
  let worldBank: FakeAdapter;
  let fixture: FakeAdapter;

  beforeEach(async () => {
    worldBank = createFakeAdapter('world-bank', '2');
    fixture = createFakeAdapter('fixture', 'weather');
    module = await Test.createTestingModule({
      providers: [
        SourceRegistry,
        DatasetCatalogService,
        {
          provide: DATA_SOURCE_ADAPTERS,
          useValue: [worldBank.adapter, fixture.adapter],
        },
      ],
    }).compile();
    catalog = module.get(DatasetCatalogService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('selects an adapter and includes its source ID in dataset summaries', async () => {
    const signal = new AbortController().signal;

    await expect(catalog.listDatasets('fixture', signal)).resolves.toEqual([
      expect.objectContaining({ sourceId: 'fixture', datasetId: 'weather' }),
    ]);
    expect(fixture.listDatasets).toHaveBeenCalledWith(signal);
    expect(worldBank.listDatasets).not.toHaveBeenCalled();
  });

  it('describes a dataset through the selected adapter', async () => {
    const signal = new AbortController().signal;

    await expect(
      catalog.describeDataset('fixture', 'weather', signal),
    ).resolves.toMatchObject({ sourceId: 'fixture', datasetId: 'weather' });
    expect(fixture.describeDataset).toHaveBeenCalledWith('weather', signal);
  });

  it('lists dimension values with the original request and signal', async () => {
    const signal = new AbortController().signal;
    const request = {
      datasetId: 'weather',
      field: 'location',
      query: 'nor',
      cursor: 'next',
      limit: 20,
    };

    await expect(
      catalog.listDimensionValues('fixture', request, signal),
    ).resolves.toEqual({
      items: [{ value: 'north', label: 'North' }],
      nextCursor: null,
    });
    expect(fixture.listDimensionValues).toHaveBeenCalledWith(request, signal);
  });

  it('lists measures with the original request and signal', async () => {
    const signal = new AbortController().signal;
    const request = {
      datasetId: 'weather',
      query: 'temp',
      cursor: 'next',
      limit: 10,
    };

    await expect(
      catalog.listMeasures('fixture', request, signal),
    ).resolves.toEqual({
      items: [expect.objectContaining({ id: 'temperature', unit: '°C' })],
      nextCursor: null,
    });
    expect(fixture.listMeasures).toHaveBeenCalledWith(request, signal);
  });

  it('rejects an unknown source before calling an adapter', async () => {
    await expect(catalog.listDatasets('unknown')).rejects.toMatchObject({
      code: SOURCE_ERROR_CODE.SOURCE_NOT_FOUND,
      context: { sourceId: 'unknown' },
    });
    expect(worldBank.listDatasets).not.toHaveBeenCalled();
    expect(fixture.listDatasets).not.toHaveBeenCalled();
  });
});

describe('SourceRegistry bootstrap contract', () => {
  it('rejects duplicate source IDs in a Nest testing module', async () => {
    const first = createFakeAdapter('duplicate', 'first');
    const second = createFakeAdapter('duplicate', 'second');

    await expect(
      Test.createTestingModule({
        providers: [
          SourceRegistry,
          {
            provide: DATA_SOURCE_ADAPTERS,
            useValue: [first.adapter, second.adapter],
          },
        ],
      }).compile(),
    ).rejects.toThrow('Duplicate data source adapter registration: duplicate');
  });
});
